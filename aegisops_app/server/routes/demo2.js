/**
 * AegisOps Demo2 API Routes - JSON API Training Mode
 * 
 * These routes provide a Next.js-style JSON API for the demo2 scenario.
 * The AI chat connects ONLY to this API, not to ML, 1C, or PostgreSQL connectors.
 * 
 * All responses are in JSON format for LLM training purposes.
 */

const express = require('express');
const router = express.Router();
const { DEMO2_CONFIG, DEMO2_SCHEMA, API_COMMANDS, executeApiCommand, seedDemo2Data } = require('../demo/demo2-setup');
const { queryAll, queryOne, runSQL } = require('../db');

// Check if PostgreSQL is available
let pgPool = null;
try {
  const pg = require('pg');
  pgPool = new pg.Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'aegisops',
    user: process.env.PG_USER || 'aegisops',
    password: process.env.PG_PASSWORD || 'aegisops',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
} catch (e) {
  console.warn('Demo2: PostgreSQL not available, using SQLite fallback');
}

// In-memory demo data for SQLite fallback
let memoryData = null;

function getMemoryData() {
  if (!memoryData) {
    const { generateDemo2MockData } = require('../demo/demo2-setup');
    memoryData = generateDemo2MockData();
  }
  return memoryData;
}

/* ── Demo2 Status ── */
router.get('/status', async (req, res) => {
  try {
    const hasPg = !!pgPool;
    let tablesExist = false;
    let rowCount = 0;
    
    if (hasPg) {
      try {
        const client = await pgPool.connect();
        const tableCheck = await client.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name LIKE 'demo2_%'
        `);
        tablesExist = tableCheck.rows.length >= 7;
        
        if (tablesExist) {
          const counts = await client.query(`
            SELECT 
              (SELECT COUNT(*) FROM demo2_forecast) as forecast,
              (SELECT COUNT(*) FROM demo2_weather) as weather,
              (SELECT COUNT(*) FROM demo2_consumption) as consumption,
              (SELECT COUNT(*) FROM demo2_consumer) as consumer,
              (SELECT COUNT(*) FROM demo2_gas_balance) as gas_balance,
              (SELECT COUNT(*) FROM demo2_scada_telemetry) as scada,
              (SELECT COUNT(*) FROM demo2_alerts) as alerts
          `);
          rowCount = Object.values(counts.rows[0]).reduce((a, b) => a + parseInt(b), 0);
        }
        client.release();
      } catch (e) {
        tablesExist = false;
      }
    }
    
    res.json({
      status: 'active',
      config: DEMO2_CONFIG,
      postgresql: hasPg && tablesExist,
      tables_exist: tablesExist,
      row_count: rowCount,
      available_commands: Object.keys(API_COMMANDS),
      message: hasPg ? (tablesExist ? 'Demo2 ready' : 'Run /api/demo2/init to initialize') : 'Using in-memory mode'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Initialize Demo2 Tables ── */
router.post('/init', async (req, res) => {
  try {
    if (!pgPool) {
      return res.json({ 
        status: 'initialized', 
        mode: 'memory',
        message: 'Using in-memory data (PostgreSQL not available)' 
      });
    }
    
    const client = await pgPool.connect();
    await client.query('BEGIN');
    
    // Create schema
    await client.query(DEMO2_SCHEMA);
    
    // Check if already seeded
    const countResult = await client.query('SELECT COUNT(*) as c FROM demo2_consumer');
    const alreadySeeded = parseInt(countResult.rows[0].c) > 0;
    
    let seedResult = { inserted: 0 };
    if (!alreadySeeded) {
      // Release client before seeding (seeding uses its own connections)
      await client.query('COMMIT');
      client.release();
      
      // Seed data
      seedResult.inserted = await seedDemo2Data(pgPool);
    } else {
      await client.query('COMMIT');
      client.release();
    }
    
    res.json({ 
      status: 'initialized', 
      mode: 'postgresql',
      seeded: !alreadySeeded,
      rows_inserted: seedResult.inserted,
      message: alreadySeeded ? 'Tables already exist with data' : 'Tables created and seeded'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Get Available Commands ── */
router.get('/commands', (req, res) => {
  res.json({
    commands: Object.keys(API_COMMANDS).map(cmd => ({
      name: cmd,
      description: getCommandDescription(cmd),
      params: getCommandParams(cmd)
    }))
  });
});

function getCommandDescription(cmd) {
  const descriptions = {
    get_forecast: 'Получить прогнозы (производство, потребление, импорт, экспорт)',
    get_weather: 'Получить погодные данные',
    get_consumption: 'Получить данные потребления по потребителям',
    get_consumer: 'Получить реестр потребителей',
    get_gas_balance: 'Получить газовый баланс',
    get_scada_telemetry: 'Получить телеметрию SCADA',
    get_alerts: 'Получить оповещения',
    query_data: 'Произвольный запрос к таблице данных',
    aggregate_data: 'Агрегация данных (AVG, SUM, MIN, MAX, COUNT)',
    export_data: 'Экспорт всех данных для обучения'
  };
  return descriptions[cmd] || 'API команда';
}

function getCommandParams(cmd) {
  const params = {
    get_forecast: ['type', 'start_date', 'end_date', 'limit'],
    get_weather: ['start_time', 'end_time', 'location', 'limit'],
    get_consumption: ['consumer_id', 'start_time', 'end_time', 'limit'],
    get_consumer: ['consumer_id', 'category', 'region'],
    get_gas_balance: ['start_date', 'end_date', 'limit'],
    get_scada_telemetry: ['node_id', 'metric_type', 'start_time', 'end_time', 'limit'],
    get_alerts: ['severity', 'acknowledged', 'resolved', 'limit'],
    query_data: ['table', 'columns', 'where', 'order_by', 'limit'],
    aggregate_data: ['table', 'column', 'aggregate_fn', 'group_by', 'start_time', 'end_time'],
    export_data: ['tables', 'format', 'start_date', 'end_date']
  };
  return params[cmd] || [];
}

/* ── Execute API Command ── */
router.post('/exec', async (req, res) => {
  try {
    const { command, params } = req.body;
    
    if (!command) {
      return res.status(400).json({ 
        success: false, 
        error: 'Command required',
        available_commands: Object.keys(API_COMMANDS)
      });
    }
    
    // Use PostgreSQL if available
    if (pgPool) {
      const result = await executeApiCommand(command, params || {}, pgPool);
      
      // Log to chat_logs if this is from AI chat
      if (req.body.log_chat && req.body.thread_id) {
        try {
          await pgPool.query(`
            INSERT INTO demo2_chat_logs (thread_id, role, content, api_command, api_response)
            VALUES ($1, 'assistant', $2, $3, $4)
          `, [req.body.thread_id, JSON.stringify(result), command, JSON.stringify(result)]);
        } catch (e) {}
      }
      
      return res.json(result);
    }
    
    // Fallback to in-memory data
    const result = await executeCommandMemory(command, params || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// In-memory command execution (fallback)
async function executeCommandMemory(command, params) {
  const data = getMemoryData();
  const { limit = 100 } = params;
  
  switch (command) {
    case 'get_forecast':
      let forecast = data.forecast;
      if (params.type) forecast = forecast.filter(f => f.type === params.type);
      return { success: true, command, data: forecast.slice(0, limit), count: Math.min(forecast.length, limit) };
      
    case 'get_weather':
      let weather = data.weather;
      if (params.location) weather = weather.filter(w => w.location === params.location);
      return { success: true, command, data: weather.slice(0, limit), count: Math.min(weather.length, limit) };
      
    case 'get_consumption':
      let consumption = data.consumption;
      if (params.consumer_id) consumption = consumption.filter(c => c.consumer_id === params.consumer_id);
      return { success: true, command, data: consumption.slice(0, limit), count: Math.min(consumption.length, limit) };
      
    case 'get_consumer':
      let consumers = data.consumer;
      if (params.category) consumers = consumers.filter(c => c.category === params.category);
      if (params.region) consumers = consumers.filter(c => c.region === params.region);
      return { success: true, command, data: consumers, count: consumers.length };
      
    case 'get_gas_balance':
      return { success: true, command, data: data.gas_balance.slice(0, limit), count: Math.min(data.gas_balance.length, limit) };
      
    case 'get_scada_telemetry':
      let scada = data.scada_telemetry;
      if (params.node_id) scada = scada.filter(s => s.node_id === params.node_id);
      if (params.metric_type) scada = scada.filter(s => s.metric_type === params.metric_type);
      return { success: true, command, data: scada.slice(0, limit), count: Math.min(scada.length, limit) };
      
    case 'get_alerts':
      let alerts = data.alerts;
      if (params.severity) alerts = alerts.filter(a => a.severity === params.severity);
      return { success: true, command, data: alerts.slice(0, limit), count: Math.min(alerts.length, limit) };
      
    case 'export_data':
      return { 
        success: true, 
        command, 
        data: {
          demo2_forecast: data.forecast,
          demo2_weather: data.weather,
          demo2_consumption: data.consumption,
          demo2_consumer: data.consumer,
          demo2_gas_balance: data.gas_balance,
          demo2_scada_telemetry: data.scada_telemetry,
          demo2_alerts: data.alerts
        },
        exported_at: new Date().toISOString()
      };
      
    default:
      return { 
        success: false, 
        error: `Unknown command: ${command}`,
        available_commands: Object.keys(API_COMMANDS)
      };
  }
}

/* ── Chat Endpoint for Demo2 ── */
router.post('/chat', async (req, res) => {
  try {
    const { message, thread_id, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }
    
    // Parse message to extract potential API command
    const parsedCommand = parseMessageForCommand(message);
    
    // Execute command if found
    let apiResult = null;
    let responseText = '';
    
    if (parsedCommand) {
      if (pgPool) {
        apiResult = await executeApiCommand(parsedCommand.command, parsedCommand.params, pgPool);
      } else {
        apiResult = await executeCommandMemory(parsedCommand.command, parsedCommand.params);
      }
      
      responseText = formatApiResponse(parsedCommand.command, apiResult);
    } else {
      // Provide help response
      responseText = generateHelpResponse(message);
    }
    
    // Log chat
    if (pgPool && thread_id) {
      try {
        await pgPool.query(`
          INSERT INTO demo2_chat_logs (thread_id, role, content, api_command, api_response)
          VALUES ($1, 'user', $2, $3, $4)
        `, [thread_id, message, parsedCommand?.command || null, null]);
        
        await pgPool.query(`
          INSERT INTO demo2_chat_logs (thread_id, role, content, api_command, api_response)
          VALUES ($1, 'assistant', $2, $3, $4)
        `, [thread_id, responseText, parsedCommand?.command || null, apiResult ? JSON.stringify(apiResult) : null]);
      } catch (e) {}
    }
    
    res.json({
      response: responseText,
      thread_id: thread_id || 'demo2_' + Date.now(),
      api_command: parsedCommand?.command || null,
      api_result: apiResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parse natural language message for API commands
function parseMessageForCommand(message) {
  const lowerMsg = message.toLowerCase();
  
  // Forecast
  if (lowerMsg.includes('прогноз') || lowerMsg.includes('forecast')) {
    const type = lowerMsg.includes('производств') ? 'production' :
                 lowerMsg.includes('потреблен') ? 'consumption' :
                 lowerMsg.includes('импорт') ? 'import' :
                 lowerMsg.includes('экспорт') ? 'export' : null;
    return { command: 'get_forecast', params: { type, limit: 30 } };
  }
  
  // Weather
  if (lowerMsg.includes('погод') || lowerMsg.includes('weather') || lowerMsg.includes('температур')) {
    return { command: 'get_weather', params: { limit: 24 } };
  }
  
  // Consumption
  if (lowerMsg.includes('потреблен') || lowerMsg.includes('consumption')) {
    return { command: 'get_consumption', params: { limit: 50 } };
  }
  
  // Consumers
  if (lowerMsg.includes('потребител') || lowerMsg.includes('consumer')) {
    return { command: 'get_consumer', params: {} };
  }
  
  // Gas balance
  if (lowerMsg.includes('баланс') || lowerMsg.includes('balance')) {
    return { command: 'get_gas_balance', params: { limit: 30 } };
  }
  
  // SCADA
  if (lowerMsg.includes('scada') || lowerMsg.includes('телеметр') || lowerMsg.includes('датчик')) {
    return { command: 'get_scada_telemetry', params: { limit: 100 } };
  }
  
  // Alerts
  if (lowerMsg.includes('алерт') || lowerMsg.includes('оповещен') || lowerMsg.includes('предупрежд') || lowerMsg.includes('авар')) {
    return { command: 'get_alerts', params: { limit: 20 } };
  }
  
  // Export
  if (lowerMsg.includes('экспорт') || lowerMsg.includes('export') || lowerMsg.includes('датасет') || lowerMsg.includes('скачать')) {
    return { command: 'export_data', params: {} };
  }
  
  // Direct command format: /command param=value
  const cmdMatch = message.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (cmdMatch) {
    const cmd = cmdMatch[1];
    const paramStr = cmdMatch[2] || '';
    const params = {};
    
    paramStr.split(/\s+/).forEach(p => {
      const [key, val] = p.split('=');
      if (key && val) params[key] = val;
    });
    
    if (API_COMMANDS[cmd]) {
      return { command: cmd, params };
    }
  }
  
  return null;
}

// Format API response for chat
function formatApiResponse(command, result) {
  if (!result.success) {
    return `❌ Ошибка: ${result.error}\n\nДоступные команды: ${result.available_commands?.join(', ') || Object.keys(API_COMMANDS).join(', ')}`;
  }
  
  const count = result.count || result.data?.length || 0;
  let response = `✅ Команда: ${command}\n📊 Найдено записей: ${count}\n\n`;
  
  // Show sample data
  if (result.data && result.data.length > 0) {
    const sample = result.data.slice(0, 5);
    response += '```\n' + JSON.stringify(sample, null, 2) + '\n```\n';
    
    if (result.data.length > 5) {
      response += `\n... и ещё ${result.data.length - 5} записей`;
    }
  }
  
  return response;
}

// Generate help response
function generateHelpResponse(message) {
  return `🤖 **Demo2 JSON API Ассистент**

Я могу помочь вам получить данные из демонстрационной базы данных.

**Доступные команды:**
- \`/get_forecast\` — Прогнозы (производство, потребление, импорт, экспорт)
- \`/get_weather\` — Погодные данные
- \`/get_consumption\` — Данные потребления
- \`/get_consumer\` — Реестр потребителей
- \`/get_gas_balance\` — Газовый баланс
- \`/get_scada_telemetry\` — Телеметрия SCADA
- \`/get_alerts\` — Оповещения
- \`/export_data\` — Экспорт всех данных

**Или просто спросите на естественном языке:**
- "Покажи прогноз потребления"
- "Какая погода?"
- "Данные телеметрии SCADA"
- "Экспорт данных для обучения"

**Параметры команд:**
\`/command param=value\`
Пример: \`/get_forecast type=consumption limit=10\`
`;
}

/* ── Get Chat History ── */
router.get('/chat/threads', async (req, res) => {
  try {
    if (!pgPool) {
      return res.json([]);
    }
    
    const result = await pgPool.query(`
      SELECT DISTINCT thread_id, MIN(timestamp) as created_at, 
             COUNT(*) as message_count
      FROM demo2_chat_logs
      GROUP BY thread_id
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

router.get('/chat/threads/:threadId', async (req, res) => {
  try {
    if (!pgPool) {
      return res.json([]);
    }
    
    const result = await pgPool.query(`
      SELECT * FROM demo2_chat_logs
      WHERE thread_id = $1
      ORDER BY timestamp ASC
    `, [req.params.threadId]);
    
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

/* ── Dataset Export for Audit Tab ── */
router.get('/dataset', async (req, res) => {
  try {
    const { format = 'json', tables } = req.query;
    const tablesToExport = tables ? tables.split(',') : null;
    
    let result;
    if (pgPool) {
      result = await executeApiCommand('export_data', { tables: tablesToExport }, pgPool);
    } else {
      result = await executeCommandMemory('export_data', { tables: tablesToExport });
    }
    
    if (format === 'jsonl') {
      // Convert to JSONL format for ML training
      const lines = [];
      for (const [table, rows] of Object.entries(result.data)) {
        rows.forEach(row => {
          lines.push(JSON.stringify({ table, ...row }));
        });
      }
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', 'attachment; filename="demo2_dataset.jsonl"');
      res.send(lines.join('\n'));
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="demo2_dataset.json"');
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Chat Logs for Dataset Collection ── */
router.get('/chat-logs', async (req, res) => {
  try {
    if (!pgPool) {
      return res.json({ logs: [], count: 0, message: 'PostgreSQL not available' });
    }
    
    const { start_date, end_date, limit = 1000 } = req.query;
    let sql = 'SELECT * FROM demo2_chat_logs WHERE 1=1';
    const params = [];
    
    if (start_date) {
      sql += ` AND timestamp >= $${params.length + 1}`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND timestamp <= $${params.length + 1}`;
      params.push(end_date);
    }
    sql += ` ORDER BY timestamp ASC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await pgPool.query(sql, params);
    
    res.json({
      logs: result.rows,
      count: result.rows.length,
      exported_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Chat Logs Export for Training ── */
router.get('/chat-logs/export', async (req, res) => {
  try {
    if (!pgPool) {
      return res.json({ error: 'PostgreSQL not available', logs: [] });
    }
    
    const result = await pgPool.query(`
      SELECT thread_id, timestamp, role, content, api_command, api_response
      FROM demo2_chat_logs
      ORDER BY thread_id, timestamp ASC
    `);
    
    // Group by thread for training data format
    const threads = {};
    result.rows.forEach(row => {
      if (!threads[row.thread_id]) {
        threads[row.thread_id] = { thread_id: row.thread_id, messages: [] };
      }
      threads[row.thread_id].messages.push({
        role: row.role,
        content: row.content,
        api_command: row.api_command,
        api_response: row.api_response ? JSON.parse(row.api_response) : null
      });
    });
    
    const trainingData = Object.values(threads);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="demo2_chat_training.json"');
    res.json({
      description: 'Demo2 Chat Logs for LLM Training',
      scenario: DEMO2_CONFIG.name,
      total_threads: trainingData.length,
      total_messages: result.rows.length,
      exported_at: new Date().toISOString(),
      data: trainingData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Clear Chat Logs ── */
router.delete('/chat-logs', async (req, res) => {
  try {
    if (!pgPool) {
      return res.json({ cleared: 0, message: 'PostgreSQL not available' });
    }
    
    const result = await pgPool.query('DELETE FROM demo2_chat_logs');
    res.json({ cleared: result.rowCount, message: 'Chat logs cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.parseMessageForCommand = parseMessageForCommand;
module.exports.formatApiResponse = formatApiResponse;
module.exports.generateHelpResponse = generateHelpResponse;
module.exports.executeCommandMemory = executeCommandMemory;
