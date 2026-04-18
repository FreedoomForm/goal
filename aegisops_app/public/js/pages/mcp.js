/**
 * AegisOps — MCP servers management page.
 * Add, start, stop and test Model Context Protocol servers (OpenClaw-compatible).
 */
(function () {
  'use strict';

  async function renderMcpPage(container) {
    const [presets, data] = await Promise.all([
      fetch('/api/mcp/presets').then(r => r.json()).catch(() => []),
      fetch('/api/mcp/servers').then(r => r.json()).catch(() => ({ persisted: [], running: [] })),
    ]);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🧩 MCP серверы (Model Context Protocol)</h1>
          <p class="page-subtitle">Интеграция с OpenClaw-совместимыми MCP-серверами. Реальный stdio-transport.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="mcpAddBtn">+ Добавить сервер</button>
        </div>
      </div>

      <div class="grid-2" id="mcpServersGrid"></div>

      <div class="card" style="margin-top: 20px;">
        <h2 style="color: #b2d6ff; margin-bottom: 12px;">📋 Доступные пресеты</h2>
        <div class="grid-3" id="mcpPresetsGrid">
          ${presets.map(p => `
            <div class="preset-card">
              <div class="preset-name">${p.preset}</div>
              <div class="preset-desc">${p.description}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    function renderServers() {
      fetch('/api/mcp/servers').then(r => r.json()).then(({ persisted, running }) => {
        const runByName = new Map(running.map(r => [r.name, r]));
        const grid = document.getElementById('mcpServersGrid');
        if (!persisted.length) {
          grid.innerHTML = '<div class="empty-state">Нет зарегистрированных MCP-серверов. Добавьте первый.</div>';
          return;
        }
        grid.innerHTML = persisted.map(s => {
          const r = runByName.get(s.name);
          const isRunning = r?.running && r?.initialized;
          return `
            <div class="mcp-card ${isRunning ? 'running' : ''}">
              <div class="mcp-card-header">
                <div>
                  <div class="mcp-name">${s.name}</div>
                  <div class="mcp-preset">preset: <code>${s.preset}</code></div>
                </div>
                <span class="badge ${isRunning ? 'badge-success' : 'badge-neutral'}">${isRunning ? 'running' : 'stopped'}</span>
              </div>
              ${r?.serverInfo ? `<div class="mcp-info">Сервер: <code>${r.serverInfo.name || '?'}</code> v${r.serverInfo.version || '?'}</div>` : ''}
              ${r?.tools?.length ? `
                <div class="mcp-tools">
                  <div class="mcp-tools-title">Инструменты (${r.tools.length}):</div>
                  <ul>${r.tools.slice(0, 6).map(t => `<li><code>${t.name}</code> — ${t.description || ''}</li>`).join('')}</ul>
                </div>
              ` : ''}
              <div class="mcp-card-actions">
                ${isRunning
                  ? `<button class="btn btn-ghost" data-action="stop" data-name="${s.name}">⏸ Stop</button>`
                  : `<button class="btn btn-primary" data-action="start" data-name="${s.name}">▶ Start</button>`
                }
                <button class="btn btn-ghost" data-action="delete" data-name="${s.name}">🗑 Delete</button>
              </div>
            </div>
          `;
        }).join('');

        grid.querySelectorAll('[data-action]').forEach(btn => {
          btn.onclick = async () => {
            const action = btn.dataset.action;
            const name = btn.dataset.name;
            try {
              if (action === 'start') {
                const r = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}/start`, { method: 'POST' }).then(r => r.json());
                window.showToast?.(`Запущен: ${r.info?.tools || 0} tools`, 'success');
              } else if (action === 'stop') {
                await fetch(`/api/mcp/servers/${encodeURIComponent(name)}/stop`, { method: 'POST' });
                window.showToast?.('Остановлен', 'info');
              } else if (action === 'delete') {
                if (!confirm(`Удалить ${name}?`)) return;
                await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
                window.showToast?.('Удалён', 'info');
              }
              renderServers();
            } catch (err) { window.showToast?.(err.message, 'error'); }
          };
        });
      });
    }
    renderServers();

    document.getElementById('mcpAddBtn').onclick = () => {
      const presetOpts = presets.map(p => `<option value="${p.preset}">${p.preset} — ${p.description}</option>`).join('');
      const saveHandler = async () => {
        const name = document.getElementById('mcpForm_name').value.trim();
        const preset = document.getElementById('mcpForm_preset').value;
        let config = {};
        try { config = JSON.parse(document.getElementById('mcpForm_config').value || '{}'); }
        catch { return window.showToast?.('Невалидный JSON', 'error'); }
        const auto_start = document.getElementById('mcpForm_auto').checked;
        await fetch('/api/mcp/servers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, preset, config, auto_start }),
        });
        window.showToast?.('Сервер зарегистрирован', 'success');
        window.hideModal?.();
        renderServers();
      };
      (window.showModal || window.openModal)?.('Новый MCP-сервер', `
        <div class="form-group"><label>Имя</label><input id="mcpForm_name" placeholder="github"/></div>
        <div class="form-group"><label>Preset</label><select id="mcpForm_preset">${presetOpts}</select></div>
        <div class="form-group"><label>Конфиг (JSON)</label><textarea id="mcpForm_config" rows="6">{}</textarea>
          <small style="color:#8ea1c9">Например для github: <code>{"token":"ghp_..."}</code>, для filesystem: <code>{"allowedDir":"/home/user"}</code></small>
        </div>
        <div class="form-group"><label><input type="checkbox" id="mcpForm_auto"/> Автостарт при запуске сервера</label></div>
      `, `<button class="btn" onclick="hideModal()">Отмена</button><button class="btn btn-primary" id="mcpFormSave">Сохранить</button>`);
      setTimeout(() => { document.getElementById('mcpFormSave').onclick = saveHandler; }, 50);
    };
  }

  window.renderMcpPage = renderMcpPage;
})();
