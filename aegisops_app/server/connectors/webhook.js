/**
 * AegisOps — Webhook Connector
 * Outgoing: POST to external webhook URLs (Slack, Teams, custom).
 * Incoming: register express routes to receive callbacks.
 */
const { BaseConnector } = require('./base');
const crypto = require('crypto');

class WebhookConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.webhookUrl = this.baseUrl;
    this.secret = this.authPayload.secret || this.config.secret || '';
    this.format = this.config.format || 'json'; // json, form
    this.signatureHeader = this.config.signature_header || 'X-Hub-Signature-256';
  }

  /** Test: send a test ping to the webhook URL */
  async testConnection() {
    if (!this.webhookUrl) {
      return { status: 'not_configured', error: 'Webhook URL not set' };
    }
    try {
      const payload = {
        event: 'aegisops.test',
        timestamp: new Date().toISOString(),
        message: 'AegisOps webhook connectivity test',
      };
      const res = await this._send(payload);
      return {
        status: res.ok ? 'online' : 'error',
        httpStatus: res.status,
        endpoint: this.webhookUrl,
      };
    } catch (err) {
      return { status: 'offline', endpoint: this.webhookUrl, error: err.message };
    }
  }

  /** Send data to webhook */
  async _send(payload) {
    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    // Add HMAC signature if secret is configured
    if (this.secret) {
      const sig = crypto.createHmac('sha256', this.secret).update(body).digest('hex');
      headers[this.signatureHeader] = `sha256=${sig}`;
    }

    return this.safeFetch(this.webhookUrl, { method: 'POST', headers, body });
  }

  /** Push data (outgoing webhook) */
  async pushData(payload) {
    const res = await this._send(payload);
    let response;
    try {
      const ct = res.headers.get('content-type') || '';
      response = ct.includes('json') ? await res.json() : await res.text();
    } catch {
      response = null;
    }
    return { success: res.ok, httpStatus: res.status, response };
  }

  /** Verify incoming webhook signature */
  verifySignature(body, signature) {
    if (!this.secret) return true;
    const expected = crypto.createHmac('sha256', this.secret).update(body).digest('hex');
    return signature === `sha256=${expected}`;
  }

  /** Send Slack-formatted message */
  async sendSlackMessage(text, options = {}) {
    return this.pushData({
      text,
      blocks: options.blocks,
      channel: options.channel,
      username: options.username || 'AegisOps AI',
      icon_emoji: options.icon || ':robot_face:',
    });
  }

  /** Send Microsoft Teams adaptive card */
  async sendTeamsMessage(text, title = 'AegisOps Report') {
    return this.pushData({
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: '59a8ff',
      summary: title,
      title,
      text,
    });
  }

  async fetchData() { return this.testConnection(); }
}

module.exports = { WebhookConnector };
