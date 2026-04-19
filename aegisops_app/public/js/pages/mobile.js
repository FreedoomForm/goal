/**
 * AegisOps — Mobile / Remote Access page.
 * Start a public tunnel (Cloudflare/ngrok) and generate pairing codes + QR
 * so the Android APK can connect to this PC-as-server from anywhere.
 */
(function () {
  'use strict';

  async function renderMobilePage(container) {
    const status = await fetch('/api/tunnel/status').then(r => r.json()).catch(() => ({ active: false }));
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📱 Мобильный доступ</h1>
          <p class="page-subtitle">Подключите Android-приложение AegisOps к этому ПК через интернет.</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2>🌐 Публичный туннель</h2>
          <p style="color:#8ea1c9;margin-bottom:12px;">ПК выступает как сервер. Туннель делает его доступным из любой точки сети.</p>
          <div id="tunnelStatus"></div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="tunnelStart">▶️ Запустить Cloudflare</button>
            <button class="btn btn-ghost" id="tunnelStop">⏹ Остановить</button>
            <button class="btn btn-ghost" id="tunnelManual">✎ Ввести вручную</button>
          </div>
        </div>

        <div class="card">
          <h2>🔐 Сопряжение устройства</h2>
          <p style="color:#8ea1c9;margin-bottom:12px;">Сгенерируйте код — APK отсканирует QR или введёт код вручную.</p>
          <button class="btn btn-primary" id="pairBtn">🔑 Создать код сопряжения</button>
          <div id="pairResult" style="margin-top:16px;"></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2>🗝 API-ключи</h2>
        <div id="apiKeysList"></div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2>📱 Как подключить APK</h2>
        <ol style="color:#e8eefc;line-height:1.8;">
          <li>Скачайте <code>AegisOps.apk</code> из <a href="https://github.com/FreedoomForm/goal/releases" target="_blank">Releases</a> и установите на Android.</li>
          <li>В приложении нажмите «Подключиться к серверу» → «Сканировать QR».</li>
          <li>Отсканируйте QR-код, сгенерированный выше.</li>
          <li>Готово — приложение получит URL сервера и API-ключ, все вкладки становятся доступны удалённо.</li>
        </ol>
      </div>
    `;

    async function renderStatus() {
      const s = await fetch('/api/tunnel/status').then(r => r.json());
      const el = document.getElementById('tunnelStatus');
      if (s.active && s.url) {
        el.innerHTML = `
          <div class="tunnel-live">
            <span class="badge badge-success">ACTIVE</span>
            <div style="margin-top:8px;">Provider: <code>${s.provider}</code></div>
            <div style="margin-top:4px;">URL: <a href="${s.url}" target="_blank">${s.url}</a></div>
          </div>
        `;
      } else if (s.url) {
        el.innerHTML = `
          <div>
            <span class="badge badge-neutral">CONFIGURED</span>
            <div style="margin-top:8px;">URL: <a href="${s.url}" target="_blank">${s.url}</a></div>
          </div>
        `;
      } else {
        el.innerHTML = `<span class="badge badge-neutral">Не настроен</span>`;
      }
    }
    renderStatus();

    document.getElementById('tunnelStart').onclick = async () => {
      window.showToast?.('Запускаем туннель...', 'info');
      try {
        const r = await fetch('/api/tunnel/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'cloudflared' }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        window.showToast?.(`Туннель активен: ${data.url}`, 'success');
        renderStatus();
      } catch (err) { window.showToast?.('Ошибка: ' + err.message + ' (установите cloudflared)', 'error'); }
    };
    document.getElementById('tunnelStop').onclick = async () => {
      await fetch('/api/tunnel/stop', { method: 'POST' });
      window.showToast?.('Остановлен', 'info'); renderStatus();
    };
    document.getElementById('tunnelManual').onclick = async () => {
      const url = prompt('Публичный URL сервера (https://...):');
      if (!url) return;
      await fetch('/api/tunnel/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      renderStatus();
    };

    document.getElementById('pairBtn').onclick = async () => {
      const r = await fetch('/api/auth/pair/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Mobile ' + new Date().toLocaleString('ru-RU') }) }).then(r => r.json());
      const qrPayload = JSON.stringify({ base: r.public_base_url || location.origin, code: r.code });
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrPayload)}&bgcolor=ffffff`;
      document.getElementById('pairResult').innerHTML = `
        <div class="pairing-box">
          <div class="pairing-hint">Введите этот код в APK или отсканируйте QR (действителен 5 мин):</div>
          <div class="pairing-code">${r.code}</div>
          <div class="pairing-qr"><img src="${qrUrl}" alt="QR" width="200" height="200"/></div>
          <div class="pairing-hint">Сервер: <code>${r.public_base_url || location.origin}</code></div>
        </div>
      `;
      renderKeys();
    };

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
  }

  window.renderMobilePage = renderMobilePage;
})();
