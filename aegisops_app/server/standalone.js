/**
 * AegisOps Local AI — Standalone Server (no Electron required)
 * Run with: node server/standalone.js
 */
const { startServer } = require('./index');
const PORT = parseInt(process.env.PORT || '18090');
startServer(PORT).then(() => {
  console.log(`[AegisOps] ✅ Open http://127.0.0.1:${PORT} in browser`);
}).catch(err => {
  console.error('[AegisOps] Fatal:', err);
  process.exit(1);
});
