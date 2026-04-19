/**
 * AegisOps — OpenClaw MCP Bridge
 * Provides convenient registration of common OpenClaw-compatible MCP servers
 * (filesystem, GitHub, shell, Notion, Postgres) and exposes their tools
 * as "pseudo-connectors" to the AegisOps orchestrator so scenarios can call them.
 */
const path = require('path');
const os = require('os');
const { registry } = require('./client');
const { log } = require('../middleware/logger');

const PRESETS = {
  filesystem: {
    description: 'Local filesystem access (read/write within allowed dirs)',
    build: ({ allowedDir }) => ({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', allowedDir || os.homedir()],
      env: {},
    }),
  },
  github: {
    description: 'GitHub API (repos, issues, PRs) via MCP',
    build: ({ token }) => ({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: token || '' },
    }),
  },
  shell: {
    description: 'Restricted shell executor (whitelisted commands)',
    build: ({ allowed = [] }) => ({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', 'mcp-server-shell'],
      env: { MCP_SHELL_ALLOWED: allowed.join(',') },
    }),
  },
  postgres: {
    description: 'Postgres read-only MCP server',
    build: ({ connectionString }) => ({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', connectionString || ''],
      env: {},
    }),
  },
  custom: {
    description: 'Custom MCP server (user-provided command)',
    build: ({ command, args = [], env = {}, cwd }) => ({ command, args, env, cwd }),
  },
};

async function startPreset(name, preset, config = {}) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`Unknown MCP preset: ${preset}`);
  const spec = p.build(config || {});
  const client = registry.register(name, spec);
  try {
    const info = await client.initialize();
    log.info('mcp.started', { name, preset, tools: info.tools });
    return { ok: true, name, preset, info };
  } catch (err) {
    log.error('mcp.start_failed', { name, preset, err: err.message });
    client.stop();
    throw err;
  }
}

function stop(name) {
  const c = registry.get(name);
  if (c) c.stop();
  return { ok: true, name };
}

async function callTool(name, toolName, args) {
  const c = registry.get(name);
  if (!c) throw new Error(`MCP server not registered: ${name}`);
  return c.callTool(toolName, args || {});
}

function listPresets() {
  return Object.entries(PRESETS).map(([k, v]) => ({ preset: k, description: v.description }));
}

module.exports = { startPreset, stop, callTool, listPresets, registry };
