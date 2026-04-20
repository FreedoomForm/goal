/**
 * AegisOps — Module API Routes
 * REST API для 5 ИИ-модулей системы прогнозирования
 */
const express = require('express');
const { queryAll, queryOne } = require('../db/pg');
const { runModule, modules } = require('../modules/engine');
const { log } = require('../middleware/logger');

const router = express.Router();

// Список всех модулей — returns array compatible with frontend renderModules()
router.get('/', async (req, res) => {
  try {
    // Try to get modules from database first (they have sort_order, icons, etc.)
    const dbModules = await queryAll('SELECT * FROM modules ORDER BY sort_order');
    if (dbModules && dbModules.length > 0) {
      return res.json(dbModules);
    }
  } catch (err) {
    // DB query failed, fall through to static list
  }

  // Fallback: return static module definitions
  const moduleList = Object.keys(modules).map((code, idx) => ({
    id: idx + 1,
    code,
    name: modules[code].name || code,
    description: modules[code].description || '',
    icon: modules[code].icon || '📦',
    status: 'active',
    sort_order: idx + 1,
  }));
  res.json(moduleList);
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
router.get('/:code', async (req, res) => {
  // Normalize: gas-balance → gas_balance, consumption → consumption, etc.
  const code = req.params.code.replace(/-/g, '_');
  if (!modules[code]) {
    return res.status(404).json({ error: `Module "${code}" not found`, available: Object.keys(modules) });
  }
  try {
    const params = {};
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
