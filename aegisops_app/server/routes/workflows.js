/**
 * Routes: /api/workflows/*  — node-based workflow CRUD + execution.
 * Updated: all handlers are async to match the async db/pg.js layer.
 */
const express = require('express');
const {
  listWorkflows, getWorkflow, saveWorkflow, deleteWorkflow,
  runWorkflow, listRuns, nodeCatalog,
} = require('../workflow/engine');
const { queryAll, nowISO } = require('../db/pg');
const { authMiddleware } = require('../auth');
const { log } = require('../middleware/logger');

const router = express.Router();

router.get('/catalog', (req, res) => res.json(nodeCatalog()));

/** Get all workflow schedules */
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await queryAll('SELECT * FROM workflow_schedules ORDER BY id DESC');
    res.json(schedules);
  } catch (err) {
    res.json([]);
  }
});

router.get('/', async (req, res) => {
  try {
    const workflows = await listWorkflows();
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const wf = await getWorkflow(parseInt(req.params.id));
    if (!wf) return res.status(404).json({ error: 'not found' });
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware({ scopes: ['*', 'run'] }), async (req, res) => {
  try {
    const { id, name, description, graph, cron_expr, enabled } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!graph || typeof graph !== 'object') return res.status(400).json({ error: 'graph required' });
    const saved = await saveWorkflow({ id, name, description, graph, cron_expr, enabled });
    log.info('workflow.saved', { id: saved.id, name });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Update a workflow (PUT) */
router.put('/:id', authMiddleware({ scopes: ['*', 'run'] }), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await getWorkflow(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const { name, description, graph, cron_expr, enabled } = req.body || {};
    const saved = await saveWorkflow({
      id,
      name: name || existing.name,
      description: description ?? existing.description,
      graph: graph || existing.graph,
      cron_expr: cron_expr ?? existing.cron_expr,
      enabled: enabled !== undefined ? enabled : existing.enabled,
    });
    log.info('workflow.updated', { id });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  try {
    await deleteWorkflow(parseInt(req.params.id));
    log.info('workflow.deleted', { id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/run', authMiddleware({ scopes: ['*', 'run'] }), async (req, res) => {
  try {
    const result = await runWorkflow(parseInt(req.params.id), req.body?.payload || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/runs', async (req, res) => {
  try {
    const runs = await listRuns(parseInt(req.params.id));
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
