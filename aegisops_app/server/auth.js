/**
 * AegisOps — Authentication & Authorization
 * Stateless JWT-like HMAC tokens (no external deps) +
 * long-lived API keys (hashed at rest) for mobile clients.
 */
const crypto = require('crypto');
const { safeEqual } = require('./middleware/security');
const { queryOne, queryAll, runSQL, nowISO } = require('./db');

const SECRET_ENV = 'AEGISOPS_SECRET';

function getSecret() {
  let s = process.env[SECRET_ENV];
  if (!s) {
    // Derive per-install secret from DB (seeded once)
    const row = queryOne("SELECT value FROM settings WHERE key='server_secret'");
    if (row?.value) return row.value;
    const generated = crypto.randomBytes(48).toString('hex');
    runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      ['server_secret', generated, nowISO()]);
    return generated;
  }
  return s;
}

/* ───── Token format: v1.<base64url(payload)>.<base64url(hmac)> ───── */
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function signToken(payload, ttlSec = 24 * 3600) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec };
  const encoded = b64url(JSON.stringify(body));
  const h = crypto.createHmac('sha256', getSecret()).update(encoded).digest();
  return `v1.${encoded}.${b64url(h)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.startsWith('v1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', getSecret()).update(encoded).digest());
  if (!safeEqual(expected, sig)) return null;
  try {
    const body = JSON.parse(b64urlDecode(encoded).toString('utf-8'));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { return null; }
}

/* ───── API keys (for mobile pairing) ───── */
function hashKey(raw) {
  return crypto.createHash('sha256').update(raw + ':' + getSecret()).digest('hex');
}

function createApiKey(label, scopes = ['read', 'run']) {
  const raw = 'aos_' + crypto.randomBytes(24).toString('base64url');
  const hashed = hashKey(raw);
  runSQL(`INSERT INTO api_keys (label, key_hash, scopes, created_at, last_used_at, revoked)
          VALUES (?, ?, ?, ?, NULL, 0)`,
    [label, hashed, JSON.stringify(scopes), nowISO()]);
  const row = queryOne('SELECT * FROM api_keys WHERE key_hash=?', [hashed]);
  return { id: row.id, label, key: raw, scopes, created_at: row.created_at };
}

function listApiKeys() {
  return queryAll('SELECT id, label, scopes, created_at, last_used_at, revoked FROM api_keys ORDER BY id DESC')
    .map(r => ({ ...r, scopes: safeParse(r.scopes, []) }));
}

function revokeApiKey(id) {
  runSQL('UPDATE api_keys SET revoked=1 WHERE id=?', [id]);
}

function verifyApiKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const hashed = hashKey(raw);
  const row = queryOne('SELECT * FROM api_keys WHERE key_hash=? AND revoked=0', [hashed]);
  if (!row) return null;
  runSQL('UPDATE api_keys SET last_used_at=? WHERE id=?', [nowISO(), row.id]);
  return { id: row.id, label: row.label, scopes: safeParse(row.scopes, []) };
}

function safeParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

/* ───── Admin login (password stored as scrypt hash) ───── */
function setAdminPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  const stored = 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
  runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['admin_password', stored, nowISO()]);
}

function verifyAdminPassword(password) {
  const row = queryOne("SELECT value FROM settings WHERE key='admin_password'");
  if (!row?.value) return false;
  const [scheme, saltHex, hashHex] = row.value.split('$');
  if (scheme !== 'scrypt') return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = crypto.scryptSync(password, salt, 64);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

/* ───── Middleware ───── */
function authMiddleware({ required = true, scopes = [] } = {}) {
  return (req, res, next) => {
    // Allow localhost without auth unless explicitly disabled
    const ip = req.ip || req.connection?.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    const enforceLocal = process.env.AEGISOPS_ENFORCE_LOCAL_AUTH === '1';
    if (isLocal && !enforceLocal) { req.auth = { local: true, scopes: ['*'] }; return next(); }

    const header = req.headers['authorization'] || '';
    const apiKeyHeader = req.headers['x-api-key'];
    let principal = null;

    if (header.startsWith('Bearer ')) {
      const token = header.slice(7).trim();
      principal = verifyToken(token);
      if (principal) principal.type = 'jwt';
    }
    if (!principal && apiKeyHeader) {
      const k = verifyApiKey(apiKeyHeader);
      if (k) principal = { ...k, type: 'api_key' };
    }

    if (!principal && required) return res.status(401).json({ error: 'Authentication required' });
    if (principal && scopes.length) {
      const granted = new Set(principal.scopes || []);
      const ok = scopes.every(s => granted.has(s) || granted.has('*'));
      if (!ok) return res.status(403).json({ error: 'Insufficient scope', required: scopes });
    }
    req.auth = principal || { anonymous: true };
    next();
  };
}

module.exports = {
  signToken,
  verifyToken,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
  setAdminPassword,
  verifyAdminPassword,
  authMiddleware,
};
