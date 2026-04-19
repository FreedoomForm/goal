/**
 * AegisOps — MCP servers management page.
 * Add, start, stop, edit and test Model Context Protocol servers (OpenClaw-compatible).
 */
(function () {
  'use strict';

  async function renderMcpPage(container) {
    let presets = [];
    let data = { persisted: [], running: [] };

    try {
      [presets, data] = await Promise.all([
        api('/api/mcp/presets').catch(() => []),
        api('/api/mcp/servers').catch(() => ({ persisted: [], running: [] })),
      ]);
    } catch (err) {
      container.innerHTML = `<div class="card"><h3>Ошибка загрузки MCP</h3><p>${escapeHtml(err.message)}</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🧩 MCP серверы (Model Context Protocol)</h1>
          <p class="page-subtitle">Интеграция с OpenClaw-совместимыми MCP-серверами. Реальный stdio-transport.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="mcpAddBtn">+ Добавить сервер</button>
          <button class="btn" id="mcpRefreshBtn">🔄 Обновить</button>
        </div>
      </div>

      <div class="grid-2" id="mcpServersGrid"></div>

      <div class="card" style="margin-top: 20px;">
        <h2 style="color: #b2d6ff; margin-bottom: 12px;">📋 Доступные пресеты</h2>
        <div class="grid-auto" id="mcpPresetsGrid">
          ${presets.map(p => `
            <div class="preset-card" style="padding:16px;background:rgba(255,255,255,0.02);border:1px solid var(--border-default);border-radius:12px;cursor:pointer" data-preset="${p.preset}">
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">${escapeHtml(p.preset)}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(p.description)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Render server cards
    function renderServers() {
      api('/api/mcp/servers').then(({ persisted, running }) => {
        const runByName = new Map(running.map(r => [r.name, r]));
        const grid = document.getElementById('mcpServersGrid');
        if (!grid) return;

        if (!persisted.length) {
          grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>Нет зарегистрированных MCP-серверов. Нажмите «+ Добавить сервер» или выберите пресет ниже.</p></div>';
          return;
        }

        grid.innerHTML = persisted.map(s => {
          const r = runByName.get(s.name);
          const isRunning = r?.running && r?.initialized;
          const toolList = r?.tools?.length
            ? r.tools.slice(0, 6).map(t => `<code>${escapeHtml(t.name)}</code>`).join(', ')
            : '';
          return `
            <div class="card mcp-card ${isRunning ? 'card-glow' : ''}" style="padding:20px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div>
                  <div style="font-weight:700;font-size:16px">${escapeHtml(s.name)}</div>
                  <div style="font-size:12px;color:var(--text-secondary)">preset: <code>${escapeHtml(s.preset)}</code></div>
                </div>
                <span class="badge ${isRunning ? 'badge-success' : 'badge-neutral'}">${isRunning ? '🟢 Running' : '⏹ Stopped'}</span>
              </div>
              ${r?.serverInfo ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Сервер: <code>${escapeHtml(r.serverInfo.name || '?')}</code> v${escapeHtml(r.serverInfo.version || '?')}</div>` : ''}
              ${toolList ? `
                <div style="margin-bottom:12px">
                  <div style="font-size:12px;font-weight:600;color:var(--accent-cyan);margin-bottom:4px">Инструменты (${r.tools.length}):</div>
                  <div style="font-size:12px;color:var(--text-secondary)">${toolList}${r.tools.length > 6 ? '...' : ''}</div>
                </div>
              ` : ''}
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                ${isRunning
                  ? '<button class="btn btn-sm" data-action="stop" data-name="' + escapeHtml(s.name) + '">⏸ Stop</button>'
                  : '<button class="btn btn-sm btn-primary" data-action="start" data-name="' + escapeHtml(s.name) + '">▶ Start</button>'
                }
                <button class="btn btn-sm" data-action="edit" data-name="${escapeHtml(s.name)}" data-preset="${escapeHtml(s.preset)}" data-config="${escapeHtml(JSON.stringify(s.config || {}))}" data-auto="${s.auto_start ? 1 : 0}">✎ Изменить</button>
                <button class="btn btn-sm btn-danger" data-action="delete" data-name="${escapeHtml(s.name)}">🗑 Удалить</button>
              </div>
            </div>
          `;
        }).join('');

        // Bind action buttons
        grid.querySelectorAll('[data-action]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            const name = btn.dataset.name;
            btn.disabled = true;
            const origText = btn.textContent;
            btn.textContent = '⏳...';

            try {
              if (action === 'start') {
                const result = await api(`/api/mcp/servers/${encodeURIComponent(name)}/start`, { method: 'POST' });
                showToast(`Запущен: ${result.info?.tools || 0} tools`, 'success');
              } else if (action === 'stop') {
                await api(`/api/mcp/servers/${encodeURIComponent(name)}/stop`, { method: 'POST' });
                showToast('Остановлен', 'info');
              } else if (action === 'delete') {
                if (!confirm(`Удалить MCP сервер "${name}"?`)) { btn.disabled = false; btn.textContent = origText; return; }
                await api(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
                showToast('Удалён', 'info');
              } else if (action === 'edit') {
                btn.disabled = false;
                btn.textContent = origText;
                openEditModal(name, btn.dataset.preset, btn.dataset.config, btn.dataset.auto === '1');
                return;
              }
              renderServers();
            } catch (err) {
              showToast(err.message, 'error');
              btn.disabled = false;
              btn.textContent = origText;
            }
          });
        });
      }).catch(err => {
        showToast('Ошибка обновления: ' + err.message, 'error');
      });
    }

    renderServers();

    // Refresh button
    document.getElementById('mcpRefreshBtn')?.addEventListener('click', () => renderServers());

    // Preset quick-add
    document.querySelectorAll('.preset-card[data-preset]').forEach(el => {
      el.addEventListener('click', () => {
        const preset = el.dataset.preset;
        openAddModal(preset);
      });
    });

    // Add button
    document.getElementById('mcpAddBtn')?.addEventListener('click', () => openAddModal());

    function openAddModal(preselectedPreset) {
      const presetOpts = presets.map(p =>
        `<option value="${p.preset}" ${p.preset === preselectedPreset ? 'selected' : ''}>${p.preset} — ${p.description}</option>`
      ).join('');

      showModal('Новый MCP-сервер', `
        <div class="form-group">
          <label class="form-label">Имя</label>
          <input class="form-input" id="mcpForm_name" placeholder="github">
        </div>
        <div class="form-group">
          <label class="form-label">Preset</label>
          <select class="form-select" id="mcpForm_preset">${presetOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Конфиг (JSON)</label>
          <textarea class="form-textarea" id="mcpForm_config" rows="5">{}</textarea>
          <small style="color:#8ea1c9">Например для github: <code>{"token":"ghp_..."}</code>, для filesystem: <code>{"allowedDir":"/home/user"}</code></small>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="mcpForm_auto" style="accent-color:#59a8ff">
            <span>Автостарт при запуске сервера</span>
          </label>
        </div>
      `, `
        <button class="btn" onclick="hideModal()">Отмена</button>
        <button class="btn btn-primary" id="mcpFormSave">Сохранить</button>
      `);

      // Bind save button directly (no setTimeout needed since DOM is already rendered)
      const saveBtn = document.getElementById('mcpFormSave');
      if (saveBtn) {
        saveBtn.onclick = async () => {
          const name = document.getElementById('mcpForm_name')?.value.trim();
          const preset = document.getElementById('mcpForm_preset')?.value;
          let config = {};
          try {
            config = JSON.parse(document.getElementById('mcpForm_config')?.value || '{}');
          } catch {
            showToast('Невалидный JSON в конфиге', 'error');
            return;
          }
          const auto_start = document.getElementById('mcpForm_auto')?.checked || false;

          if (!name) { showToast('Введите имя сервера', 'warning'); return; }
          if (!preset) { showToast('Выберите пресет', 'warning'); return; }

          saveBtn.disabled = true;
          saveBtn.textContent = '⏳ Сохранение...';

          try {
            await api('/api/mcp/servers', {
              method: 'POST',
              body: JSON.stringify({ name, preset, config, auto_start }),
            });
            hideModal();
            showToast('Сервер зарегистрирован', 'success');
            renderServers();
          } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить';
          }
        };
      }
    }

    function openEditModal(name, preset, configStr, autoStart) {
      let config = {};
      try { config = JSON.parse(configStr || '{}'); } catch {}

      showModal('Изменить MCP-сервер: ' + name, `
        <div class="form-group">
          <label class="form-label">Имя</label>
          <input class="form-input" id="mcpEdit_name" value="${escapeHtml(name)}" readonly style="opacity:0.6">
          <small style="color:#8ea1c9">Имя нельзя изменить (используется как идентификатор)</small>
        </div>
        <div class="form-group">
          <label class="form-label">Preset</label>
          <select class="form-select" id="mcpEdit_preset">
            ${presets.map(p => `<option value="${p.preset}" ${p.preset === preset ? 'selected' : ''}>${p.preset} — ${p.description}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Конфиг (JSON)</label>
          <textarea class="form-textarea" id="mcpEdit_config" rows="5">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="mcpEdit_auto" ${autoStart ? 'checked' : ''} style="accent-color:#59a8ff">
            <span>Автостарт при запуске сервера</span>
          </label>
        </div>
      `, `
        <button class="btn" onclick="hideModal()">Отмена</button>
        <button class="btn btn-primary" id="mcpEditSave">Сохранить</button>
      `);

      const saveBtn = document.getElementById('mcpEditSave');
      if (saveBtn) {
        saveBtn.onclick = async () => {
          const newName = document.getElementById('mcpEdit_name')?.value.trim();
          const newPreset = document.getElementById('mcpEdit_preset')?.value;
          let newConfig = {};
          try {
            newConfig = JSON.parse(document.getElementById('mcpEdit_config')?.value || '{}');
          } catch {
            showToast('Невалидный JSON в конфиге', 'error');
            return;
          }
          const newAutoStart = document.getElementById('mcpEdit_auto')?.checked || false;

          saveBtn.disabled = true;
          saveBtn.textContent = '⏳ Сохранение...';

          try {
            // Delete old and re-create (MCP uses name as key)
            if (newPreset !== preset || JSON.stringify(newConfig) !== JSON.stringify(config) || newAutoStart !== autoStart) {
              await api(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
              await api('/api/mcp/servers', {
                method: 'POST',
                body: JSON.stringify({ name: newName || name, preset: newPreset, config: newConfig, auto_start: newAutoStart }),
              });
            }
            hideModal();
            showToast('Сервер обновлен', 'success');
            renderServers();
          } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить';
          }
        };
      }
    }
  }

  window.renderMcpPage = renderMcpPage;
})();
