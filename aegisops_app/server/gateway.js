/**
 * AegisOps — Local WebSocket Gateway
 *
 * Replaces Cloudflare/ngrok tunnel for mobile QR-password access.
 * Like OpenClaw's implementation for Telegram/Android nodes —
 * a local WS server that the mobile app connects to directly on LAN,
 * or via a simple relay for internet access.
 *
 * Protocol:
 *   Client connects via WebSocket
 *   Client sends: { type: "auth", code: "123456" } or { type: "auth", api_key: "aos_xxx" }
 *   Server responds: { type: "auth_result", success: true/false, session_id: "xxx" }
 *   After auth, client sends: { type: "api_request", method: "GET", path: "/api/dashboard", body: null, request_id: "xxx" }
 *   Server responds: { type: "api_response", request_id: "xxx", status: 200, body: {...} }
 *   Server pushes: { type: "event", topic: "aegisops.connector.status", payload: {...} }
 *   Ping/pong: client sends { type: "ping" }, server responds { type: "pong" }
 */
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { verifyApiKey } = require('./auth');
const { log } = require('./middleware/logger');
const { TOPICS } = require('./events/kafka');

/* ─── Pairing code store (shared with auth routes) ─── */
const { pairingCodes } = require('./pairing-store');

/**
 * Generate a 6-digit pairing code with 5-minute TTL.
 * Returns { code, api_key, expires_in }.
 */
function generatePairingCode(label = 'Mobile WS device') {
  const { createApiKey } = require('./auth');
  const key = createApiKey(label, ['read', 'run']);
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  pairingCodes.set(code, { apiKey: key.key, label, expiresAt });
  setTimeout(() => pairingCodes.delete(code), 5 * 60 * 1000);
  return { code, api_key: key.key, expires_in: 300, label };
}

/**
 * Consume a pairing code — returns apiKey or null if invalid/expired.
 */
function consumePairingCode(code) {
  const entry = pairingCodes.get(code);
  if (!entry || entry.expiresAt < Date.now()) return null;
  pairingCodes.delete(code);
  return { apiKey: entry.apiKey, label: entry.label };
}

/* ─── LAN IP discovery ─── */
function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const [name, ifaces] of Object.entries(interfaces)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      // Skip internal, IPv6, and loopback
      if (iface.internal) continue;
      if (iface.family !== 'IPv4') continue;
      ips.push({ interface: name, address: iface.address });
    }
  }
  // Sort: prefer 192.168.x.x, then 10.x.x.x, then others
  ips.sort((a, b) => {
    const score = (ip) => {
      if (ip.startsWith('192.168.')) return 0;
      if (ip.startsWith('10.')) return 1;
      if (ip.startsWith('172.')) return 2;
      return 3;
    };
    return score(a.address) - score(b.address);
  });
  return ips;
}

/* ─── Gateway Server ─── */
class GatewayServer {
  constructor() {
    this.wss = null;
    this.port = null;
    this.active = false;
    this.sessions = new Map(); // sessionId -> { ws, auth, connectedAt, lastActivity }
    this._heartbeatInterval = null;
    this._eventBusUnsubscribe = null;
  }

  /**
   * Start the WebSocket gateway on the given port.
   * @param {number} port - Port to listen on (default 18091)
   * @param {http.Server} [httpServer] - Optional existing HTTP server to attach to
   * @returns {Promise<{port, lan_urls}>}
   */
  start(port = 18091, httpServer = null) {
    return new Promise((resolve, reject) => {
      if (this.active) {
        return reject(new Error('Gateway already running'));
      }

      this.port = port;

      if (httpServer) {
        // Attach to existing HTTP server (Express)
        this.wss = new WebSocketServer({ server: httpServer, path: '/ws/gateway' });
      } else {
        // Standalone WS server
        this.wss = new WebSocketServer({ port, host: '0.0.0.0' });
      }

      this.wss.on('listening', () => {
        this.active = true;
        const lanIPs = getLanIPs();
        const lan_urls = lanIPs.map(ip => `ws://${ip.address}:${port}`);
        log.info('gateway.started', { port, lan_urls });

        // Start heartbeat checker (every 30s)
        this._heartbeatInterval = setInterval(() => this._checkHeartbeats(), 30_000);

        // Subscribe to Kafka event bus for real-time event push
        this._subscribeToEvents();

        resolve({ port, lan_urls });
      });

      this.wss.on('error', (err) => {
        log.error('gateway.listen_error', { error: err.message });
        reject(err);
      });

      this.wss.on('connection', (ws, req) => {
        this._handleConnection(ws, req);
      });
    });
  }

  /**
   * Stop the gateway server.
   */
  stop() {
    if (!this.active) return;

    // Close all sessions
    for (const [sessionId, session] of this.sessions) {
      try {
        session.ws.close(1001, 'Gateway shutting down');
      } catch {}
    }
    this.sessions.clear();

    // Stop heartbeat
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }

    // Unsubscribe from event bus
    if (this._eventBusUnsubscribe) {
      this._eventBusUnsubscribe();
      this._eventBusUnsubscribe = null;
    }

    // Close WSS
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.active = false;
    this.port = null;
    log.info('gateway.stopped');
  }

  /**
   * Get gateway status.
   */
  getStatus() {
    const lanIPs = getLanIPs();
    const primaryIP = lanIPs.length > 0 ? lanIPs[0].address : '127.0.0.1';
    return {
      active: this.active,
      port: this.port,
      connections: this.sessions.size,
      lan_url: this.active ? `ws://${primaryIP}:${this.port}` : null,
      lan_ips: lanIPs,
      sessions: Array.from(this.sessions.values()).map(s => ({
        session_id: s.sessionId,
        auth: s.auth ? { label: s.auth.label, type: s.auth.type } : null,
        connected_at: s.connectedAt,
        last_activity: s.lastActivity,
      })),
    };
  }

  /**
   * Get list of active connections.
   */
  getConnections() {
    return Array.from(this.sessions.values()).map(s => ({
      session_id: s.sessionId,
      auth: s.auth ? { label: s.auth.label, type: s.auth.type, scopes: s.auth.scopes } : null,
      connected_at: s.connectedAt,
      last_activity: s.lastActivity,
      remote_address: s.remoteAddress,
    }));
  }

  /* ─── Private methods ─── */

  _handleConnection(ws, req) {
    const sessionId = crypto.randomBytes(12).toString('hex');
    const remoteAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

    const session = {
      sessionId,
      ws,
      auth: null,
      connectedAt: new Date().toISOString(),
      lastActivity: Date.now(),
      remoteAddress,
    };
    this.sessions.set(sessionId, session);

    log.info('gateway.client_connected', { sessionId, remoteAddress });

    // Send welcome message
    this._send(ws, { type: 'welcome', session_id: sessionId, message: 'AegisOps Gateway. Authenticate to proceed.' });

    ws.on('message', (data) => {
      this._handleMessage(sessionId, data);
    });

    ws.on('close', (code, reason) => {
      log.info('gateway.client_disconnected', { sessionId, code, reason: reason?.toString() });
      this.sessions.delete(sessionId);
    });

    ws.on('error', (err) => {
      log.warn('gateway.ws_error', { sessionId, error: err.message });
      this.sessions.delete(sessionId);
    });

    // Set ping-pong for connection keepalive
    ws.on('pong', () => {
      session.lastActivity = Date.now();
    });
  }

  _handleMessage(sessionId, rawData) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivity = Date.now();

    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      this._send(session.ws, { type: 'error', error: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'auth':
        this._handleAuth(sessionId, msg);
        break;
      case 'api_request':
        this._handleApiRequest(sessionId, msg);
        break;
      case 'ping':
        this._send(session.ws, { type: 'pong', ts: Date.now() });
        break;
      case 'subscribe':
        this._handleSubscribe(sessionId, msg);
        break;
      case 'unsubscribe':
        this._handleUnsubscribe(sessionId, msg);
        break;
      default:
        this._send(session.ws, { type: 'error', error: `Unknown message type: ${msg.type}` });
    }
  }

  _handleAuth(sessionId, msg) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Already authenticated
    if (session.auth) {
      this._send(session.ws, { type: 'auth_result', success: false, error: 'Already authenticated' });
      return;
    }

    let authResult = null;

    // Try pairing code auth
    if (msg.code) {
      const pairResult = consumePairingCode(msg.code);
      if (pairResult) {
        // Verify the API key we generated
        const verified = verifyApiKey(pairResult.apiKey);
        if (verified) {
          authResult = { ...verified, type: 'pairing_code', raw_key: pairResult.apiKey };
        }
      }
    }

    // Try API key auth
    if (!authResult && msg.api_key) {
      const verified = verifyApiKey(msg.api_key);
      if (verified) {
        authResult = { ...verified, type: 'api_key', raw_key: msg.api_key };
      }
    }

    if (authResult) {
      session.auth = authResult;
      log.info('gateway.auth_success', { sessionId, label: authResult.label, type: authResult.type });
      const lanIPs = getLanIPs();
      const httpIP = lanIPs.length > 0 ? lanIPs[0].address : '127.0.0.1';
      const httpPort = parseInt(process.env.PORT || '18090');
      this._send(session.ws, {
        type: 'auth_result',
        success: true,
        session_id: sessionId,
        label: authResult.label,
        scopes: authResult.scopes,
        api_key: authResult.raw_key,
        http_base_url: `http://${httpIP}:${httpPort}`,
      });
    } else {
      log.warn('gateway.auth_failed', { sessionId });
      this._send(session.ws, {
        type: 'auth_result',
        success: false,
        error: 'Invalid pairing code or API key',
      });
    }
  }

  _handleApiRequest(sessionId, msg) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Must be authenticated
    if (!session.auth) {
      this._send(session.ws, {
        type: 'api_response',
        request_id: msg.request_id,
        status: 401,
        body: { error: 'Authentication required' },
      });
      return;
    }

    const { method, path, body, request_id, headers: msgHeaders } = msg;
    if (!path || !request_id) {
      this._send(session.ws, {
        type: 'api_response',
        request_id: request_id || 'unknown',
        status: 400,
        body: { error: 'path and request_id are required' },
      });
      return;
    }

    // Security: only allow /api/ paths
    if (!path.startsWith('/api/')) {
      this._send(session.ws, {
        type: 'api_response',
        request_id,
        status: 403,
        body: { error: 'Only /api/ paths are allowed' },
      });
      return;
    }

    // Scope check
    const requiredScopes = this._requiredScopesForPath(method, path);
    const grantedScopes = new Set(session.auth.scopes || []);
    const hasAccess = requiredScopes.every(s => grantedScopes.has(s) || grantedScopes.has('*'));
    if (!hasAccess) {
      this._send(session.ws, {
        type: 'api_response',
        request_id,
        status: 403,
        body: { error: 'Insufficient scope', required: requiredScopes },
      });
      return;
    }

    // Proxy the request to the Express server
    this._proxyRequest(session, method, path, body, request_id, msgHeaders);
  }

  _requiredScopesForPath(method, path) {
    // Most read operations require 'read' scope
    // Write operations require 'run' or '*' scope
    if (method === 'GET') return ['read'];
    if (path.includes('/auth/') && method !== 'GET') return ['*'];
    return ['run'];
  }

  async _proxyRequest(session, method, path, body, request_id, msgHeaders) {
    try {
      const expressPort = parseInt(process.env.PORT || '18090');
      const fetchUrl = `http://127.0.0.1:${expressPort}${path}`;

      const fetchOpts = {
        method: method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-Key': session.auth.raw_key || '',
          'X-Gateway-Session': session.sessionId,
          'X-Forwarded-For': session.remoteAddress,
        },
      };

      if (body && method !== 'GET') {
        fetchOpts.body = JSON.stringify(body);
      }

      // Merge extra headers from client
      if (msgHeaders && typeof msgHeaders === 'object') {
        for (const [k, v] of Object.entries(msgHeaders)) {
          if (k.toLowerCase() !== 'x-api-key' && k.toLowerCase() !== 'host') {
            fetchOpts.headers[k] = v;
          }
        }
      }

      const res = await fetch(fetchUrl, fetchOpts);
      let responseBody;
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        responseBody = await res.json();
      } else {
        const text = await res.text();
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = text;
        }
      }

      this._send(session.ws, {
        type: 'api_response',
        request_id,
        status: res.status,
        body: responseBody,
      });
    } catch (err) {
      log.warn('gateway.proxy_error', { sessionId: session.sessionId, path, error: err.message });
      this._send(session.ws, {
        type: 'api_response',
        request_id,
        status: 502,
        body: { error: `Gateway proxy error: ${err.message}` },
      });
    }
  }

  _handleSubscribe(sessionId, msg) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.auth) {
      this._send(session.ws, { type: 'error', error: 'Authentication required to subscribe' });
      return;
    }
    // Track subscriptions on the session
    if (!session.subscriptions) session.subscriptions = new Set();
    if (msg.topics && Array.isArray(msg.topics)) {
      msg.topics.forEach(t => session.subscriptions.add(t));
    } else if (msg.topic) {
      session.subscriptions.add(msg.topic);
    }
    this._send(session.ws, { type: 'subscribe_result', success: true, topics: Array.from(session.subscriptions) });
  }

  _handleUnsubscribe(sessionId, msg) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.subscriptions) return;
    if (msg.topics && Array.isArray(msg.topics)) {
      msg.topics.forEach(t => session.subscriptions.delete(t));
    } else if (msg.topic) {
      session.subscriptions.delete(msg.topic);
    }
    this._send(session.ws, { type: 'unsubscribe_result', success: true, topics: Array.from(session.subscriptions) });
  }

  /**
   * Subscribe to Kafka/event bus and push events to authenticated clients.
   */
  _subscribeToEvents() {
    try {
      const { eventBus } = require('./events/kafka');
      const handler = (envelope) => {
        this._broadcastEvent(envelope.topic, envelope.payload || envelope);
      };

      // Subscribe to wildcard (all events)
      eventBus.subscribeAll(handler).then(() => {
        log.info('gateway.event_bus_subscribed');
      }).catch(err => {
        log.warn('gateway.event_bus_subscribe_failed', { error: err.message });
      });

      this._eventBusUnsubscribe = () => {
        try { eventBus.unsubscribe('*', handler); } catch {}
      };
    } catch (err) {
      log.warn('gateway.event_bus_init_failed', { error: err.message });
    }
  }

  /**
   * Broadcast an event to all authenticated clients subscribed to the topic.
   */
  _broadcastEvent(topic, payload) {
    const message = { type: 'event', topic, payload, ts: Date.now() };
    for (const [, session] of this.sessions) {
      if (!session.auth) continue;
      if (session.ws.readyState !== WebSocket.OPEN) continue;
      // If session has subscriptions, only send matching topics
      if (session.subscriptions && session.subscriptions.size > 0) {
        if (!session.subscriptions.has(topic) && !session.subscriptions.has('*')) continue;
      }
      // If no explicit subscriptions, send all events
      this._send(session.ws, message);
    }
  }

  /**
   * Check heartbeats and close stale connections.
   */
  _checkHeartbeats() {
    const staleThreshold = 60_000; // 60 seconds
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > staleThreshold) {
        // Send ping to check if still alive
        if (session.ws.readyState === WebSocket.OPEN) {
          try {
            session.ws.ping();
          } catch {
            this.sessions.delete(sessionId);
          }
        } else {
          this.sessions.delete(sessionId);
        }
      }
    }

    // Force-close connections with no activity for 5 minutes
    const deadThreshold = 5 * 60_000;
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > deadThreshold) {
        log.info('gateway.closing_stale', { sessionId });
        try { session.ws.close(1000, 'Session timeout'); } catch {}
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Send a JSON message over WebSocket.
   */
  _send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      log.warn('gateway.send_error', { error: err.message });
    }
  }
}

/* ─── Singleton ─── */
const gateway = new GatewayServer();

module.exports = {
  gateway,
  GatewayServer,
  getLanIPs,
  generatePairingCode,
  consumePairingCode,
};
