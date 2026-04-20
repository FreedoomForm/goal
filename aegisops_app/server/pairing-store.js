/**
 * AegisOps — Shared Pairing Code Store
 * Used by both gateway.js and routes/auth.js to avoid duplicate stores.
 * Fixes Android connection bug where pairing codes generated in auth
 * routes weren't found by the gateway (and vice versa).
 */
'use strict';

const pairingCodes = new Map(); // code -> { apiKey, label, expiresAt }

module.exports = { pairingCodes };
