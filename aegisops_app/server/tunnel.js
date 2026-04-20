/**
 * AegisOps — Tunnel Manager & Gateway
 * Exposes the local server so mobile APK clients can reach it.
 *
 * Primary method: Local WebSocket Gateway (no cloud dependency)
 *   - WS server on configurable port (default 18091)
 *   - Mobile connects directly on LAN or via relay
 *   - QR code with ws://LAN_IP:PORT
 *
 * Optional fallback: cloud tunnels (cloudflared / ngrok / manual)
 *   - cloudflared (no account required for quick tunnels)
 *   - ngrok (if NGROK_AUTHTOKEN is set)
 *   - manual (user-provided public URL)
 */
const { spawn } = require('child_process');
const { log } = require('./middleware/logger');
const { runSQL, queryOne, nowISO } = require('./db');
const { gateway, getLanIPs, generatePairingCode } = require('./gateway');

let current = null; // { provider, url, proc }

function setPublicUrl(url, provider = 'manual') {
  runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['public_base_url', url, nowISO()]);
  runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['public_provider', provider, nowISO()]);
}

function getPublicUrl() {
  return queryOne("SELECT value FROM settings WHERE key='public_base_url'")?.value || '';
}

function status() {
  const gw = gateway.getStatus();
  return {
    active: !!current,
    provider: current?.provider || null,
    url: current?.url || getPublicUrl(),
    gateway: gw,
  };
}

/* ─── Local WebSocket Gateway ─── */

async function startGateway(port) {
  const gwPort = parseInt(port) || 18091;
  const result = await gateway.start(gwPort);
  log.info('tunnel.gateway_started', { port: gwPort });
  return result;
}

function stopGateway() {
  gateway.stop();
  log.info('tunnel.gateway_stopped');
}

function getGatewayStatus() {
  return gateway.getStatus();
}

/* ─── Cloudflare/ngrok tunnels (optional fallback) ─── */

async function startCloudflared(port) {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    const proc = spawn(cmd, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const settle = (err, url) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve(url);
    };
    const t = setTimeout(() => settle(new Error('cloudflared timeout')), 30_000);

    const onData = buf => {
      const text = String(buf);
      const m = text.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        clearTimeout(t);
        current = { provider: 'cloudflared', url: m[0], proc };
        setPublicUrl(m[0], 'cloudflared');
        log.info('tunnel.cloudflared_up', { url: m[0] });
        settle(null, m[0]);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', err => { clearTimeout(t); settle(err); });
    proc.on('exit', code => { log.info('tunnel.cloudflared_exit', { code }); if (current?.provider === 'cloudflared') current = null; });
  });
}

async function startNgrok(port) {
  const token = process.env.NGROK_AUTHTOKEN;
  if (!token) throw new Error('NGROK_AUTHTOKEN not set');
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'ngrok.exe' : 'ngrok';
    const proc = spawn(cmd, ['http', String(port), '--log=stdout', '--log-format=json', `--authtoken=${token}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const t = setTimeout(() => settled || reject(new Error('ngrok timeout')), 30_000);
    proc.stdout.on('data', buf => {
      const text = String(buf);
      const m = text.match(/"url":"(https:\/\/[a-z0-9-]+\.ngrok[^"]+)"/i);
      if (m && !settled) {
        settled = true; clearTimeout(t);
        current = { provider: 'ngrok', url: m[1], proc };
        setPublicUrl(m[1], 'ngrok');
        log.info('tunnel.ngrok_up', { url: m[1] });
        resolve(m[1]);
      }
    });
    proc.on('error', err => { clearTimeout(t); if (!settled) { settled = true; reject(err); } });
  });
}

async function start(port, provider = 'auto') {
  await stop();
  const order = provider === 'auto' ? ['cloudflared', 'ngrok'] : [provider];
  const errors = [];
  for (const p of order) {
    try {
      if (p === 'cloudflared') return { provider: p, url: await startCloudflared(port) };
      if (p === 'ngrok') return { provider: p, url: await startNgrok(port) };
    } catch (err) {
      errors.push({ provider: p, err: err.message });
      log.warn('tunnel.start_failed', { provider: p, err: err.message });
    }
  }
  throw new Error('No tunnel provider available: ' + JSON.stringify(errors));
}

async function stop() {
  if (current?.proc) {
    try { current.proc.kill(); } catch {}
  }
  current = null;
}

module.exports = {
  start, stop, status, setPublicUrl, getPublicUrl,
  // Gateway methods
  startGateway, stopGateway, getGatewayStatus, getLanIPs, generatePairingCode,
};
