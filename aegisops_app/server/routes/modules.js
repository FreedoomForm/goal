/**
 * AegisOps — Module API Routes
 * REST API для 5 ИИ-модулей системы прогнозирования
 */
const express = require('express');
const { runModule, modules } = require('../modules/engine');
const { log } = require('../middleware/logger');

const router = express.Router();

// Список всех модулей
router.get('/', (req, res) => {
  res.json({
    modules: Object.keys(modules).map(code => ({
      code,
      name: modules[code].name || code,
      endpoint: `/api/modules/${code}/run`,
    })),
    total: Object.keys(modules).length,
  });
});

// Запуск модуля
router.post('/:code/run', async (req, res) => {
  const { code } = req.params;
  const params = req.body || {};

  try {
    const result = await runModule(code, params);
    log.info('module.run', { code, params: JSON.stringify(params).slice(0, 200) });
    res.json(result);
  } catch (err) {
    log.error('module.run_error', { code, error: err.message });
    res.status(400).json({ error: err.message, code });
  }
});

// Generic module access by code (accepts both hyphen and underscore formats)
// Supports: gas-balance / gas_balance, consumption, payments, tariffs, risks
router.get('/:code', async (req, res) => {
  // Normalize: gas-balance → gas_balance, consumption → consumption, etc.
  const code = req.params.code.replace(/-/g, '_');
  if (!modules[code]) {
    return res.status(404).json({ error: `Module "${code}" not found`, available: Object.keys(modules) });
  }
  try {
    const params = {};
    // Default params per module
    if (code === 'gas_balance') {
      params.region = req.query.region || 'Ташкент';
      params.days = parseInt(req.query.days) || 30;
      params.temperatureScenario = req.query.scenario || 'normal';
    } else if (code === 'consumption') {
      params.region = req.query.region || 'Ташкент';
      params.period = req.query.period || 'month';
    } else if (code === 'payments') {
      params.period = req.query.period || 'month';
    } else if (code === 'tariffs') {
      params.scenario = req.query.scenario || 'base';
    } else if (code === 'risks') {
      params.horizon = parseInt(req.query.horizon) || 30;
    }
    const result = await runModule(code, params);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
