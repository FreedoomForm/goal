/**
 * AegisOps Local AI — Server Core (Real Connectors Edition)
 * All connector calls are REAL network requests — no demo/simulation data.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const { initDB, getDB, queryAll, queryOne, runSQL, saveDB, nowISO } = require('./db');
const { createConnector, getConnectorTypes } = require('./connectors');
const {
  rateLimiter, securityHeaders, inputSanitizer, payloadGuard,
} = require('./middleware/security');
const { requestLogger, errorHandler, log } = require('./middleware/logger');
const { authMiddleware } = require('./auth');
const authRoutes = require('./routes/auth');
const workflowRoutes = require('./routes/workflows');
const { router: mcpRoutes, autoStartPersisted: autoStartMcp } = require('./routes/mcp');
const tunnel = require('./tunnel');

const REPORTS_DIR = path.join(__dirname, '..', 'generated_reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function uid() { return uuidv4().replace(/-/g, '').slice(0, 12); }

function logEvent(eventType, payload) {
  try {
    runSQL('INSERT INTO audit_log (event_type, payload, created_at) VALUES (?, ?, ?)',
      [eventType, JSON.stringify(payload, null, 0), nowISO()]);
  } catch (e) { console.error('Audit log error:', e.message); }
}

function safeJSON(str, fallback) {
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

/* ────────── AI layer (uses real Ollama connector) ────────── */
async function askAI(prompt) {
  // Find Ollama connector
  const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
  if (ollamaRow) {
    try {
      const connector = createConnector(ollamaRow);
      const result = await connector.chat([
        { role: 'system', content: 'Ты enterprise AI-аналитик для газовых компаний и банков. Отвечай структурированно, с цифрами. Русский язык.' },
        { role: 'user', content: prompt },
      ]);
      return result; // { provider: 'ollama', model, content }
    } catch (err) {
      // Ollama not available — fall through to fallback
    }
  }
  // Fallback: built-in analyzer
  return { provider: 'fallback', model: 'built-in', content: generateFallbackAnalysis(prompt) };
}

function generateFallbackAnalysis(prompt) {
  const d = new Date();
  const dateStr = d.toLocaleDateString('ru-RU');
  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (prompt.includes('газ') || prompt.includes('баланс') || prompt.includes('gas')) {
    return `📊 АНАЛИТИЧЕСКИЙ ОТЧЕТ ПО ГАЗОВОМУ БАЛАНСУ\nДата: ${dateStr} | ${timeStr}\n\n1. СТАТУС: Данные не получены из внешних систем\n   → Подключите SCADA (OPC UA) для реальных показателей давления и температуры\n   → Подключите 1C OData для данных по потреблению и контрактам\n\n2. РЕКОМЕНДАЦИЯ:\n   Настройте коннекторы в разделе «Коннекторы» для получения реальных данных.\n   После подключения система будет автоматически анализировать:\n   • Суточный баланс газа (поступление / потребление / ПХГ)\n   • Импорт/Экспорт с учетом температурных сценариев\n   • Давление в ГТС по ниткам\n\n[AegisOps Local AI | fallback — подключите Ollama для AI-анализа]`;
  }
  if (prompt.includes('платеж') || prompt.includes('дебитор') || prompt.includes('задолженн')) {
    return `💰 МОНИТОРИНГ ПЛАТЕЖЕЙ\nДата: ${dateStr} | ${timeStr}\n\nДанные платежной системы недоступны.\n→ Подключите 1C Бухгалтерию через OData для реальных данных по ДЗ/КЗ\n→ Подключите ERP для анализа платежеспособности\n\n[AegisOps Local AI | fallback]`;
  }
  if (prompt.includes('тариф') || prompt.includes('финанс') || prompt.includes('безубыточн')) {
    return `📈 ФИНАНСОВОЕ МОДЕЛИРОВАНИЕ\nДата: ${dateStr} | ${timeStr}\n\nТребуются данные из SAP/1C для тарифного анализа.\n→ Подключите SAP S/4HANA через OData коннектор\n→ Подключите 1C для данных по расщеплению платежей\n\n[AegisOps Local AI | fallback]`;
  }
  if (prompt.includes('риск') || prompt.includes('прогноз')) {
    return `🔍 УПРАВЛЕНИЕ РИСКАМИ\nДата: ${dateStr} | ${timeStr}\n\nРегрессионный анализ требует исторических данных.\n→ Подключите источники данных через раздел «Коннекторы»\n→ Настройте ETL пайплайн для загрузки исторических данных\n\n[AegisOps Local AI | fallback]`;
  }
  return `📋 АНАЛИЗ\nДата: ${dateStr} | ${timeStr}\n\nЗапрос: ${prompt.slice(0, 300)}\n\nДля AI-анализа подключите Ollama:\n  ollama serve\n  ollama pull qwen2.5:7b-instruct\n\n[AegisOps Local AI | fallback]`;
}

/* ────────── Report generator ────────── */
function generateHTMLReport(scenario, aiResult, collectedData) {
  const now = nowISO();
  const connectorSections = collectedData.map(cd => {
    const statusClass = cd.status === 'online' ? 'status-ok' : cd.status === 'offline' ? 'status-danger' : 'status-warn';
    return `<div style="margin-bottom:12px;padding:12px;background:#09101d;border-radius:10px;border:1px solid #1f2d4a">
      <strong>${cd.connector || 'Unknown'}</strong> — <span class="${statusClass}">${cd.status}</span>
      <pre style="margin-top:8px;font-size:12px">${JSON.stringify(cd, null, 2)}</pre>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${scenario.name} — AegisOps</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Inter,Arial,sans-serif;background:#0b1220;color:#e8eefc}
    .wrap{max-width:1000px;margin:0 auto;padding:40px 32px}
    .badge{display:inline-block;padding:6px 14px;border-radius:999px;background:linear-gradient(135deg,#59a8ff22,#7c5cff22);color:#9fcbff;font-size:13px;border:1px solid #59a8ff33;margin-bottom:12px}
    h1{font-size:28px;margin-bottom:8px} .meta{color:#8ea1c9;font-size:14px}
    .card{background:#121b31;border:1px solid #24304e;border-radius:20px;padding:28px;margin-bottom:24px}
    .card h2{font-size:20px;margin-bottom:16px;color:#b2d6ff}
    pre{white-space:pre-wrap;word-break:break-word;background:#09101d;padding:20px;border-radius:14px;border:1px solid #23314f;font-size:13px;line-height:1.6}
    .status-ok{color:#23c483} .status-warn{color:#ffb347} .status-danger{color:#ff6a6a}
    .footer{text-align:center;color:#5e6c88;font-size:12px;margin-top:40px;padding-top:20px;border-top:1px solid #1a2540}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge">AegisOps Local AI — Управленческий отчет</div>
    <h1>${scenario.name}</h1>
    <p class="meta">Сгенерировано: ${now} | AI: ${aiResult.provider} (${aiResult.model || 'built-in'})</p>
    <div class="card" style="margin-top:24px">
      <h2>📋 Цель</h2><p>${scenario.objective || ''}</p>
    </div>
    <div class="card"><h2>🤖 Аналитический вывод</h2><pre>${aiResult.content}</pre></div>
    <div class="card"><h2>📡 Данные коннекторов</h2>${connectorSections || '<p style="color:#8ea1c9">Нет данных</p>'}</div>
    <div class="footer">AegisOps Local AI v1.0.0 • Конфиденциально • ${now}</div>
  </div>
</body>
</html>`;
}

/* ────────── Express App ────────── */
function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // CORS: allow same-origin + explicit mobile origins. For public tunneling,
  // only the paired mobile app matters (API-key auth).
  app.use(cors({
    origin: (origin, cb) => cb(null, true), // auth is enforced below
    credentials: false,
    maxAge: 86400,
  }));

  app.use(securityHeaders);
  app.use(payloadGuard(10 * 1024 * 1024));
  app.use(express.json({ limit: '10mb' }));
  app.use(inputSanitizer);
  app.use(requestLogger);
  app.use('/api/', rateLimiter({ max: 300, windowMs: 60_000 }));

  // Auth routes (login, keys, pairing) — no auth required to hit them
  app.use('/api/auth', authRoutes);

  // Remote routes are behind authMiddleware; localhost bypasses it by default.
  app.use('/api/workflows', authMiddleware({ required: true }), workflowRoutes);
  app.use('/api/mcp', authMiddleware({ required: true }), mcpRoutes);

  // Tunnel management (admin only)
  app.get('/api/tunnel/status', authMiddleware({ required: true }), (req, res) => res.json(tunnel.status()));
  app.post('/api/tunnel/start', authMiddleware({ scopes: ['*'] }), async (req, res) => {
    try {
      const port = parseInt(req.body?.port || process.env.PORT || 18090);
      const provider = req.body?.provider || 'auto';
      const r = await tunnel.start(port, provider);
      res.json(r);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/tunnel/stop', authMiddleware({ scopes: ['*'] }), async (req, res) => {
    await tunnel.stop();
    res.json({ ok: true });
  });
  app.post('/api/tunnel/manual', authMiddleware({ scopes: ['*'] }), (req, res) => {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    tunnel.setPublicUrl(url, 'manual');
    res.json({ ok: true, url });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/reports', express.static(REPORTS_DIR));

  /* ── Health ── */
  app.get('/api/health', (req, res) => {
    const c = queryOne('SELECT COUNT(*) as c FROM connectors');
    const s = queryOne('SELECT COUNT(*) as c FROM scenarios');
    const d = queryOne('SELECT COUNT(*) as c FROM documents');
    res.json({ status: 'ok', product: 'AegisOps Local AI', version: '1.0.0', connectors: c?.c || 0, scenarios: s?.c || 0, documents: d?.c || 0, ts: nowISO() });
  });

  /* ── Dashboard ── */
  app.get('/api/dashboard', (req, res) => {
    const connectors = queryAll('SELECT * FROM connectors ORDER BY id');
    const scenarios = queryAll('SELECT * FROM scenarios ORDER BY id');
    const logs = queryAll('SELECT * FROM audit_log ORDER BY id DESC LIMIT 20');
    const docs = queryAll('SELECT * FROM documents ORDER BY id DESC LIMIT 20');
    const modules = queryAll('SELECT * FROM modules ORDER BY sort_order');
    const trainingJobs = queryAll('SELECT * FROM training_jobs ORDER BY id DESC LIMIT 10');
    connectors.forEach(c => { c.config = safeJSON(c.config, {}); c.auth_payload = safeJSON(c.auth_payload, {}); });
    scenarios.forEach(s => { s.config = safeJSON(s.config, {}); s.connector_ids = safeJSON(s.connector_ids, []); });
    res.json({
      hero: {
        title: 'AegisOps Local AI',
        subtitle: 'Универсальная Enterprise AI-платформа с реальными коннекторами к 1C, SAP, SCADA, Telegram',
        highlights: ['Реальные коннекторы (не симуляция)', 'Ollama LLM', '1C / SAP OData', 'SCADA OPC UA', 'Telegram Bot', 'Генерация отчетов'],
      },
      modules, connectors, scenarios, logs, documents: docs, trainingJobs,
    });
  });

  /* ── Connector types ── */
  app.get('/api/connector-types', (req, res) => res.json(getConnectorTypes()));

  /* ── Connectors CRUD ── */
  app.get('/api/connectors', (req, res) => {
    const rows = queryAll('SELECT * FROM connectors ORDER BY id');
    rows.forEach(r => { r.config = safeJSON(r.config, {}); r.auth_payload = safeJSON(r.auth_payload, {}); });
    res.json(rows);
  });

  app.post('/api/connectors', (req, res) => {
    const { name, type, base_url, auth_mode, auth_payload, config, enabled } = req.body;
    const now = nowISO();
    const result = runSQL(`INSERT INTO connectors (name, type, base_url, auth_mode, auth_payload, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, base_url || '', auth_mode || 'none', JSON.stringify(auth_payload || {}), JSON.stringify(config || {}), enabled !== false ? 1 : 0, now, now]);
    const row = queryOne('SELECT * FROM connectors WHERE id = ?', [result.lastInsertRowid]);
    logEvent('connector.created', { id: row?.id, name });
    res.json(row);
  });

  app.put('/api/connectors/:id', (req, res) => {
    const { name, type, base_url, auth_mode, auth_payload, config, enabled } = req.body;
    runSQL(`UPDATE connectors SET name=?, type=?, base_url=?, auth_mode=?, auth_payload=?, config=?, enabled=?, updated_at=? WHERE id=?`,
      [name, type, base_url || '', auth_mode || 'none', JSON.stringify(auth_payload || {}), JSON.stringify(config || {}), enabled ? 1 : 0, nowISO(), req.params.id]);
    const row = queryOne('SELECT * FROM connectors WHERE id = ?', [req.params.id]);
    logEvent('connector.updated', { id: req.params.id });
    res.json(row);
  });

  app.delete('/api/connectors/:id', (req, res) => {
    runSQL('DELETE FROM connectors WHERE id = ?', [req.params.id]);
    logEvent('connector.deleted', { id: req.params.id });
    res.json({ ok: true });
  });

  /* ── Real connector test ── */
  app.post('/api/connectors/:id/test', async (req, res) => {
    const row = queryOne('SELECT * FROM connectors WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    try {
      const connector = createConnector(row);
      const result = await connector.testConnection();
      logEvent('connector.tested', { id: req.params.id, status: result.status });
      res.json(result);
    } catch (err) {
      res.json({ status: 'error', error: err.message });
    }
  });

  /* ── Real connector data fetch ── */
  app.post('/api/connectors/:id/query', async (req, res) => {
    const row = queryOne('SELECT * FROM connectors WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    try {
      const connector = createConnector(row);
      const result = await connector.fetchData(req.body);
      logEvent('connector.queried', { id: req.params.id });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ── Real connector schema discovery ── */
  app.post('/api/connectors/:id/discover', async (req, res) => {
    const row = queryOne('SELECT * FROM connectors WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    try {
      const connector = createConnector(row);
      const result = await connector.discoverSchema(req.body);
      logEvent('connector.discovered', { id: req.params.id });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ── Scenarios CRUD ── */
  app.get('/api/scenarios', (req, res) => {
    const rows = queryAll('SELECT * FROM scenarios ORDER BY id');
    rows.forEach(r => { r.config = safeJSON(r.config, {}); r.connector_ids = safeJSON(r.connector_ids, []); });
    res.json(rows);
  });

  app.post('/api/scenarios', (req, res) => {
    const { name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled } = req.body;
    const now = nowISO();
    const result = runSQL(`INSERT INTO scenarios (name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category, cron_expr || '', JSON.stringify(connector_ids || []), objective, delivery_channel || 'none', JSON.stringify(config || {}), enabled !== false ? 1 : 0, now, now]);
    const row = queryOne('SELECT * FROM scenarios WHERE id = ?', [result.lastInsertRowid]);
    logEvent('scenario.created', { id: row?.id, name });
    res.json(row);
  });

  app.delete('/api/scenarios/:id', (req, res) => {
    runSQL('DELETE FROM scenarios WHERE id = ?', [req.params.id]);
    logEvent('scenario.deleted', { id: req.params.id });
    res.json({ ok: true });
  });

  /* ── Run scenario (REAL connectors) ── */
  app.post('/api/scenarios/:id/run', async (req, res) => {
    const row = queryOne('SELECT * FROM scenarios WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Scenario not found' });
    const scenario = { ...row, config: safeJSON(row.config, {}), connector_ids: safeJSON(row.connector_ids, []) };
    const { ask, send_to_telegram } = req.body || {};

    // Collect REAL data from connectors
    const allConnectors = queryAll('SELECT * FROM connectors');
    const collected = [];
    const targetIds = scenario.connector_ids.length > 0 ? scenario.connector_ids : allConnectors.filter(c => c.enabled).map(c => c.id);

    for (const cid of targetIds) {
      const connRow = allConnectors.find(c => c.id === cid);
      if (!connRow) continue;
      try {
        const connector = createConnector(connRow);
        const testResult = await connector.testConnection();
        collected.push({ connector: connRow.name, type: connRow.type, ...testResult });
      } catch (err) {
        collected.push({ connector: connRow.name, type: connRow.type, status: 'error', error: err.message });
      }
    }

    // AI analysis
    const prompt = `Сценарий: ${scenario.name}\nЦель: ${scenario.objective}\nДоп. запрос: ${ask || 'нет'}\nДанные коннекторов: ${JSON.stringify(collected, null, 2)}\n\nПодготовь управленческий отчет:\n1. Итоговый статус\n2. Ключевые отклонения и риски\n3. Рекомендованные действия\n4. Что автоматизировать дальше`;
    const aiResult = await askAI(prompt);

    // Generate report
    const reportId = uid();
    const html = generateHTMLReport(scenario, aiResult, collected);
    const reportPath = path.join(REPORTS_DIR, `report_${reportId}.html`);
    fs.writeFileSync(reportPath, html, 'utf-8');

    runSQL('INSERT INTO documents (title, kind, scenario_id, path, format, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [scenario.name, 'report', scenario.id, reportPath, 'html', nowISO()]);

    // Real Telegram send
    let telegram = { status: 'skipped' };
    if (send_to_telegram || scenario.delivery_channel === 'telegram') {
      const tgRow = queryOne("SELECT * FROM connectors WHERE type='telegram' LIMIT 1");
      if (tgRow) {
        try {
          const tgConn = createConnector(tgRow);
          await tgConn.sendMessage(`📊 <b>${scenario.name}</b>\n\nОтчет сгенерирован: ${nowISO()}\nAI: ${aiResult.provider}`);
          await tgConn.sendDocument(reportPath, `Отчет: ${scenario.name}`);
          telegram = { status: 'sent' };
        } catch (err) {
          telegram = { status: 'error', error: err.message };
        }
      } else {
        telegram = { status: 'skipped', reason: 'no telegram connector' };
      }
    }

    const payload = { scenario: scenario.name, report_id: reportId, report_url: `/reports/report_${reportId}.html`, ai_provider: aiResult.provider, telegram };
    logEvent('scenario.executed', payload);
    res.json(payload);
  });

  /* ── Modules ── */
  app.get('/api/modules', (req, res) => res.json(queryAll('SELECT * FROM modules ORDER BY sort_order')));

  /* ── Documents ── */
  app.get('/api/documents', (req, res) => res.json(queryAll('SELECT * FROM documents ORDER BY id DESC')));

  app.get('/api/documents/:id/download', (req, res) => {
    const row = queryOne('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    if (!fs.existsSync(row.path)) return res.status(404).json({ error: 'file missing' });
    res.download(row.path);
  });

  /* ── AI Assistant (real Ollama) ── */
  app.post('/api/assistant', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt required' });
    const result = await askAI(prompt);
    logEvent('assistant.asked', { prompt: prompt.slice(0, 200), provider: result.provider });
    res.json(result);
  });

  /* ── Module analytics (real AI) ── */
  const analyticPrompts = {
    'gas-balance': 'Подготовь сводку по газовому балансу: поступление, потребление, ПХГ, импорт/экспорт, давление ГТС.',
    'consumption': 'Аналитика потребления: заявки vs факт, дисциплина потребления, перебор/недобор.',
    'payments': 'Мониторинг платежей: дебиторская и кредиторская задолженность, просрочки, пени.',
    'tariffs': 'Тарифный анализ: точка безубыточности, оптимальный тариф, субсидии, расщепление.',
    'risks': 'Управление рисками: качество газа, недопоставки, финансовые риски, VaR.',
  };
  for (const [key, prompt] of Object.entries(analyticPrompts)) {
    app.get(`/api/analytics/${key}`, async (req, res) => {
      const result = await askAI(prompt);
      res.json({ module: key, analysis: result });
    });
  }

  /* ── Training jobs ── */
  app.get('/api/training', (req, res) => res.json(queryAll('SELECT * FROM training_jobs ORDER BY id DESC')));
  app.post('/api/training', (req, res) => {
    const { name, base_model, dataset_path, method, config } = req.body;
    const now = nowISO();
    const result = runSQL(`INSERT INTO training_jobs (name, base_model, dataset_path, method, config, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      [name, base_model || 'qwen2.5:7b', dataset_path || '', method || 'lora', JSON.stringify(config || {}), now, now]);
    logEvent('training.created', { id: result.lastInsertRowid, name });
    res.json(queryOne('SELECT * FROM training_jobs WHERE id = ?', [result.lastInsertRowid]));
  });

  /* ── ETL Pipelines ── */
  app.get('/api/etl', (req, res) => res.json(queryAll('SELECT * FROM etl_pipelines ORDER BY id DESC')));
  app.post('/api/etl', (req, res) => {
    const { name, source_connector_id, target, schedule, config } = req.body;
    const result = runSQL(`INSERT INTO etl_pipelines (name, source_connector_id, target, schedule, config, status, created_at) VALUES (?, ?, ?, ?, ?, 'idle', ?)`,
      [name, source_connector_id || null, target || 'local_db', schedule || '', JSON.stringify(config || {}), nowISO()]);
    logEvent('etl.created', { id: result.lastInsertRowid, name });
    res.json(queryOne('SELECT * FROM etl_pipelines WHERE id = ?', [result.lastInsertRowid]));
  });

  /* ── Audit ── */
  app.get('/api/audit', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(queryAll('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit]));
  });

  /* ── Settings ── */
  app.get('/api/settings', (req, res) => {
    const rows = queryAll('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  });
  app.put('/api/settings', (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
      runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, String(value), nowISO()]);
    }
    logEvent('settings.updated', req.body);
    res.json({ ok: true });
  });

  // SPA fallback
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  // Last-resort error handler
  app.use(errorHandler);

  return app;
}

/* ────────── Start server ────────── */
async function startServer(port = 18090, { bind = '127.0.0.1' } = {}) {
  await initDB();
  const app = createApp();
  // Auto-start persisted MCP servers in background (do not block listen)
  autoStartMcp().catch(err => log.warn('mcp.autostart_error', { err: err.message }));

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(port, bind, () => {
      log.info('server.listening', { url: `http://${bind}:${port}`, bind, port });
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { startServer, createApp };
