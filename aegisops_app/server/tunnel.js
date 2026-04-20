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
 *   - cloudflared (auto-downloaded if missing, no account required)
 *   - ngrok (if NGROK_AUTHTOKEN is set)
 *   - manual (user-provided public URL)
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');
const { log } = require('./middleware/logger');
const { runSQL, queryOne, nowISO } = require('./db');
const { gateway, getLanIPs, generatePairingCode } = require('./gateway');

let current = null; // { provider, url, proc }

async function setPublicUrl(url, provider = 'manual') {
  await runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['public_base_url', url, nowISO()]);
  await runSQL('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['public_provider', provider, nowISO()]);
}

async function getPublicUrl() {
  const row = await queryOne("SELECT value FROM settings WHERE key='public_base_url'");
  return row?.value || '';
}

async function status() {
  const gw = gateway.getStatus();
  return {
    active: !!current,
    provider: current?.provider || null,
    url: current?.url || (await getPublicUrl()),
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

/* ─── cloudflared auto-download ─── */

/**
 * Safely ensure a directory exists, with ENOTDIR fallback to temp.
 * On Windows Electron, `__dirname/../data` can resolve to a path where
 * an ancestor is a file (e.g. the app asar), causing ENOTDIR.
 */
function safeMkdir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (err) {
    if (err.code === 'ENOTDIR') {
      // Fallback to OS temp directory
      const os = require('os');
      const fallback = path.join(os.tmpdir(), 'aegisops', path.basename(dir));
      if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
      log.info('tunnel.mkdir_enotdir_fallback', { original: dir, fallback });
      return fallback;
    }
    throw err;
  }
}

/**
 * Resolve the cloudflared binary path.
 * 1. Check if 'cloudflared' / 'cloudflared.exe' is on PATH
 * 2. Check the local data/bin directory
 * 3. Check OS temp directory (fallback for Electron/asar)
 * 4. Auto-download to the first writable directory
 */
async function ensureCloudflared() {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'cloudflared.exe' : 'cloudflared';

  // 1. Check PATH
  try {
    const whichCmd = isWin ? 'where' : 'which';
    const result = execSync(`${whichCmd} ${binName}`, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) {
      log.info('tunnel.cloudflared_found_in_path', { path: result.split('\n')[0] });
      return result.split('\n')[0];
    }
  } catch {}

  // 2. Check local data/bin directory
  const dataDir = path.join(__dirname, '..', 'data');
  const binDir = path.join(dataDir, 'bin');
  const localBin = path.join(binDir, binName);
  if (fs.existsSync(localBin)) {
    if (!isWin) {
      try { fs.chmodSync(localBin, 0o755); } catch {}
    }
    log.info('tunnel.cloudflared_found_local', { path: localBin });
    return localBin;
  }

  // 3. Check OS temp directory (Electron/asar fallback)
  const os = require('os');
  const tmpBinDir = path.join(os.tmpdir(), 'aegisops', 'bin');
  const tmpBin = path.join(tmpBinDir, binName);
  if (fs.existsSync(tmpBin)) {
    if (!isWin) {
      try { fs.chmodSync(tmpBin, 0o755); } catch {}
    }
    log.info('tunnel.cloudflared_found_tmp', { path: tmpBin });
    return tmpBin;
  }

  // 4. Auto-download — try data/bin first, fall back to temp on ENOTDIR
  log.info('tunnel.cloudflared_downloading', { platform: process.platform, arch: process.arch });
  const archMap = { x64: 'amd64', arm64: 'arm64', ia32: '386', arm: 'arm' };
  const cfArch = archMap[process.arch] || 'amd64';

  let downloadUrl;
  if (isWin) {
    downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${cfArch}.exe`;
  } else if (process.platform === 'darwin') {
    downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${cfArch}`;
  } else {
    downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch}`;
  }

  // Try both locations: data/bin and tmp
  const tryDirs = [binDir, tmpBinDir];
  for (const dir of tryDirs) {
    try {
      const actualDir = safeMkdir(dir);
      const destBin = path.join(actualDir, binName);
      log.info('tunnel.cloudflared_downloading_to', { dest: destBin });
      await downloadFile(downloadUrl, destBin);
      if (!isWin) {
        try { fs.chmodSync(destBin, 0o755); } catch {}
      }
      log.info('tunnel.cloudflared_downloaded', { path: destBin });
      return destBin;
    } catch (err) {
      log.warn('tunnel.cloudflared_download_dir_failed', { dir, error: err.message });
      continue; // Try next directory
    }
  }

  // All download attempts failed
  log.warn('tunnel.cloudflared_download_all_failed');
  throw new Error(
    `cloudflared not found and auto-download failed. ` +
    `Install manually from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/ ` +
    `or place the binary in: ${tmpBinDir}`
  );
}

/**
 * Download a file from URL to local path using streaming.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (url, redirects = 0) => {
      if (redirects > 10) return reject(new Error('Too many redirects'));
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, { timeout: 120_000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        }
        const stream = fs.createWriteStream(dest);
        res.pipe(stream);
        stream.on('finish', () => {
          stream.close();
          resolve();
        });
        stream.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

/* ─── Cloudflare/ngrok tunnels (optional fallback) ─── */

async function startCloudflared(port) {
  // Ensure cloudflared binary is available (auto-download if missing)
  const cloudflaredPath = await ensureCloudflared();

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cloudflaredPath, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return reject(new Error(`Failed to start cloudflared: ${err.message}`));
    }

    let settled = false;
    const settle = (err, url) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve(url);
    };
    const t = setTimeout(() => settle(new Error('cloudflared timeout (30s). Check your internet connection.')), 30_000);

    const onData = buf => {
      const text = String(buf);
      const m = text.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        clearTimeout(t);
        current = { provider: 'cloudflared', url: m[0], proc };
        setPublicUrl(m[0], 'cloudflared').catch(() => {});
        log.info('tunnel.cloudflared_up', { url: m[0] });
        settle(null, m[0]);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', err => {
      clearTimeout(t);
      settle(new Error(`cloudflared failed to start: ${err.message}`));
    });
    proc.on('exit', code => {
      log.info('tunnel.cloudflared_exit', { code });
      if (current?.provider === 'cloudflared') current = null;
    });
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
        setPublicUrl(m[1], 'ngrok').catch(() => {});
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

  // Graceful fallback: no cloud tunnel available, but local gateway still works.
  // Return a "gateway-only" result instead of throwing — the mobile app can still
  // connect directly on LAN via the WebSocket gateway.
  log.info('tunnel.fallback_gateway_only', { errors });
  const gwStatus = gateway.getStatus();
  return {
    provider: 'gateway-only',
    url: '',
    gateway_only: true,
    message: 'Cloud tunnel unavailable. Use local WebSocket gateway on LAN instead.',
    errors,
    gateway: gwStatus,
  };
}

async function stop() {
  if (current?.proc) {
    try { current.proc.kill(); } catch {}
  }
  current = null;
}

module.exports = {
  start, stop, status, setPublicUrl, getPublicUrl,
  startGateway, stopGateway, getGatewayStatus, getLanIPs, generatePairingCode,
};
