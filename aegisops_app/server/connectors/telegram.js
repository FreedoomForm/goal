/**
 * AegisOps — Real Telegram Bot Connector
 * Uses native fetch + FormData for real Telegram Bot API calls.
 */
const { BaseConnector } = require('./base');
const fs = require('fs');
const path = require('path');

class TelegramConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.token = this.authPayload.token || '';
    this.chatId = this.authPayload.chat_id || '';
    this.apiBase = 'https://api.telegram.org';
  }

  _isConfigured() {
    return this.token && this.token !== 'CHANGE_ME' && this.chatId && this.chatId !== 'CHANGE_ME';
  }

  _url(method) {
    return `${this.apiBase}/bot${this.token}/${method}`;
  }

  /** Test connection via getMe */
  async testConnection() {
    if (!this._isConfigured()) {
      return {
        status: 'not_configured',
        error: 'Telegram bot token и/или chat_id не настроены',
        suggestion: 'Задайте token и chat_id в конфигурации коннектора',
      };
    }
    try {
      const res = await this.safeFetch(this._url('getMe'));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`Telegram API error: ${res.status} — ${data.description || ''}`);
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || 'Unknown error');
      return {
        status: 'online',
        bot: {
          id: data.result.id,
          username: data.result.username,
          firstName: data.result.first_name,
          canJoinGroups: data.result.can_join_groups,
          canReadMessages: data.result.can_read_all_group_messages,
        },
        chatId: this.chatId,
      };
    } catch (err) {
      return {
        status: 'offline',
        error: err.message,
        suggestion: 'Проверьте токен бота через @BotFather в Telegram',
      };
    }
  }

  /** Send text message */
  async sendMessage(text, options = {}) {
    if (!this._isConfigured()) throw new Error('Telegram not configured');
    const chatId = options.chat_id || this.chatId;
    const res = await this.safeFetch(this._url('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        disable_web_page_preview: options.disable_preview !== false,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`);
    return { status: 'sent', messageId: data.result.message_id };
  }

  /** Send document (file) */
  async sendDocument(filePath, caption = '') {
    if (!this._isConfigured()) throw new Error('Telegram not configured');
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    const formData = new FormData();
    formData.append('chat_id', this.chatId);
    if (caption) formData.append('caption', caption);

    // Read file and create Blob
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    formData.append('document', blob, fileName);

    const res = await this.safeFetch(this._url('sendDocument'), {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendDocument failed: ${data.description}`);
    return { status: 'sent', messageId: data.result.message_id, fileName };
  }

  /** Send photo */
  async sendPhoto(filePath, caption = '') {
    if (!this._isConfigured()) throw new Error('Telegram not configured');
    const formData = new FormData();
    formData.append('chat_id', this.chatId);
    if (caption) formData.append('caption', caption);
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    formData.append('photo', blob, path.basename(filePath));

    const res = await this.safeFetch(this._url('sendPhoto'), {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendPhoto failed: ${data.description}`);
    return { status: 'sent', messageId: data.result.message_id };
  }

  /** Get webhook info */
  async getWebhookInfo() {
    const res = await this.safeFetch(this._url('getWebhookInfo'));
    const data = await res.json();
    return data.result;
  }

  /** Get recent updates (for conversational AI) */
  async getUpdates(offset = 0, limit = 10) {
    const res = await this.safeFetch(this._url('getUpdates') + `?offset=${offset}&limit=${limit}&timeout=1`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.description);
    return data.result;
  }

  // BaseConnector interface
  async fetchData() { return this.testConnection(); }
  async pushData(payload) {
    if (payload.file) {
      return this.sendDocument(payload.file, payload.caption || '');
    }
    return this.sendMessage(payload.text || payload.message || JSON.stringify(payload));
  }
}

module.exports = { TelegramConnector };
