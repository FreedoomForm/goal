/**
 * AegisOps — PostgreSQL + TimescaleDB Database Layer
 * Replaces SQLite/sql.js for production-grade data storage.
 *
 * Features:
 *   - PostgreSQL 15+ as primary data store
 *   - TimescaleDB extension for time-series telemetry data
 *   - Hypertable for SCADA/IoT telemetry (millions of records)
 *   - Connection pooling via pg Pool
 *   - Automatic migration on startup
 *   - Transparent fallback to SQLite if PostgreSQL unavailable
 *
 * Schema:
 *   - Core tables (connectors, scenarios, etc.) — standard PostgreSQL
 *   - telemetry_readings — TimescaleDB hypertable for SCADA time-series
 *   - etl_run_log — ETL execution history with metrics
 *   - workflow_schedules — Cron schedule tracking for Airflow-like DAG execution
 */
const path = require('path');
const fs = require('fs');
const { log } = require('../middleware/logger');

/* ─── PostgreSQL client (optional) ─── */
let pg = null;
try {
  pg = require('pg');
} catch {
  pg = null;
}

/* ─── SQLite fallback ─── */
let sqliteDB = null;
let initSqlJs = null;
try {
  initSqlJs = require('sql.js');
} catch {}

/* ─── Configuration ─── */
const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'aegisops',
  user: process.env.PG_USER || 'aegisops',
  password: process.env.PG_PASSWORD || 'aegisops',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

let pool = null;
let pgAvailable = false;
let usingFallback = false;

function nowISO() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/* ─── Placeholder conversion: ? → $1, $2, … for PostgreSQL ─── */
function convertPlaceholders(sql) {
  if (!pgAvailable) return sql;
  // Already using $N style — skip
  if (/\$1\b/.test(sql)) return sql;
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

async function createPool() {
  if (!pg) {
    log.warn('pg.unavailable', { reason: 'pg module not installed' });
    return null;
  }
  try {
    const newPool = new pg.Pool(PG_CONFIG);
    const client = await newPool.connect();
    client.release();
    log.info('pg.connected', { host: PG_CONFIG.host, database: PG_CONFIG.database });
    return newPool;
  } catch (err) {
    log.warn('pg.connection_failed', { error: err.message, host: PG_CONFIG.host });
    return null;
  }
}

/* ─── Migrations ─── */
const MIGRATIONS_CORE = `
CREATE TABLE IF NOT EXISTS connectors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT DEFAULT '',
  auth_mode TEXT DEFAULT 'none',
  auth_payload TEXT DEFAULT '{}',
  encrypted_auth_payload TEXT DEFAULT NULL,
  config TEXT DEFAULT '{}',
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS scenarios (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  cron_expr TEXT DEFAULT '',
  connector_ids TEXT DEFAULT '[]',
  objective TEXT DEFAULT '',
  delivery_channel TEXT DEFAULT 'none',
  config TEXT DEFAULT '{}',
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  scenario_id INTEGER,
  path TEXT NOT NULL,
  format TEXT DEFAULT 'html',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE TABLE IF NOT EXISTS modules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS training_jobs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  base_model TEXT DEFAULT 'qwen2.5:7b',
  dataset_path TEXT DEFAULT '',
  method TEXT DEFAULT 'lora',
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  result TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS etl_pipelines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  source_connector_id INTEGER,
  target TEXT DEFAULT 'local_db',
  schedule TEXT DEFAULT '',
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'idle',
  last_run TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  graph JSONB DEFAULT '{}',
  enabled INTEGER DEFAULT 1,
  cron_expr TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  trace JSONB DEFAULT '[]',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(workflow_id);
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes JSONB DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mcp_servers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  preset TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  auto_start INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS dmz_proxies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  connector_id INTEGER NOT NULL,
  proxy_host TEXT NOT NULL DEFAULT '127.0.0.1',
  proxy_port INTEGER NOT NULL DEFAULT 4840,
  target_host TEXT NOT NULL,
  target_port INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'read_only',
  allowed_operations JSONB DEFAULT '["read"]',
  rate_limit_per_sec INTEGER DEFAULT 10,
  audit_all INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workflow_schedules (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL UNIQUE,
  cron_expr TEXT NOT NULL,
  next_run TIMESTAMPTZ,
  last_run TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 300000,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

const MIGRATIONS_TIMESCALE = `
CREATE TABLE IF NOT EXISTS telemetry_readings (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connector_id INTEGER NOT NULL,
  node_id     TEXT NOT NULL DEFAULT '',
  metric_name TEXT NOT NULL DEFAULT '',
  value       DOUBLE PRECISION,
  quality     TEXT DEFAULT 'Good',
  metadata    JSONB DEFAULT '{}'
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
    PERFORM create_hypertable('telemetry_readings', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_telemetry_connector ON telemetry_readings(connector_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_node ON telemetry_readings(node_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_metric ON telemetry_readings(metric_name, time DESC);
`;

const MIGRATIONS_ETL = `
CREATE TABLE IF NOT EXISTS etl_run_log (
  id SERIAL PRIMARY KEY,
  pipeline_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  rows_extracted INTEGER DEFAULT 0,
  rows_transformed INTEGER DEFAULT 0,
  rows_loaded INTEGER DEFAULT 0,
  rows_rejected INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  metrics JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_etl_run_pipeline ON etl_run_log(pipeline_id, started_at DESC);
`;

const SEED_CONNECTORS = `
INSERT INTO connectors (name, type, base_url, auth_mode, auth_payload, config, enabled) VALUES
  ('Локальная LLM (Ollama)', 'ollama', 'http://127.0.0.1:11434', 'none', '{}', '{"model":"qwen2.5:7b-instruct","embedding_model":"nomic-embed-text"}', 1),
  ('1C Бухгалтерия / OData', 'one_c_odata', 'http://localhost/accounting/odata/standard.odata', 'basic', '{"username":"","password":""}', '{"entity":"Document_РеализацияТоваровУслуг"}', 0),
  ('1C ЗУП / OData', 'one_c_odata', 'http://localhost/zup/odata/standard.odata', 'basic', '{"username":"","password":""}', '{"entity":"Document_НачислениеЗарплаты"}', 0),
  ('SAP S/4HANA / OData', 'sap_odata', 'https://sap.example.local/sap/opu/odata/sap', 'bearer', '{"token":""}', '{"service":"API_SALESORDER_SRV","sap_client":"100"}', 0),
  ('SCADA / OPC UA', 'opc_ua', 'opc.tcp://127.0.0.1:4840', 'none', '{}', '{"nodes":["ns=2;i=2","ns=2;i=3","ns=2;i=4"]}', 0),
  ('Telegram Bot', 'telegram', 'https://api.telegram.org', 'token', '{"token":"","chat_id":""}', '{}', 0),
  ('CRM (REST API)', 'crm_rest', '', 'bearer', '{"token":""}', '{}', 0),
  ('ERP Модуль (REST)', 'erp_rest', '', 'basic', '{"username":"","password":""}', '{}', 0)
ON CONFLICT DO NOTHING;
`;

const SEED_MODULES = `
INSERT INTO modules (name, code, description, status, icon, sort_order) VALUES
  ('Газовый баланс и инфраструктура', 'gas_balance', 'Прогноз баланса газа, импорт/экспорт, ПХГ', 'active', '⛽', 1),
  ('Аналитика потребления', 'consumption', 'Анализ заявок и фактического потребления', 'active', '📈', 2),
  ('Мониторинг платежей', 'payments', 'Платежеспособность, пени/штрафы', 'active', '💰', 3),
  ('Финансовое моделирование', 'finance', 'Прогноз поступлений/платежей, тарифы', 'active', '📊', 4),
  ('Управление рисками', 'risks', 'Прогноз рисков, VaR-анализ', 'active', '🔍', 5),
  ('ETL и Дата-инжиниринг', 'etl', 'Пайплайны выгрузки, очистка, обогащение данных', 'active', '🔄', 6),
  ('Обучение моделей', 'training', 'Локальное дообучение: LoRA, QLoRA', 'active', '🧠', 7),
  ('Генерация документов', 'documents', 'HTML/PDF отчеты, протоколы', 'active', '📄', 8)
ON CONFLICT DO NOTHING;
`;

const SEED_SETTINGS = `
INSERT INTO settings (key, value) VALUES
  ('theme', 'dark'), ('language', 'ru'),
  ('ollama_url', 'http://127.0.0.1:11434'),
  ('ollama_model', 'qwen2.5:7b-instruct'),
  ('telegram_enabled', 'false'),
  ('auto_reports', 'true'),
  ('data_retention_days', '365'),
  ('db_mode', 'postgresql')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
`;

const SEED_WORKFLOWS = `
INSERT INTO workflows (name, description, graph, enabled, cron_expr) VALUES
  (
    'Ежедневный мониторинг коннекторов',
    'Автоматическая проверка доступности всех коннекторов каждый день в 9:00',
    '{"nodes":[{"id":"n1","type":"trigger.cron","params":{"cron":"0 9 * * *"}},{"id":"n2","type":"connector.test","params":{"connector_id":1}},{"id":"n3","type":"data.transform","params":{"expression":"$input"}},{"id":"n4","type":"output.report","params":{"template":"<h2>Мониторинг коннекторов</h2><pre>{{input}}</pre>"}}],"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n3","to":"n4"}],"config":{"max_retries":1,"retry_delay_ms":2000,"timeout_ms":30000}}'::jsonb,
    1,
    '0 9 * * *'
  ),
  (
    'Еженедельный анализ SCADA',
    'Еженедельный анализ телеметрии SCADA с помощью AI каждый понедельник в 8:00',
    '{"nodes":[{"id":"n1","type":"trigger.cron","params":{"cron":"0 8 * * 1"}},{"id":"n2","type":"connector.fetch","params":{"connector_id":5,"query":{"nodes":["ns=2;i=2"]}}},{"id":"n3","type":"ai.ask","params":{"prompt_template":"Проанализируй показания SCADA: {{$input}}","system":"Ты аналитик SCADA систем."}},{"id":"n4","type":"output.report","params":{"template":"<h2>Анализ SCADA</h2><pre>{{input}}</pre>"}}],"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n3","to":"n4"}],"config":{"max_retries":2,"retry_delay_ms":3000,"timeout_ms":120000}}'::jsonb,
    1,
    '0 8 * * 1'
  )
ON CONFLICT DO NOTHING;
`;

/* ─── Database Initialization ─── */
async function initDB(customDir) {
  pool = await createPool();
  if (pool) {
    pgAvailable = true;
    usingFallback = false;
    await runMigrations();
    await seedIfEmpty();
    log.info('pg.initialized', { host: PG_CONFIG.host, database: PG_CONFIG.database });
    return;
  }
  log.warn('db.fallback_sqlite', { reason: 'PostgreSQL unavailable, using SQLite' });
  usingFallback = true;
  await initSQLite(customDir);
}

async function runMigrations() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(MIGRATIONS_CORE);
    try { await client.query(MIGRATIONS_TIMESCALE); } catch (tsErr) {
      log.warn('pg.timescaledb_unavailable', { error: tsErr.message });
    }
    try { await client.query(MIGRATIONS_ETL); } catch {}
    try {
      const fs = require('fs');
      const path = require('path');
      const dwhPath = path.join(__dirname, 'dwh_schema.sql');
      if (fs.existsSync(dwhPath)) {
        const dwhSql = fs.readFileSync(dwhPath, 'utf8');
        await client.query(dwhSql);
        log.info('pg.dwh_schema_applied');
      }
    } catch (dwhErr) {
      log.warn('pg.dwh_schema_partial', { error: dwhErr.message });
    }
    await client.query('COMMIT');
    log.info('pg.migrations_complete');
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('pg.migration_failed', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

async function seedIfEmpty() {
  if (!pool) return;
  const result = await pool.query('SELECT COUNT(*) as c FROM connectors');
  if (parseInt(result.rows[0].c) === 0) {
    await pool.query(SEED_CONNECTORS);
    await pool.query(SEED_MODULES);
    await pool.query(SEED_SETTINGS);
    log.info('pg.seeded');
  }
  // Seed demo workflows if none exist
  const wfResult = await pool.query('SELECT COUNT(*) as c FROM workflows');
  if (parseInt(wfResult.rows[0].c) === 0) {
    await pool.query(SEED_WORKFLOWS);
    log.info('pg.seeded_workflows');
  }
}

async function initSQLite(customDir) {
  const dbDir = customDir || path.join(__dirname, '..', 'data');
  const dbPath = path.join(dbDir, 'aegisops.db');
  try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }); } catch {}

  if (!initSqlJs) throw new Error('Neither PostgreSQL nor sql.js available');
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    sqliteDB = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    sqliteDB = new SQL.Database();
  }
  sqliteDB.run(`
    CREATE TABLE IF NOT EXISTS connectors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, base_url TEXT DEFAULT '', auth_mode TEXT DEFAULT 'none', auth_payload TEXT DEFAULT '{}', encrypted_auth_payload TEXT DEFAULT NULL, config TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scenarios (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL, cron_expr TEXT DEFAULT '', connector_ids TEXT DEFAULT '[]', objective TEXT DEFAULT '', delivery_channel TEXT DEFAULT 'none', config TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, kind TEXT NOT NULL, scenario_id INTEGER, path TEXT NOT NULL, format TEXT DEFAULT 'html', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS modules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'active', icon TEXT DEFAULT '', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS training_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, base_model TEXT DEFAULT 'qwen2.5:7b', dataset_path TEXT DEFAULT '', method TEXT DEFAULT 'lora', config TEXT DEFAULT '{}', status TEXT DEFAULT 'pending', progress INTEGER DEFAULT 0, result TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS etl_pipelines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, source_connector_id INTEGER, target TEXT DEFAULT 'local_db', schedule TEXT DEFAULT '', config TEXT DEFAULT '{}', status TEXT DEFAULT 'idle', last_run TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT DEFAULT '', updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workflows (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', graph TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1, cron_expr TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workflow_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL, status TEXT DEFAULT 'pending', trace TEXT DEFAULT '[]', started_at TEXT NOT NULL, finished_at TEXT);
    CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, scopes TEXT DEFAULT '[]', created_at TEXT NOT NULL, last_used_at TEXT, revoked INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS mcp_servers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, preset TEXT NOT NULL, config TEXT DEFAULT '{}', auto_start INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dmz_proxies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, connector_id INTEGER NOT NULL, proxy_host TEXT NOT NULL DEFAULT '127.0.0.1', proxy_port INTEGER NOT NULL DEFAULT 4840, target_host TEXT NOT NULL, target_port INTEGER NOT NULL, mode TEXT NOT NULL DEFAULT 'read_only', allowed_operations TEXT DEFAULT '["read"]', rate_limit_per_sec INTEGER DEFAULT 10, audit_all INTEGER DEFAULT 1, enabled INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workflow_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL UNIQUE, cron_expr TEXT NOT NULL, next_run TEXT, last_run TEXT, status TEXT DEFAULT 'active', retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 3, timeout_ms INTEGER DEFAULT 300000, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS etl_run_log (id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'running', started_at TEXT NOT NULL, finished_at TEXT, rows_extracted INTEGER DEFAULT 0, rows_transformed INTEGER DEFAULT 0, rows_loaded INTEGER DEFAULT 0, rows_rejected INTEGER DEFAULT 0, errors TEXT DEFAULT '[]', metrics TEXT DEFAULT '{}');
  `);

  // Seed data for SQLite fallback if tables are empty
  const now = nowISO();
  const connCount = sqliteDB.exec("SELECT COUNT(*) as c FROM connectors");
  if (connCount.length > 0 && connCount[0].values[0][0] === 0) {
    log.info('sqlite.seeding_data');
    sqliteDB.run(`INSERT INTO connectors (name, type, base_url, auth_mode, auth_payload, config, enabled, created_at, updated_at) VALUES
      ('Локальная LLM (Ollama)', 'ollama', 'http://127.0.0.1:11434', 'none', '{}', '{"model":"qwen2.5:7b-instruct","embedding_model":"nomic-embed-text"}', 1, '${now}', '${now}'),
      ('1C Бухгалтерия / OData', 'one_c_odata', 'http://localhost/accounting/odata/standard.odata', 'basic', '{"username":"","password":""}', '{"entity":"Document_РеализацияТоваровУслуг"}', 0, '${now}', '${now}'),
      ('1C ЗУП / OData', 'one_c_odata', 'http://localhost/zup/odata/standard.odata', 'basic', '{"username":"","password":""}', '{"entity":"Document_НачислениеЗарплаты"}', 0, '${now}', '${now}'),
      ('SAP S/4HANA / OData', 'sap_odata', 'https://sap.example.local/sap/opu/odata/sap', 'bearer', '{"token":""}', '{"service":"API_SALESORDER_SRV","sap_client":"100"}', 0, '${now}', '${now}'),
      ('SCADA / OPC UA', 'opc_ua', 'opc.tcp://127.0.0.1:4840', 'none', '{}', '{"nodes":["ns=2;i=2","ns=2;i=3","ns=2;i=4"]}', 0, '${now}', '${now}'),
      ('Telegram Bot', 'telegram', 'https://api.telegram.org', 'token', '{"token":"","chat_id":""}', '{}', 0, '${now}', '${now}'),
      ('CRM (REST API)', 'crm_rest', '', 'bearer', '{"token":""}', '{}', 0, '${now}', '${now}'),
      ('ERP Модуль (REST)', 'erp_rest', '', 'basic', '{"username":"","password":""}', '{}', 0, '${now}', '${now}')
    `);
    sqliteDB.run(`INSERT INTO modules (name, code, description, status, icon, sort_order) VALUES
      ('Газовый баланс и инфраструктура', 'gas_balance', 'Прогноз баланса газа, импорт/экспорт, ПХГ', 'active', '⛽', 1),
      ('Аналитика потребления', 'consumption', 'Анализ заявок и фактического потребления', 'active', '📈', 2),
      ('Мониторинг платежей', 'payments', 'Платежеспособность, пени/штрафы', 'active', '💰', 3),
      ('Финансовое моделирование', 'finance', 'Прогноз поступлений/платежей, тарифы', 'active', '📊', 4),
      ('Управление рисками', 'risks', 'Прогноз рисков, VaR-анализ', 'active', '🔍', 5),
      ('ETL и Дата-инжиниринг', 'etl', 'Пайплайны выгрузки, очистка, обогащение данных', 'active', '🔄', 6),
      ('Обучение моделей', 'training', 'Локальное дообучение: LoRA, QLoRA', 'active', '🧠', 7),
      ('Генерация документов', 'documents', 'HTML/PDF отчеты, протоколы', 'active', '📄', 8)
    `);
    sqliteDB.run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES
      ('theme', 'dark', '${now}'), ('language', 'ru', '${now}'),
      ('ollama_url', 'http://127.0.0.1:11434', '${now}'),
      ('ollama_model', 'qwen2.5:7b-instruct', '${now}'),
      ('telegram_enabled', 'false', '${now}'),
      ('auto_reports', 'true', '${now}'),
      ('data_retention_days', '365', '${now}'),
      ('db_mode', 'sqlite', '${now}')
    `);
    // Seed demo workflows
    sqliteDB.run(`INSERT INTO workflows (name, description, graph, enabled, cron_expr, created_at, updated_at) VALUES
      ('Ежедневный мониторинг коннекторов', 'Автоматическая проверка доступности всех коннекторов каждый день в 9:00', '{"nodes":[{"id":"n1","type":"trigger.cron","label":"По расписанию","icon":"⏰","params":{"cron":"0 9 * * *"},"position":{"x":60,"y":80}},{"id":"n2","type":"connector.test","label":"Проверить коннектор","icon":"🔌","params":{"connector_id":1},"position":{"x":340,"y":80}},{"id":"n3","type":"data.transform","label":"Трансформация","icon":"🔧","params":{"expression":"$input"},"position":{"x":620,"y":80}},{"id":"n4","type":"output.report","label":"HTML отчёт","icon":"📄","params":{"template":"<h2>Мониторинг коннекторов</h2><pre>{{$input}}</pre>"},"position":{"x":900,"y":80}}],"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n3","to":"n4"}]}', 1, '0 9 * * *', '${now}', '${now}'),
      ('Еженедельный анализ SCADA', 'Еженедельный анализ телеметрии SCADA с помощью AI', '{"nodes":[{"id":"n1","type":"trigger.cron","label":"По расписанию","icon":"⏰","params":{"cron":"0 8 * * 1"},"position":{"x":60,"y":80}},{"id":"n2","type":"connector.fetch","label":"Получить данные","icon":"📥","params":{"connector_id":5,"query":{"nodes":["ns=2;i=2"]}},"position":{"x":340,"y":80}},{"id":"n3","type":"ai.ask","label":"AI-запрос","icon":"🤖","params":{"prompt_template":"Проанализируй показания SCADA: {{$input}}","system":"Ты аналитик SCADA систем."},"position":{"x":620,"y":80}},{"id":"n4","type":"output.report","label":"HTML отчёт","icon":"📄","params":{"template":"<h2>Анализ SCADA</h2><pre>{{$input}}</pre>"},"position":{"x":900,"y":80}}],"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n3","to":"n4"}]}', 1, '0 8 * * 1', '${now}', '${now}')
    `);
    log.info('sqlite.seeded');
  }

  saveSQLite();
  log.info('sqlite.initialized', { path: dbPath });
}

function saveSQLite() {
  if (!sqliteDB) return;
  const dbDir = path.join(__dirname, '..', 'data');
  const dbPath = path.join(dbDir, 'aegisops.db');
  try { fs.writeFileSync(dbPath, Buffer.from(sqliteDB.export())); } catch {}
}

let _saveTimer = null;
function saveDBDebounced() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { saveSQLite(); _saveTimer = null; }, 2000);
}
function flushDB() {
  if (_saveTimer) { clearTimeout(_saveTimer); saveSQLite(); _saveTimer = null; }
}

/* ─── Unified Query Interface ─── */
async function queryAll(sql, params = []) {
  if (pgAvailable && pool) {
    const result = await pool.query(convertPlaceholders(sql), params);
    return result.rows;
  }
  if (!sqliteDB) throw new Error('Database not initialized');
  const stmt = sqliteDB.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function runSQL(sql, params = []) {
  if (pgAvailable && pool) {
    const result = await pool.query(convertPlaceholders(sql), params);
    let lastId = 0;
    if (result.rows && result.rows.length > 0) {
      lastId = result.rows[0].id || result.rows[0].lastInsertRowid || 0;
    }
    return { lastInsertRowid: lastId, rowCount: result.rowCount || 0 };
  }
  if (!sqliteDB) throw new Error('Database not initialized');
  sqliteDB.run(sql, params);
  saveDBDebounced();
  const result = sqliteDB.exec("SELECT last_insert_rowid() as id");
  return { lastInsertRowid: result.length > 0 ? result[0].values[0][0] : 0 };
}

async function saveDB() { if (usingFallback) saveSQLite(); }

async function insertTelemetry(reading) {
  const { connector_id, node_id, metric_name, value, quality, metadata, time } = reading;
  if (pgAvailable && pool) {
    await pool.query(
      `INSERT INTO telemetry_readings (time, connector_id, node_id, metric_name, value, quality, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [time || new Date().toISOString(), connector_id, node_id || '', metric_name || '', value, quality || 'Good', JSON.stringify(metadata || {})]
    );
  }
}

async function queryTelemetry(opts = {}) {
  const { connector_id, node_id, metric_name, start_time, end_time, limit = 1000, aggregate = 'raw' } = opts;
  if (pgAvailable && pool) {
    if (aggregate === 'hourly') {
      const result = await pool.query(
        `SELECT bucket, connector_id, node_id, metric_name, avg_value, min_value, max_value, sample_count FROM telemetry_hourly WHERE ($1::timestamptz IS NULL OR bucket >= $1) AND ($2::timestamptz IS NULL OR bucket <= $2) AND ($3::integer IS NULL OR connector_id = $3) AND ($4::text IS NULL OR node_id = $4) ORDER BY bucket DESC LIMIT $5`,
        [start_time || null, end_time || null, connector_id || null, node_id || null, limit]
      );
      return result.rows;
    }
    if (aggregate === 'daily') {
      const result = await pool.query(
        `SELECT bucket, connector_id, node_id, metric_name, avg_value, min_value, max_value, sample_count, stddev_value FROM telemetry_daily WHERE ($1::timestamptz IS NULL OR bucket >= $1) AND ($2::timestamptz IS NULL OR bucket <= $2) AND ($3::integer IS NULL OR connector_id = $3) ORDER BY bucket DESC LIMIT $4`,
        [start_time || null, end_time || null, connector_id || null, limit]
      );
      return result.rows;
    }
    const result = await pool.query(
      `SELECT time, connector_id, node_id, metric_name, value, quality, metadata FROM telemetry_readings WHERE ($1::timestamptz IS NULL OR time >= $1) AND ($2::timestamptz IS NULL OR time <= $2) AND ($3::integer IS NULL OR connector_id = $3) AND ($4::text IS NULL OR node_id = $4) AND ($5::text IS NULL OR metric_name = $5) ORDER BY time DESC LIMIT $6`,
      [start_time || null, end_time || null, connector_id || null, node_id || null, metric_name || null, limit]
    );
    return result.rows;
  }
  return [];
}

function getDBInfo() {
  return { mode: pgAvailable ? 'postgresql' : 'sqlite', pgAvailable, host: pgAvailable ? PG_CONFIG.host : null, database: pgAvailable ? PG_CONFIG.database : null };
}

async function cleanupOldData(retentionDays = 365) {
  if (!pgAvailable || !pool) return { cleaned: 0 };
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  let totalCleaned = 0;
  try {
    const r1 = await pool.query('DELETE FROM audit_log WHERE created_at < $1', [cutoff]);
    totalCleaned += r1.rowCount || 0;
    const r2 = await pool.query("DELETE FROM workflow_runs WHERE started_at < $1 AND status IN ('completed', 'failed')", [cutoff]);
    totalCleaned += r2.rowCount || 0;
    const r3 = await pool.query('DELETE FROM telemetry_readings WHERE time < $1', [cutoff]);
    totalCleaned += r3.rowCount || 0;
    log.info('db.cleanup', { retentionDays, totalCleaned });
  } catch (err) { log.warn('db.cleanup_error', { error: err.message }); }
  return { cleaned: totalCleaned };
}

async function shutdownDB() {
  if (pool) { await pool.end(); pool = null; pgAvailable = false; }
  flushDB();
}

module.exports = {
  initDB, getDB: () => sqliteDB, queryAll, queryOne, runSQL, saveDB, saveDBDebounced, flushDB, nowISO,
  insertTelemetry, queryTelemetry, getDBInfo, cleanupOldData, shutdownDB,
  isPostgreSQL: () => pgAvailable,
};
