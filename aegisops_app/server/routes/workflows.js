/**
 * Routes: /api/workflows/*  — node-based workflow CRUD + execution.
 */
const express = require('express');
const {
  listWorkflows, getWorkflow, saveWorkflow, deleteWorkflow,
  runWorkflow, listRuns, nodeCatalog,
} = require('../workflow/engine');
const { authMiddleware } = require('../auth');
const { log } = require('../middleware/logger');

const router = express.Router();

router.get('/catalog', (req, res) => res.json(nodeCatalog()));

router.get('/', (req, res) => res.json(listWorkflows()));

router.get('/:id', (req, res) => {
  const wf = getWorkflow(parseInt(req.params.id));
  if (!wf) return res.status(404).json({ error: 'not found' });
  res.json(wf);
});

router.post('/', authMiddleware({ scopes: ['*', 'run'] }), (req, res) => {
  const { id, name, description, graph, cron_expr, enabled } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!graph || typeof graph !== 'object') return res.status(400).json({ error: 'graph required' });
  const saved = saveWorkflow({ id, name, description, graph, cron_expr, enabled });
  log.info('workflow.saved', { id: saved.id, name });
  res.json(saved);
});

router.delete('/:id', authMiddleware({ scopes: ['*'] }), (req, res) => {
  deleteWorkflow(parseInt(req.params.id));
  log.info('workflow.deleted', { id: req.params.id });
  res.json({ ok: true });
});

router.post('/:id/run', authMiddleware({ scopes: ['*', 'run'] }), async (req, res) => {
  try {
    const result = await runWorkflow(parseInt(req.params.id), req.body?.payload || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/runs', (req, res) => {
  res.json(listRuns(parseInt(req.params.id)));
});

module.exports = router;
