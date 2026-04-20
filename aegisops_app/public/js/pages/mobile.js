/**
 * AegisOps — Mobile / Remote Access page.
 * Local WebSocket Gateway only — no cloud dependency, LAN direct.
 */
(function () {
  'use strict';

  async function renderMobilePage(container) {
    const gatewayStatus = await fetch('/api/gateway/status').then(r => r.json()).catch(() => ({ active: false }));

    const gwActive = gatewayStatus.active;
    const lanUrl = gatewayStatus.lan_url || '';
    const lanIps = gatewayStatus.lan_ips || [];
    const gwConns = gatewayStatus.connections || 0;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📱 Мобильный доступ</h1>
          <p class="page-subtitle">Подключите Android-приложение AegisOps к этому ПК через локальную сеть. Прямое подключение — без облака, без туннелей.</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2>🔌 Локальный шлюз (LAN)</h2>
          <p style="color:#8ea1c9;margin-bottom:12px;">WebSocket-сервер на вашей LAN — мобильное приложение подключается напрямую. Без облака, без туннелей.</p>
          <div id="gatewayStatus"></div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="gwStart">▶️ Запустить шлюз</button>
            <button class="btn btn-ghost" id="gwStop">⏹ Остановить</button>
          </div>
          <div id="gatewayQR" style="margin-top:16px;"></div>
        </div>

        <div class="card">
          <h2>🔐 Сопряжение устройства</h2>
          <p style="color:#8ea1c9;margin-bottom:12px;">Сгенерируйте код — APK отсканирует QR или введёт код вручную.</p>
          <button class="btn btn-primary" id="pairBtn">🔑 Создать код сопряжения</button>
          <div id="pairResult" style="margin-top:16px;"></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2>\u2601\uFE0F Cloudflare Tunnel (удалённый доступ)</h2>
        <p style="color:#8ea1c9;margin-bottom:12px;">Туннель для подключения из любой точки мира через интернет. Требуется установленный cloudflared.</p>
        <div id="tunnelStatus"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="tunnelStart">\u2601\uFE0F Запустить Cloudflare</button>
          <button class="btn btn-ghost" id="tunnelStop">\u23F9 Остановить</button>
        </div>
        <div id="tunnelUrl" style="margin-top:12px;"></div>
      </div>

      <div class="grid-2" style="margin-top:16px;">
        <div class="card">
          <h2>📡 Подключённые устройства</h2>
          <div id="connectionsList"></div>
        </div>

        <div class="card">
          <h2>🗝 API-ключи</h2>
          <div id="apiKeysList"></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2>📱 Как подключить APK</h2>
        <ol style="color:#e8eefc;line-height:1.8;">
          <li>Нажмите <strong>«Запустить шлюз»</strong> выше — запустится локальный WS-сервер.</li>
          <li>Скачайте <code>AegisOps.apk</code> из <a href="https://github.com/FreedoomForm/goal/releases" target="_blank">Releases</a> и установите на Android.</li>
          <li>Убедитесь, что телефон и ПК в одной Wi-Fi сети.</li>
          <li>В приложении нажмите «Подключиться к серверу» → «Сканировать QR» или введите адрес вручную.</li>
          <li>Отсканируйте QR-код или введите код сопряжения.</li>
          <li>Готово — приложение подключится по WebSocket к вашему ПК.</li>
        </ol>
      </div>
    `;

    /* ── Gateway status rendering ── */
    async function renderGatewayStatus() {
      const gw = await fetch('/api/gateway/status').then(r => r.json()).catch(() => ({ active: false }));
      const el = document.getElementById('gatewayStatus');
      if (gw.active) {
        const ips = (gw.lan_ips || []).map(i => `<div style="margin-top:4px;"><code style="color:#23c483;">ws://${i.address}:${gw.port}</code> <span style="color:#8ea1c9;font-size:12px;">(${i.interface})</span></div>`).join('');
        el.innerHTML = `
          <div class="tunnel-live">
            <span class="badge badge-success">ACTIVE</span>
            <span style="margin-left:8px;color:#8ea1c9;font-size:12px;">Порт: ${gw.port} | Подключений: ${gw.connections}</span>
            <div style="margin-top:8px;">${ips || '<code>ws://127.0.0.1:' + gw.port + '</code>'}</div>
          </div>
        `;
      } else {
        el.innerHTML = `<span class="badge badge-neutral">Не запущен</span>`;
      }
      renderConnections();
    }
    renderGatewayStatus();

    /* ── Gateway start/stop ── */
    document.getElementById('gwStart').onclick = async () => {
      window.showToast?.('Запускаем локальный шлюз...', 'info');
      try {
        const r = await fetch('/api/gateway/start', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        window.showToast?.(`Шлюз запущен на порту ${data.port}`, 'success');
        renderGatewayStatus();
      } catch (err) { window.showToast?.('Ошибка: ' + err.message, 'error'); }
    };

    document.getElementById('gwStop').onclick = async () => {
      await fetch('/api/gateway/stop', { method: 'POST' });
      window.showToast?.('Шлюз остановлен', 'info');
      renderGatewayStatus();
      document.getElementById('gatewayQR').innerHTML = '';
    };

    /* ── Cloudflare Tunnel ── */
    async function renderTunnelStatus() {
      try {
        const ts = await fetch('/api/tunnel/status').then(r => r.json()).catch(() => ({}));
        const el = document.getElementById('tunnelStatus');
        const urlEl = document.getElementById('tunnelUrl');
        if (ts.active && ts.url) {
          el.innerHTML = `<div class="tunnel-live"><span class="badge badge-success">ACTIVE</span> <span style="margin-left:8px;color:#8ea1c9;font-size:12px;">${ts.provider || 'cloudflared'}</span></div>`;
          urlEl.innerHTML = `<div style="margin-top:8px;padding:10px;background:#09101d;border-radius:8px;border:1px solid #1f2d4a;word-break:break-all;"><code style="color:#23c483;">${ts.url}</code></div>`;
        } else {
          el.innerHTML = `<span class="badge badge-neutral">Не запущен</span>`;
          urlEl.innerHTML = '';
        }
      } catch {
        document.getElementById('tunnelStatus').innerHTML = `<span class="badge badge-neutral">Не запущен</span>`;
        document.getElementById('tunnelUrl').innerHTML = '';
      }
    }
    renderTunnelStatus();

    document.getElementById('tunnelStart').onclick = async () => {
      window.showToast?.('Запускаем Cloudflare Tunnel...', 'info');
      try {
        const r = await fetch('/api/tunnel/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'cloudflared', port: 18090 }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        window.showToast?.('Туннель запущен', 'success');
        renderTunnelStatus();
      } catch (err) { window.showToast?.('Ошибка: ' + err.message, 'error'); }
    };

    document.getElementById('tunnelStop').onclick = async () => {
      await fetch('/api/tunnel/stop', { method: 'POST' });
      window.showToast?.('Туннель остановлен', 'info');
      renderTunnelStatus();
    };

    /* ── Pairing code with QR ── */
    document.getElementById('pairBtn').onclick = async () => {
      const gw = await fetch('/api/gateway/status').then(r => r.json()).catch(() => ({ active: false }));
      const r = await fetch('/api/auth/pair/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Mobile ' + new Date().toLocaleString('ru-RU') }) }).then(r => r.json());

      // Build QR payload: prefer local WS gateway URL
      let wsBase = '';
      if (gw.active && gw.lan_url) {
        wsBase = gw.lan_url;
      }
      const httpBase = location.origin;
      const tunnelStatus = await fetch('/api/tunnel/status').then(r => r.json()).catch(() => ({}));
      const tunnelUrl = tunnelStatus.url || '';
      const qrPayload = JSON.stringify({
        base: httpBase,
        ws: wsBase,
        tunnel: tunnelUrl,
        code: r.code,
        type: 'aegisops-pair',
      });
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrPayload)}&bgcolor=ffffff`;

      // Also show gateway QR if active
      let gwQrHtml = '';
      if (gw.active && gw.lan_url) {
        const gwQrPayload = JSON.stringify({ ws: gw.lan_url, type: 'aegisops-gateway' });
        const gwQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gwQrPayload)}&bgcolor=ffffff`;
        gwQrHtml = `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #1f2d4a;">
            <div style="color:#8ea1c9;font-size:12px;margin-bottom:8px;">QR для подключения (без сопряжения):</div>
            <img src="${gwQrUrl}" alt="Gateway QR" width="150" height="150"/>
            <div style="color:#8ea1c9;font-size:11px;margin-top:4px;">${gw.lan_url}</div>
          </div>
        `;
      }

      document.getElementById('pairResult').innerHTML = `
        <div class="pairing-box">
          <div class="pairing-hint">Введите этот код в APK или отсканируйте QR (действителен 5 мин):</div>
          <div class="pairing-code">${r.code}</div>
          <div class="pairing-qr"><img src="${qrUrl}" alt="QR" width="200" height="200"/></div>
          <div class="pairing-hint">Сервер: <code>${httpBase}</code></div>
          ${wsBase ? `<div class="pairing-hint">WS: <code>${wsBase}</code></div>` : ''}
        </div>
      `;

      document.getElementById('gatewayQR').innerHTML = gwQrHtml;
      renderKeys();
    };

    /* ── Connected devices ── */
    async function renderConnections() {
      try {
        const conns = await fetch('/api/gateway/connections').then(r => r.json()).catch(() => []);
        const el = document.getElementById('connectionsList');
        if (!conns || conns.length === 0) {
          el.innerHTML = '<div class="empty-state">Нет подключённых устройств</div>';
          return;
        }
        el.innerHTML = `
          <table class="table">
            <thead><tr><th>Session</th><th>Метка</th><th>Тип</th><th>Адрес</th><th>Подключён</th></tr></thead>
            <tbody>
              ${conns.map(c => `
                <tr>
                  <td><code>${c.session_id?.slice(0, 8)}...</code></td>
                  <td>${c.auth?.label || '—'}</td>
                  <td><code>${c.auth?.type || '—'}</code></td>
                  <td><code>${c.remote_address || '—'}</code></td>
                  <td>${c.connected_at ? new Date(c.connected_at).toLocaleTimeString('ru-RU') : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>`;
      } catch {
        document.getElementById('connectionsList').innerHTML = '<div class="empty-state">Шлюз не запущен</div>';
      }
    }
    renderConnections();

    /* ── API Keys ── */
    async function renderKeys() {
      try {
        const keys = await fetch('/api/auth/keys').then(r => r.json());
        document.getElementById('apiKeysList').innerHTML = keys.length ? `
          <table class="table">
            <thead><tr><th>#</th><th>Метка</th><th>Scopes</th><th>Создан</th><th>Последнее использ.</th><th></th></tr></thead>
            <tbody>
              ${keys.map(k => `
                <tr ${k.revoked ? 'style="opacity:0.5"' : ''}>
                  <td>${k.id}</td><td>${k.label}</td>
                  <td><code>${(k.scopes || []).join(', ')}</code></td>
                  <td>${k.created_at}</td><td>${k.last_used_at || '—'}</td>
                  <td>${k.revoked ? '<span class="badge badge-danger">revoked</span>' : `<button class="btn btn-ghost" data-revoke="${k.id}">Отозвать</button>`}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div class="empty-state">Нет ключей.</div>';
        document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
          if (confirm('Отозвать ключ?')) {
            await fetch('/api/auth/keys/' + b.dataset.revoke, { method: 'DELETE' });
            renderKeys();
          }
        });
      } catch {}
    }
    renderKeys();

    // Auto-refresh gateway status & connections every 10s
    const refreshInterval = setInterval(async () => {
      if (!document.getElementById('gatewayStatus')) { clearInterval(refreshInterval); return; }
      await renderGatewayStatus();
    }, 10000);
  }

  window.renderMobilePage = renderMobilePage;
})();
