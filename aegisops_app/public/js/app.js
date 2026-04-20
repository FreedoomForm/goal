/**
 * AegisOps Local AI — Frontend Application (SPA)
 * Full enterprise dashboard with all pages
 */

/* ══════════════ State ══════════════ */
const state = {
  currentPage: 'dashboard',
  dashboard: null,
  chatHistory: [],
  loading: false,
};

/* ══════════════ API Layer ══════════════ */
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ══════════════ Utilities ══════════════ */
function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(str) {
  if (!str) return '—';
  try {
    const d = new Date(str.replace(' ', 'T'));
    return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch { return str; }
}

function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' млрд';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' млн';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const typeIcons = {
  ollama: '🤖',
  ollama_cloud: '☁️',
  one_c_odata: '📦',
  sap_odata: '🏢',
  opc_ua: '🏭',
  telegram: '✈️',
  crm_rest: '👥',
  erp_rest: '⚙️',
  askug: '💳',
  mqtt: '📡',
  database: '🗄️',
  mssql: '🗄️',
  postgresql: '🗄️',
  mysql: '🗄️',
  rest: '🌐',
  graphql: '🔮',
  email: '📧',
  smtp: '📧',
  webhook: '🔔',
  tekinsoft: '🌐',
};

const typeNames = {
  ollama: 'Ollama LLM',
  ollama_cloud: 'Ollama Cloud',
  one_c_odata: '1C OData',
  sap_odata: 'SAP OData',
  opc_ua: 'OPC UA / SCADA',
  telegram: 'Telegram Bot',
  crm_rest: 'CRM REST',
  erp_rest: 'ERP REST',
  askug: 'АСКУГ / UGaz',
  mqtt: 'MQTT IoT',
  database: 'База данных',
  mssql: 'MSSQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  rest: 'REST API',
  graphql: 'GraphQL',
  email: 'Email / SMTP',
  smtp: 'SMTP',
  webhook: 'Webhook',
  tekinsoft: 'Tekinsoft',
};

const categoryColors = {
  operations: 'badge-info',
  finance: 'badge-warning',
  monitoring: 'badge-success',
  risk: 'badge-danger',
  integration: 'badge-neutral',
};

/* ══════════════ Toast Notifications ══════════════ */
function showToast(message, type = 'info') {
  const container = $('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `;
  toast.onclick = () => removeToast(toast);
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), 5000);
}

function removeToast(toast) {
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

/* ══════════════ Modal ══════════════ */
function showModal(title, bodyHtml, footerHtml = '') {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalFooter').innerHTML = footerHtml;
  $('modalOverlay').classList.add('visible');
}

function hideModal() {
  $('modalOverlay').classList.remove('visible');
}

/* ══════════════ Page Router ══════════════ */
function navigateTo(page) {
  state.currentPage = page;
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  renderPage(page);
}

async function renderPage(page) {
  const container = $('pageContainer');

  try {
    switch (page) {
      case 'dashboard': await renderDashboard(container); break;
      case 'connectors': await renderConnectors(container); break;
      case 'scenarios': await renderScenarios(container); break;
      case 'schedules': await renderSchedules(container); break;
      case 'modules': await renderModules(container); break;
      case 'ai-engine': await renderAIEngine(container); break;
      case 'assistant': await renderAssistantEnhanced(container); break;
      case 'documents': await renderDocuments(container); break;
      case 'training': await renderTraining(container); break;
      case 'etl': await renderETL(container); break;
      case 'guide': await window.renderGuidePage(container); break;
      case 'audit': await renderAudit(container); break;
      case 'settings': await renderSettings(container); break;
      case 'planning': await window.renderPlanningPage(container); break;
      case 'mcp': await window.renderMcpPage(container); break;
      case 'mobile': await window.renderMobilePage(container); break;
      default: container.innerHTML = '<h2>404</h2>';
    }
  } catch (err) {
    container.innerHTML = `<div class="card"><h3>Ошибка загрузки</h3><p>${escapeHtml(err.message)}</p></div>`;
    showToast('Ошибка загрузки страницы', 'error');
  }
}

/* ══════════════ DASHBOARD PAGE ══════════════ */
async function renderDashboard(container) {
  const data = await api('/api/dashboard');
  state.dashboard = data;

  const statConnectors = data.connectors.length;
  const statScenarios = data.scenarios.length;
  const statDocs = data.documents.length;
  const statModules = data.modules.length;

  container.innerHTML = `
    <div class="hero-card">
      <div class="pill mb-16">⚡ On-prem • Windows • Android-ready • 100% Локально</div>
      <h2 class="hero-title">${escapeHtml(data.hero.title)}</h2>
      <p class="hero-subtitle">${escapeHtml(data.hero.subtitle)}</p>
      <div class="chips mb-16">
        ${data.hero.highlights.map(h => `<span class="chip">${escapeHtml(h)}</span>`).join('')}
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary" id="btnRefresh">🔄 Обновить данные</button>
        <button class="btn" id="btnHealth">💓 Health Check</button>
        <button class="btn" id="btnRunAll">▶ Запустить все сценарии</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Коннекторы</div>
        <div class="stat-value">${statConnectors}</div>
        <div class="stat-change up">1C / SAP / SCADA / Telegram</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Сценарии автоматизации</div>
        <div class="stat-value">${statScenarios}</div>
        <div class="stat-change up">Cron + ручной запуск</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Документы / Отчеты</div>
        <div class="stat-value">${statDocs}</div>
        <div class="stat-change up">HTML генерация</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Модули ТЗ</div>
        <div class="stat-value">${statModules}</div>
        <div class="stat-change up">Газ / Платежи / Финансы / Риски</div>
      </div>
    </div>

    <div class="grid-2 mb-24">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Модули платформы</div>
            <div class="card-subtitle">Бизнес-модули из технического задания</div>
          </div>
        </div>
        <div class="item-list">
          ${data.modules.slice(0, 5).map(m => `
            <div class="item-row">
              <span style="font-size:24px;flex-shrink:0">${m.icon}</span>
              <div class="item-info">
                <div class="item-name">${escapeHtml(m.name)}</div>
                <div class="item-meta"><span>${escapeHtml(m.description).slice(0, 80)}…</span></div>
              </div>
              <span class="badge badge-success">${m.status}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Коннекторы</div>
            <div class="card-subtitle">Интеграции с enterprise системами</div>
          </div>
        </div>
        <div class="item-list">
          ${data.connectors.slice(0, 6).map(c => `
            <div class="item-row">
              <div class="connector-type-icon ${c.type}">${typeIcons[c.type] || '🔌'}</div>
              <div class="item-info">
                <div class="item-name truncate">${escapeHtml(c.name)}</div>
                <div class="item-meta"><span>${typeNames[c.type] || c.type}</span></div>
              </div>
              <span class="badge ${c.enabled ? 'badge-success' : 'badge-neutral'}">${c.enabled ? 'вкл' : 'выкл'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="grid-2 mb-24">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Сценарии</div>
            <div class="card-subtitle">Автоматизированные задачи с планировщиком</div>
          </div>
        </div>
        <div class="item-list">
          ${data.scenarios.map(s => `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name">${escapeHtml(s.name)}</div>
                <div class="item-meta">
                  <span class="badge ${categoryColors[s.category] || 'badge-neutral'}">${s.category}</span>
                  <span>cron: ${s.cron_expr || 'manual'}</span>
                  <span>→ ${s.delivery_channel}</span>
                </div>
              </div>
              <button class="btn btn-primary btn-sm dash-run-scenario" data-id="${s.id}">▶ Запустить</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Аудит</div>
            <div class="card-subtitle">Последние действия системы</div>
          </div>
        </div>
        ${data.logs.length === 0
          ? '<p class="text-muted">Нет записей</p>'
          : `<div class="item-list">
              ${data.logs.slice(0, 8).map(l => `
                <div class="item-row" style="padding:10px 14px">
                  <div class="item-info">
                    <div class="item-name text-sm">${escapeHtml(l.event_type)}</div>
                    <div class="item-meta"><span>${formatDate(l.created_at)}</span></div>
                  </div>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    </div>
  `;

  // Bind events
  $('btnRefresh')?.addEventListener('click', () => renderPage('dashboard'));
  $('btnHealth')?.addEventListener('click', async () => {
    try {
      const h = await api('/api/health');
      showToast(`Health: ${h.status} | v${h.version} | Connectors: ${h.connectors} | Scenarios: ${h.scenarios} | Docs: ${h.documents}`, 'success');
    } catch (err) {
      showToast('Health check failed: ' + err.message, 'error');
    }
  });
  $('btnRunAll')?.addEventListener('click', async () => {
    showToast('Запуск всех активных сценариев...', 'info');
    for (const s of data.scenarios.filter(s => s.enabled)) {
      try {
        await api(`/api/scenarios/${s.id}/run`, { method: 'POST', body: JSON.stringify({ ask: '', send_to_telegram: false }) });
        showToast(`✅ ${s.name} — выполнен`, 'success');
      } catch (err) {
        showToast(`❌ ${s.name}: ${err.message}`, 'error');
      }
    }
    await renderPage('dashboard');
  });

  // Dashboard scenario run buttons
  $$('.dash-run-scenario').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳...';
      try {
        const result = await api(`/api/scenarios/${btn.dataset.id}/run`, {
          method: 'POST',
          body: JSON.stringify({ ask: '', send_to_telegram: false }),
        });
        showToast(`Отчет создан: ${result.report_url}`, 'success');
        await renderPage('dashboard');
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '▶ Запустить';
      }
    });
  });
}

/* ══════════════ CONNECTORS PAGE ══════════════ */
async function renderConnectors(container) {
  const connectors = await api('/api/connectors');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Коннекторы</h2>
        <p class="page-subtitle">Интеграции с enterprise-системами: 1C, SAP S/4HANA, SCADA/OPC UA, Telegram, CRM, ERP</p>
      </div>
      <button class="btn btn-primary" id="btnAddConnector">+ Добавить коннектор</button>
    </div>

    <div class="item-list" id="connectorsList">
      ${connectors.map(c => `
        <div class="card" style="padding:20px">
          <div class="flex items-center gap-16">
            <div class="connector-type-icon ${c.type}" style="width:48px;height:48px;font-size:22px">${typeIcons[c.type] || '🔌'}</div>
            <div class="item-info" style="flex:1">
              <div class="item-name" style="font-size:16px">${escapeHtml(c.name)}</div>
              <div class="item-meta mt-8">
                <span class="chip">${typeNames[c.type] || c.type}</span>
                <span class="chip font-mono">${escapeHtml(c.base_url || 'не задан')}</span>
                <span class="chip">auth: ${c.auth_mode}</span>
                <span class="badge ${c.enabled ? 'badge-success' : 'badge-neutral'}">${c.enabled ? 'Включен' : 'Выключен'}</span>
              </div>
              ${Object.keys(c.config || {}).length > 0 ? `
                <div class="mt-8 text-sm text-muted">
                  Конфиг: ${Object.entries(c.config).map(([k,v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}
                </div>
              ` : ''}
            </div>
            <div class="item-actions">
              <button class="btn btn-sm test-connector" data-id="${c.id}">🔍 Тест</button>
              <button class="btn btn-sm edit-connector" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-type="${c.type}" data-url="${escapeHtml(c.base_url || '')}" data-auth="${c.auth_mode}" data-enabled="${c.enabled ? 1 : 0}">✎ Изменить</button>
              <button class="btn btn-sm btn-danger del-connector" data-id="${c.id}">✕</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  $('btnAddConnector')?.addEventListener('click', () => {
    showModal('Новый коннектор', `
      <div class="form-group">
        <label class="form-label">Имя</label>
        <input class="form-input" id="newConnName" placeholder="Например: 1C Бухгалтерия">
      </div>
      <div class="form-group">
        <label class="form-label">Тип</label>
        <select class="form-select" id="newConnType">
          <option value="ollama">🤖 Ollama LLM (Локальный)</option>
          <option value="ollama_cloud">☁️ Ollama Cloud (Облачный)</option>
          <option value="one_c_odata">📦 1C OData</option>
          <option value="sap_odata">🏢 SAP OData</option>
          <option value="opc_ua">🏭 OPC UA / SCADA</option>
          <option value="telegram">✈️ Telegram Bot</option>
          <option value="askug">💳 АСКУГ / UGaz / E-GAZ</option>
          <option value="mqtt">📡 MQTT IoT</option>
          <option value="database">🗄️ База данных (SQL)</option>
          <option value="crm_rest">👥 CRM REST</option>
          <option value="erp_rest">⚙️ ERP REST</option>
          <option value="rest">🌐 REST API</option>
          <option value="graphql">🔮 GraphQL</option>
          <option value="email">📧 Email / SMTP</option>
          <option value="webhook">🔔 Webhook</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Base URL</label>
        <input class="form-input" id="newConnUrl" placeholder="http://...">
      </div>
      <div class="form-group">
        <label class="form-label">Auth Mode</label>
        <select class="form-select" id="newConnAuth">
          <option value="none">Нет</option>
          <option value="basic">Basic (login/password)</option>
          <option value="bearer">Bearer Token</option>
          <option value="token">API Token</option>
        </select>
      </div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveConn">Сохранить</button>
    `);
    $('btnSaveConn')?.addEventListener('click', async () => {
      try {
        await api('/api/connectors', {
          method: 'POST',
          body: JSON.stringify({
            name: $('newConnName').value,
            type: $('newConnType').value,
            base_url: $('newConnUrl').value,
            auth_mode: $('newConnAuth').value,
          }),
        });
        hideModal();
        showToast('Коннектор создан', 'success');
        await renderConnectors(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  $$('.test-connector').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳...';
      try {
        const result = await api(`/api/connectors/${btn.dataset.id}/test`, { method: 'POST' });
        showModal('Результат теста', `<pre class="console">${escapeHtml(JSON.stringify(result, null, 2))}</pre>`, `<button class="btn" onclick="hideModal()">OK</button>`);
        showToast(`Коннектор: ${result.status}`, result.status === 'online' ? 'success' : 'info');
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Тест';
      }
    });
  });

  // Edit connector buttons
  $$('.edit-connector').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const type = btn.dataset.type;
      const url = btn.dataset.url;
      const auth = btn.dataset.auth;
      const enabled = btn.dataset.enabled === '1';
      showModal('Изменить коннектор', `
        <div class="form-group">
          <label class="form-label">Имя</label>
          <input class="form-input" id="editConnName" value="${escapeHtml(name)}">
        </div>
        <div class="form-group">
          <label class="form-label">Тип</label>
          <select class="form-select" id="editConnType">
            <option value="ollama" ${type==='ollama'?'selected':''}>🤖 Ollama LLM (Локальный)</option>
            <option value="ollama_cloud" ${type==='ollama_cloud'?'selected':''}>☁️ Ollama Cloud (Облачный)</option>
            <option value="one_c_odata" ${type==='one_c_odata'?'selected':''}>📦 1C OData</option>
            <option value="sap_odata" ${type==='sap_odata'?'selected':''}>🏢 SAP OData</option>
            <option value="opc_ua" ${type==='opc_ua'?'selected':''}>🏭 OPC UA / SCADA</option>
            <option value="telegram" ${type==='telegram'?'selected':''}>✈️ Telegram Bot</option>
            <option value="askug" ${type==='askug'?'selected':''}>💳 АСКУГ / UGaz / E-GAZ</option>
            <option value="mqtt" ${type==='mqtt'?'selected':''}>📡 MQTT IoT</option>
            <option value="database" ${type==='database'?'selected':''}>🗄️ База данных (SQL)</option>
            <option value="crm_rest" ${type==='crm_rest'?'selected':''}>👥 CRM REST</option>
            <option value="erp_rest" ${type==='erp_rest'?'selected':''}>⚙️ ERP REST</option>
            <option value="rest" ${type==='rest'?'selected':''}>🌐 REST API</option>
            <option value="graphql" ${type==='graphql'?'selected':''}>🔮 GraphQL</option>
            <option value="email" ${type==='email'?'selected':''}>📧 Email / SMTP</option>
            <option value="webhook" ${type==='webhook'?'selected':''}>🔔 Webhook</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Base URL</label>
          <input class="form-input" id="editConnUrl" value="${escapeHtml(url)}">
        </div>
        <div class="form-group">
          <label class="form-label">Auth Mode</label>
          <select class="form-select" id="editConnAuth">
            <option value="none" ${auth==='none'?'selected':''}>Нет</option>
            <option value="basic" ${auth==='basic'?'selected':''}>Basic (login/password)</option>
            <option value="bearer" ${auth==='bearer'?'selected':''}>Bearer Token</option>
            <option value="token" ${auth==='token'?'selected':''}>API Token</option>
          </select>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="editConnEnabled" ${enabled?'checked':''} style="accent-color:#59a8ff">
            <span>Включен</span>
          </label>
        </div>
      `, `
        <button class="btn" onclick="hideModal()">Отмена</button>
        <button class="btn btn-primary" id="btnUpdateConn">Сохранить</button>
      `);
      $('btnUpdateConn')?.addEventListener('click', async () => {
        try {
          await api(`/api/connectors/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: $('editConnName').value,
              type: $('editConnType').value,
              base_url: $('editConnUrl').value,
              auth_mode: $('editConnAuth').value,
              enabled: $('editConnEnabled').checked,
            }),
          });
          hideModal();
          showToast('Коннектор обновлен', 'success');
          await renderConnectors(container);
        } catch (err) {
          showToast('Ошибка: ' + err.message, 'error');
        }
      });
    });
  });

  $$('.del-connector').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить коннектор?')) return;
      await api(`/api/connectors/${btn.dataset.id}`, { method: 'DELETE' });
      showToast('Коннектор удален', 'info');
      await renderConnectors(container);
    });
  });
}

/* ══════════════ SCENARIOS PAGE ══════════════ */
async function renderScenarios(container) {
  const scenarios = await api('/api/scenarios');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Сценарии автоматизации</h2>
        <p class="page-subtitle">Настройка агентских задач: ежедневные отчеты, мониторинг, прогнозирование, оповещения</p>
      </div>
      <button class="btn btn-primary" id="btnAddScenario">+ Создать сценарий</button>
    </div>

    <div class="item-list">
      ${scenarios.map(s => `
        <div class="card" style="padding:20px">
          <div class="flex items-center gap-16">
            <div class="item-info" style="flex:1">
              <div class="item-name" style="font-size:16px">${escapeHtml(s.name)}</div>
              <p class="text-muted text-sm mt-8">${escapeHtml(s.objective || '')}</p>
              <div class="chips mt-8">
                <span class="badge ${categoryColors[s.category] || 'badge-neutral'}">${s.category}</span>
                <span class="chip">⏰ ${s.cron_expr || 'manual'}</span>
                <span class="chip">📡 ${s.delivery_channel}</span>
                <span class="chip">🔗 коннекторы: ${JSON.stringify(s.connector_ids)}</span>
                <span class="badge ${s.enabled ? 'badge-success' : 'badge-neutral'}">${s.enabled ? 'Активен' : 'Выключен'}</span>
              </div>
            </div>
            <div class="item-actions flex-col gap-8">
              <button class="btn btn-primary btn-sm run-scenario" data-id="${s.id}">▶ Запустить</button>
              <button class="btn btn-sm toggle-scenario" data-id="${s.id}" data-enabled="${s.enabled ? 1 : 0}">${s.enabled ? '⏸ Выключить' : '▶ Включить'}</button>
              <button class="btn btn-sm edit-scenario" data-id="${s.id}" data-name="${escapeHtml(s.name)}" data-category="${s.category}" data-cron="${escapeHtml(s.cron_expr || '')}" data-objective="${escapeHtml(s.objective || '')}" data-channel="${s.delivery_channel}" data-enabled="${s.enabled ? 1 : 0}">✎ Изменить</button>
              <button class="btn btn-sm btn-danger del-scenario" data-id="${s.id}">✕ Удалить</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  $('btnAddScenario')?.addEventListener('click', () => {
    showModal('Новый сценарий', `
      <div class="form-group">
        <label class="form-label">Название</label>
        <input class="form-input" id="newScName" placeholder="Например: Ежедневный отчет">
      </div>
      <div class="form-group">
        <label class="form-label">Категория</label>
        <select class="form-select" id="newScCategory">
          <option value="operations">Operations</option>
          <option value="finance">Finance</option>
          <option value="monitoring">Monitoring</option>
          <option value="risk">Risk</option>
          <option value="integration">Integration</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Cron Expression</label>
        <input class="form-input" id="newScCron" placeholder="0 5 * * * (каждый день в 5:00)">
      </div>
      <div class="form-group">
        <label class="form-label">Цель / Описание</label>
        <textarea class="form-textarea" id="newScObjective" placeholder="Что должен делать сценарий..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Канал доставки</label>
        <select class="form-select" id="newScChannel">
          <option value="none">Нет (только генерация)</option>
          <option value="telegram">Telegram</option>
        </select>
      </div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveScenario">Сохранить</button>
    `);
    $('btnSaveScenario')?.addEventListener('click', async () => {
      try {
        await api('/api/scenarios', {
          method: 'POST',
          body: JSON.stringify({
            name: $('newScName').value,
            category: $('newScCategory').value,
            cron_expr: $('newScCron').value,
            objective: $('newScObjective').value,
            delivery_channel: $('newScChannel').value,
          }),
        });
        hideModal();
        showToast('Сценарий создан', 'success');
        await renderScenarios(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  $$('.run-scenario').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Выполняется...';
      try {
        const result = await api(`/api/scenarios/${btn.dataset.id}/run`, {
          method: 'POST',
          body: JSON.stringify({ ask: '', send_to_telegram: false }),
        });
        showToast(`Отчет создан! AI: ${result.ai_provider}`, 'success');
        // Open report in new tab
        if (result.report_url) {
          window.open(result.report_url, '_blank');
        }
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '▶ Запустить';
      }
    });
  });

  // Toggle scenario enabled/disabled
  $$('.toggle-scenario').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const isEnabled = btn.dataset.enabled === '1';
      try {
        await api(`/api/scenarios/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: !isEnabled }),
        });
        showToast(isEnabled ? 'Сценарий выключен' : 'Сценарий включен', 'success');
        await renderScenarios(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // Edit scenario buttons
  $$('.edit-scenario').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const category = btn.dataset.category;
      const cron = btn.dataset.cron;
      const objective = btn.dataset.objective;
      const channel = btn.dataset.channel;
      const enabled = btn.dataset.enabled === '1';
      showModal('Изменить сценарий', `
        <div class="form-group">
          <label class="form-label">Название</label>
          <input class="form-input" id="editScName" value="${escapeHtml(name)}">
        </div>
        <div class="form-group">
          <label class="form-label">Категория</label>
          <select class="form-select" id="editScCategory">
            <option value="operations" ${category==='operations'?'selected':''}>Operations</option>
            <option value="finance" ${category==='finance'?'selected':''}>Finance</option>
            <option value="monitoring" ${category==='monitoring'?'selected':''}>Monitoring</option>
            <option value="risk" ${category==='risk'?'selected':''}>Risk</option>
            <option value="integration" ${category==='integration'?'selected':''}>Integration</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Cron Expression</label>
          <input class="form-input" id="editScCron" value="${escapeHtml(cron)}">
        </div>
        <div class="form-group">
          <label class="form-label">Цель / Описание</label>
          <textarea class="form-textarea" id="editScObjective">${escapeHtml(objective)}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Канал доставки</label>
          <select class="form-select" id="editScChannel">
            <option value="none" ${channel==='none'?'selected':''}>Нет (только генерация)</option>
            <option value="telegram" ${channel==='telegram'?'selected':''}>Telegram</option>
          </select>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="editScEnabled" ${enabled?'checked':''} style="accent-color:#59a8ff">
            <span>Активен</span>
          </label>
        </div>
      `, `
        <button class="btn" onclick="hideModal()">Отмена</button>
        <button class="btn btn-primary" id="btnUpdateScenario">Сохранить</button>
      `);
      $('btnUpdateScenario')?.addEventListener('click', async () => {
        try {
          await api(`/api/scenarios/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: $('editScName').value,
              category: $('editScCategory').value,
              cron_expr: $('editScCron').value,
              objective: $('editScObjective').value,
              delivery_channel: $('editScChannel').value,
              enabled: $('editScEnabled').checked,
            }),
          });
          hideModal();
          showToast('Сценарий обновлен', 'success');
          await renderScenarios(container);
        } catch (err) {
          showToast('Ошибка: ' + err.message, 'error');
        }
      });
    });
  });

  $$('.del-scenario').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить сценарий?')) return;
      await api(`/api/scenarios/${btn.dataset.id}`, { method: 'DELETE' });
      showToast('Сценарий удален', 'info');
      await renderScenarios(container);
    });
  });
}

/* ══════════════ MODULES PAGE ══════════════ */
async function renderModules(container) {
  const modules = await api('/api/modules');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Модули платформы (из ТЗ)</h2>
        <p class="page-subtitle">5 основных бизнес-модулей по газовому балансу, аналитике, платежам, финансам и рискам + инфраструктурные модули</p>
      </div>
    </div>

    <div class="grid-auto mb-24">
      ${modules.map(m => `
        <div class="module-card" data-module="${m.code}">
          <div class="module-icon">${m.icon}</div>
          <div class="module-name">${escapeHtml(m.name)}</div>
          <div class="module-desc">${escapeHtml(m.description)}</div>
          <div class="module-status mt-16">
            <span class="badge badge-success">${m.status}</span>
          </div>
          <button class="btn btn-sm btn-primary mt-16 module-analyze" data-code="${m.code}" data-name="${escapeHtml(m.name)}">📊 Запросить анализ</button>
        </div>
      `).join('')}
    </div>

    <div class="card" id="moduleAnalysisResult" style="display:none">
      <div class="card-header">
        <div class="card-title" id="moduleAnalysisTitle">Результат анализа</div>
      </div>
      <pre class="console" id="moduleAnalysisContent"></pre>
    </div>
  `;

  $$('.module-analyze').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code;
      const name = btn.dataset.name;
      btn.disabled = true;
      btn.textContent = '⏳ Анализ...';

      // Map module codes to analytics endpoints (handles both underscore and hyphen formats)
      const endpointMap = {
        gas_balance: '/api/analytics/gas-balance',
        consumption: '/api/analytics/consumption',
        payments: '/api/analytics/payments',
        tariffs: '/api/analytics/tariffs',
        finance: '/api/analytics/tariffs',
        risks: '/api/analytics/risks',
      };

      try {
        // Try analytics endpoint first, fall back to direct module endpoint
        const endpoint = endpointMap[code] || `/api/modules/${code}`;
        const result = await api(endpoint);
        const resultCard = $('moduleAnalysisResult');
        resultCard.style.display = 'block';
        $('moduleAnalysisTitle').textContent = `📊 Анализ: ${name}`;
        $('moduleAnalysisContent').textContent = result.analysis?.content || JSON.stringify(result, null, 2);
        resultCard.scrollIntoView({ behavior: 'smooth' });
        showToast(`Анализ модуля "${name}" готов`, 'success');
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '📊 Запросить анализ';
      }
    });
  });
}

/* ══════════════ AI ASSISTANT PAGE — see ai-engine.js: renderAssistantEnhanced() ══════════════ */

function renderChatMessage(msg) {
  if (msg.role === 'user') {
    return `<div class="chat-message user">
      <div class="chat-avatar">👤</div>
      <div class="chat-bubble">${escapeHtml(msg.content)}</div>
    </div>`;
  }
  // AI message with OpenClaw-style layout
  const providerInfo = msg.provider || 'ai';
  const modelInfo = msg.model ? ' / ' + msg.model : '';
  const toolCalls = msg.toolCalls ? msg.toolCalls.map(t =>
    `<div class="chat-tool-call"><span class="tool-icon">🔧</span>${escapeHtml(t.name || t)}${t.duration ? `<span class="tool-duration">${t.duration}</span>` : ''}</div>`
  ).join('') : '';
  const thinkingBlock = msg.thinking ? `
    <div class="chat-thinking${msg.thinkingOpen ? ' open' : ''}">
      <div class="chat-thinking-header">💡 Думает...</div>
      <div class="chat-thinking-body">${escapeHtml(msg.thinking)}</div>
    </div>` : '';
  const isStreaming = msg.isStreaming;
  return `
    <div class="chat-message ai">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        <span class="provider-tag">${escapeHtml(providerInfo)}${escapeHtml(modelInfo)}</span>
        ${thinkingBlock}
        ${toolCalls}
        <div class="ai-content">${isStreaming && !msg.content ? '<div class="streaming-dots"><span></span><span></span><span></span></div>' : `<pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(msg.content)}</pre>`}</div>
      </div>
    </div>`;
}

/* ══════════════ DOCUMENTS PAGE ══════════════ */
async function renderDocuments(container) {
  const docs = await api('/api/documents');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Документы и отчеты</h2>
        <p class="page-subtitle">Сгенерированные HTML-отчеты, протоколы, аналитические записки</p>
      </div>
    </div>

    ${docs.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p>Документы пока не созданы. Запустите сценарий для генерации отчета.</p>
          <button class="btn btn-primary" onclick="navigateTo('scenarios')">Перейти к сценариям</button>
        </div>
      </div>
    ` : `
      <div class="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Тип</th>
              <th>Формат</th>
              <th>Дата</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${docs.map(d => `
              <tr>
                <td>#${d.id}</td>
                <td><strong>${escapeHtml(d.title)}</strong></td>
                <td><span class="badge badge-info">${d.kind}</span></td>
                <td><span class="chip">${d.format || 'html'}</span></td>
                <td class="text-muted">${formatDate(d.created_at)}</td>
                <td>
                  <div class="btn-group">
                    <a class="btn btn-sm" href="/api/documents/${d.id}/download" target="_blank">📥 Скачать</a>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

/* ══════════════ TRAINING PAGE ══════════════ */
async function renderTraining(container) {
  const jobs = await api('/api/training');

  const statusBadge = (s) => {
    const map = { completed: 'badge-success', running: 'badge-warning', cancelled: 'badge-danger', failed: 'badge-danger', pending: 'badge-neutral' };
    return map[s] || 'badge-neutral';
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Обучение моделей</h2>
        <p class="page-subtitle">Локальное дообучение (LoRA/QLoRA) моделей на корпоративных данных</p>
      </div>
      <button class="btn btn-primary" id="btnNewTraining">+ Новая задача обучения</button>
    </div>

    ${jobs.length > 0 ? `
      <div class="card mb-24">
        <div class="card-title mb-16">Задачи обучения</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Название</th><th>Модель</th><th>Метод</th><th>Статус</th><th>Прогресс</th><th>Дата</th><th>Действия</th></tr></thead>
            <tbody>
              ${jobs.map(j => `
                <tr>
                  <td>#${j.id}</td>
                  <td>${escapeHtml(j.name)}</td>
                  <td><span class="chip">${escapeHtml(j.base_model)}</span></td>
                  <td><span class="chip">${escapeHtml(j.method)}</span></td>
                  <td><span class="badge ${statusBadge(j.status)}">${j.status}</span></td>
                  <td style="min-width:140px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${j.progress || 0}%"></div></div>
                      <span class="text-sm text-muted">${j.progress || 0}%</span>
                    </div>
                  </td>
                  <td class="text-muted text-sm">${formatDate(j.created_at)}</td>
                  <td>
                    <div class="btn-group">
                      ${j.status === 'pending' ? `<button class="btn btn-sm btn-primary start-training" data-id="${j.id}">▶ Запустить</button>` : ''}
                      ${j.status === 'running' ? `<button class="btn btn-sm cancel-training" data-id="${j.id}" style="color:var(--danger)">⏹ Отменить</button>` : ''}
                      ${j.status !== 'running' ? `<button class="btn btn-sm btn-danger del-training" data-id="${j.id}">✕ Удалить</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <div class="grid-auto mb-24">
      <div class="card">
        <div class="card-title">Рекомендуемые модели</div>
        <div class="item-list mt-16">
          ${[
            { name: 'Qwen 2.5 7B Instruct', desc: 'Оптимальный баланс качества и скорости', size: '4.4 GB' },
            { name: 'Llama 3 8B', desc: 'Универсальная модель для анализа', size: '4.7 GB' },
            { name: 'Gemma 3 4B', desc: 'Компактная модель для быстрого инференса', size: '3.3 GB' },
            { name: 'Mistral 7B v0.3', desc: 'Хорошая для структурированных задач', size: '4.1 GB' },
          ].map(m => `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name">${m.name}</div>
                <div class="item-meta"><span>${m.desc}</span><span>${m.size}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Методы обучения</div>
        <div class="item-list mt-16">
          ${[
            { name: 'LoRA', desc: 'Low-Rank Adaptation — быстрое дообучение с минимальным потреблением RAM' },
            { name: 'QLoRA', desc: '4-bit квантование + LoRA — для машин с ≤ 8 GB VRAM' },
            { name: 'Full Fine-tune', desc: 'Полное дообучение — максимальное качество, требуется мощный GPU' },
          ].map(m => `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name">${m.name}</div>
                <div class="item-meta"><span>${m.desc}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Auto-refresh every 5 seconds while any job is running
  if (jobs.some(j => j.status === 'running')) {
    const pollId = setInterval(async () => {
      try {
        const freshJobs = await api('/api/training');
        if (!freshJobs.some(j => j.status === 'running')) {
          clearInterval(pollId);
        }
        await renderTraining(container);
      } catch { clearInterval(pollId); }
    }, 5000);
    // Store pollId so we can clear on navigation
    container.dataset.pollId = pollId;
  }

  $('btnNewTraining')?.addEventListener('click', () => {
    showModal('Новая задача обучения', `
      <div class="form-group">
        <label class="form-label">Название</label>
        <input class="form-input" id="trainName" placeholder="Например: Gas Analysis Model v1">
      </div>
      <div class="form-group">
        <label class="form-label">Базовая модель</label>
        <select class="form-select" id="trainModel">
          <option value="qwen2.5:7b">Qwen 2.5 7B</option>
          <option value="llama3:8b">Llama 3 8B</option>
          <option value="gemma3:4b">Gemma 3 4B</option>
          <option value="mistral:7b">Mistral 7B</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Метод</label>
        <select class="form-select" id="trainMethod">
          <option value="lora">LoRA</option>
          <option value="qlora">QLoRA (4-bit)</option>
          <option value="full">Full Fine-tune</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Путь к датасету</label>
        <input class="form-input" id="trainDataset" placeholder="data/my_dataset.jsonl">
      </div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveTrain">Создать задачу</button>
    `);
    $('btnSaveTrain')?.addEventListener('click', async () => {
      try {
        await api('/api/training', {
          method: 'POST',
          body: JSON.stringify({
            name: $('trainName').value,
            base_model: $('trainModel').value,
            method: $('trainMethod').value,
            dataset_path: $('trainDataset').value,
          }),
        });
        hideModal();
        showToast('Задача обучения создана', 'success');
        await renderTraining(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // Start training job buttons
  $$('.start-training').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Запуск...';
      try {
        await api(`/api/training/${btn.dataset.id}/start`, { method: 'POST' });
        showToast('Обучение запущено', 'success');
        await renderTraining(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '▶ Запустить';
      }
    });
  });

  // Cancel training job buttons
  $$('.cancel-training').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Отменить обучение?')) return;
      try {
        await api(`/api/training/${btn.dataset.id}/cancel`, { method: 'POST' });
        showToast('Обучение отменено', 'info');
        await renderTraining(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // Delete training job buttons
  $$('.del-training').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить задачу обучения?')) return;
      try {
        await api(`/api/training/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Задача обучения удалена', 'info');
        await renderTraining(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });
}
/* ══════════════ SCHEDULES PAGE ══════════════ */
async function renderSchedules(container) {
  const [workflows, schedules] = await Promise.all([
    api('/api/workflows').catch(() => []),
    api('/api/workflows/schedules').catch(() => []),
  ]);

  const cronToHuman = (expr) => {
    if (!expr) return '—';
    const map = {
      '* * * * *': 'Каждую минуту',
      '*/5 * * * *': 'Каждые 5 минут',
      '*/10 * * * *': 'Каждые 10 минут',
      '*/15 * * * *': 'Каждые 15 минут',
      '*/30 * * * *': 'Каждые 30 минут',
      '0 * * * *': 'Каждый час',
      '0 */2 * * *': 'Каждые 2 часа',
      '0 */6 * * *': 'Каждые 6 часов',
      '0 0 * * *': 'Каждый день в полночь',
      '0 5 * * *': 'Каждый день в 05:00',
      '0 6 * * *': 'Каждый день в 06:00',
      '0 7 * * *': 'Каждый день в 07:00',
      '0 8 * * *': 'Каждый день в 08:00',
      '0 9 * * *': 'Каждый день в 09:00',
      '0 5 * * 1-5': 'Пн-Пт в 05:00',
      '0 8 * * 1-5': 'Пн-Пт в 08:00',
      '0 9 * * 1': 'Каждый понедельник в 09:00',
    };
    return map[expr] || expr;
  };

  const scheduledWorkflows = workflows.filter(w => w.cron_expr && w.cron_expr.trim() !== '');
  const manualWorkflows = workflows.filter(w => !w.cron_expr || w.cron_expr.trim() === '');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Расписания</h2>
        <p class="page-subtitle">Управление cron-расписаниями для автоматического запуска workflows и сценариев</p>
      </div>
    </div>

    <div class="stats-grid mb-24">
      <div class="stat-card">
        <div class="stat-label">Запланировано</div>
        <div class="stat-value">${scheduledWorkflows.length}</div>
        <div class="stat-change up">С cron-расписанием</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ручной запуск</div>
        <div class="stat-value">${manualWorkflows.length}</div>
        <div class="stat-change">Без расписания</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Всего workflows</div>
        <div class="stat-value">${workflows.length}</div>
        <div class="stat-change">Создано</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Активных</div>
        <div class="stat-value">${workflows.filter(w => w.enabled).length}</div>
        <div class="stat-change up">Включено</div>
      </div>
    </div>

    ${scheduledWorkflows.length > 0 ? `
      <div class="card mb-24">
        <div class="card-header">
          <div>
            <div class="card-title">⏰ Запланированные workflows</div>
            <div class="card-subtitle">Запускаются автоматически по cron-расписанию</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Название</th><th>Cron</th><th>Описание</th><th>Статус</th><th>Действия</th></tr></thead>
            <tbody>
              ${scheduledWorkflows.map(w => `
                <tr>
                  <td>#${w.id}</td>
                  <td><strong>${escapeHtml(w.name)}</strong></td>
                  <td><code style="font-size:12px;background:#0b1220;padding:4px 8px;border-radius:6px">${escapeHtml(w.cron_expr)}</code>
                      <div style="color:#8ea1c9;font-size:12px;margin-top:2px">${cronToHuman(w.cron_expr)}</div></td>
                  <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(w.description || '—')}</td>
                  <td><span class="badge ${w.enabled ? 'badge-success' : 'badge-neutral'}">${w.enabled ? 'Активен' : 'Выключен'}</span></td>
                  <td>
                    <div class="btn-group">
                      <button class="btn btn-sm btn-primary run-wf" data-id="${w.id}">▶ Запустить</button>
                      <button class="btn btn-sm toggle-wf" data-id="${w.id}" data-enabled="${w.enabled ? 1 : 0}">${w.enabled ? '⏸ Выключить' : '▶ Включить'}</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : `
      <div class="card mb-24">
        <div class="empty-state" style="padding:40px">
          <div style="font-size:48px;margin-bottom:16px">⏰</div>
          <h3 style="margin-bottom:8px">Нет запланированных workflows</h3>
          <p style="color:#8ea1c9;margin-bottom:16px">Создайте workflow в разделе «Планирование» и укажите cron-расписание, чтобы он запускался автоматически.</p>
          <button class="btn btn-primary" onclick="navigateTo('planning')">Перейти к планированию</button>
        </div>
      </div>
    `}

    <div class="card mb-24">
      <div class="card-header">
        <div>
          <div class="card-title">📋 Cron-справочник</div>
          <div class="card-subtitle">Популярные выражения для настройки расписаний</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Выражение</th><th>Описание</th><th>Использование</th></tr></thead>
          <tbody>
            ${[
              ['*/5 * * * *', 'Каждые 5 минут', 'Мониторинг давления'],
              ['*/30 * * * *', 'Каждые 30 минут', 'Проверка SCADA'],
              ['0 * * * *', 'Каждый час', 'Сбор телеметрии'],
              ['0 5 * * *', 'Каждый день в 05:00', 'Утренний отчёт'],
              ['0 9 * * 1-5', 'Пн-Пт в 09:00', 'Рабочие дни отчёт'],
              ['0 0 1 * *', '1-е число каждого месяца', 'Ежемесячный баланс'],
            ].map(([expr, desc, usage]) => `
              <tr>
                <td><code style="font-size:12px;background:#0b1220;padding:4px 8px;border-radius:6px">${expr}</code></td>
                <td>${desc}</td>
                <td style="color:#8ea1c9">${usage}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${manualWorkflows.length > 0 ? `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">📋 Ручные workflows</div>
            <div class="card-subtitle">Без автоматического расписания — запуск вручную</div>
          </div>
        </div>
        <div class="item-list">
          ${manualWorkflows.map(w => `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name">${escapeHtml(w.name)}</div>
                <div class="item-meta"><span>${escapeHtml(w.description || 'Без описания')}</span></div>
              </div>
              <span class="badge ${w.enabled ? 'badge-success' : 'badge-neutral'}">${w.enabled ? 'Включен' : 'Выключен'}</span>
              <button class="btn btn-sm btn-primary run-wf" data-id="${w.id}" style="margin-left:8px">▶ Запустить</button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  // Run workflow buttons
  $$('.run-wf').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳...';
      try {
        const result = await api(`/api/workflows/${btn.dataset.id}/run`, { method: 'POST', body: JSON.stringify({}) });
        showToast(`Workflow выполнен: ${result.trace?.filter(t => t.status === 'ok').length || 0} нод OK`, 'success');
        await renderSchedules(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '▶ Запустить';
      }
    });
  });

  // Toggle workflow enabled/disabled
  $$('.toggle-wf').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const isEnabled = btn.dataset.enabled === '1';
      try {
        // We need the full workflow data to update
        const wf = await api(`/api/workflows/${id}`);
        await api(`/api/workflows/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...wf, enabled: !isEnabled }),
        });
        showToast(isEnabled ? 'Workflow выключен' : 'Workflow включен', 'success');
        await renderSchedules(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });
}

async function renderETL(container) {
  const [pipelines, connectors] = await Promise.all([
    api('/api/etl'),
    api('/api/connectors'),
  ]);

  const statusBadge = (s) => {
    const map = { completed: 'badge-success', running: 'badge-warning', error: 'badge-danger', idle: 'badge-neutral' };
    return map[s] || 'badge-neutral';
  };

  const getConnectorName = (id) => {
    const c = connectors.find(c => c.id == id);
    return c ? c.name : (id || '—');
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">ETL Пайплайны</h2>
        <p class="page-subtitle">Настройка выгрузки данных из ERP/1C/SCADA/биллинг, очистка, разметка и обогащение</p>
      </div>
      <button class="btn btn-primary" id="btnNewETL">+ Создать пайплайн</button>
    </div>

    ${pipelines.length > 0 ? `
      <div class="card mb-24">
        <div class="card-title mb-16">Пайплайны</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Название</th><th>Источник</th><th>Цель</th><th>Расписание</th><th>Статус</th><th>Действия</th></tr></thead>
            <tbody>
              ${pipelines.map(p => `
                <tr>
                  <td class="text-muted">#${p.id}</td>
                  <td><strong>${escapeHtml(p.name)}</strong></td>
                  <td><span class="chip">${typeIcons[connectors.find(c => c.id == p.source_connector_id)?.type] || '🔌'} ${escapeHtml(getConnectorName(p.source_connector_id))}</span></td>
                  <td><span class="chip font-mono">${escapeHtml(p.target || 'local_db')}</span></td>
                  <td><span class="chip">⏰ ${escapeHtml(p.schedule || 'manual')}</span></td>
                  <td><span class="badge ${statusBadge(p.status)}">${p.status || 'idle'}</span></td>
                  <td>
                    <div class="btn-group">
                      ${p.status !== 'running' ? `<button class="btn btn-sm btn-primary run-etl" data-id="${p.id}">▶ Запустить</button>` : `<span class="badge badge-warning">⏳ Выполняется</span>`}
                      <button class="btn btn-sm btn-danger del-etl" data-id="${p.id}">✕ Удалить</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <div class="grid-auto mb-24">
      <div class="card">
        <div class="card-title">Шаблоны ETL</div>
        <div class="card-subtitle mb-16">Готовые пайплайны для типичных сценариев</div>
        <div class="item-list">
          ${[
            { name: '1C → Газовый баланс', desc: 'Выгрузка данных по потреблению из 1С Бухгалтерии', icon: '📦' },
            { name: 'SCADA → Мониторинг', desc: 'Чтение данных OPC UA в реальном времени', icon: '🏭' },
            { name: 'SAP → Финансы', desc: 'Синхронизация purchase orders и invoices', icon: '🏢' },
            { name: 'Биллинг → Платежи', desc: 'Агрегация платежных данных для анализа ДЗ/КЗ', icon: '💳' },
          ].map(t => `
            <div class="item-row">
              <span style="font-size:20px">${t.icon}</span>
              <div class="item-info">
                <div class="item-name">${t.name}</div>
                <div class="item-meta"><span>${t.desc}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Доступные коннекторы-источники</div>
        <div class="card-subtitle mb-16">Коннекторы для использования в пайплайнах</div>
        ${connectors.length === 0 ? `
          <p class="text-muted">Нет коннекторов. Сначала добавьте коннектор.</p>
        ` : `
          <div class="item-list">
            ${connectors.map(c => `
              <div class="item-row">
                <div class="connector-type-icon ${c.type}" style="width:32px;height:32px;font-size:16px">${typeIcons[c.type] || '🔌'}</div>
                <div class="item-info">
                  <div class="item-name">${escapeHtml(c.name)}</div>
                  <div class="item-meta"><span>${typeNames[c.type] || c.type}</span></div>
                </div>
                <span class="badge ${c.enabled ? 'badge-success' : 'badge-neutral'}">${c.enabled ? 'вкл' : 'выкл'}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  $('btnNewETL')?.addEventListener('click', () => {
    showModal('Создать ETL пайплайн', `
      <div class="form-group">
        <label class="form-label">Название</label>
        <input class="form-input" id="etlName" placeholder="Например: 1C → Газовый баланс">
      </div>
      <div class="form-group">
        <label class="form-label">Коннектор-источник</label>
        <select class="form-select" id="etlSourceConnector">
          <option value="">— Выберите коннектор —</option>
          ${connectors.map(c => `<option value="${c.id}">${typeIcons[c.type] || '🔌'} ${escapeHtml(c.name)} (${typeNames[c.type] || c.type})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Target</label>
        <input class="form-input" id="etlTarget" value="local_db">
      </div>
      <div class="form-group">
        <label class="form-label">Расписание (cron)</label>
        <input class="form-input" id="etlSchedule" placeholder="0 4 * * * (каждый день в 4:00)">
      </div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveETL">Создать</button>
    `);
    $('btnSaveETL')?.addEventListener('click', async () => {
      try {
        await api('/api/etl', {
          method: 'POST',
          body: JSON.stringify({
            name: $('etlName').value,
            source_connector_id: $('etlSourceConnector').value ? parseInt($('etlSourceConnector').value) : null,
            target: $('etlTarget').value,
            schedule: $('etlSchedule').value,
          }),
        });
        hideModal();
        showToast('ETL пайплайн создан', 'success');
        await renderETL(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // Run ETL pipeline buttons
  $$('.run-etl').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Выполняется...';
      try {
        await api(`/api/etl/${btn.dataset.id}/run`, { method: 'POST' });
        showToast('ETL пайплайн запущен', 'success');
        await renderETL(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '▶ Запустить';
      }
    });
  });

  // Delete ETL pipeline buttons
  $$('.del-etl').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить ETL пайплайн?')) return;
      try {
        await api(`/api/etl/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('ETL пайплайн удален', 'info');
        await renderETL(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });
}

/* ══════════════ AUDIT PAGE ══════════════ */
async function renderAudit(container, currentLimit = 100, currentFilter = '') {
  const logs = await api(`/api/audit?limit=${currentLimit}`);

  // Apply client-side filter by event_type if provided
  const filtered = currentFilter
    ? logs.filter(l => l.event_type && l.event_type.toLowerCase().includes(currentFilter.toLowerCase()))
    : logs;

  const formatPayload = (payload) => {
    let parsed;
    try { parsed = JSON.parse(payload); } catch { parsed = payload; }
    if (typeof parsed === 'object' && parsed !== null) {
      const entries = Object.entries(parsed);
      if (entries.length === 0) return '—';
      return entries.map(([k, v]) => {
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `<span class="chip" style="margin:2px">${escapeHtml(k)}=${escapeHtml(val.length > 60 ? val.slice(0, 60) + '…' : val)}</span>`;
      }).join('');
    }
    const str = String(parsed);
    return escapeHtml(str.length > 120 ? str.slice(0, 120) + '…' : str);
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Журнал аудита</h2>
        <p class="page-subtitle">Полная история всех действий системы: создание, изменение, выполнение, ошибки</p>
      </div>
      <div class="item-actions">
        <select class="form-select" id="auditLimit" style="width:auto">
          <option value="25" ${currentLimit === 25 ? 'selected' : ''}>25 записей</option>
          <option value="50" ${currentLimit === 50 ? 'selected' : ''}>50 записей</option>
          <option value="100" ${currentLimit === 100 ? 'selected' : ''}>100 записей</option>
          <option value="200" ${currentLimit === 200 ? 'selected' : ''}>200 записей</option>
        </select>
        <button class="btn" id="btnRefreshAudit">🔄 Обновить</button>
      </div>
    </div>

    <div class="card mb-24">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Фильтр по типу события</label>
        <input class="form-input" id="auditFilter" placeholder="Введите тип события для поиска..." value="${escapeHtml(currentFilter)}">
      </div>
    </div>

    ${filtered.length === 0 ? `
      <div class="card">
        <p class="text-muted">Нет записей аудита${currentFilter ? ' с фильтром "' + escapeHtml(currentFilter) + '"' : ''}.</p>
      </div>
    ` : `
      <div class="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Тип события</th>
              <th>Payload</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(l => `
              <tr>
                <td class="text-muted">#${l.id}</td>
                <td>
                  <span class="badge ${l.event_type.includes('error') ? 'badge-danger' : l.event_type.includes('created') ? 'badge-success' : l.event_type.includes('executed') || l.event_type.includes('run') ? 'badge-info' : l.event_type.includes('deleted') ? 'badge-danger' : 'badge-neutral'}">${escapeHtml(l.event_type)}</span>
                </td>
                <td style="max-width:500px">${formatPayload(l.payload)}</td>
                <td class="text-muted text-sm" style="white-space:nowrap">${formatDate(l.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  // Limit selector
  $('auditLimit')?.addEventListener('change', (e) => {
    renderAudit(container, parseInt(e.target.value), currentFilter);
  });

  // Refresh button
  $('btnRefreshAudit')?.addEventListener('click', () => {
    renderAudit(container, currentLimit, currentFilter);
  });

  // Filter input with debounce
  let filterTimeout;
  $('auditFilter')?.addEventListener('input', (e) => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      renderAudit(container, currentLimit, e.target.value);
    }, 400);
  });
}

/* ══════════════ SETTINGS PAGE ══════════════ */
async function renderSettings(container) {
  const settings = await api('/api/settings');

  // Store original values for change detection
  const original = { ...settings };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Настройки</h2>
        <p class="page-subtitle">Конфигурация платформы AegisOps Local AI</p>
      </div>
      <button class="btn btn-primary" id="btnSaveAllSettings">💾 Сохранить все</button>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title mb-16">⚙️ Общие</div>
        <div class="form-group">
          <label class="form-label">Тема оформления</label>
          <select class="form-select setting-field" id="setTheme" data-key="theme">
            <option value="dark" ${(settings.theme || 'dark') === 'dark' ? 'selected' : ''}>Тёмная</option>
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Светлая</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Язык интерфейса</label>
          <select class="form-select setting-field" id="setLanguage" data-key="language">
            <option value="ru" ${(settings.language || 'ru') === 'ru' ? 'selected' : ''}>Русский</option>
            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
            <option value="uz" ${settings.language === 'uz' ? 'selected' : ''}>O'zbek</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-16">🤖 AI / Ollama</div>
        <div class="form-group">
          <label class="form-label">URL Ollama</label>
          <input class="form-input setting-field" id="setOllamaUrl" data-key="ollama_url" value="${escapeHtml(settings.ollama_url || 'http://127.0.0.1:11434')}">
        </div>
        <div class="form-group">
          <label class="form-label">Модель по умолчанию</label>
          <input class="form-input setting-field" id="setOllamaModel" data-key="ollama_model" value="${escapeHtml(settings.ollama_model || 'qwen2.5:7b-instruct')}">
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-16">🔔 Уведомления</div>
        <div class="form-group">
          <label class="form-label">Telegram уведомления</label>
          <select class="form-select setting-field" id="setTelegramEnabled" data-key="telegram_enabled">
            <option value="false" ${settings.telegram_enabled !== 'true' ? 'selected' : ''}>Отключены</option>
            <option value="true" ${settings.telegram_enabled === 'true' ? 'selected' : ''}>Включены</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Автогенерация отчетов</label>
          <select class="form-select setting-field" id="setAutoReports" data-key="auto_reports">
            <option value="true" ${settings.auto_reports !== 'false' ? 'selected' : ''}>Да</option>
            <option value="false" ${settings.auto_reports === 'false' ? 'selected' : ''}>Нет</option>
          </select>
        </div>
        <p class="text-sm text-muted mt-8">Для настройки Telegram Bot откройте раздел Коннекторы и задайте token и chat_id.</p>
      </div>

      <div class="card">
        <div class="card-title mb-16">📊 Данные</div>
        <div class="form-group">
          <label class="form-label">Хранить данные (дней)</label>
          <input class="form-input setting-field" id="setRetention" data-key="data_retention_days" type="number" value="${settings.data_retention_days || 365}">
        </div>
      </div>

      <div class="card" style="grid-column: 1 / -1">
        <div class="card-title mb-16">ℹ️ О системе</div>
        <div class="item-list">
          <div class="item-row" style="padding:10px 14px">
            <span class="text-muted">Версия</span>
            <strong>1.0.0</strong>
          </div>
          <div class="item-row" style="padding:10px 14px">
            <span class="text-muted">Платформа</span>
            <strong>Electron + Express + SQLite</strong>
          </div>
          <div class="item-row" style="padding:10px 14px">
            <span class="text-muted">AI Engine</span>
            <strong>Ollama + Fallback Analyzer</strong>
          </div>
          <div class="item-row" style="padding:10px 14px">
            <span class="text-muted">Коннекторы</span>
            <strong>1C, SAP, SCADA, Telegram, CRM, ERP</strong>
          </div>
          <div class="item-row" style="padding:10px 14px">
            <span class="text-muted">Язык</span>
            <strong>${settings.language || 'ru'}</strong>
          </div>
        </div>
      </div>
    </div>
  `;

  // Unified Save button — collects all changed values and sends a single PUT
  $('btnSaveAllSettings')?.addEventListener('click', async () => {
    const btn = $('btnSaveAllSettings');
    btn.disabled = true;
    btn.textContent = '⏳ Сохранение...';

    const changes = {};
    $$('.setting-field').forEach(el => {
      const key = el.dataset.key;
      const currentVal = el.value;
      if (key && currentVal !== undefined) {
        changes[key] = currentVal;
      }
    });

    try {
      await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(changes),
      });
      showToast('Настройки сохранены', 'success');
      await renderSettings(container);
    } catch (err) {
      showToast('Ошибка сохранения: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = '💾 Сохранить все';
    }
  });
}

/* ══════════════ INIT ══════════════ */
/* ══════════════ Splash/Loading — PERMANENTLY DISABLED ══════════════ */
// The splash/loading overlays were causing the "blur screen" bug on Windows
// Electron. They used z-index 99998-99999 with opaque backgrounds and were
// only hidden by JS — race conditions caused them to persist.
// Now the overlays are display:none by default (see index.html) and CSS
// !important rules prevent them from ever being shown.
// Electron's ready-to-show in main.js handles the initial blank window.

window.addEventListener('DOMContentLoaded', () => {
  // Navigation
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // Modal close
  $('modalClose')?.addEventListener('click', hideModal);
  $('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('modalOverlay')) hideModal();
  });

  // Sidebar toggle (mobile)
  $('sidebarToggle')?.addEventListener('click', () => {
    $('sidebar')?.classList.toggle('open');
  });

  // Status indicator
  (async () => {
    try {
      const health = await api('/api/health');
      const statusEl = $('statusIndicator');
      if (statusEl) {
        statusEl.querySelector('span').textContent = `${health.status === 'ok' ? 'System Online' : 'Offline'}`;
      }
    } catch {}
  })();

  // Load dashboard
  navigateTo('dashboard');
});

// Global functions for inline onclick
window.navigateTo = navigateTo;
window.hideModal = hideModal;
