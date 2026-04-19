/**
 * AegisOps Local AI — Standalone Server (no Electron required)
 * Run with:
 *   node server/standalone.js              # local only (127.0.0.1)
 *   BIND=0.0.0.0 node server/standalone.js # LAN access (mobile over Wi-Fi)
 *   AEGISOPS_TUNNEL=cloudflared node server/standalone.js  # auto-tunnel
 */
const { startServer } = require('./index');
const tunnel = require('./tunnel');

const PORT = parseInt(process.env.PORT || '18090');
const BIND = process.env.BIND || '127.0.0.1';

startServer(PORT, { bind: BIND }).then(async () => {
  console.log(`[AegisOps] ✅ Server: http://${BIND}:${PORT}`);
  if (BIND === '0.0.0.0') {
    console.log('[AegisOps] ⚠️  Bound to 0.0.0.0 — remote clients must authenticate (API key / JWT).');
  }
  const mode = process.env.AEGISOPS_TUNNEL;
  if (mode) {
    try {
      const r = await tunnel.start(PORT, mode);
      console.log(`[AegisOps] 🌐 Public URL: ${r.url} (provider=${r.provider})`);
    } catch (err) {
      console.error('[AegisOps] ⚠️  Tunnel failed:', err.message);
    }
  }
}).catch(err => {
  console.error('[AegisOps] Fatal:', err);
  process.exit(1);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n[AegisOps] Received ${sig}, shutting down...`);
    try { await tunnel.stop(); } catch {}
    process.exit(0);
  });
}
