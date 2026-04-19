/**
 * AegisOps — Connector Credential Encryption
 * Implements AES-256-GCM encryption for connector auth_payload
 * as required by SECURITY.md.
 *
 * Previously, auth_payload was stored as plaintext JSON in SQLite.
 * This module encrypts credentials before storage and decrypts on read.
 *
 * Encryption:
 *   - Algorithm: AES-256-GCM (authenticated encryption)
 *   - Key: derived from serverSecret via HKDF (SHA-256)
 *   - IV: 12-byte random per encryption
 *   - Output: base64(iv:ciphertext:authTag)
 *
 * Migration:
 *   - On startup, any plaintext auth_payload is encrypted and moved
 *     to encrypted_auth_payload column; the original column is zeroed.
 */
const crypto = require('crypto');
const { queryAll, queryOne, runSQL, nowISO } = require('../db/pg');
const { log } = require('../middleware/logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

let _encryptionKey = null;

/**
 * Initialize encryption key from server secret.
 * Derives a 256-bit key using HKDF-SHA256.
 */
function initEncryptionKey(serverSecret) {
  if (!serverSecret) throw new Error('serverSecret required for credential encryption');
  _encryptionKey = crypto.hkdfSync(
    'sha256',
    serverSecret,
    'aegisops-credential-encryption', // salt (info)
    'auth-payload-v1',               // info
    KEY_LENGTH
  );
  log.info('crypto.key_initialized');
}

/**
 * Encrypt a JSON object.
 * @param {Object} plaintext - Data to encrypt
 * @returns {string} Base64-encoded encrypted blob (iv:ciphertext:authTag)
 */
function encrypt(plaintext) {
  if (!_encryptionKey) throw new Error('Encryption key not initialized');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, _encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });

  const input = JSON.stringify(plaintext);
  let encrypted = cipher.update(input, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Combine iv + ciphertext + authTag, all base64
  const blob = Buffer.concat([iv, Buffer.from(encrypted, 'base64'), authTag]);
  return blob.toString('base64');
}

/**
 * Decrypt an encrypted blob back to JSON object.
 * @param {string} encryptedBlob - Base64-encoded encrypted data
 * @returns {Object} Decrypted JSON object
 */
function decrypt(encryptedBlob) {
  if (!_encryptionKey) throw new Error('Encryption key not initialized');
  const blob = Buffer.from(encryptedBlob, 'base64');

  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, _encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Encrypt connector credentials.
 * Called before storing auth_payload in the database.
 */
function encryptCredentials(authPayload) {
  if (!authPayload || Object.keys(authPayload).length === 0) return null;
  try {
    return encrypt(authPayload);
  } catch (err) {
    log.error('crypto.encrypt_error', { error: err.message });
    return null;
  }
}

/**
 * Decrypt connector credentials.
 * Called when reading auth_payload from the database.
 */
function decryptCredentials(encryptedBlob) {
  if (!encryptedBlob) return {};
  try {
    return decrypt(encryptedBlob);
  } catch (err) {
    log.error('crypto.decrypt_error', { error: err.message });
    return {};
  }
}

/**
 * Migrate plaintext credentials to encrypted storage.
 * Called on startup after encryption key is initialized.
 */
async function migrateCredentials() {
  if (!_encryptionKey) {
    log.warn('crypto.migration_skipped', { reason: 'No encryption key' });
    return;
  }

  try {
    const connectors = await queryAll('SELECT id, auth_payload, encrypted_auth_payload FROM connectors');
    let migrated = 0;

    for (const conn of connectors) {
      // Skip if already encrypted
      if (conn.encrypted_auth_payload) continue;

      const authPayload = typeof conn.auth_payload === 'string'
        ? JSON.parse(conn.auth_payload || '{}')
        : (conn.auth_payload || {});

      // Skip empty credentials
      if (!authPayload || Object.keys(authPayload).length === 0) continue;

      const encrypted = encryptCredentials(authPayload);
      if (encrypted) {
        await runSQL(
          'UPDATE connectors SET encrypted_auth_payload = ?, auth_payload = ? WHERE id = ?',
          [encrypted, '{}', conn.id] // Zero out plaintext
        );
        migrated++;
      }
    }

    if (migrated > 0) {
      log.info('crypto.migration_complete', { migrated });
    }
  } catch (err) {
    log.error('crypto.migration_error', { error: err.message });
  }
}

/**
 * Get decrypted auth_payload for a connector.
 * Tries encrypted column first, falls back to plaintext.
 */
function getConnectorCredentials(connector) {
  if (connector.encrypted_auth_payload) {
    return decryptCredentials(connector.encrypted_auth_payload);
  }
  // Fallback to plaintext (for unmigrated data)
  return typeof connector.auth_payload === 'string'
    ? JSON.parse(connector.auth_payload || '{}')
    : (connector.auth_payload || {});
}

module.exports = {
  initEncryptionKey,
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  migrateCredentials,
  getConnectorCredentials,
};
