/**
 * AegisOps Local AI — Database Layer (sql.js / WASM SQLite)
 * Pure JS/WASM, no native compilation required.
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR_DEFAULT = path.join(__dirname, '..', 'data');
const DB_PATH_DEFAULT = path.join(DB_DIR_DEFAULT, 'aegisops.db');

let dbDir = DB_DIR_DEFAULT;
let dbPath = DB_PATH_DEFAULT;

let db = null;
let SQL = null;

function getDB() {
  if (!db) throw new Error('DB not initialized. Call initDB() first.');
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function nowISO() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function initDB(customDir) {
  // Allow overriding the DB directory (needed for packaged Electron apps
  // where __dirname points inside read-only ASAR archive).
  if (customDir) {
    dbDir = customDir;
    dbPath = path.join(dbDir, 'aegisops.db');
  }

  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS connectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT DEFAULT '',
      auth_mode TEXT DEFAULT 'none',
      auth_payload TEXT DEFAULT '{}',
      config TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      cron_expr TEXT DEFAULT '',
      connector_ids TEXT DEFAULT '[]',
      objective TEXT DEFAULT '',
      delivery_channel TEXT DEFAULT 'none',
      config TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      scenario_id INTEGER,
      path TEXT NOT NULL,
      format TEXT DEFAULT 'html',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      icon TEXT DEFAULT '📊',
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS training_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_model TEXT DEFAULT 'qwen2.5:7b',
      dataset_path TEXT DEFAULT '',
      method TEXT DEFAULT 'lora',
      config TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      result TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS etl_pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_connector_id INTEGER,
      target TEXT DEFAULT 'local_db',
      schedule TEXT DEFAULT '',
      config TEXT DEFAULT '{}',
      status TEXT DEFAULT 'idle',
      last_run TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      graph TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      cron_expr TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      trace TEXT DEFAULT '[]',
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      scopes TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      preset TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      auto_start INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Check if seeded
  const countResult = db.exec("SELECT COUNT(*) as c FROM connectors");
  const count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
  if (count === 0) {
    seedData();
  }

  saveDB();
  console.log('[AegisOps DB] Initialized at', dbPath);
}

/** Helper: run query and return rows as objects */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Helper: run query and return first row */
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Helper: run INSERT/UPDATE/DELETE */
function runSQL(sql, params = []) {
  db.run(sql, params);
  saveDB();
  const result = db.exec("SELECT last_insert_rowid() as id");
  return { lastInsertRowid: result.length > 0 ? result[0].values[0][0] : 0 };
}

function seedData() {
  const ts = nowISO();

  // Connectors
  const connectors = [
    ['Локальная LLM (Ollama)', 'ollama', 'http://127.0.0.1:11434', 'none', '{}', '{"model":"qwen2.5:7b-instruct","embedding_model":"nomic-embed-text"}', 1],
    ['1C Бухгалтерия / OData', 'one_c_odata', 'http://localhost/accounting/odata/standard.odata', 'basic', '{"username":"","password":""}', '{"entity":"Document_РеализацияТоваровУслуг"}', 0],
    ['1C ЗУП / OData', 'one_c_odata', 'http://localhost/zup/odata/standard.odata', 'basic', '{"username":"","password":""}', '{"entity":"Document_НачислениеЗарплаты"}', 0],
    ['SAP S/4HANA / OData', 'sap_odata', 'https://sap.example.local/sap/opu/odata/sap', 'bearer', '{"token":""}', '{"service":"API_SALESORDER_SRV","sap_client":"100"}', 0],
    ['SCADA / OPC UA', 'opc_ua', 'opc.tcp://127.0.0.1:4840', 'none', '{}', '{"nodes":["ns=2;i=2","ns=2;i=3","ns=2;i=4"]}', 0],
    ['Telegram Bot', 'telegram', 'https://api.telegram.org', 'token', '{"token":"","chat_id":""}', '{}', 0],
    ['CRM (REST API)', 'crm_rest', '', 'bearer', '{"token":""}', '{}', 0],
    ['ERP Модуль (REST)', 'erp_rest', '', 'basic', '{"username":"","password":""}', '{}', 0],
  ];
  for (const [name, type, base_url, auth_mode, auth_payload, config, enabled] of connectors) {
    db.run(`INSERT INTO connectors (name, type, base_url, auth_mode, auth_payload, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, base_url, auth_mode, auth_payload, config, enabled, ts, ts]);
  }

  // Scenarios
  const scenarios = [
    ['Ежедневный отчет по состоянию газопровода', 'operations', '0 5 * * *', '[1,5,6]', 'Каждый день в 05:00 собирать данные с SCADA и Ollama, формировать управленческий отчет с отправкой через Telegram.', 'telegram', '{"template":"gas_daily"}', 1],
    ['Контроль дебиторской задолженности', 'finance', '0 8 * * 1-5', '[1,2,3]', 'Анализировать платежи из 1С, прогнозировать кассовые разрывы и формировать список рискованных контрагентов.', 'none', '{"template":"finance_risk","threshold":0.72}', 1],
    ['Мониторинг давления в ГТС', 'monitoring', '*/30 * * * *', '[1,5]', 'Каждые 30 минут считывать давление и температуру с SCADA через OPC UA. При аномалиях — алерт в Telegram.', 'telegram', '{"alert_threshold_mpa":4.0}', 1],
    ['Еженедельный финансовый прогноз', 'finance', '0 9 * * 1', '[1,2,3,4]', 'Каждый понедельник формировать прогноз: тарифы, субсидии, задолженности на основе данных из SAP и 1С.', 'none', '{}', 1],
    ['Анализ рисков недопоставки', 'risk', '0 7 * * *', '[1,4,5]', 'Ежедневный прогноз рисков по объемам недопоставки газа. Данные из SCADA + SAP.', 'none', '{"regression_window_days":90}', 1],
    ['Синхронизация SAP закупок', 'integration', '0 6 * * 1-5', '[1,4]', 'Выгрузка purchase orders из SAP S/4HANA и формирование аналитического отчета.', 'none', '{"sap_module":"MM"}', 0],
  ];
  for (const [name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled] of scenarios) {
    db.run(`INSERT INTO scenarios (name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled, ts, ts]);
  }

  // Modules
  const modules = [
    ['Газовый баланс и инфраструктура', 'gas_balance', 'Прогноз баланса газа, импорт/экспорт, ПХГ, оценка возможностей транспортировщика, сценарный анализ по температурам', 'active', '⛽', 1],
    ['Аналитика потребления', 'consumption', 'Анализ заявок и фактического потребления, дисциплина потребления, перебор/недобор, ХГТ по ниткам ГТС', 'active', '📈', 2],
    ['Мониторинг платежей', 'payments', 'Платежеспособность потребителей и контрагентов, пени/штрафы/скидки, ежедневный мониторинг поступлений', 'active', '💰', 3],
    ['Финансовое моделирование', 'finance', 'Прогноз поступлений/платежей, ДЗ и КЗ, расщепление, субсидии, тарифы от безубыточности', 'active', '📊', 4],
    ['Управление рисками', 'risks', 'Прогноз рисков по качеству газа, недопоставки, убытки, регрессионные модели, VaR-анализ', 'active', '🔍', 5],
    ['ETL и Дата-инжиниринг', 'etl', 'Пайплайны выгрузки из ERP/1C/SCADA, очистка, разметка, обогащение данных', 'active', '🔄', 6],
    ['Обучение моделей', 'training', 'Локальное дообучение моделей: LoRA, QLoRA, полное дообучение', 'active', '🧠', 7],
    ['Генерация документов', 'documents', 'HTML/PDF отчеты, протоколы, аналитические записки, справки', 'active', '📄', 8],
  ];
  for (const [name, code, description, status, icon, sort_order] of modules) {
    db.run(`INSERT INTO modules (name, code, description, status, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, code, description, status, icon, sort_order]);
  }

  // Settings
  const settings = [
    ['theme', 'dark'], ['language', 'ru'],
    ['ollama_url', 'http://127.0.0.1:11434'],
    ['ollama_model', 'qwen2.5:7b-instruct'],
    ['telegram_enabled', 'false'],
    ['auto_reports', 'true'],
    ['data_retention_days', '365'],
  ];
  for (const [k, v] of settings) {
    db.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [k, v, ts]);
  }

  db.run('INSERT INTO audit_log (event_type, payload, created_at) VALUES (?, ?, ?)',
    ['system.seeded', JSON.stringify({ connectors: connectors.length, scenarios: scenarios.length, modules: modules.length }), ts]);

  saveDB();
  console.log('[AegisOps DB] Seeded with data');
}

module.exports = { initDB, getDB, queryAll, queryOne, runSQL, saveDB, nowISO };
