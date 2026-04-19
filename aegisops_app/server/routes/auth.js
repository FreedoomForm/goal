/**
 * Routes: /api/auth/*  — login, API keys, pairing QR
 */
const express = require('express');
const crypto = require('crypto');
const {
  signToken, createApiKey, listApiKeys, revokeApiKey,
  setAdminPassword, verifyAdminPassword, authMiddleware,
} = require('../auth');
const { queryOne, runSQL, nowISO } = require('../db');
const { log } = require('../middleware/logger');

const router = express.Router();

/* Bootstrap admin password on first use */
router.post('/bootstrap', (req, res) => {
  const existing = queryOne("SELECT value FROM settings WHERE key='admin_password'");
  if (existing?.value) return res.status(409).json({ error: 'already bootstrapped' });
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'password too short (min 8)' });
  setAdminPassword(password);
  log.info('auth.bootstrap');
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!verifyAdminPassword(password || '')) {
    log.warn('auth.login_failed');
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = signToken({ sub: 'admin', scopes: ['*'] }, 24 * 3600);
  res.json({ token, expires_in: 24 * 3600 });
});

router.get('/me', authMiddleware({ required: false }), (req, res) => {
  res.json({ auth: req.auth });
});

/* API keys management */
router.get('/keys', authMiddleware({ scopes: ['*'] }), (req, res) => {
  res.json(listApiKeys());
});

router.post('/keys', authMiddleware({ scopes: ['*'] }), (req, res) => {
  const { label, scopes } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label required' });
  const created = createApiKey(label, scopes && Array.isArray(scopes) ? scopes : ['read', 'run']);
  log.info('auth.key_created', { label });
  res.json(created); // key shown ONCE
});

router.delete('/keys/:id', authMiddleware({ scopes: ['*'] }), (req, res) => {
  revokeApiKey(req.params.id);
  log.info('auth.key_revoked', { id: req.params.id });
  res.json({ ok: true });
});

/* Pairing: generate short-lived code for mobile */
const pairingCodes = new Map(); // code -> { token, expiresAt }
router.post('/pair/request', authMiddleware({ scopes: ['*'] }), (req, res) => {
  const { label } = req.body || {};
  const key = createApiKey(label || 'Mobile device', ['read', 'run']);
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  pairingCodes.set(code, { apiKey: key.key, label, expiresAt });
  setTimeout(() => pairingCodes.delete(code), 5 * 60 * 1000);
  // Return base URL info for QR generation
  const publicBase = queryOne("SELECT value FROM settings WHERE key='public_base_url'")?.value || '';
  res.json({
    code,
    expires_in: 300,
    pairing_url: `aegisops://pair?code=${code}&base=${encodeURIComponent(publicBase)}`,
    public_base_url: publicBase,
  });
});

router.post('/pair/consume', (req, res) => {
  const { code } = req.body || {};
  const entry = pairingCodes.get(code);
  if (!entry || entry.expiresAt < Date.now()) return res.status(404).json({ error: 'invalid or expired code' });
  pairingCodes.delete(code);
  const publicBase = queryOne("SELECT value FROM settings WHERE key='public_base_url'")?.value || '';
  res.json({ api_key: entry.apiKey, base_url: publicBase, label: entry.label });
});

module.exports = router;
