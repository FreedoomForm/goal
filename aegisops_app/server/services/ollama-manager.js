/**
 * AegisOps — Ollama Manager
 * Управление локальными и облачными LLM моделями через Ollama API
 * Supports both local Ollama (http://localhost:11434) and cloud/remote Ollama endpoints
 * Uses Node.js built-in fetch (Node 18+)
 */
const { queryOne, queryAll, runSQL } = require('../db');

class OllamaManager {
  constructor() {
    this._baseUrl = 'http://localhost:11434';
    this._activeModel = 'qwen2.5:7b-instruct';
    this._activeProvider = 'local'; // 'local' or 'cloud'
    this._cloudEndpoints = []; // Cached cloud endpoints
  }

  getBaseUrl() {
    return this._baseUrl;
  }

  /**
   * Get the effective base URL based on active provider
   */
  getEffectiveBaseUrl() {
    if (this._activeProvider === 'cloud' && this._cloudEndpoints.length > 0) {
      return this._cloudEndpoints[0].url; // Use first cloud endpoint as primary
    }
    return this._baseUrl;
  }

  async refreshBaseUrl() {
    try {
      const row = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
      if (row?.base_url) this._baseUrl = row.base_url;
    } catch (_) {}
    return this._baseUrl;
  }

  /**
   * Load cloud endpoints from database
   */
  async loadCloudEndpoints() {
    try {
      const rows = await queryAll("SELECT * FROM connectors WHERE type='ollama_cloud'");
      this._cloudEndpoints = rows.map(r => ({
        id: r.id,
        name: r.name,
        url: r.base_url,
        auth_mode: r.auth_mode,
        config: typeof r.config === 'string' ? JSON.parse(r.config || '{}') : (r.config || {}),
        enabled: r.enabled,
      })).filter(e => e.enabled);
    } catch {
      this._cloudEndpoints = [];
    }
    return this._cloudEndpoints;
  }

  getActiveModel() {
    return this._activeModel;
  }

  getActiveProvider() {
    return this._activeProvider;
  }

  setModel(model, provider) {
    if (!model) return;
    this._activeModel = model;
    if (provider === 'cloud' || provider === 'local') {
      this._activeProvider = provider;
    }
  }

  setCloudProvider(cloudUrl) {
    this._activeProvider = 'cloud';
    // Find matching cloud endpoint
    const endpoint = this._cloudEndpoints.find(e => e.url === cloudUrl);
    if (endpoint) {
      this._baseUrl = endpoint.url;
    }
  }

  setLocalProvider() {
    this._activeProvider = 'local';
    this._baseUrl = 'http://localhost:11434';
  }

  async listModels() {
    const results = { local: [], cloud: [] };

    // Local models
    try {
      await this.refreshBaseUrl();
      const res = await fetch(`${this._baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      results.local = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        family: m.details?.family || '',
        parameterSize: m.details?.parameter_size || '',
        modified_at: m.modified_at,
        provider: 'local',
      }));
    } catch {}

    // Cloud models
    await this.loadCloudEndpoints();
    for (const endpoint of this._cloudEndpoints) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (endpoint.auth_mode === 'bearer' && endpoint.config?.token) {
          headers['Authorization'] = `Bearer ${endpoint.config.token}`;
        } else if (endpoint.auth_mode === 'token' && endpoint.config?.apiKey) {
          headers['Authorization'] = `Bearer ${endpoint.config.apiKey}`;
        }

        const res = await fetch(`${endpoint.url}/api/tags`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        const cloudModels = (data.models || []).map(m => ({
          name: m.name,
          size: m.size,
          family: m.details?.family || '',
          parameterSize: m.details?.parameter_size || '',
          modified_at: m.modified_at,
          provider: 'cloud',
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          endpointUrl: endpoint.url,
        }));
        results.cloud.push(...cloudModels);
      } catch {}
    }

    return results;
  }

  async isOnline() {
    const baseUrl = this.getEffectiveBaseUrl();
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async isLocalOnline() {
    try {
      const res = await fetch(`${this._baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async isCloudOnline(endpointUrl, config = {}) {
    try {
      const headers = {};
      if (config.token) headers['Authorization'] = `Bearer ${config.token}`;
      const res = await fetch(`${endpointUrl}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async pullModel(modelName) {
    const baseUrl = this.getEffectiveBaseUrl();
    // Fire and forget — pull runs in background
    fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
    }).catch(() => {});
  }

  async deleteModel(modelName) {
    const baseUrl = this.getEffectiveBaseUrl();
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    if (!res.ok) throw new Error(`Failed to delete model: ${res.status}`);
  }

  /**
   * Add a cloud Ollama endpoint
   */
  async addCloudEndpoint(name, url, authMode = 'none', config = {}) {
    const now = new Date().toISOString();
    const result = await runSQL(
      'INSERT INTO connectors (name, type, base_url, auth_mode, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [name, 'ollama_cloud', url.replace(/\/$/, ''), authMode, JSON.stringify(config), now, now]
    );
    await this.loadCloudEndpoints();
    return { id: result.lastID, name, url };
  }

  /**
   * Remove a cloud Ollama endpoint
   */
  async removeCloudEndpoint(id) {
    await runSQL('DELETE FROM connectors WHERE id = ? AND type = ?', [id, 'ollama_cloud']);
    await this.loadCloudEndpoints();
  }

  /**
   * Test a cloud Ollama endpoint
   */
  async testCloudEndpoint(url, authMode = 'none', config = {}) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authMode === 'bearer' && config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
      } else if (authMode === 'token' && config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const res = await fetch(`${url.replace(/\/$/, '')}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { status: 'offline', error: `HTTP ${res.status}` };
      const data = await res.json();
      return {
        status: 'online',
        models: (data.models || []).map(m => m.name),
        modelCount: (data.models || []).length,
      };
    } catch (err) {
      return { status: 'offline', error: err.message };
    }
  }
}

module.exports = new OllamaManager();
