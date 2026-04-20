/**
 * Routes: /api/auth/*  — login, API keys, pairing QR
 * Updated to use async db/pg.js and async auth functions.
 */
const express = require('express');
const crypto = require('crypto');
const {
  signToken, createApiKey, listApiKeys, revokeApiKey,
  setAdminPassword, verifyAdminPassword, authMiddleware,
} = require('../auth');
const { queryOne, runSQL, nowISO } = require('../db/pg');
const { log } = require('../middleware/logger');

const router = express.Router();

/* Bootstrap admin password on first use */
router.post('/bootstrap', async (req, res) => {
  try {
    const existing = await queryOne("SELECT value FROM settings WHERE key='admin_password'");
    if (existing?.value) return res.status(409).json({ error: 'already bootstrapped' });
    const { password } = req.body || {};
    if (!password || password.length < 8) return res.status(400).json({ error: 'password too short (min 8)' });
    await setAdminPassword(password);
    log.info('auth.bootstrap');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!(await verifyAdminPassword(password || ''))) {
      log.warn('auth.login_failed');
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const token = await signToken({ sub: 'admin', scopes: ['*'] }, 24 * 3600);
    res.json({ token, expires_in: 24 * 3600 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authMiddleware({ required: false }), (req, res) => {
  res.json({ auth: req.auth });
});

/* API keys management */
router.get('/keys', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  try {
    const keys = await listApiKeys();
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/keys', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  try {
    const { label, scopes } = req.body || {};
    if (!label) return res.status(400).json({ error: 'label required' });
    const created = await createApiKey(label, scopes && Array.isArray(scopes) ? scopes : ['read', 'run']);
    log.info('auth.key_created', { label });
    res.json(created); // key shown ONCE
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/keys/:id', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  try {
    await revokeApiKey(req.params.id);
    log.info('auth.key_revoked', { id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Pairing: generate short-lived code for mobile */
const pairingCodes = new Map(); // code -> { apiKey, expiresAt }

router.post('/pair/request', authMiddleware({ scopes: ['*'] }), async (req, res) => {
  try {
    const { label } = req.body || {};
    const key = await createApiKey(label || 'Mobile device', ['read', 'run']);
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = Date.now() + 5 * 60 * 1000;
    pairingCodes.set(code, { apiKey: key.key, label, expiresAt });
    setTimeout(() => pairingCodes.delete(code), 5 * 60 * 1000);
    // Return base URL info for QR generation
    const publicBase = (await queryOne("SELECT value FROM settings WHERE key='public_base_url'"))?.value || '';
    res.json({
      code,
      expires_in: 300,
      pairing_url: `aegisops://pair?code=${code}&base=${encodeURIComponent(publicBase)}`,
      public_base_url: publicBase,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pair/consume', async (req, res) => {
  try {
    const { code } = req.body || {};
    const entry = pairingCodes.get(code);
    if (!entry || entry.expiresAt < Date.now()) return res.status(404).json({ error: 'invalid or expired code' });
    pairingCodes.delete(code);
    const publicBase = (await queryOne("SELECT value FROM settings WHERE key='public_base_url'"))?.value || '';
    res.json({ api_key: entry.apiKey, base_url: publicBase, label: entry.label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
