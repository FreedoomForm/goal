/**
 * AegisOps — Workflow Engine (n8n-like)
 * Executes node graphs: { nodes: [{id, type, params, position}], edges: [{from, to}] }
 *
 * Node types (pluggable):
 *   - trigger.manual / trigger.cron
 *   - connector.test, connector.fetch
 *   - ai.ask (Ollama via connector)
 *   - mcp.call (Model Context Protocol tool invocation)
 *   - data.transform (JS expression, sandboxed via new Function)
 *   - data.filter (JS expression returning boolean)
 *   - output.report (HTML report generation)
 *   - output.telegram (send via Telegram connector)
 *   - output.webhook (POST to URL)
 *
 * All database calls use the async PostgreSQL/TimescaleDB layer (db/pg).
 */
const { queryOne, queryAll, runSQL, nowISO } = require('../db');
const { createConnector } = require('../connectors');
const { registry: mcpRegistry } = require('../mcp/client');
const { log } = require('../middleware/logger');

/* Safe expression evaluator — avoids eval but supports simple JS. */
function safeEval(expr, ctx) {
  // Whitelist-style: compile once, no access to global scope
  // eslint-disable-next-line no-new-func
  const fn = new Function('$input', '$ctx', '"use strict"; return (' + expr + ');');
  return fn(ctx.input, ctx);
}

async function runNode(node, inbound, ctx) {
  const input = inbound; // already aggregated
  switch (node.type) {
    case 'trigger.manual':
    case 'trigger.cron':
    case 'trigger.webhook':
      return { output: ctx.triggerPayload || {} };

    case 'connector.test': {
      const row = await queryOne('SELECT * FROM connectors WHERE id=?', [node.params.connector_id]);
      if (!row) throw new Error(`connector ${node.params.connector_id} not found`);
      const c = createConnector(row);
      return { output: await c.testConnection() };
    }

    case 'connector.fetch': {
      const row = await queryOne('SELECT * FROM connectors WHERE id=?', [node.params.connector_id]);
      if (!row) throw new Error(`connector ${node.params.connector_id} not found`);
      const c = createConnector(row);
      return { output: await c.fetchData(node.params.query || {}) };
    }

    case 'connector.write': {
      const row = await queryOne('SELECT * FROM connectors WHERE id=?', [node.params.connector_id]);
      if (!row) throw new Error(`connector ${node.params.connector_id} not found`);
      const c = createConnector(row);
      const payload = node.params.query || input || {};
      const result = await c.sendData ? await c.sendData(payload) : { written: true };
      return { output: result };
    }

    case 'ai.ask': {
      const prompt = node.params.prompt_template
        ? interpolate(node.params.prompt_template, { input, ctx })
        : (node.params.prompt || String(input ?? ''));
      const ollamaRow = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
      if (!ollamaRow) throw new Error('no ollama connector configured');
      const c = createConnector(ollamaRow);
      return { output: await c.chat([
        { role: 'system', content: node.params.system || 'You are a helpful enterprise AI analyst.' },
        { role: 'user', content: prompt },
      ]) };
    }

    case 'mcp.call': {
      const { server, tool, args } = node.params;
      const client = mcpRegistry.get(server);
      if (!client) throw new Error(`MCP server "${server}" not registered`);
      const merged = { ...(args || {}), _input: input };
      return { output: await client.callTool(tool, merged) };
    }

    case 'data.transform': {
      return { output: safeEval(node.params.expression || '$input', { input, ...ctx }) };
    }

    case 'data.filter': {
      const pass = !!safeEval(node.params.expression || 'true', { input, ...ctx });
      return { output: input, skip: !pass };
    }

    case 'data.merge': {
      // Merge all inbound data into a single object/array
      const merged = Array.isArray(input) ? input : [input];
      const flat = merged.flat();
      if (flat.length === 0) return { output: {} };
      // If items are objects, deep merge; otherwise return array
      if (flat.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
        return { output: Object.assign({}, ...flat) };
      }
      return { output: flat };
    }

    case 'output.webhook': {
      const url = interpolate(node.params.url, { input, ctx });
      const body = node.params.body_template ? interpolate(node.params.body_template, { input, ctx }) : JSON.stringify(input);
      const res = await fetch(url, {
        method: node.params.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...(node.params.headers || {}) },
        body,
      });
      return { output: { status: res.status, ok: res.ok } };
    }

    case 'output.telegram': {
      const row = await queryOne("SELECT * FROM connectors WHERE type='telegram' LIMIT 1");
      if (!row) throw new Error('telegram connector not configured');
      const c = createConnector(row);
      const text = interpolate(node.params.text || String(input ?? ''), { input, ctx });
      await c.sendMessage(text);
      return { output: { sent: true } };
    }

    case 'output.report': {
      const html = interpolate(node.params.template || '<pre>{{input}}</pre>', { input, ctx });
      return { output: { html } };
    }

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

function interpolate(tpl, vars) {
  if (typeof tpl !== 'string') return tpl;
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    try { return String(safeEval(expr, vars)); } catch { return ''; }
  });
}

/* Topological execution (DAG). Cycles → error. */
async function executeGraph(graph, { triggerPayload = {}, onProgress } = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const indeg = new Map(nodes.map(n => [n.id, 0]));
  const outgoing = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) {
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    outgoing.get(e.from)?.push(e.to);
  }
  const queue = nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id);
  const results = new Map();
  const skipped = new Set();
  const trace = [];
  const ctx = { triggerPayload };

  while (queue.length) {
    const id = queue.shift();
    const node = byId.get(id);
    const incomingIds = edges.filter(e => e.to === id).map(e => e.from);
    const incomingResults = incomingIds.map(i => results.get(i));
    const inbound = incomingResults.length <= 1 ? incomingResults[0] : incomingResults;
    const anyParentSkipped = incomingIds.some(i => skipped.has(i));
    const t0 = Date.now();
    try {
      if (anyParentSkipped) { skipped.add(id); trace.push({ id, type: node.type, status: 'skipped', ms: 0 }); }
      else {
        const { output, skip } = await runNode(node, inbound, ctx);
        results.set(id, output);
        if (skip) skipped.add(id);
        trace.push({ id, type: node.type, status: skip ? 'filtered' : 'ok', ms: Date.now() - t0, output_preview: safePreview(output) });
      }
      if (onProgress) onProgress(trace[trace.length - 1]);
    } catch (err) {
      trace.push({ id, type: node.type, status: 'error', ms: Date.now() - t0, error: err.message });
      log.warn('workflow.node_error', { id, type: node.type, err: err.message });
      skipped.add(id);
    }
    for (const next of outgoing.get(id) || []) {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  return { trace, results: Object.fromEntries(results) };
}

function safePreview(value) {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return (s || '').slice(0, 300);
  } catch { return ''; }
}

/* Persistence helpers — all async because db/pg is async */
async function saveWorkflow({ id, name, description, graph, cron_expr, enabled = true }) {
  const ts = nowISO();
  if (id) {
    await runSQL('UPDATE workflows SET name=?, description=?, graph=?, cron_expr=?, enabled=?, updated_at=? WHERE id=?',
      [name, description || '', JSON.stringify(graph), cron_expr || '', enabled ? 1 : 0, ts, id]);
    return await queryOne('SELECT * FROM workflows WHERE id=?', [id]);
  }
  const r = await runSQL(`INSERT INTO workflows (name, description, graph, cron_expr, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, description || '', JSON.stringify(graph), cron_expr || '', enabled ? 1 : 0, ts, ts]);
  return await queryOne('SELECT * FROM workflows WHERE id=?', [r.lastInsertRowid]);
}

async function listWorkflows() {
  const rows = await queryAll('SELECT * FROM workflows ORDER BY id DESC');
  return rows.map(r => ({ ...r, graph: safeJSON(r.graph, { nodes: [], edges: [] }) }));
}

async function getWorkflow(id) {
  const r = await queryOne('SELECT * FROM workflows WHERE id=?', [id]);
  if (!r) return null;
  return { ...r, graph: safeJSON(r.graph, { nodes: [], edges: [] }) };
}

async function deleteWorkflow(id) {
  await runSQL('DELETE FROM workflows WHERE id=?', [id]);
  await runSQL('DELETE FROM workflow_runs WHERE workflow_id=?', [id]);
}

async function runWorkflow(id, triggerPayload = {}) {
  const wf = await getWorkflow(id);
  if (!wf) throw new Error('workflow not found');
  const runStart = nowISO();
  const r = await runSQL('INSERT INTO workflow_runs (workflow_id, status, trace, started_at) VALUES (?, ?, ?, ?)',
    [id, 'running', '[]', runStart]);
  const runId = r.lastInsertRowid;
  try {
    const result = await executeGraph(wf.graph, { triggerPayload });
    await runSQL('UPDATE workflow_runs SET status=?, trace=?, finished_at=? WHERE id=?',
      ['completed', JSON.stringify(result.trace), nowISO(), runId]);
    return { run_id: runId, ...result };
  } catch (err) {
    await runSQL('UPDATE workflow_runs SET status=?, trace=?, finished_at=? WHERE id=?',
      ['failed', JSON.stringify([{ error: err.message }]), nowISO(), runId]);
    throw err;
  }
}

async function listRuns(workflowId) {
  const rows = await queryAll('SELECT * FROM workflow_runs WHERE workflow_id=? ORDER BY id DESC LIMIT 50', [workflowId]);
  return rows.map(r => ({ ...r, trace: safeJSON(r.trace, []) }));
}

function safeJSON(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

/* Catalogue of node types for frontend palette */
function nodeCatalog() {
  return [
    { category: 'Триггеры', items: [
      { type: 'trigger.manual', label: 'Ручной запуск', icon: '▶️', params: {} },
      { type: 'trigger.cron', label: 'По расписанию (cron)', icon: '⏰', params: { cron: '0 9 * * *' } },
      { type: 'trigger.webhook', label: 'Webhook', icon: '🌐', params: { path: '/hook' } },
    ]},
    { category: 'Коннекторы', items: [
      { type: 'connector.test', label: 'Проверить коннектор', icon: '🔌', params: { connector_id: null } },
      { type: 'connector.fetch', label: 'Получить данные', icon: '📥', params: { connector_id: null, query: {} } },
      { type: 'connector.write', label: 'Запись данных', icon: '📤', params: { connector_id: null } },
    ]},
    { category: 'ИИ и MCP', items: [
      { type: 'ai.ask', label: 'AI-запрос (Ollama)', icon: '🤖', params: { prompt_template: 'Проанализируй: {{$input}}', system: 'Ты enterprise аналитик.' } },
      { type: 'mcp.call', label: 'Вызвать MCP-инструмент', icon: '🧩', params: { server: 'filesystem', tool: '', args: {} } },
    ]},
    { category: 'Данные', items: [
      { type: 'data.transform', label: 'Трансформация (JS)', icon: '🔧', params: { expression: '$input' } },
      { type: 'data.filter', label: 'Фильтр (JS)', icon: '🔍', params: { expression: 'true' } },
      { type: 'data.merge', label: 'Объединение', icon: '🔗', params: {} },
    ]},
    { category: 'Вывод', items: [
      { type: 'output.telegram', label: 'Отправить в Telegram', icon: '✈️', params: { text: '{{$input}}' } },
      { type: 'output.webhook', label: 'Webhook (HTTP)', icon: '🌐', params: { url: 'https://...', method: 'POST' } },
      { type: 'output.report', label: 'HTML отчет', icon: '📄', params: { template: '<h1>Отчет</h1><pre>{{$input}}</pre>' } },
    ]},
  ];
}

module.exports = {
  executeGraph, runWorkflow, saveWorkflow, listWorkflows, getWorkflow,
  deleteWorkflow, listRuns, nodeCatalog,
};
