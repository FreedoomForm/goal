/**
 * AegisOps — Ollama Manager
 * Управление локальными, облачными (удалёнными) и Ollama Cloud моделями.
 *
 * Three modes:
 * 1. Local:    http://localhost:11434  (Ollama running on the same machine)
 * 2. Cloud:    Any remote Ollama server (RunPod, Vast.ai, custom server)
 * 3. Ollama Cloud: https://ollama.com  (Official Ollama Cloud — API key auth,
 *              cloud models like gpt-oss:120b-cloud, llama3.3:70b-cloud)
 *
 * Ollama Cloud uses the same API as local Ollama (/api/chat, /api/tags, etc.)
 * but hosted at https://ollama.com with Bearer token authentication.
 * The API key can be set via OLLAMA_API_KEY env var or through the UI.
 *
 * Uses Node.js built-in fetch (Node 18+)
 */
const { queryOne, queryAll, runSQL } = require('../db');

class OllamaManager {
  constructor() {
    this._baseUrl = 'http://localhost:11434';
    this._activeModel = 'qwen2.5:7b-instruct';
    this._activeProvider = 'local'; // 'local', 'cloud', 'ollama-cloud'
    this._cloudEndpoints = []; // Cached cloud endpoints (remote Ollama servers)
    this._ollamaCloudKey = ''; // Ollama Cloud API key (OLLAMA_API_KEY)
    this._ollamaCloudUrl = 'https://ollama.com';
  }

  getBaseUrl() {
    return this._baseUrl;
  }

  /**
   * Get the effective base URL based on active provider
   */
  getEffectiveBaseUrl() {
    if (this._activeProvider === 'ollama-cloud') {
      return this._ollamaCloudUrl;
    }
    if (this._activeProvider === 'cloud' && this._cloudEndpoints.length > 0) {
      return this._cloudEndpoints[0].url;
    }
    return this._baseUrl;
  }

  /**
   * Get auth headers for the current active provider
   */
  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this._activeProvider === 'ollama-cloud' && this._ollamaCloudKey) {
      headers['Authorization'] = `Bearer ${this._ollamaCloudKey}`;
    } else if (this._activeProvider === 'cloud' && this._cloudEndpoints.length > 0) {
      const ep = this._cloudEndpoints[0];
      if (ep.auth_mode === 'bearer' && ep.config?.token) {
        headers['Authorization'] = `Bearer ${ep.config.token}`;
      } else if (ep.auth_mode === 'token' && ep.config?.apiKey) {
        headers['Authorization'] = `Bearer ${ep.config.apiKey}`;
      }
    }
    return headers;
  }

  async refreshBaseUrl() {
    try {
      const row = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
      if (row?.base_url) this._baseUrl = row.base_url;
    } catch (_) {}
    return this._baseUrl;
  }

  /**
   * Load cloud endpoints from database (remote Ollama servers, NOT ollama.com)
   */
  async loadCloudEndpoints() {
    try {
      const rows = await queryAll("SELECT * FROM connectors WHERE type='ollama_cloud' AND base_url NOT LIKE '%ollama.com%'");
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

  /**
   * Load Ollama Cloud API key — check env var first, then settings, then connector
   */
  async loadOllamaCloudKey() {
    // 1. Check environment variable OLLAMA_API_KEY (official method)
    if (process.env.OLLAMA_API_KEY) {
      this._ollamaCloudKey = process.env.OLLAMA_API_KEY;
      return this._ollamaCloudKey;
    }

    // 2. Check settings table
    try {
      const setting = await queryOne("SELECT value FROM settings WHERE key = 'ollama_cloud_api_key'");
      if (setting?.value) {
        this._ollamaCloudKey = setting.value;
        return this._ollamaCloudKey;
      }
    } catch {}

    // 3. Check connector entry for ollama.com
    try {
      const row = await queryOne("SELECT * FROM connectors WHERE type='ollama_cloud' AND base_url LIKE '%ollama.com%' LIMIT 1");
      if (row) {
        const config = typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {});
        this._ollamaCloudKey = config.apiKey || config.token || '';
        if (this._ollamaCloudKey) return this._ollamaCloudKey;
      }
    } catch {}

    return this._ollamaCloudKey;
  }

  getActiveModel() {
    return this._activeModel;
  }

  getActiveProvider() {
    return this._activeProvider;
  }

  /**
   * Get the effective model name for cloud providers.
   * Ollama Cloud requires -cloud suffix on model names.
   */
  getCloudModelName(model) {
    if (this._activeProvider === 'ollama-cloud' && model && !model.endsWith('-cloud')) {
      return model + '-cloud';
    }
    return model;
  }

  setModel(model, provider) {
    if (!model) return;
    this._activeModel = model;
    if (provider === 'cloud' || provider === 'local' || provider === 'ollama-cloud') {
      this._activeProvider = provider;
    }
  }

  setOllamaCloudKey(apiKey) {
    this._ollamaCloudKey = apiKey;
    this._activeProvider = 'ollama-cloud';
  }

  setCloudProvider(cloudUrl) {
    this._activeProvider = 'cloud';
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
    const results = { local: [], cloud: [], ollamaCloud: [] };

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

    // Cloud models (remote Ollama endpoints — NOT ollama.com)
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

    // Ollama Cloud models (ollama.com)
    await this.loadOllamaCloudKey();
    if (this._ollamaCloudKey) {
      try {
        const res = await fetch(`${this._ollamaCloudUrl}/api/tags`, {
          headers: { 'Authorization': `Bearer ${this._ollamaCloudKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          results.ollamaCloud = (data.models || []).map(m => ({
            name: m.name,
            size: m.size,
            family: m.details?.family || '',
            parameterSize: m.details?.parameter_size || '',
            modified_at: m.modified_at,
            provider: 'ollama-cloud',
            endpointName: 'Ollama Cloud',
            endpointUrl: this._ollamaCloudUrl,
          }));
        }
      } catch {}
    }

    return results;
  }

  async isOnline() {
    const baseUrl = this.getEffectiveBaseUrl();
    const headers = this.getAuthHeaders();
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { headers, signal: AbortSignal.timeout(5000) });
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

  async isOllamaCloudOnline() {
    await this.loadOllamaCloudKey();
    if (!this._ollamaCloudKey) return false;
    try {
      const res = await fetch(`${this._ollamaCloudUrl}/api/tags`, {
        headers: { 'Authorization': `Bearer ${this._ollamaCloudKey}` },
        signal: AbortSignal.timeout(5000),
      });
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
    const headers = this.getAuthHeaders();
    fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: modelName, stream: false }),
    }).catch(() => {});
  }

  async deleteModel(modelName) {
    const baseUrl = this.getEffectiveBaseUrl();
    const headers = this.getAuthHeaders();
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ name: modelName }),
    });
    if (!res.ok) throw new Error(`Failed to delete model: ${res.status}`);
  }

  async addCloudEndpoint(name, url, authMode = 'none', config = {}) {
    const now = new Date().toISOString();
    const result = await runSQL(
      'INSERT INTO connectors (name, type, base_url, auth_mode, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [name, 'ollama_cloud', url.replace(/\/$/, ''), authMode, JSON.stringify(config), now, now]
    );
    await this.loadCloudEndpoints();
    return { id: result.lastID, name, url };
  }

  async removeCloudEndpoint(id) {
    await runSQL('DELETE FROM connectors WHERE id = ? AND type = ?', [id, 'ollama_cloud']);
    await this.loadCloudEndpoints();
  }

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

  /**
   * Test Ollama Cloud (ollama.com) with an API key
   * The official Ollama Cloud API uses /api/tags with Bearer auth,
   * same as the local Ollama API but hosted at ollama.com
   */
  async testOllamaCloud(apiKey) {
    try {
      const res = await fetch(`${this._ollamaCloudUrl}/api/tags`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        // Provide helpful error messages based on status code
        if (res.status === 401) return { status: 'offline', error: 'Invalid API key (401 Unauthorized). Get your key at ollama.com/settings' };
        if (res.status === 403) return { status: 'offline', error: 'Access denied (403). Check your Ollama Cloud subscription.' };
        return { status: 'offline', error: `HTTP ${res.status}` };
      }
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

  /**
   * Save Ollama Cloud API key
   * Stores in settings table and creates/updates a connector entry for ollama.com
   */
  async saveOllamaCloudKey(apiKey) {
    this._ollamaCloudKey = apiKey;
    try {
      // Save to settings table
      await runSQL(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        ['ollama_cloud_api_key', apiKey, new Date().toISOString()]
      );

      // Create/update connector entry for ollama.com (separate from remote servers)
      const existing = await queryOne("SELECT id FROM connectors WHERE type='ollama_cloud' AND base_url LIKE '%ollama.com%' LIMIT 1");
      if (existing) {
        await runSQL('UPDATE connectors SET config = ?, updated_at = ? WHERE id = ?',
          [JSON.stringify({ apiKey }), new Date().toISOString(), existing.id]);
      } else {
        const now = new Date().toISOString();
        await runSQL(
          'INSERT INTO connectors (name, type, base_url, auth_mode, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
          ['Ollama Cloud (Official)', 'ollama_cloud', 'https://ollama.com', 'bearer', JSON.stringify({ apiKey }), now, now]
        );
      }
    } catch {}
  }

  /**
   * Chat with Ollama Cloud — uses the standard Ollama /api/chat endpoint
   * at ollama.com with Bearer auth. Works exactly like local Ollama but
   * with authentication and cloud models (e.g., gpt-oss:120b-cloud).
   *
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {Object} options - { model, stream }
   * @returns {Object} - { provider, model, content, totalDuration, evalCount }
   */
  async chatWithOllamaCloud(messages, options = {}) {
    const apiKey = await this.loadOllamaCloudKey();
    if (!apiKey) throw new Error('Ollama Cloud API key not configured');

    const rawModel = options.model || this._activeModel || 'gpt-oss:120b-cloud';
    const model = rawModel.endsWith('-cloud') ? rawModel : rawModel + '-cloud';
    const res = await fetch(`${this._ollamaCloudUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('Ollama Cloud: Invalid API key');
      if (res.status === 403) throw new Error('Ollama Cloud: Access denied — check subscription');
      throw new Error(`Ollama Cloud: HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      provider: 'ollama-cloud',
      model: data.model || model,
      content: data.message?.content || '',
      totalDuration: data.total_duration,
      evalCount: data.eval_count,
    };
  }
}

module.exports = new OllamaManager();
