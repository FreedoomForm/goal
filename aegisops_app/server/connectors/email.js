/**
 * AegisOps — Email / SMTP Connector
 * Real email sending via nodemailer.
 */
const { BaseConnector } = require('./base');

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

class EmailConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.smtpHost = this.config.smtp_host || this.baseUrl || 'smtp.gmail.com';
    this.smtpPort = this.config.smtp_port || 587;
    this.secure = this.config.secure || false;
    this.fromAddress = this.config.from || this.authPayload.username || '';
  }

  _createTransporter() {
    if (!nodemailer) throw new Error('nodemailer не установлен. Выполните: npm install nodemailer');
    return nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.secure,
      auth: {
        user: this.authPayload.username || this.authPayload.user || '',
        pass: this.authPayload.password || this.authPayload.pass || '',
      },
      tls: { rejectUnauthorized: false },
    });
  }

  async testConnection() {
    if (!nodemailer) {
      return { status: 'unavailable', error: 'nodemailer не установлен' };
    }
    try {
      const transporter = this._createTransporter();
      await transporter.verify();
      return {
        status: 'online',
        host: this.smtpHost,
        port: this.smtpPort,
        from: this.fromAddress,
      };
    } catch (err) {
      return {
        status: 'offline',
        host: this.smtpHost,
        error: err.message,
        suggestion: 'Проверьте SMTP хост, порт и учетные данные',
      };
    }
  }

  /** Send email */
  async sendEmail(options) {
    const transporter = this._createTransporter();
    const info = await transporter.sendMail({
      from: options.from || this.fromAddress,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject || 'AegisOps Report',
      text: options.text,
      html: options.html,
      attachments: options.attachments, // [{ filename, path }]
    });
    return {
      status: 'sent',
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    };
  }

  async fetchData() { return this.testConnection(); }
  async pushData(payload) {
    return this.sendEmail(payload);
  }
}

module.exports = { EmailConnector };
