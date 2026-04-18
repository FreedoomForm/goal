/**
 * AegisOps — Real MCP (Model Context Protocol) Client
 * Implements the MCP spec over stdio transport (JSON-RPC 2.0).
 * Supports: initialize, tools/list, tools/call, resources/list, resources/read, prompts/list.
 *
 * Reference: https://modelcontextprotocol.io/specification/2025-06-18
 *
 * Designed to bridge OpenClaw-compatible local MCP servers (GitHub, Notion,
 * filesystem, shell, etc.) into the AegisOps AI orchestrator.
 */
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { log } = require('../middleware/logger');

class McpStdioClient extends EventEmitter {
  constructor({ command, args = [], env = {}, cwd, name = 'mcp' }) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this.name = name;

    this.proc = null;
    this.buf = '';
    this.nextId = 1;
    this.pending = new Map();
    this.initialized = false;
    this.capabilities = null;
    this.serverInfo = null;
    this.tools = [];
    this.resources = [];
    this.prompts = [];
  }

  start() {
    if (this.proc) return;
    this.proc = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.setEncoding('utf-8');
    this.proc.stdout.on('data', d => this._onData(d));
    this.proc.stderr.on('data', d => log.debug('mcp.stderr', { name: this.name, chunk: String(d).slice(0, 400) }));
    this.proc.on('exit', code => {
      log.info('mcp.exit', { name: this.name, code });
      this.emit('exit', code);
      this.proc = null;
      for (const [id, { reject }] of this.pending) reject(new Error('MCP process exited'));
      this.pending.clear();
    });
    this.proc.on('error', err => {
      log.error('mcp.spawn_error', { name: this.name, err: err.message });
      this.emit('error', err);
    });
  }

  stop() {
    if (this.proc) { try { this.proc.kill(); } catch {} this.proc = null; }
    this.initialized = false;
  }

  _onData(chunk) {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        this._handle(msg);
      } catch (e) {
        log.warn('mcp.parse_error', { name: this.name, line: line.slice(0, 200) });
      }
    }
  }

  _handle(msg) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || 'MCP error'));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      // Server → client notifications / requests (resources updated, logs, etc.)
      this.emit('notification', msg);
    }
  }

  _send(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(new Error('MCP client not started'));
      const id = this.nextId++;
      const payload = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(payload) + '\n');
      // 30s timeout safeguard
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  async initialize({ clientInfo = { name: 'AegisOps', version: '1.0.0' } } = {}) {
    if (!this.proc) this.start();
    const result = await this._send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo,
    });
    this.capabilities = result.capabilities;
    this.serverInfo = result.serverInfo;
    // Per spec, client must send initialized notification (no response expected)
    try {
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    } catch {}
    this.initialized = true;
    // Cache discovery
    try { this.tools = (await this._send('tools/list', {})).tools || []; } catch { this.tools = []; }
    try { this.resources = (await this._send('resources/list', {})).resources || []; } catch { this.resources = []; }
    try { this.prompts = (await this._send('prompts/list', {})).prompts || []; } catch { this.prompts = []; }
    return { serverInfo: this.serverInfo, capabilities: this.capabilities, tools: this.tools.length, resources: this.resources.length };
  }

  async callTool(name, args = {}) {
    if (!this.initialized) await this.initialize();
    return this._send('tools/call', { name, arguments: args });
  }

  async readResource(uri) {
    if (!this.initialized) await this.initialize();
    return this._send('resources/read', { uri });
  }

  async getPrompt(name, args = {}) {
    if (!this.initialized) await this.initialize();
    return this._send('prompts/get', { name, arguments: args });
  }
}

/* ───── Registry to manage multiple MCP servers ───── */
class McpRegistry {
  constructor() { this.clients = new Map(); }

  register(name, config) {
    if (this.clients.has(name)) this.clients.get(name).stop();
    const client = new McpStdioClient({ ...config, name });
    this.clients.set(name, client);
    return client;
  }

  get(name) { return this.clients.get(name); }
  list() {
    return [...this.clients.entries()].map(([name, c]) => ({
      name,
      running: !!c.proc,
      initialized: c.initialized,
      serverInfo: c.serverInfo,
      tools: c.tools.map(t => ({ name: t.name, description: t.description })),
      resources: c.resources.map(r => ({ uri: r.uri, name: r.name, description: r.description })),
      prompts: c.prompts.map(p => ({ name: p.name, description: p.description })),
    }));
  }

  stopAll() { for (const c of this.clients.values()) c.stop(); this.clients.clear(); }
}

const registry = new McpRegistry();
module.exports = { McpStdioClient, McpRegistry, registry };
