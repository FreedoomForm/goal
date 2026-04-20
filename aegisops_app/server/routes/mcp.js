/**
 * Routes: /api/mcp/*  — manage real Model Context Protocol servers.
 * Updated to use async db/pg.js — all DB calls use await.
 */
const express = require('express');
const { startPreset, stop, callTool, listPresets, registry } = require('../mcp/openclaw-bridge');
const { queryAll, queryOne, runSQL, nowISO } = require('../db');
const { authMiddleware } = require('../auth');
const { log } = require('../middleware/logger');

const router = express.Router();

router.get('/presets', (req, res) => res.json(listPresets()));

router.get('/servers', async (req, res) => {
  const persisted = (await queryAll('SELECT * FROM mcp_servers ORDER BY id'))
    .map(r => ({ ...r, config: safe(r.config, {}) }));
  const running = registry.list();
  res.json({ persisted, running });
});

router.post('/servers', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  const { name, preset, config, auto_start } = req.body || {};
  if (!name || !preset) return res.status(400).json({ error: 'name and preset required' });
  const ts = nowISO();
  const existing = await queryOne('SELECT id FROM mcp_servers WHERE name=?', [name]);
  if (existing) {
    await runSQL('UPDATE mcp_servers SET preset=?, config=?, auto_start=?, updated_at=? WHERE id=?',
      [preset, JSON.stringify(config || {}), auto_start ? 1 : 0, ts, existing.id]);
  } else {
    await runSQL('INSERT INTO mcp_servers (name, preset, config, auto_start, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, preset, JSON.stringify(config || {}), auto_start ? 1 : 0, ts, ts]);
  }
  log.info('mcp.saved', { name, preset });
  res.json({ ok: true });
});

router.post('/servers/:name/start', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  const row = await queryOne('SELECT * FROM mcp_servers WHERE name=?', [req.params.name]);
  if (!row) return res.status(404).json({ error: 'not found' });
  try {
    const result = await startPreset(row.name, row.preset, safe(row.config, {}));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/servers/:name/stop', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  stop(req.params.name);
  res.json({ ok: true });
});

router.delete('/servers/:name', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  stop(req.params.name);
  await runSQL('DELETE FROM mcp_servers WHERE name=?', [req.params.name]);
  res.json({ ok: true });
});

router.post('/servers/:name/call', authMiddleware({ scopes: ['*', 'run'] }), async (req, res) => {
  const { tool, args } = req.body || {};
  if (!tool) return res.status(400).json({ error: 'tool required' });
  try {
    const result = await callTool(req.params.name, tool, args || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function safe(s, fb) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return fb; } }

/* Auto-start persisted servers on boot */
async function autoStartPersisted() {
  const rows = await queryAll('SELECT * FROM mcp_servers WHERE auto_start=1');
  for (const r of rows) {
    try {
      await startPreset(r.name, r.preset, safe(r.config, {}));
      log.info('mcp.auto_started', { name: r.name });
    } catch (err) {
      log.warn('mcp.auto_start_failed', { name: r.name, err: err.message });
    }
  }
}

module.exports = { router, autoStartPersisted };
