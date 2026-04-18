/**
 * AegisOps Local AI — Server Core (Real Connectors Edition)
 * All connector calls are REAL network requests — no demo/simulation data.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const nodeCron = require('node-cron');

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

const REPORTS_DIR_DEFAULT = path.join(__dirname, '..', 'generated_reports');
let REPORTS_DIR = REPORTS_DIR_DEFAULT;
let DATA_DIR = path.join(__dirname, '..', 'data');

const VERSION = '1.1.0';

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
async function askAI(prompt, model) {
  // Find Ollama connector
  const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
  if (ollamaRow) {
    try {
      const connector = createConnector(ollamaRow);
      const useModel = model || activeModel || connector.model;
      const result = await connector.chat([
        { role: 'system', content: 'Ты enterprise AI-аналитик для газовых компаний и банков. Отвечай структурированно, с цифрами. Русский язык.' },
        { role: 'user', content: prompt },
      ], { model: useModel });
      return result; // { provider: 'ollama', model, content }
    } catch (err) {
      // Ollama not available — fall through to fallback
    }
  }
  // Fallback: built-in analyzer
  return { provider: 'fallback', model: model || 'built-in', content: generateFallbackAnalysis(prompt) };
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
    <div class="footer">AegisOps Local AI v${VERSION} • Конфиденциально • ${now}</div>
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
    res.json({ status: 'ok', product: 'AegisOps Local AI', version: VERSION, connectors: c?.c || 0, scenarios: s?.c || 0, documents: d?.c || 0, ts: nowISO() });
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
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
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

  app.put('/api/scenarios/:id', (req, res) => {
    const { name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled } = req.body;
    runSQL(`UPDATE scenarios SET name=?, category=?, cron_expr=?, connector_ids=?, objective=?, delivery_channel=?, config=?, enabled=?, updated_at=? WHERE id=?`,
      [name, category, cron_expr || '', JSON.stringify(connector_ids || []), objective, delivery_channel || 'none', JSON.stringify(config || {}), enabled ? 1 : 0, nowISO(), req.params.id]);
    const row = queryOne('SELECT * FROM scenarios WHERE id = ?', [req.params.id]);
    logEvent('scenario.updated', { id: req.params.id });
    res.json(row);
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
    const { prompt, model } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt required' });
    const result = await askAI(prompt, model);
    logEvent('assistant.asked', { prompt: prompt.slice(0, 200), provider: result.provider });
    res.json(result);
  });

  /* ── AI Assistant Streaming (SSE) ── */
  app.post('/api/assistant/stream', async (req, res) => {
    const { prompt, model } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
    if (!ollamaRow) {
      // No Ollama — fallback to non-streaming
      const result = await askAI(prompt, model);
      res.write(`event: token\ndata: ${JSON.stringify({ content: result.content, model: result.model })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ content: result.content, model: result.model, provider: result.provider, done: true })}\n\n`);
      res.end();
      return;
    }

    try {
      const connector = createConnector(ollamaRow);
      const useModel = model || connector.model;
      const ollamaUrl = connector.baseUrl;

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: useModel,
          stream: true,
          messages: [
            { role: 'system', content: 'Ты enterprise AI-аналитик для газовых компаний. Отвечай структурированно, с цифрами. Русский язык.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        // Ollama error — fallback
        const result = await askAI(prompt, model);
        res.write(`event: token\ndata: ${JSON.stringify({ content: result.content })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ content: result.content, model: result.model, provider: result.provider, done: true })}\n\n`);
        res.end();
        return;
      }

      const decoder = new (require('string_decoder')).StringDecoder('utf-8');
      let buffer = '';
      let fullContent = '';

      for await (const chunk of response.body) {
        buffer += decoder.write(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullContent += data.message.content;
              res.write(`event: token\ndata: ${JSON.stringify({ content: data.message.content, model: useModel })}\n\n`);
            }
            if (data.done) {
              res.write(`event: done\ndata: ${JSON.stringify({ content: fullContent, model: useModel, provider: 'ollama', done: true })}\n\n`);
            }
          } catch {}
        }
      }
      // If stream ended without done signal
      if (fullContent) {
        res.write(`event: done\ndata: ${JSON.stringify({ content: fullContent, model: useModel, provider: 'ollama', done: true })}\n\n`);
      }
      res.end();
    } catch (err) {
      // Streaming failed — try non-streaming fallback
      try {
        const result = await askAI(prompt, model);
        res.write(`event: token\ndata: ${JSON.stringify({ content: result.content })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ content: result.content, model: result.model, provider: result.provider, done: true })}\n\n`);
      } catch (fallbackErr) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: fallbackErr.message })}\n\n`);
      }
      res.end();
    }
  });

  /* ── AI Engine Management ── */
  let ollamaProcess = null;
  let openclawProcess = null;
  let activeModel = null;
  let activeProvider = 'ollama';
  const pullProgress = new Map();

  // Helper: check if Ollama is installed
  function isOllamaInstalled() {
    try { execSync('which ollama 2>/dev/null || where ollama 2>nul', { encoding: 'utf8' }); return true; }
    catch { return false; }
  }

  // Helper: check if Ollama is running
  async function isOllamaRunning() {
    try {
      const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
      const url = ollamaRow?.base_url || 'http://127.0.0.1:11434';
      const res = await fetch(`${url}/api/tags`);
      return res.ok;
    } catch { return false; }
  }

  // Helper: get Ollama models
  async function getOllamaModels() {
    try {
      const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
      const url = ollamaRow?.base_url || 'http://127.0.0.1:11434';
      const res = await fetch(`${url}/api/tags`);
      const data = await res.json();
      return (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        parameterSize: m.details?.parameter_size || '',
        family: m.details?.family || '',
        quantization: m.details?.quantization_level || '',
        modified: m.modified_at,
      }));
    } catch { return []; }
  }

  // Helper: get Ollama version
  async function getOllamaVersion() {
    try {
      const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
      const url = ollamaRow?.base_url || 'http://127.0.0.1:11434';
      const res = await fetch(`${url}/api/version`);
      const data = await res.json();
      return data.version || 'unknown';
    } catch { return null; }
  }

  // Recommended models for gas sector
  const RECOMMENDED_MODELS = [
    { name: 'qwen2.5:7b-instruct', desc: 'Оптимальная модель для газового сектора (7B, русский язык)', size: '4.4 GB', recommended: true },
    { name: 'qwen2.5:14b-instruct', desc: 'Высокое качество анализа (14B, требуется 10+ GB VRAM)', size: '8.7 GB', recommended: false },
    { name: 'llama3.1:8b-instruct', desc: 'Универсальная модель для анализа (8B)', size: '4.7 GB', recommended: false },
    { name: 'gemma3:4b', desc: 'Компактная модель для быстрого инференса (4B)', size: '3.3 GB', recommended: false },
    { name: 'mistral:7b-instruct', desc: 'Хорошая для структурированных задач (7B)', size: '4.1 GB', recommended: false },
    { name: 'nomic-embed-text', desc: 'Модель эмбеддингов для поиска по документам', size: '274 MB', recommended: false },
  ];

  // GET /api/ai/status
  app.get('/api/ai/status', async (req, res) => {
    try {
      const ollamaRunning = await isOllamaRunning();
      const ollamaInstalled = isOllamaInstalled();
      const ollamaModels = ollamaRunning ? await getOllamaModels() : [];
      const ollamaVersion = ollamaRunning ? await getOllamaVersion() : null;

      // Check if active model is still available
      if (activeModel && !ollamaModels.find(m => m.name === activeModel)) {
        activeModel = ollamaModels.length > 0 ? ollamaModels[0].name : null;
      } else if (!activeModel && ollamaModels.length > 0) {
        activeModel = ollamaModels[0].name;
      }

      // Load saved active model from settings
      if (!activeModel) {
        const savedModel = queryOne("SELECT value FROM settings WHERE key='ollama_model'");
        if (savedModel?.value) activeModel = savedModel.value;
      }

      res.json({
        ollama: {
          running: ollamaRunning,
          installed: ollamaInstalled,
          version: ollamaVersion,
          models: ollamaModels,
          baseUrl: queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1")?.base_url || 'http://127.0.0.1:11434',
        },
        openclaw: {
          running: !!openclawProcess,
          installed: false, // TODO: implement OpenClaw install check
        },
        activeModel,
        activeProvider,
        recommended: RECOMMENDED_MODELS.map(m => ({
          ...m,
          installed: ollamaModels.some(om => om.name === m.name || om.name.startsWith(m.name.split(':')[0])),
        })),
      });
    } catch (err) {
      res.json({
        ollama: { running: false, installed: false, models: [], baseUrl: 'http://127.0.0.1:11434' },
        openclaw: { running: false, installed: false },
        activeModel: null, activeProvider: 'ollama', recommended: RECOMMENDED_MODELS,
        error: err.message,
      });
    }
  });

  // POST /api/ai/ensure — auto-start everything
  app.post('/api/ai/ensure', async (req, res) => {
    const result = { ollama: {}, openclaw: {} };

    // Ensure Ollama
    if (!await isOllamaRunning()) {
      if (!isOllamaInstalled()) {
        try {
          // Auto-install Ollama
          if (process.platform === 'win32') {
            execSync('winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements', { timeout: 300000 });
          } else if (process.platform === 'darwin') {
            execSync('brew install ollama', { timeout: 300000 });
          } else {
            execSync('curl -fsSL https://ollama.com/install.sh | sh', { timeout: 300000 });
          }
          result.ollama.installed = true;
        } catch (err) {
          result.ollama.installError = err.message;
        }
      }
      try {
        ollamaProcess = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
        ollamaProcess.unref();
        // Wait for Ollama to start
        await new Promise(r => setTimeout(r, 3000));
        result.ollama.started = true;
      } catch (err) {
        result.ollama.startError = err.message;
      }
    }
    result.ollama.running = await isOllamaRunning();

    // OpenClaw — placeholder for now
    result.openclaw.running = !!openclawProcess;

    logEvent('ai.ensured', result);
    res.json(result);
  });

  // POST /api/ai/ollama/start
  app.post('/api/ai/ollama/start', async (req, res) => {
    try {
      if (await isOllamaRunning()) {
        return res.json({ status: 'already_running' });
      }
      ollamaProcess = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
      ollamaProcess.unref();
      await new Promise(r => setTimeout(r, 3000));
      const running = await isOllamaRunning();
      logEvent('ai.ollama.started', { running });
      res.json({ status: running ? 'started' : 'failed' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ai/ollama/stop
  app.post('/api/ai/ollama/stop', async (req, res) => {
    try {
      if (ollamaProcess) { ollamaProcess.kill(); ollamaProcess = null; }
      // Also try to kill any running ollama serve
      try { execSync('pkill -f "ollama serve" 2>/dev/null || taskkill /F /IM ollama.exe 2>nul'); } catch {}
      logEvent('ai.ollama.stopped', {});
      res.json({ status: 'stopped' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ai/ollama/install
  app.post('/api/ai/ollama/install', async (req, res) => {
    try {
      if (process.platform === 'win32') {
        execSync('winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements', { timeout: 300000 });
      } else if (process.platform === 'darwin') {
        execSync('brew install ollama', { timeout: 300000 });
      } else {
        execSync('curl -fsSL https://ollama.com/install.sh | sh', { timeout: 300000 });
      }
      logEvent('ai.ollama.installed', {});
      res.json({ status: 'installed' });
    } catch (err) {
      res.status(500).json({ error: err.message, hint: 'Install manually from https://ollama.com' });
    }
  });

  // POST /api/ai/openclaw/start
  app.post('/api/ai/openclaw/start', async (req, res) => {
    // OpenClaw is a future feature — return placeholder
    res.json({ status: 'not_implemented', message: 'OpenClaw MCP agent will be available in a future update' });
  });

  // POST /api/ai/openclaw/stop
  app.post('/api/ai/openclaw/stop', async (req, res) => {
    if (openclawProcess) { openclawProcess.kill(); openclawProcess = null; }
    res.json({ status: 'stopped' });
  });

  // POST /api/ai/openclaw/install
  app.post('/api/ai/openclaw/install', async (req, res) => {
    res.json({ status: 'not_implemented', message: 'OpenClaw installation will be available in a future update' });
  });

  // POST /api/ai/openclaw/configure
  app.post('/api/ai/openclaw/configure', async (req, res) => {
    res.json({ status: 'not_implemented', config: { defaultModel: activeModel } });
  });

  // POST /api/ai/models/select — set active model
  app.post('/api/ai/models/select', async (req, res) => {
    const { model, provider } = req.body;
    if (!model) return res.status(400).json({ error: 'model required' });
    activeModel = model;
    activeProvider = provider || 'ollama';
    // Persist to settings
    runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      ['ollama_model', model, nowISO()]);
    logEvent('ai.model.selected', { model, provider: activeProvider });
    res.json({ status: 'ok', activeModel, activeProvider });
  });

  // POST /api/ai/models/pull/:model — start pulling a model
  app.post('/api/ai/models/pull/:model', async (req, res) => {
    const model = req.params.model;
    if (!model) return res.status(400).json({ error: 'model name required' });

    // Start pull in background
    pullProgress.set(model, { status: 'pulling', progress: 0, statusText: 'Starting download...' });
    logEvent('ai.model.pull_started', { model });

    // Fire and forget the pull process
    const pullProc = spawn('ollama', ['pull', model], { stdio: 'pipe' });
    pullProc.stdout?.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/(\d+)%/);
      if (match) {
        pullProgress.set(model, { status: 'pulling', progress: parseInt(match[1]), statusText: `Downloading ${match[1]}%` });
      }
    });
    pullProc.on('close', (code) => {
      if (code === 0) {
        pullProgress.set(model, { status: 'completed', progress: 100, statusText: 'Download complete' });
        logEvent('ai.model.pulled', { model, success: true });
      } else {
        pullProgress.set(model, { status: 'failed', progress: 0, statusText: 'Download failed', error: `Exit code ${code}` });
        logEvent('ai.model.pulled', { model, success: false, code });
      }
    });
    pullProc.on('error', (err) => {
      pullProgress.set(model, { status: 'failed', progress: 0, statusText: 'Download failed', error: err.message });
    });

    res.json({ status: 'pulling', model });
  });

  // GET /api/ai/models/pull-status
  app.get('/api/ai/models/pull-status', (req, res) => {
    const result = {};
    for (const [model, progress] of pullProgress) {
      result[model] = progress;
    }
    res.json(result);
  });

  // DELETE /api/ai/models/:model — delete a model
  app.delete('/api/ai/models/:model', async (req, res) => {
    const model = req.params.model;
    try {
      execSync(`ollama rm ${model}`, { timeout: 60000 });
      if (activeModel === model) activeModel = null;
      logEvent('ai.model.deleted', { model });
      res.json({ status: 'deleted', model });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
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
async function startServer(port = 18090, { bind = '127.0.0.1', dataDir } = {}) {
  // Use Electron's userData directory if provided (avoids ENOTDIR inside ASAR),
  // otherwise fall back to relative paths (development / standalone mode).
  if (dataDir) {
    DATA_DIR = path.join(dataDir, 'data');
    REPORTS_DIR = path.join(dataDir, 'generated_reports');
  }

  // Ensure writable directories exist
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  await initDB(DATA_DIR);
  const app = createApp();
  // Auto-start persisted MCP servers in background (do not block listen)
  autoStartMcp().catch(err => log.warn('mcp.autostart_error', { err: err.message }));

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(port, bind, () => {
      log.info('server.listening', { url: `http://${bind}:${port}`, bind, port, dataDir: DATA_DIR });
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { startServer, createApp };
