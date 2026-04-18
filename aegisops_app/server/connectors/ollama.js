/**
 * AegisOps — Real Ollama Connector
 * Connects to a local Ollama instance for LLM inference.
 */
const { BaseConnector } = require('./base');

class OllamaConnector extends BaseConnector {
  constructor(config) {
    super(config);
    if (!this.baseUrl) this.baseUrl = 'http://127.0.0.1:11434';
    this.model = this.config.model || 'qwen2.5:7b-instruct';
    this.embeddingModel = this.config.embedding_model || 'nomic-embed-text';
  }

  async testConnection() {
    try {
      const res = await this.safeFetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map(m => m.name);
      return {
        status: 'online',
        models,
        modelCount: models.length,
        hasRequestedModel: models.some(m => m.startsWith(this.model.split(':')[0])),
        endpoint: this.baseUrl,
      };
    } catch (err) {
      return {
        status: 'offline',
        error: err.message,
        suggestion: 'Убедитесь что Ollama запущена: ollama serve',
        endpoint: this.baseUrl,
      };
    }
  }

  async fetchData(query = {}) {
    return this.testConnection();
  }

  /** Chat completion — real call to Ollama /api/chat */
  async chat(messages, options = {}) {
    const model = options.model || this.model;
    const stream = options.stream || false;
    const res = await this.safeFetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream,
        messages,
        ...(options.temperature !== undefined && { options: { temperature: options.temperature } }),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama chat error: ${res.status} ${text}`);
    }
    const data = await res.json();
    return {
      provider: 'ollama',
      model,
      content: data.message?.content || '',
      totalDuration: data.total_duration,
      evalCount: data.eval_count,
    };
  }

  /** Generate embeddings — real call to /api/embeddings */
  async embed(text) {
    const res = await this.safeFetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama embedding error: ${res.status}`);
    const data = await res.json();
    return { embedding: data.embedding, model: this.embeddingModel };
  }

  /** List models */
  async listModels() {
    const res = await this.safeFetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`Ollama tags error: ${res.status}`);
    const data = await res.json();
    return (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
      digest: m.digest,
    }));
  }

  /** Show model info */
  async showModel(model) {
    const res = await this.safeFetch(`${this.baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model || this.model }),
    });
    if (!res.ok) throw new Error(`Ollama show error: ${res.status}`);
    return await res.json();
  }
}

module.exports = { OllamaConnector };
