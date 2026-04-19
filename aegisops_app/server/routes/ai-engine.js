/**
 * AegisOps — AI Engine Routes
 * REST API для управления AI моделями и статусом
 * Uses Node.js built-in fetch (Node 18+)
 */
const express = require('express');
const { queryOne } = require('../db');
const ollamaManager = require('../services/ollama-manager');

const router = express.Router();

// AI Status
router.get('/status', async (req, res) => {
  try {
    const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
    let models = [];
    let activeModel = ollamaManager.getActiveModel();
    let ollamaOnline = false;

    if (ollamaRow) {
      try {
        const { createConnector } = require('../connectors');
        const connector = createConnector(ollamaRow);
        const status = await connector.testConnection();
        ollamaOnline = status.status === 'online';

        if (ollamaOnline) {
          const response = await fetch(`${ollamaRow.base_url || 'http://localhost:11434'}/api/tags`);
          const data = await response.json();
          models = (data.models || []).map(m => ({
            name: m.name,
            size: m.size,
            family: m.details?.family || '',
            modified_at: m.modified_at,
          }));
        }
      } catch (err) {
        ollamaOnline = false;
      }
    }

    res.json({
      ollama: { online: ollamaOnline, models },
      activeModel,
      providers: [
        { id: 'ollama', name: 'Ollama', online: ollamaOnline },
        { id: 'fallback', name: 'Built-in Fallback', online: true },
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Select active model
router.post('/models/select', (req, res) => {
  const { model, provider } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  ollamaManager.setModel(model);
  res.json({ ok: true, activeModel: model, provider: provider || 'ollama' });
});

// Pull a new model
router.post('/models/pull', async (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  try {
    ollamaManager.pullModel(model);
    res.json({ ok: true, message: `Pulling ${model}...` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a model
router.delete('/models/:name', async (req, res) => {
  try {
    await ollamaManager.deleteModel(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
