/**
 * AegisOps — Connector Registry
 * Maps connector types to their real implementation classes.
 * Handles credential decryption for connector instances.
 */
const { OllamaConnector } = require('./ollama');
const { ODataConnector } = require('./odata');
const { OpcUaConnector } = require('./opcua');
const { TelegramConnector } = require('./telegram');
const { RestConnector } = require('./rest');
const { EmailConnector } = require('./email');
const { WebhookConnector } = require('./webhook');
const { DatabaseConnector } = require('./database');
const { MqttConnector } = require('./mqtt');
const { AskugConnector } = require('./askug');
const { decryptCredentials } = require('../security/crypto');

/** Map of connector type → class */
const CONNECTOR_CLASSES = {
  ollama: OllamaConnector,
  one_c_odata: ODataConnector,
  sap_odata: ODataConnector,
  opc_ua: OpcUaConnector,
  telegram: TelegramConnector,
  crm_rest: RestConnector,
  erp_rest: RestConnector,
  rest: RestConnector,
  graphql: RestConnector,
  database: DatabaseConnector,
  mssql: DatabaseConnector,
  postgresql: DatabaseConnector,
  mysql: DatabaseConnector,
  email: EmailConnector,
  smtp: EmailConnector,
  webhook: WebhookConnector,
  mqtt: MqttConnector,
  iot: MqttConnector,
  askug: AskugConnector,
  egaz: AskugConnector,
  ugaz: AskugConnector,
};

/**
 * Create a connector instance from a DB row.
 * Handles credential decryption: tries encrypted_auth_payload first,
 * then falls back to plaintext auth_payload.
 * @param {Object} row — connector record from the database
 * @returns {BaseConnector} — real connector instance with decrypted credentials
 */
function createConnector(row) {
  const ConnectorClass = CONNECTOR_CLASSES[row.type];
  const TargetClass = ConnectorClass || RestConnector;

  // Decrypt credentials if encrypted_auth_payload exists
  let authPayload = {};
  if (row.encrypted_auth_payload) {
    try {
      authPayload = decryptCredentials(row.encrypted_auth_payload);
    } catch (err) {
      // If decryption fails, try plaintext fallback
      authPayload = _safeParseJSON(row.auth_payload, {});
    }
  } else {
    // No encrypted payload — use plaintext
    authPayload = _safeParseJSON(row.auth_payload, {});
  }

  // Parse config
  const config = _safeParseJSON(row.config, {});

  // Build a clean connector config with decrypted credentials
  const connectorConfig = {
    ...row,
    auth_payload: authPayload,
    config: config,
  };

  return new TargetClass(connectorConfig);
}

function _safeParseJSON(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * Get all supported connector types with descriptions.
 */
function getConnectorTypes() {
  return [
    { type: 'ollama', name: 'Ollama LLM', description: 'Локальная нейросеть через Ollama API', icon: '🤖', protocol: 'HTTP' },
    { type: 'one_c_odata', name: '1C / OData', description: '1C:Enterprise через OData v3 REST API', icon: '📦', protocol: 'OData' },
    { type: 'sap_odata', name: 'SAP S/4HANA / OData', description: 'SAP S/4HANA через OData v2/v4 с CSRF', icon: '🏢', protocol: 'OData' },
    { type: 'opc_ua', name: 'OPC UA / SCADA', description: 'Промышленный контур через OPC UA', icon: '🏭', protocol: 'OPC UA' },
    { type: 'telegram', name: 'Telegram Bot', description: 'Отправка сообщений и файлов через Telegram Bot API', icon: '✈️', protocol: 'HTTPS' },
    { type: 'crm_rest', name: 'CRM (REST API)', description: 'Любая CRM-система через REST API', icon: '👥', protocol: 'REST' },
    { type: 'erp_rest', name: 'ERP (REST API)', description: 'ERP-система через REST API', icon: '⚙️', protocol: 'REST' },
    { type: 'rest', name: 'Generic REST', description: 'Любой REST/HTTP API', icon: '🌐', protocol: 'REST' },
    { type: 'graphql', name: 'GraphQL', description: 'GraphQL API endpoint', icon: '💎', protocol: 'GraphQL' },
    { type: 'database', name: 'Database (SQL)', description: 'Прямое подключение к БД: PostgreSQL, MySQL, MSSQL', icon: '🗄️', protocol: 'SQL' },
    { type: 'email', name: 'Email / SMTP', description: 'Отправка email через SMTP', icon: '📧', protocol: 'SMTP' },
    { type: 'webhook', name: 'Webhook', description: 'Исходящие/входящие webhook (Slack, Teams, custom)', icon: '🔗', protocol: 'HTTP' },
    { type: 'askug', name: 'АСКУГ / UGaz', description: 'Автоматизированная система контроля и учета газа (АСКУГ, UGaz, E-GAZ)', icon: '💳', protocol: 'REST' },
    { type: 'mqtt', name: 'MQTT / IoT', description: 'IoT-сенсоры через MQTT брокер (EMQX, HiveMQ)', icon: '📡', protocol: 'MQTT' },
    { type: 'iot', name: 'IoT Sensor', description: 'IoT-датчики (газ, температура, расход) через MQTT', icon: '🌡️', protocol: 'MQTT' },
  ];
}

module.exports = { createConnector, getConnectorTypes, CONNECTOR_CLASSES };
