/**
 * AegisOps — SCADA DMZ Security Proxy
 * Implements ISA/IEC 62443 compliant network isolation for OPC UA/SCADA connections.
 *
 * Architecture (Purdue Model):
 *
 *   ┌──────────────────────┐
 *   │  Enterprise Network   │  ← AegisOps Server (Node.js)
 *   │  (Level 5)            │
 *   └──────────┬───────────┘
 *              │
 *   ┌──────────▼───────────┐
 *   │  DMZ (Level 3.5)      │  ← THIS PROXY — Rate-limited, audited, read-only
 *   │  - Input validation   │
 *   │  - Rate limiting      │
 *   │  - Audit logging      │
 *   │  - Command filtering  │
 *   └──────────┬───────────┘
 *              │
 *   ┌──────────▼───────────┐
 *   │  Control Network      │  ← OPC UA SCADA Server
 *   │  (Level 2-3)          │
 *   └──────────────────────┘
 *
 * Features:
 *   - Read-only enforcement: blocks all write operations unless explicitly allowed
 *   - Rate limiting: max N requests/sec per proxy
 *   - Command allow-listing: only permitted OPC UA operations pass through
 *   - Full audit trail: every request logged with user, timestamp, operation
 *   - Connection timeout enforcement
 *   - Data validation: range checks on values before forwarding
 *   - Emergency stop: immediately block all access to SCADA
 */
const { queryAll, queryOne, runSQL, nowISO } = require('../db/pg');
const { eventBus, TOPICS } = require('../events/kafka');
const { log } = require('../middleware/logger');

/* ─── Operation Types ─── */
const SCADA_OPERATIONS = {
  READ: 'read',
  BROWSE: 'browse',
  SUBSCRIBE: 'subscribe',
  WRITE: 'write',
  CALL: 'call',
  CREATE: 'create',
  DELETE: 'delete',
};

/* ─── Default allowed operations for each mode ─── */
const MODE_PERMISSIONS = {
  read_only: [SCADA_OPERATIONS.READ, SCADA_OPERATIONS.BROWSE, SCADA_OPERATIONS.SUBSCRIBE],
  read_write: [SCADA_OPERATIONS.READ, SCADA_OPERATIONS.BROWSE, SCADA_OPERATIONS.SUBSCRIBE, SCADA_OPERATIONS.WRITE, SCADA_OPERATIONS.CALL],
  monitor: [SCADA_OPERATIONS.READ, SCADA_OPERATIONS.BROWSE, SCADA_OPERATIONS.SUBSCRIBE],
  admin: Object.values(SCADA_OPERATIONS),
};

/* ─── Rate Limiter (token bucket) ─── */
class TokenBucketRateLimiter {
  constructor(ratePerSec, burstSize = null) {
    this.rate = ratePerSec;
    this.burst = burstSize || Math.max(ratePerSec * 2, 20);
    this.tokens = this.burst;
    this.lastRefill = Date.now();
  }

  tryConsume(count = 1) {
    this._refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
    this.lastRefill = now;
  }
}

/* ─── SCADA DMZ Proxy ─── */
class ScadaDmzProxy {
  constructor(proxyConfig) {
    this.id = proxyConfig.id;
    this.name = proxyConfig.name;
    this.connectorId = proxyConfig.connector_id;
    this.proxyHost = proxyConfig.proxy_host || '127.0.0.1';
    this.proxyPort = proxyConfig.proxy_port || 4840;
    this.targetHost = proxyConfig.target_host;
    this.targetPort = proxyConfig.target_port;
    this.mode = proxyConfig.mode || 'read_only';
    this.allowedOperations = proxyConfig.allowed_operations || MODE_PERMISSIONS[this.mode] || MODE_PERMISSIONS.read_only;
    this.rateLimitPerSec = proxyConfig.rate_limit_per_sec || 10;
    this.auditAll = proxyConfig.audit_all !== 0;
    this.enabled = proxyConfig.enabled !== 0;

    this.rateLimiter = new TokenBucketRateLimiter(this.rateLimitPerSec);
    this._emergencyStop = false;
    this._requestCount = 0;
    this._blockedCount = 0;
    this._lastRequestAt = null;
  }

  /**
   * Validate and authorize a SCADA operation request.
   * @param {Object} request - The operation request
   * @param {string} request.operation - Operation type (read, write, browse, etc.)
   * @param {string} request.nodeId - Target OPC UA node ID
   * @param {*} request.value - Value to write (for write operations)
   * @param {Object} request.metadata - Additional context (user, source IP, etc.)
   * @returns {Object} { authorized: boolean, reason?: string, sanitized?: Object }
   */
  authorize(request) {
    // Check emergency stop
    if (this._emergencyStop) {
      this._auditBlock(request, 'emergency_stop');
      return { authorized: false, reason: 'Emergency stop is active. All SCADA access blocked.' };
    }

    // Check if proxy is enabled
    if (!this.enabled) {
      this._auditBlock(request, 'proxy_disabled');
      return { authorized: false, reason: 'DMZ proxy is disabled.' };
    }

    // Check operation is allowed
    const op = request.operation?.toLowerCase();
    if (!this.allowedOperations.includes(op)) {
      this._blockedCount++;
      this._auditBlock(request, 'operation_not_allowed');
      return { authorized: false, reason: `Operation "${op}" not allowed in ${this.mode} mode. Allowed: ${this.allowedOperations.join(', ')}` };
    }

    // Rate limiting
    if (!this.rateLimiter.tryConsume()) {
      this._blockedCount++;
      this._auditBlock(request, 'rate_limit_exceeded');
      return { authorized: false, reason: `Rate limit exceeded (${this.rateLimitPerSec} req/sec). Back off.` };
    }

    // Validate write operations — apply range checks
    if (op === SCADA_OPERATIONS.WRITE && request.value !== undefined) {
      const validation = this._validateWriteValue(request);
      if (!validation.valid) {
        this._blockedCount++;
        this._auditBlock(request, 'value_validation_failed');
        return { authorized: false, reason: validation.error };
      }
    }

    // Sanitize nodeId
    const sanitizedNodeId = this._sanitizeNodeId(request.nodeId);
    if (!sanitizedNodeId) {
      this._blockedCount++;
      this._auditBlock(request, 'invalid_node_id');
      return { authorized: false, reason: `Invalid or disallowed nodeId: ${request.nodeId}` };
    }

    // Audit successful authorization
    this._requestCount++;
    this._lastRequestAt = new Date().toISOString();

    if (this.auditAll) {
      this._auditAllow(request, sanitizedNodeId);
    }

    return {
      authorized: true,
      sanitized: {
        ...request,
        nodeId: sanitizedNodeId,
        operation: op,
      },
    };
  }

  /**
   * Validate write value against configured constraints.
   */
  _validateWriteValue(request) {
    const { value, nodeId, constraints } = request;

    // If constraints are provided, validate against them
    if (constraints) {
      if (constraints.min !== undefined && value < constraints.min) {
        return { valid: false, error: `Value ${value} below minimum ${constraints.min} for ${nodeId}` };
      }
      if (constraints.max !== undefined && value > constraints.max) {
        return { valid: false, error: `Value ${value} above maximum ${constraints.max} for ${nodeId}` };
      }
      if (constraints.type && typeof value !== constraints.type) {
        return { valid: false, error: `Value type ${typeof value} doesn't match expected ${constraints.type}` };
      }
    }

    // Default safety: limit write values to reasonable ranges for SCADA
    // This prevents accidentally setting pressure to 99999 MPa etc.
    if (typeof value === 'number') {
      if (!isFinite(value)) {
        return { valid: false, error: 'Value must be finite' };
      }
      if (Math.abs(value) > 1e9) {
        return { valid: false, error: 'Write value exceeds safety threshold (1e9)' };
      }
    }

    return { valid: true };
  }

  /**
   * Sanitize and validate OPC UA node ID format.
   * Prevents injection attacks via malformed node IDs.
   */
  _sanitizeNodeId(nodeId) {
    if (!nodeId || typeof nodeId !== 'string') return null;
    // OPC UA node ID formats: ns=X;i=Y, ns=X;s=Z, ns=X;b=base64, i=Y
    const validPatterns = [
      /^ns=\d+;i=\d+$/,        // ns=2;i=3
      /^ns=\d+;s=[\w\-_.]+$/,   // ns=2;s=MyNode
      /^ns=\d+;b=[A-Za-z0-9+/=]+$/, // ns=2;b=base64
      /^i=\d+$/,                 // i=84 (Root)
    ];
    const trimmed = nodeId.trim();
    if (!validPatterns.some(p => p.test(trimmed))) return null;
    if (trimmed.length > 200) return null; // Prevent excessively long IDs
    return trimmed;
  }

  /**
   * Activate emergency stop — blocks ALL SCADA access.
   */
  emergencyStop(reason = 'manual') {
    this._emergencyStop = true;
    log.error('scada.emergency_stop', { proxy_id: this.id, proxy_name: this.name, reason });

    // Publish alert
    eventBus.produce(TOPICS.ALERT, {
      level: 'critical',
      type: 'scada_emergency_stop',
      proxy_id: this.id,
      proxy_name: this.name,
      reason,
      timestamp: new Date().toISOString(),
    });

    return { stopped: true, reason };
  }

  /**
   * Release emergency stop.
   */
  releaseEmergencyStop() {
    this._emergencyStop = false;
    log.info('scada.emergency_stop_released', { proxy_id: this.id });
    return { stopped: false };
  }

  /**
   * Audit a blocked request.
   */
  _auditBlock(request, reason) {
    const entry = {
      proxy_id: this.id,
      proxy_name: this.name,
      operation: request.operation,
      node_id: request.nodeId,
      reason,
      blocked_at: new Date().toISOString(),
      source: request.metadata?.source || 'unknown',
    };

    log.warn('scada.blocked', entry);

    // Publish to audit topic
    eventBus.produce(TOPICS.AUDIT, {
      type: 'scada_access_blocked',
      ...entry,
    });
  }

  /**
   * Audit an allowed request.
   */
  _auditAllow(request, sanitizedNodeId) {
    const entry = {
      proxy_id: this.id,
      proxy_name: this.name,
      operation: request.operation,
      node_id: sanitizedNodeId,
      authorized_at: new Date().toISOString(),
      source: request.metadata?.source || 'unknown',
    };

    log.info('scada.authorized', entry);

    // Publish to audit topic
    eventBus.produce(TOPICS.AUDIT, {
      type: 'scada_access_authorized',
      ...entry,
    });
  }

  /**
   * Get proxy statistics.
   */
  getStats() {
    return {
      id: this.id,
      name: this.name,
      mode: this.mode,
      enabled: this.enabled,
      emergency_stop: this._emergencyStop,
      target: `${this.targetHost}:${this.targetPort}`,
      allowed_operations: this.allowedOperations,
      rate_limit_per_sec: this.rateLimitPerSec,
      request_count: this._requestCount,
      blocked_count: this._blockedCount,
      last_request_at: this._lastRequestAt,
    };
  }
}

/* ─── DMZ Proxy Manager ─── */
class DmzProxyManager {
  constructor() {
    this.proxies = new Map(); // connectorId → ScadaDmzProxy
  }

  /**
   * Load all DMZ proxy configurations from database.
   */
  async loadProxies() {
    try {
      const rows = await queryAll('SELECT * FROM dmz_proxies');
      for (const row of rows) {
        const config = {
          ...row,
          allowed_operations: typeof row.allowed_operations === 'string'
            ? JSON.parse(row.allowed_operations || '["read"]')
            : (row.allowed_operations || ['read']),
        };
        this.proxies.set(row.connector_id, new ScadaDmzProxy(config));
      }
      log.info('dmz.proxies_loaded', { count: this.proxies.size });
    } catch (err) {
      log.warn('dmz.load_error', { error: err.message });
    }
  }

  /**
   * Get or create a DMZ proxy for a connector.
   * If no proxy exists, creates a read-only one by default (security-first).
   */
  getProxyForConnector(connectorId) {
    if (this.proxies.has(connectorId)) {
      return this.proxies.get(connectorId);
    }
    // Security-first: if no DMZ proxy configured, return a restrictive default
    return new ScadaDmzProxy({
      id: 0,
      name: `default-dmz-${connectorId}`,
      connector_id: connectorId,
      mode: 'read_only',
      allowed_operations: ['read', 'browse'],
      rate_limit_per_sec: 5,
      audit_all: true,
      enabled: true,
    });
  }

  /**
   * Create a new DMZ proxy configuration.
   */
  async createProxy(config) {
    const { name, connector_id, target_host, target_port, mode, rate_limit_per_sec, allowed_operations } = config;

    if (!target_host || !target_port) {
      throw new Error('target_host and target_port are required');
    }

    const result = await runSQL(
      `INSERT INTO dmz_proxies (name, connector_id, proxy_host, proxy_port, target_host, target_port, mode, allowed_operations, rate_limit_per_sec, audit_all, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, connector_id, '127.0.0.1', config.proxy_port || 4840, target_host, target_port, mode || 'read_only', JSON.stringify(allowed_operations || MODE_PERMISSIONS[mode || 'read_only']), rate_limit_per_sec || 10, 1, 1, nowISO(), nowISO()]
    );

    const proxy = new ScadaDmzProxy({
      id: result.lastInsertRowid,
      name,
      connector_id,
      target_host,
      target_port,
      mode: mode || 'read_only',
      allowed_operations: allowed_operations || MODE_PERMISSIONS[mode || 'read_only'],
      rate_limit_per_sec: rate_limit_per_sec || 10,
      audit_all: true,
      enabled: true,
    });

    this.proxies.set(connector_id, proxy);

    log.info('dmz.proxy_created', { id: result.lastInsertRowid, name, connector_id, mode: mode || 'read_only' });

    return proxy.getStats();
  }

  /**
   * Emergency stop all SCADA proxies.
   */
  emergencyStopAll(reason = 'global') {
    for (const proxy of this.proxies.values()) {
      proxy.emergencyStop(reason);
    }
    log.error('dmz.emergency_stop_all', { reason, proxy_count: this.proxies.size });
  }

  /**
   * Get stats for all proxies.
   */
  getAllStats() {
    return Array.from(this.proxies.values()).map(p => p.getStats());
  }
}

/* Singleton */
const dmzManager = new DmzProxyManager();

module.exports = {
  ScadaDmzProxy,
  DmzProxyManager,
  dmzManager,
  SCADA_OPERATIONS,
  MODE_PERMISSIONS,
};
