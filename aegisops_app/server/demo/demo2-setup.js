/**
 * AegisOps Demo2 Scenario - JSON API Training Mode
 * 
 * This scenario provides:
 * - Mock PostgreSQL tables with data from connectors (forecast, weather, consumption, consumer)
 * - Next.js-style JSON API endpoint for AI chat
 * - No ML connectors - only JSON format API
 * - Dataset collection in Audit tab for LLM training
 * 
 * The purpose is to train LLMs to use exact JSON format API commands
 * without relying on ML, 1C, or PostgreSQL connectors directly.
 */

const DEMO2_CONFIG = {
  name: 'Demo2: JSON API Training',
  description: 'Тренировка LLM для работы с JSON API форматом',
  enabled: true,
  scenario_id: 'demo2',
  
  // AI chat is connected only to demo JSON API
  connectors: {
    ml: false,           // No ML connectors
    onec: false,         // No 1C connectors
    postgres: false,     // No direct PostgreSQL
    json_api: true       // Only JSON API
  },
  
  // Available JSON API commands
  api_commands: [
    'get_forecast',
    'get_weather', 
    'get_consumption',
    'get_consumer',
    'get_gas_balance',
    'get_scada_telemetry',
    'get_alerts',
    'query_data',
    'aggregate_data',
    'export_data'
  ]
};

// PostgreSQL schema for demo2 tables
const DEMO2_SCHEMA = `
-- Forecast table (прогнозы)
CREATE TABLE IF NOT EXISTS demo2_forecast (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT NOT NULL, -- 'production', 'consumption', 'import', 'export'
  value DOUBLE PRECISION NOT NULL,
  unit TEXT DEFAULT 'm3',
  confidence_lower DOUBLE PRECISION,
  confidence_upper DOUBLE PRECISION,
  model_version TEXT DEFAULT 'v1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weather data table (погодные данные)
CREATE TABLE IF NOT EXISTS demo2_weather (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  pressure DOUBLE PRECISION,
  wind_speed DOUBLE PRECISION,
  wind_direction TEXT,
  precipitation DOUBLE PRECISION DEFAULT 0,
  location TEXT DEFAULT 'Ташкент',
  source TEXT DEFAULT 'mock',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consumption data table (потребление)
CREATE TABLE IF NOT EXISTS demo2_consumption (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  consumer_id TEXT NOT NULL,
  consumer_name TEXT,
  volume DOUBLE PRECISION NOT NULL,
  unit TEXT DEFAULT 'm3',
  temperature DOUBLE PRECISION,
  pressure DOUBLE PRECISION,
  status TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consumer registry table (реестр потребителей)
CREATE TABLE IF NOT EXISTS demo2_consumer (
  id SERIAL PRIMARY KEY,
  consumer_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT, -- 'industrial', 'residential', 'commercial'
  region TEXT,
  address TEXT,
  contract_number TEXT,
  daily_limit DOUBLE PRECISION,
  monthly_limit DOUBLE PRECISION,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gas balance table (газовый баланс)
CREATE TABLE IF NOT EXISTS demo2_gas_balance (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  production DOUBLE PRECISION DEFAULT 0,
  consumption DOUBLE PRECISION DEFAULT 0,
  import_volume DOUBLE PRECISION DEFAULT 0,
  export_volume DOUBLE PRECISION DEFAULT 0,
  storage_change DOUBLE PRECISION DEFAULT 0,
  losses DOUBLE PRECISION DEFAULT 0,
  balance DOUBLE PRECISION GENERATED ALWAYS AS (
    production + import_volume - consumption - export_volume - storage_change - losses
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SCADA telemetry table (телеметрия SCADA)
CREATE TABLE IF NOT EXISTS demo2_scada_telemetry (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  node_id TEXT NOT NULL,
  node_name TEXT,
  metric_type TEXT NOT NULL, -- 'pressure', 'temperature', 'flow', 'level'
  value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  quality TEXT DEFAULT 'Good',
  status TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table (оповещения)
CREATE TABLE IF NOT EXISTS demo2_alerts (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity TEXT NOT NULL, -- 'info', 'warning', 'critical'
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  node_id TEXT,
  value DOUBLE PRECISION,
  threshold DOUBLE PRECISION,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI chat logs for dataset collection
CREATE TABLE IF NOT EXISTS demo2_chat_logs (
  id SERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  api_command TEXT, -- JSON API command used
  api_response JSONB, -- API response data
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_demo2_forecast_date ON demo2_forecast(date);
CREATE INDEX IF NOT EXISTS idx_demo2_weather_timestamp ON demo2_weather(timestamp);
CREATE INDEX IF NOT EXISTS idx_demo2_consumption_timestamp ON demo2_consumption(timestamp);
CREATE INDEX IF NOT EXISTS idx_demo2_consumer_id ON demo2_consumer(consumer_id);
CREATE INDEX IF NOT EXISTS idx_demo2_gas_balance_date ON demo2_gas_balance(date);
CREATE INDEX IF NOT EXISTS idx_demo2_scada_timestamp ON demo2_scada_telemetry(timestamp);
CREATE INDEX IF NOT EXISTS idx_demo2_alerts_timestamp ON demo2_alerts(timestamp);
CREATE INDEX IF NOT EXISTS idx_demo2_chat_logs_thread ON demo2_chat_logs(thread_id);
`;

// Generate mock data for demo2 tables
function generateDemo2MockData() {
  const now = new Date();
  const data = {
    forecast: [],
    weather: [],
    consumption: [],
    consumer: [],
    gas_balance: [],
    scada_telemetry: [],
    alerts: []
  };

  // Generate consumers first
  const consumers = [
    { id: 'CONS-001', name: 'Ташкентская ТЭЦ', category: 'industrial', region: 'Ташкент', daily_limit: 50000 },
    { id: 'CONS-002', name: 'АО Алмалыкский ГМК', category: 'industrial', region: 'Алмалык', daily_limit: 80000 },
    { id: 'CONS-003', name: 'Бухарский НПЗ', category: 'industrial', region: 'Бухара', daily_limit: 65000 },
    { id: 'CONS-004', name: 'ЖК «Яшнабад»', category: 'residential', region: 'Ташкент', daily_limit: 5000 },
    { id: 'CONS-005', name: 'Торговый центр «Самарканд Дарвоза»', category: 'commercial', region: 'Самарканд', daily_limit: 3000 },
    { id: 'CONS-006', name: 'Навоийский ГМЗ', category: 'industrial', region: 'Навои', daily_limit: 90000 },
    { id: 'CONS-007', name: 'Ургенчская ТЭЦ', category: 'industrial', region: 'Ургенч', daily_limit: 45000 },
    { id: 'CONS-008', name: 'Ферганский НПЗ', category: 'industrial', region: 'Фергана', daily_limit: 55000 }
  ];

  consumers.forEach(c => {
    data.consumer.push({
      consumer_id: c.id,
      name: c.name,
      category: c.category,
      region: c.region,
      address: `г. ${c.region}, ул. Промышленная`,
      contract_number: `ДГ-${c.id}`,
      daily_limit: c.daily_limit,
      monthly_limit: c.daily_limit * 30,
      status: 'active'
    });
  });

  // Generate 30 days of historical data
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Seasonal patterns
    const seasonality = Math.sin((i / 365) * Math.PI * 2) * 0.3;
    const trend = (30 - i) * 0.001;
    
    // Forecast data
    data.forecast.push({
      date: dateStr,
      type: 'production',
      value: Math.round(52000 * (1 + seasonality + trend)),
      unit: 'm3',
      confidence_lower: Math.round(50000 * (1 + seasonality + trend)),
      confidence_upper: Math.round(54000 * (1 + seasonality + trend))
    });
    
    data.forecast.push({
      date: dateStr,
      type: 'consumption',
      value: Math.round(48000 * (1 + seasonality + trend * 1.1)),
      unit: 'm3',
      confidence_lower: Math.round(46000 * (1 + seasonality + trend * 1.1)),
      confidence_upper: Math.round(50000 * (1 + seasonality + trend * 1.1))
    });
    
    // Weather data (hourly for last 24h of each day)
    for (let h = 0; h < 24; h += 6) {
      const ts = new Date(date);
      ts.setHours(h);
      
      data.weather.push({
        timestamp: ts.toISOString(),
        temperature: 18 + seasonality * 10 + Math.sin(h / 24 * Math.PI * 2) * 5 + (Math.random() - 0.5) * 3,
        humidity: 40 + Math.random() * 30,
        pressure: 1013 + (Math.random() - 0.5) * 10,
        wind_speed: 2 + Math.random() * 5,
        wind_direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
        precipitation: Math.random() > 0.7 ? Math.random() * 5 : 0,
        location: 'Ташкент'
      });
    }
    
    // Consumption data per consumer
    consumers.forEach(c => {
      const ts = new Date(date);
      ts.setHours(12);
      
      data.consumption.push({
        timestamp: ts.toISOString(),
        consumer_id: c.id,
        consumer_name: c.name,
        volume: c.daily_limit * (0.7 + Math.random() * 0.5),
        unit: 'm3',
        temperature: 18 + seasonality * 10,
        pressure: 2.5 + (Math.random() - 0.5) * 0.3,
        status: Math.random() > 0.95 ? 'warning' : 'normal'
      });
    });
    
    // Gas balance
    data.gas_balance.push({
      date: dateStr,
      production: Math.round(52000 * (1 + seasonality + trend)),
      consumption: Math.round(48000 * (1 + seasonality + trend * 1.1)),
      import_volume: Math.round(3000 * (1 + Math.random() * 0.2)),
      export_volume: Math.round(2000 * (1 + Math.random() * 0.1)),
      storage_change: Math.round((Math.random() - 0.5) * 1000),
      losses: Math.round(500 + Math.random() * 200)
    });
    
    // SCADA telemetry
    const scadaNodes = [
      { id: 'GRS-1-PR', name: 'ГРС-1 Давление', metric: 'pressure', unit: 'bar' },
      { id: 'GRS-1-TE', name: 'ГРС-1 Температура', metric: 'temperature', unit: '°C' },
      { id: 'GRS-1-FL', name: 'ГРС-1 Расход', metric: 'flow', unit: 'm3/h' },
      { id: 'GRS-2-PR', name: 'ГРС-2 Давление', metric: 'pressure', unit: 'bar' },
      { id: 'GRS-2-FL', name: 'ГРС-2 Расход', metric: 'flow', unit: 'm3/h' },
      { id: 'GRS-3-PR', name: 'ГРС-3 Давление', metric: 'pressure', unit: 'bar' }
    ];
    
    for (let h = 0; h < 24; h += 3) {
      const ts = new Date(date);
      ts.setHours(h);
      
      scadaNodes.forEach(node => {
        let value;
        switch (node.metric) {
          case 'pressure': value = 2.5 + (Math.random() - 0.5) * 0.4; break;
          case 'temperature': value = 18 + (Math.random() - 0.5) * 5; break;
          case 'flow': value = 1200 + (Math.random() - 0.5) * 400; break;
          default: value = Math.random() * 100;
        }
        
        data.scada_telemetry.push({
          timestamp: ts.toISOString(),
          node_id: node.id,
          node_name: node.name,
          metric_type: node.metric,
          value: Math.round(value * 100) / 100,
          unit: node.unit,
          quality: Math.random() > 0.95 ? 'Bad' : 'Good',
          status: Math.random() > 0.98 ? 'warning' : 'normal'
        });
      });
    }
    
    // Occasional alerts
    if (Math.random() > 0.85) {
      data.alerts.push({
        timestamp: new Date(date).toISOString(),
        severity: ['info', 'warning', 'critical'][Math.floor(Math.random() * 3)],
        source: 'SCADA',
        message: 'Превышение порогового значения давления на ГРС-' + (Math.floor(Math.random() * 3) + 1),
        node_id: 'GRS-' + (Math.floor(Math.random() * 3) + 1) + '-PR',
        value: 2.8 + Math.random() * 0.5,
        threshold: 2.8,
        acknowledged: Math.random() > 0.3,
        resolved: Math.random() > 0.5
      });
    }
  }

  return data;
}

// JSON API command handlers
const API_COMMANDS = {
  get_forecast: async (params, pool) => {
    const { type, start_date, end_date, limit = 30 } = params;
    let sql = 'SELECT * FROM demo2_forecast WHERE 1=1';
    const sqlParams = [];
    
    if (type) {
      sql += ` AND type = $${sqlParams.length + 1}`;
      sqlParams.push(type);
    }
    if (start_date) {
      sql += ` AND date >= $${sqlParams.length + 1}`;
      sqlParams.push(start_date);
    }
    if (end_date) {
      sql += ` AND date <= $${sqlParams.length + 1}`;
      sqlParams.push(end_date);
    }
    sql += ` ORDER BY date DESC LIMIT $${sqlParams.length + 1}`;
    sqlParams.push(limit);
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'get_forecast', data: result.rows, count: result.rows.length };
  },
  
  get_weather: async (params, pool) => {
    const { start_time, end_time, location, limit = 100 } = params;
    let sql = 'SELECT * FROM demo2_weather WHERE 1=1';
    const sqlParams = [];
    
    if (start_time) {
      sql += ` AND timestamp >= $${sqlParams.length + 1}`;
      sqlParams.push(start_time);
    }
    if (end_time) {
      sql += ` AND timestamp <= $${sqlParams.length + 1}`;
      sqlParams.push(end_time);
    }
    if (location) {
      sql += ` AND location = $${sqlParams.length + 1}`;
      sqlParams.push(location);
    }
    sql += ` ORDER BY timestamp DESC LIMIT $${sqlParams.length + 1}`;
    sqlParams.push(limit);
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'get_weather', data: result.rows, count: result.rows.length };
  },
  
  get_consumption: async (params, pool) => {
    const { consumer_id, start_time, end_time, limit = 100 } = params;
    let sql = 'SELECT * FROM demo2_consumption WHERE 1=1';
    const sqlParams = [];
    
    if (consumer_id) {
      sql += ` AND consumer_id = $${sqlParams.length + 1}`;
      sqlParams.push(consumer_id);
    }
    if (start_time) {
      sql += ` AND timestamp >= $${sqlParams.length + 1}`;
      sqlParams.push(start_time);
    }
    if (end_time) {
      sql += ` AND timestamp <= $${sqlParams.length + 1}`;
      sqlParams.push(end_time);
    }
    sql += ` ORDER BY timestamp DESC LIMIT $${sqlParams.length + 1}`;
    sqlParams.push(limit);
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'get_consumption', data: result.rows, count: result.rows.length };
  },
  
  get_consumer: async (params, pool) => {
    const { consumer_id, category, region } = params;
    let sql = 'SELECT * FROM demo2_consumer WHERE 1=1';
    const sqlParams = [];
    
    if (consumer_id) {
      sql += ` AND consumer_id = $${sqlParams.length + 1}`;
      sqlParams.push(consumer_id);
    }
    if (category) {
      sql += ` AND category = $${sqlParams.length + 1}`;
      sqlParams.push(category);
    }
    if (region) {
      sql += ` AND region = $${sqlParams.length + 1}`;
      sqlParams.push(region);
    }
    sql += ' ORDER BY name';
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'get_consumer', data: result.rows, count: result.rows.length };
  },
  
  get_gas_balance: async (params, pool) => {
    const { start_date, end_date, limit = 30 } = params;
    let sql = 'SELECT * FROM demo2_gas_balance WHERE 1=1';
    const sqlParams = [];
    
    if (start_date) {
      sql += ` AND date >= $${sqlParams.length + 1}`;
      sqlParams.push(start_date);
    }
    if (end_date) {
      sql += ` AND date <= $${sqlParams.length + 1}`;
      sqlParams.push(end_date);
    }
    sql += ` ORDER BY date DESC LIMIT $${sqlParams.length + 1}`;
    sqlParams.push(limit);
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'get_gas_balance', data: result.rows, count: result.rows.length };
  },
  
  get_scada_telemetry: async (params, pool) => {
    const { node_id, metric_type, start_time, end_time, limit = 500 } = params;
    let sql = 'SELECT * FROM demo2_scada_telemetry WHERE 1=1';
    const sqlParams = [];
    
    if (node_id) {
      sql += ` AND node_id = $${sqlParams.length + 1}`;
      sqlParams.push(node_id);
    }
    if (metric_type) {
      sql += ` AND metric_type = $${sqlParams.length + 1}`;
      sqlParams.push(metric_type);
    }
    if (start_time) {
      sql += ` AND timestamp >= $${sqlParams.length + 1}`;
      sqlParams.push(start_time);
    }
    if (end_time) {
      sql += ` AND timestamp <= $${sqlParams.length + 1}`;
      sqlParams.push(end_time);
    }
    sql += ` ORDER BY timestamp DESC LIMIT $${sqlParams.length + 1}`;
    sqlParams.push(limit);
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'get_scada_telemetry', data: result.rows, count: result.rows.length };
  },
  
  get_alerts: async (params, pool) => {
    const { severity, acknowledged, resolved, limit = 50 } = params;
    let sql = 'SELECT * FROM demo2_alerts WHERE 1=1';
    const sqlParams = [];
    
    if (severity) {
      sql += ` AND severity = $${sqlParams.length + 1}`;
      sqlParams.push(severity);
    }
    if (acknowledged !== undefined) {
      sql += ` AND acknowledged = $${sqlParams.length + 1}`;
      sqlParams.push(acknowledged);
    }
    if (resolved !== undefined) {
      sql += ` AND resolved = $${sqlParams.length + 1}`;
      sqlParams.push(resolved);
    }
    sql += ` ORDER BY timestamp DESC LIMIT $${sqlParams.length + 1}`;
    sqlParams.push(limit);
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'get_alerts', data: result.rows, count: result.rows.length };
  },
  
  query_data: async (params, pool) => {
    const { table, columns, where, order_by, limit = 100 } = params;
    
    // Validate table name
    const validTables = ['demo2_forecast', 'demo2_weather', 'demo2_consumption', 'demo2_consumer', 
                         'demo2_gas_balance', 'demo2_scada_telemetry', 'demo2_alerts'];
    if (!validTables.includes(table)) {
      return { success: false, error: 'Invalid table name', valid_tables: validTables };
    }
    
    let sql = `SELECT ${columns || '*'} FROM ${table}`;
    const sqlParams = [];
    
    if (where) {
      sql += ` WHERE ${where}`;
    }
    if (order_by) {
      sql += ` ORDER BY ${order_by}`;
    }
    sql += ` LIMIT $${sqlParams.length + 1}`;
    sqlParams.push(limit);
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'query_data', table, data: result.rows, count: result.rows.length };
  },
  
  aggregate_data: async (params, pool) => {
    const { table, column, aggregate_fn = 'AVG', group_by, start_time, end_time } = params;
    
    const validTables = ['demo2_forecast', 'demo2_weather', 'demo2_consumption', 'demo2_gas_balance', 'demo2_scada_telemetry'];
    if (!validTables.includes(table)) {
      return { success: false, error: 'Invalid table name', valid_tables: validTables };
    }
    
    const validAggFns = ['AVG', 'SUM', 'MIN', 'MAX', 'COUNT'];
    const aggFn = validAggFns.includes(aggregate_fn.toUpperCase()) ? aggregate_fn.toUpperCase() : 'AVG';
    
    let sql = `SELECT ${group_by ? group_by + ', ' : ''}${aggFn}(${column}) as result FROM ${table}`;
    const sqlParams = [];
    
    if (start_time) {
      sql += ` WHERE timestamp >= $${sqlParams.length + 1}`;
      sqlParams.push(start_time);
    }
    if (end_time) {
      sql += `${start_time ? ' AND' : ' WHERE'} timestamp <= $${sqlParams.length + 1}`;
      sqlParams.push(end_time);
    }
    if (group_by) {
      sql += ` GROUP BY ${group_by}`;
    }
    
    const result = await pool.query(sql, sqlParams);
    return { success: true, command: 'aggregate_data', aggregate: aggFn, column, data: result.rows };
  },
  
  export_data: async (params, pool) => {
    const { tables, format = 'json', start_date, end_date } = params;
    const validTables = ['demo2_forecast', 'demo2_weather', 'demo2_consumption', 'demo2_consumer', 
                         'demo2_gas_balance', 'demo2_scada_telemetry', 'demo2_alerts'];
    
    const exportData = {};
    const tablesToExport = tables || validTables;
    
    for (const table of tablesToExport) {
      if (!validTables.includes(table)) continue;
      
      let sql = `SELECT * FROM ${table}`;
      const sqlParams = [];
      
      if (start_date) {
        sql += ` WHERE date >= $1 OR timestamp >= $1`;
        sqlParams.push(start_date);
      }
      if (end_date) {
        sql += `${start_date ? ' AND' : ' WHERE'} date <= $${sqlParams.length + 1} OR timestamp <= $${sqlParams.length + 1}`;
        sqlParams.push(end_date);
      }
      sql += ' LIMIT 1000';
      
      const result = await pool.query(sql, sqlParams);
      exportData[table] = result.rows;
    }
    
    return { 
      success: true, 
      command: 'export_data', 
      format,
      tables: Object.keys(exportData),
      data: exportData,
      exported_at: new Date().toISOString()
    };
  }
};

// Execute JSON API command
async function executeApiCommand(command, params, pool) {
  const handler = API_COMMANDS[command];
  if (!handler) {
    return { 
      success: false, 
      error: `Unknown command: ${command}`, 
      available_commands: Object.keys(API_COMMANDS) 
    };
  }
  
  try {
    return await handler(params || {}, pool);
  } catch (err) {
    return { success: false, error: err.message, command };
  }
}

// Seed demo2 data into PostgreSQL
async function seedDemo2Data(pool) {
  const mockData = generateDemo2MockData();
  let inserted = 0;
  
  // Insert consumers
  for (const c of mockData.consumer) {
    try {
      await pool.query(`
        INSERT INTO demo2_consumer (consumer_id, name, category, region, address, contract_number, daily_limit, monthly_limit, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (consumer_id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
      `, [c.consumer_id, c.name, c.category, c.region, c.address, c.contract_number, c.daily_limit, c.monthly_limit, c.status]);
      inserted++;
    } catch (err) { console.warn('demo2 seed consumer error:', err.message); }
  }
  
  // Insert forecasts
  for (const f of mockData.forecast) {
    try {
      await pool.query(`
        INSERT INTO demo2_forecast (date, type, value, unit, confidence_lower, confidence_upper)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [f.date, f.type, f.value, f.unit, f.confidence_lower, f.confidence_upper]);
      inserted++;
    } catch (err) {}
  }
  
  // Insert weather
  for (const w of mockData.weather) {
    try {
      await pool.query(`
        INSERT INTO demo2_weather (timestamp, temperature, humidity, pressure, wind_speed, wind_direction, precipitation, location)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [w.timestamp, w.temperature, w.humidity, w.pressure, w.wind_speed, w.wind_direction, w.precipitation, w.location]);
      inserted++;
    } catch (err) {}
  }
  
  // Insert consumption
  for (const c of mockData.consumption) {
    try {
      await pool.query(`
        INSERT INTO demo2_consumption (timestamp, consumer_id, consumer_name, volume, unit, temperature, pressure, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [c.timestamp, c.consumer_id, c.consumer_name, c.volume, c.unit, c.temperature, c.pressure, c.status]);
      inserted++;
    } catch (err) {}
  }
  
  // Insert gas balance
  for (const g of mockData.gas_balance) {
    try {
      await pool.query(`
        INSERT INTO demo2_gas_balance (date, production, consumption, import_volume, export_volume, storage_change, losses)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [g.date, g.production, g.consumption, g.import_volume, g.export_volume, g.storage_change, g.losses]);
      inserted++;
    } catch (err) {}
  }
  
  // Insert SCADA telemetry
  for (const s of mockData.scada_telemetry) {
    try {
      await pool.query(`
        INSERT INTO demo2_scada_telemetry (timestamp, node_id, node_name, metric_type, value, unit, quality, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [s.timestamp, s.node_id, s.node_name, s.metric_type, s.value, s.unit, s.quality, s.status]);
      inserted++;
    } catch (err) {}
  }
  
  // Insert alerts
  for (const a of mockData.alerts) {
    try {
      await pool.query(`
        INSERT INTO demo2_alerts (timestamp, severity, source, message, node_id, value, threshold, acknowledged, resolved)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [a.timestamp, a.severity, a.source, a.message, a.node_id, a.value, a.threshold, a.acknowledged, a.resolved]);
      inserted++;
    } catch (err) {}
  }
  
  return inserted;
}

module.exports = {
  DEMO2_CONFIG,
  DEMO2_SCHEMA,
  API_COMMANDS,
  generateDemo2MockData,
  executeApiCommand,
  seedDemo2Data
};
