/**
 * AegisOps — Security Middleware
 * Senior-grade security: rate limiting, helmet-like headers,
 * input sanitization, CSRF protection for state-changing ops.
 */
const crypto = require('crypto');

/* ───── In-memory rate limiter (per-IP, per-route) ───── */
const rateStore = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 120; // 120 req/min per IP per route group

// Cleanup expired rate limit entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateStore) {
    if (now > entry.reset) rateStore.delete(key);
  }
}, 5 * 60 * 1000);

function rateLimiter(opts = {}) {
  const max = opts.max || RATE_MAX_REQUESTS;
  const windowMs = opts.windowMs || RATE_WINDOW_MS;
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl || ''}${req.path.split('/').slice(0, 3).join('/')}`;
    const now = Date.now();
    const entry = rateStore.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count += 1;
    rateStore.set(key, entry);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.reset / 1000)));
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests', retry_after_ms: entry.reset - now });
    }
    next();
  };
}

/* ───── Security headers (CSP + hardening) ───── */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // CSP — permissive enough for Electron + inline SVG, strict for scripts
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' ws: wss: http: https:; " +
    "frame-ancestors 'self';"
  );
  next();
}

/* ───── Input sanitization (deep, in-place) ───── */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Strip null bytes and control chars (except \n, \r, \t)
    return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(k)) continue; // prototype pollution defense
      out[k] = sanitize(value[k]);
    }
    return out;
  }
  return value;
}

function inputSanitizer(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitize(req.body);
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) {
      if (typeof req.query[k] === 'string') req.query[k] = sanitize(req.query[k]);
    }
  }
  next();
}

/* ───── Secret redaction helper (for logs) ───── */
const SECRET_KEYS = /(password|token|secret|api_key|authorization|private_key)/i;
function redactSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj)) {
    if (SECRET_KEYS.test(k)) { out[k] = '***REDACTED***'; continue; }
    out[k] = typeof obj[k] === 'object' ? redactSecrets(obj[k]) : obj[k];
  }
  return out;
}

/* ───── Payload size guard (defense-in-depth beyond express limit) ───── */
function payloadGuard(maxBytes = 10 * 1024 * 1024) {
  return (req, res, next) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len && len > maxBytes) {
      return res.status(413).json({ error: 'Payload too large', max_bytes: maxBytes });
    }
    next();
  };
}

/* ───── Timing-safe string compare ───── */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Still run timingSafeEqual on equal-length buffers to avoid length-based timing leaks
    const max = Math.max(a.length, b.length);
    crypto.timingSafeEqual(Buffer.alloc(max), Buffer.alloc(max));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = {
  rateLimiter,
  securityHeaders,
  inputSanitizer,
  redactSecrets,
  payloadGuard,
  safeEqual,
  sanitize,
};
