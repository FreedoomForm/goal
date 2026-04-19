/**
 * AegisOps — Model Manager
 * Управление AI моделями (Ollama, OpenClaw, и др.)
 */
const ollamaManager = require('./ollama-manager');

class ModelManager {
  constructor() {
    this._providers = {
      ollama: ollamaManager,
    };
    this._activeProvider = 'ollama';
  }

  getActiveProvider() {
    return this._activeProvider;
  }

  setActiveProvider(provider) {
    if (this._providers[provider]) {
      this._activeProvider = provider;
    }
  }

  getActiveModel() {
    return this._providers[this._activeProvider]?.getActiveModel() || 'none';
  }

  setActiveModel(model, provider) {
    if (provider && this._providers[provider]) {
      this._activeProvider = provider;
    }
    this._providers[this._activeProvider]?.setModel(model);
  }

  async listAllModels() {
    const result = {};
    for (const [name, provider] of Object.entries(this._providers)) {
      try {
        result[name] = {
          online: await provider.isOnline(),
          models: await provider.listModels(),
        };
      } catch (err) {
        result[name] = { online: false, models: [], error: err.message };
      }
    }
    return result;
  }
}

module.exports = new ModelManager();
