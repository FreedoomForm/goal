/**
 * AegisOps — Ollama Manager
 * Управление локальными LLM моделями через Ollama API
 * Uses Node.js built-in fetch (Node 18+)
 */
const { queryOne } = require('../db');

class OllamaManager {
  constructor() {
    this._baseUrl = 'http://localhost:11434';
    this._activeModel = 'qwen2.5:7b-instruct';
  }

  getBaseUrl() {
    return this._baseUrl;
  }

  async refreshBaseUrl() {
    try {
      const row = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
      if (row?.base_url) this._baseUrl = row.base_url;
    } catch (_) {}
    return this._baseUrl;
  }

  getActiveModel() {
    return this._activeModel;
  }

  setModel(model) {
    if (!model) return;
    this._activeModel = model;
  }

  async listModels() {
    const baseUrl = this.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      return (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        family: m.details?.family || '',
        modified_at: m.modified_at,
      }));
    } catch (err) {
      return [];
    }
  }

  async isOnline() {
    const baseUrl = this.getBaseUrl();
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async pullModel(modelName) {
    const baseUrl = this.getBaseUrl();
    // Fire and forget — pull runs in background
    fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
    }).catch(() => {});
  }

  async deleteModel(modelName) {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    if (!res.ok) throw new Error(`Failed to delete model: ${res.status}`);
  }
}

module.exports = new OllamaManager();
