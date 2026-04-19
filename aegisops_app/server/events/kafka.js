/**
 * AegisOps — Apache Kafka Event Bus
 * Central event streaming platform for real-time data between connectors,
 * AI modules, ETL pipelines, and workflow engine.
 *
 * Architecture:
 *   Producer → Kafka Topic → Consumer Group → Handler
 *
 * Topics:
 *   - aegisops.connector.data     — Raw data from connectors (SCADA, OData, MQTT, etc.)
 *   - aegisops.connector.status   — Connector status changes (online/offline/error)
 *   - aegisops.etl.extracted      — ETL: raw data after extraction phase
 *   - aegisops.etl.transformed    — ETL: data after transformation phase
 *   - aegisops.etl.loaded         — ETL: data after loading to target
 *   - aegisops.workflow.event     — Workflow execution events (started, completed, failed)
 *   - aegisops.ai.request         — AI inference requests
 *   - aegisops.ai.response        — AI inference responses
 *   - aegisops.alert              — Alert/event notifications (SCADA anomalies, etc.)
 *   - aegisops.audit              — Audit log events (structured, for SIEM forwarding)
 *   - aegisops.scada.telemetry    — Time-series SCADA telemetry (pressure, temperature, flow)
 *
 * Fallback: If Kafka is unavailable, falls back to local EventEmitter
 * so the platform still works without Kafka (degraded mode).
 */
const { EventEmitter } = require('events');
const { log } = require('../middleware/logger');

/* ─── Topic definitions ─── */
const TOPICS = {
  CONNECTOR_DATA:     'aegisops.connector.data',
  CONNECTOR_STATUS:   'aegisops.connector.status',
  ETL_EXTRACTED:      'aegisops.etl.extracted',
  ETL_TRANSFORMED:    'aegisops.etl.transformed',
  ETL_LOADED:         'aegisops.etl.loaded',
  WORKFLOW_EVENT:     'aegisops.workflow.event',
  AI_REQUEST:         'aegisops.ai.request',
  AI_RESPONSE:        'aegisops.ai.response',
  ALERT:              'aegisops.alert',
  AUDIT:              'aegisops.audit',
  SCADA_TELEMETRY:    'aegisops.scada.telemetry',
};

const ALL_TOPICS = Object.values(TOPICS);

/* ─── Kafka client (optional dependency) ─── */
let kafkaLib = null;
let KafkaClass = null;
try {
  kafkaLib = require('kafkajs');
  KafkaClass = kafkaLib.Kafka;
} catch {
  kafkaLib = null;
}

/* ─── Event Bus Implementation ─── */
class AegisOpsEventBus {
  constructor() {
    this._emitter = new EventEmitter();
    this._emitter.setMaxListeners(200); // Many consumers per topic
    this._kafkaProducer = null;
    this._kafkaConsumers = [];
    this._kafkaAdmin = null;
    this._kafkaConnected = false;
    this._kafkaClientId = `aegisops-${process.pid}`;
    this._brokers = [];
    this._consumerGroups = new Map(); // groupId → Map<topic, handler[]>
    this._messageId = 0;
    this._stats = {
      produced: 0,
      consumed: 0,
      errors: 0,
      fallbackUsed: 0,
      kafkaAvailable: false,
    };
  }

  /**
   * Initialize Kafka connection or fall back to local EventEmitter.
   * @param {Object} opts - Configuration options
   * @param {string[]} opts.brokers - Kafka broker addresses (e.g. ['localhost:9092'])
   * @param {string} opts.clientId - Client identifier
   * @param {Object} opts.sasl - SASL auth (optional)
   * @param {Object} opts.ssl - SSL/TLS config (optional)
   */
  async init(opts = {}) {
    this._brokers = opts.brokers || (process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092']);
    this._kafkaClientId = opts.clientId || process.env.KAFKA_CLIENT_ID || this._kafkaClientId;

    if (!kafkaLib) {
      log.warn('kafka.unavailable', { reason: 'kafkajs not installed. Using local EventEmitter fallback.' });
      this._stats.kafkaAvailable = false;
      this._stats.fallbackUsed++;
      return { mode: 'fallback', reason: 'kafkajs not installed' };
    }

    try {
      const kafkaConfig = {
        clientId: this._kafkaClientId,
        brokers: this._brokers,
        retry: {
          initialRetryTime: 1000,
          retries: 5,
          multiplier: 2,
          maxRetryTime: 30000,
        },
      };

      if (opts.sasl || process.env.KAFKA_SASL_MECHANISM) {
        kafkaConfig.sasl = opts.sasl || {
          mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
          username: process.env.KAFKA_SASL_USERNAME || '',
          password: process.env.KAFKA_SASL_PASSWORD || '',
        };
      }

      if (opts.ssl || process.env.KAFKA_SSL === 'true') {
        kafkaConfig.ssl = opts.ssl || true;
      }

      const kafkaInstance = new KafkaClass(kafkaConfig);

      // Create admin client and ensure topics exist
      this._kafkaAdmin = kafkaInstance.admin();
      await this._kafkaAdmin.connect();

      const topicConfigs = ALL_TOPICS.map(topic => ({
        topic,
        numPartitions: topic === TOPICS.SCADA_TELEMETRY ? 6 : 3, // More partitions for high-throughput telemetry
        replicationFactor: 1, // Single-node default; increase for production clusters
        configEntries: [
          { name: 'retention.ms', value: topic === TOPICS.SCADA_TELEMETRY ? '604800000' : '259200000' }, // 7 days telemetry, 3 days others
          { name: 'cleanup.policy', value: 'delete' },
          { name: 'compression.type', value: 'lz4' },
        ],
      }));

      await this._kafkaAdmin.createTopics({ topics: topicConfigs, waitForLeaders: true });

      // Create producer
      this._kafkaProducer = kafkaInstance.producer({
        maxBatchSize: 16384,
        lingerMs: 5,
        allowAutoTopicCreation: false,
        idempotent: true,
      });
      await this._kafkaProducer.connect();

      this._kafkaConnected = true;
      this._stats.kafkaAvailable = true;

      log.info('kafka.connected', {
        brokers: this._brokers,
        clientId: this._kafkaClientId,
        topics: ALL_TOPICS.length,
      });

      return { mode: 'kafka', brokers: this._brokers, topics: ALL_TOPICS.length };
    } catch (err) {
      log.warn('kafka.connection_failed', { error: err.message, brokers: this._brokers });
      this._stats.kafkaAvailable = false;
      this._stats.fallbackUsed++;
      return { mode: 'fallback', reason: err.message };
    }
  }

  /**
   * Produce a message to a topic.
   * @param {string} topic - Topic name (use TOPICS constants)
   * @param {Object} message - Message payload
   * @param {string} [key] - Message key for partitioning
   * @param {Object} [headers] - Message headers
   */
  async produce(topic, message, key = null, headers = {}) {
    const messageId = ++this._messageId;
    const envelope = {
      id: messageId,
      topic,
      timestamp: new Date().toISOString(),
      source: this._kafkaClientId,
      payload: message,
    };

    this._stats.produced++;

    if (this._kafkaConnected && this._kafkaProducer) {
      try {
        await this._kafkaProducer.send({
          topic,
          messages: [{
            key: key || String(messageId),
            value: JSON.stringify(envelope),
            headers: {
              'content-type': 'application/json',
              'source': this._kafkaClientId,
              ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)])),
            },
          }],
        });
        return { messageId, mode: 'kafka' };
      } catch (err) {
        this._stats.errors++;
        log.warn('kafka.produce_error', { topic, error: err.message });
        // Fall through to local fallback
      }
    }

    // Fallback: local EventEmitter
    this._stats.fallbackUsed++;
    this._emitter.emit(topic, envelope);
    this._emitter.emit('*', envelope); // Wildcard for monitoring
    return { messageId, mode: 'fallback' };
  }

  /**
   * Subscribe to a topic with a handler.
   * @param {string} topic - Topic name
   * @param {Function} handler - Async handler(messageEnvelope)
   * @param {Object} opts - Options
   * @param {string} opts.groupId - Consumer group ID
   * @param {boolean} opts.fromBeginning - Start consuming from beginning
   */
  async subscribe(topic, handler, opts = {}) {
    const groupId = opts.groupId || `aegisops-consumer-${topic.replace(/\./g, '-')}`;

    if (this._kafkaConnected && kafkaLib) {
      try {
        const kafkaInstance = new KafkaClass({
          clientId: this._kafkaClientId,
          brokers: this._brokers,
        });

        const consumer = kafkaInstance.consumer({
          groupId,
          sessionTimeout: 30000,
          heartbeatInterval: 3000,
          maxPollIntervalMs: 300000,
        });

        await consumer.connect();
        await consumer.subscribe({ topic, fromBeginning: opts.fromBeginning || false });

        await consumer.run({
          eachMessage: async ({ topic: t, partition, message }) => {
            try {
              const envelope = JSON.parse(message.value.toString());
              this._stats.consumed++;
              await handler(envelope);
            } catch (err) {
              this._stats.errors++;
              log.warn('kafka.consume_error', { topic: t, partition, error: err.message });
            }
          },
        });

        this._kafkaConsumers.push(consumer);

        // Track consumer group
        if (!this._consumerGroups.has(groupId)) {
          this._consumerGroups.set(groupId, new Map());
        }
        const groupHandlers = this._consumerGroups.get(groupId);
        groupHandlers.set(topic, handler);

        log.info('kafka.subscribed', { topic, groupId });
        return { mode: 'kafka', topic, groupId };
      } catch (err) {
        log.warn('kafka.subscribe_error', { topic, error: err.message });
      }
    }

    // Fallback: local EventEmitter
    this._emitter.on(topic, handler);
    return { mode: 'fallback', topic };
  }

  /**
   * Unsubscribe a handler from a topic.
   */
  async unsubscribe(topic, handler) {
    this._emitter.off(topic, handler);
  }

  /**
   * Subscribe to all topics (wildcard).
   */
  async subscribeAll(handler, opts = {}) {
    return this.subscribe('*', handler, { ...opts, groupId: opts.groupId || 'aegisops-monitor' });
  }

  /**
   * Get event bus statistics.
   */
  getStats() {
    return {
      ...this._stats,
      brokers: this._brokers,
      topics: ALL_TOPICS,
      consumerGroups: Array.from(this._consumerGroups.keys()),
      connected: this._kafkaConnected,
    };
  }

  /**
   * Check if Kafka is available.
   */
  isKafkaAvailable() {
    return this._kafkaConnected;
  }

  /**
   * Graceful shutdown.
   */
  async shutdown() {
    log.info('kafka.shutting_down');

    // Disconnect consumers
    for (const consumer of this._kafkaConsumers) {
      try { await consumer.disconnect(); } catch {}
    }
    this._kafkaConsumers = [];

    // Disconnect producer
    if (this._kafkaProducer) {
      try { await this._kafkaProducer.disconnect(); } catch {}
      this._kafkaProducer = null;
    }

    // Disconnect admin
    if (this._kafkaAdmin) {
      try { await this._kafkaAdmin.disconnect(); } catch {}
      this._kafkaAdmin = null;
    }

    this._kafkaConnected = false;
    this._emitter.removeAllListeners();
    log.info('kafka.disconnected');
  }
}

/* Singleton instance */
const eventBus = new AegisOpsEventBus();

module.exports = {
  eventBus,
  TOPICS,
  ALL_TOPICS,
  AegisOpsEventBus,
};
