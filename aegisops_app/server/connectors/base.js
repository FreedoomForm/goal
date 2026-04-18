/**
 * AegisOps — Base Connector Interface
 * All real connectors extend this class.
 */
class BaseConnector {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.baseUrl = (config.base_url || '').replace(/\/+$/, '');
    this.authMode = config.auth_mode || 'none';
    this.authPayload = typeof config.auth_payload === 'string'
      ? JSON.parse(config.auth_payload || '{}')
      : (config.auth_payload || {});
    this.config = typeof config.config === 'string'
      ? JSON.parse(config.config || '{}')
      : (config.config || {});
    this.enabled = !!config.enabled;
    this.timeout = this.config.timeout || 30000;
  }

  /** Test the connection. Returns { status: 'online'|'offline'|'error', details: {...} } */
  async testConnection() {
    throw new Error('testConnection() not implemented');
  }

  /** Fetch data from the external system */
  async fetchData(query = {}) {
    throw new Error('fetchData() not implemented');
  }

  /** Push data to the external system */
  async pushData(payload) {
    throw new Error('pushData() not implemented');
  }

  /** Discover schema / available entities */
  async discoverSchema() {
    return { entities: [], note: 'Schema discovery not supported for this connector type' };
  }

  /** Build auth headers based on config */
  getAuthHeaders() {
    const headers = {};
    if (this.authMode === 'basic') {
      const user = this.authPayload.username || '';
      const pass = this.authPayload.password || '';
      headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    } else if (this.authMode === 'bearer') {
      const token = this.authPayload.token || '';
      if (token && token !== 'CHANGE_ME') headers['Authorization'] = `Bearer ${token}`;
    } else if (this.authMode === 'token' || this.authMode === 'api_key') {
      const token = this.authPayload.token || this.authPayload.api_key || '';
      const headerName = this.authPayload.header_name || 'X-API-Key';
      if (token && token !== 'CHANGE_ME') headers[headerName] = token;
    }
    return headers;
  }

  /** Safe fetch with timeout */
  async safeFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Connection timeout after ${this.timeout}ms`);
      }
      throw err;
    }
  }
}

module.exports = { BaseConnector };
