/**
 * AegisOps Local AI v2.0 — Standalone Server (no Electron required)
 * Run with:
 *   node server/standalone.js              # local only (127.0.0.1)
 *   BIND=0.0.0.0 node server/standalone.js # LAN access (mobile over Wi-Fi)
 *   AEGISOPS_TUNNEL=cloudflared node server/standalone.js  # auto-tunnel
 *   GATEWAY=1 node server/standalone.js    # auto-start local WS gateway
 *
 * Environment variables:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD  — PostgreSQL connection
 *   KAFKA_BROKERS                                          — Kafka broker addresses (comma-separated)
 *   AEGISOPS_SECRET                                        — Server secret for JWT & credential encryption
 *   GATEWAY                                                — Set to "1" to auto-start WS gateway (default: "1" if BIND=0.0.0.0)
 *   GATEWAY_PORT                                           — WS gateway port (default 18091)
 */
const { startServer } = require('./index');
const tunnel = require('./tunnel');
const { eventBus } = require('./events/kafka');
const { stopScheduler } = require('./workflow/scheduler');
const { stopRetentionJob } = require('./services/retention');
const { shutdownDB } = require('./db/pg');
const { log } = require('./middleware/logger');

const PORT = parseInt(process.env.PORT || '18090');
const BIND = process.env.BIND || '127.0.0.1';

startServer(PORT, { bind: BIND }).then(async () => {
  console.log(`[AegisOps] ✅ Server: http://${BIND}:${PORT}`);
  console.log(`[AegisOps] 📦 v2.0 — PostgreSQL/TimescaleDB, Kafka, SCADA DMZ, Real ETL, DAG Workflows`);
  if (BIND === '0.0.0.0') {
    console.log('[AegisOps] ⚠️  Bound to 0.0.0.0 — remote clients must authenticate (API key / JWT).');
  }

  // Auto-start gateway if GATEWAY=1 or if bound to LAN
  const shouldStartGateway = process.env.GATEWAY === '1' || (BIND === '0.0.0.0' && process.env.GATEWAY !== '0');
  if (shouldStartGateway) {
    try {
      const gwPort = parseInt(process.env.GATEWAY_PORT || '18091');
      const gwResult = await tunnel.startGateway(gwPort);
      console.log(`[AegisOps] 🔌 WS Gateway: port ${gwResult.port}`);
      if (gwResult.lan_urls?.length > 0) {
        console.log(`[AegisOps] 📱 LAN URLs: ${gwResult.lan_urls.join(', ')}`);
      }
    } catch (err) {
      console.error('[AegisOps] ⚠️  Gateway failed:', err.message);
    }
  }

  // Auto-start tunnel if AEGISOPS_TUNNEL is set
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

    // Stop gateway
    try { tunnel.stopGateway(); } catch {}

    // Stop cron schedulers
    stopScheduler();
    stopRetentionJob();

    // Disconnect Kafka
    try { await eventBus.shutdown(); } catch {}

    // Disconnect tunnel
    try { await tunnel.stop(); } catch {}

    // Close database connections
    try { await shutdownDB(); } catch {}

    log.info('server.shutdown_complete');
    process.exit(0);
  });
}
