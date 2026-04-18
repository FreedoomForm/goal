/**
 * AegisOps — MQTT IoT Connector
 * Connects to MQTT brokers for IoT sensor data (gas pressure, temperature, flow).
 * Uses MQTT broker's HTTP API (EMQX, HiveMQ, Mosquitto with management plugin)
 * for REST-based publish/subscribe, with WebSocket fallback.
 */
const { BaseConnector } = require('./base');

class MqttConnector extends BaseConnector {
  constructor(config) {
    super(config);
    // Base URL should be the MQTT broker's HTTP API endpoint (e.g., http://broker:8083/api/v3 for EMQX)
    this.apiPath = this.config.api_path || '/api/v3';
    this.topic = this.config.topic || '#'; // Subscribe to all topics by default
    this.qos = this.config.qos || 0;
    this.username = this.authPayload.username || '';
    this.password = this.authPayload.password || '';
  }

  /** Build full API URL */
  _url(endpoint) {
    return `${this.baseUrl}${this.apiPath}/${endpoint}`.replace(/\/+/g, '/').replace(':/', '://');
  }

  /** Test connection to MQTT broker's HTTP API */
  async testConnection() {
    try {
      // Try to connect to broker's management API
      const res = await this.safeFetch(this._url('brokers'), {
        headers: this.getAuthHeaders(),
      });
      // If standard API doesn't work, try basic health check
      if (!res.ok) {
        const altRes = await this.safeFetch(this.baseUrl, {
          headers: this.getAuthHeaders(),
        });
        return {
          status: altRes.ok ? 'online' : 'error',
          httpStatus: altRes.status,
          endpoint: this.baseUrl,
          note: 'MQTT broker HTTP API reachable (management endpoint may differ)',
        };
      }
      const data = await res.json().catch(() => null);
      return {
        status: 'online',
        endpoint: this.baseUrl,
        broker: data,
      };
    } catch (err) {
      return {
        status: 'offline',
        error: err.message,
        suggestion: 'Проверьте URL MQTT брокера и доступность HTTP API. EMQX: http://host:8083/api/v3, HiveMQ: http://host:8080/api/v1',
        endpoint: this.baseUrl,
      };
    }
  }

  /** Fetch data — subscribe and collect messages from topics */
  async fetchData(query = {}) {
    const topic = query.topic || this.topic;
    try {
      // Try EMQX-style subscription API
      const res = await this.safeFetch(this._url(`topics/${encodeURIComponent(topic)}`), {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        return { connector: this.name, type: 'mqtt', topic, data };
      }
      // Fallback: try to get last messages from a cache endpoint
      const cacheRes = await this.safeFetch(this._url(`messages?topic=${encodeURIComponent(topic)}&limit=100`), {
        headers: this.getAuthHeaders(),
      });
      const data = await cacheRes.json().catch(() => ({ note: 'MQTT data requires active subscription' }));
      return { connector: this.name, type: 'mqtt', topic, data };
    } catch (err) {
      return { connector: this.name, type: 'mqtt', topic, error: err.message };
    }
  }

  /** Publish a message to an MQTT topic */
  async pushData(payload) {
    const topic = payload.topic || this.topic;
    const message = payload.message || payload.data || '';
    try {
      const res = await this.safeFetch(this._url('publish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify({ topic, payload: message, qos: this.qos }),
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, topic, httpStatus: res.status, data };
    } catch (err) {
      return { success: false, topic, error: err.message };
    }
  }

  /** Discover available MQTT topics */
  async discoverSchema() {
    try {
      const res = await this.safeFetch(this._url('topics'), {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const topics = Array.isArray(data) ? data : (data?.data || data?.topics || []);
        return {
          entities: topics.map(t => ({
            name: typeof t === 'string' ? t : (t.topic || t.name),
            description: typeof t === 'object' ? (t.description || '') : '',
          })),
        };
      }
    } catch {}
    return {
      entities: [{ name: this.topic, description: 'Configured default topic' }],
      configFields: [
        { key: 'api_path', label: 'API Path', default: '/api/v3' },
        { key: 'topic', label: 'Тема подписки', default: '#' },
        { key: 'qos', label: 'QoS Level (0-2)', default: '0' },
      ],
    };
  }
}

module.exports = { MqttConnector };
