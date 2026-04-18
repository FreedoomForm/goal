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
};

const typeNames = {
  ollama: 'Ollama LLM',
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

/* ══════════════ Sidebar Mobile Helpers ══════════════ */
function openSidebar() {
  $('sidebar')?.classList.add('open');
  $('sidebarBackdrop')?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sidebarBackdrop')?.classList.remove('visible');
  document.body.style.overflow = '';
}
function toggleSidebar() {
  if ($('sidebar')?.classList.contains('open')) closeSidebar();
  else openSidebar();
}

/* ══════════════ Page Router ══════════════ */
function navigateTo(page) {
  state.currentPage = page;
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  renderPage(page);
  // Auto-close sidebar on mobile navigation
  if (window.innerWidth <= 900) closeSidebar();
  // Scroll to top on page change
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); }
}

async function renderPage(page) {
  const container = $('pageContainer');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Загрузка...</span></div>';

  try {
    switch (page) {
      case 'dashboard': await renderDashboard(container); break;
      case 'connectors': await renderConnectors(container); break;
      case 'scenarios': await renderScenarios(container); break;
      case 'modules': await renderModules(container); break;
      case 'assistant': await renderAssistantEnhanced(container); break;
      case 'ai-engine': await renderAIEngine(container); break;
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
            <div class="item-row" style="cursor:pointer" onclick="navigateTo('modules')">
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
            <div class="item-row" style="cursor:pointer" onclick="navigateTo('connectors')">
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
              <button class="btn btn-sm edit-connector" data-id="${c.id}">✏️ Изменить</button>
              <button class="btn btn-sm test-connector" data-id="${c.id}">🔍 Тест</button>
              <button class="btn btn-sm btn-danger del-connector" data-id="${c.id}">✕</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Helper: build auth fields HTML based on auth mode
  function authFieldsHtml(authMode, payload) {
    const p = payload || {};
    if (authMode === 'basic') {
      return `
        <div class="form-group">
          <label class="form-label">Имя пользователя</label>
          <input class="form-input" id="authUsername" placeholder="user" value="${escapeHtml(p.username || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Пароль</label>
          <input class="form-input" id="authPassword" type="password" placeholder="••••••" value="${escapeHtml(p.password || '')}">
        </div>`;
    }
    if (authMode === 'bearer' || authMode === 'token') {
      return `
        <div class="form-group">
          <label class="form-label">Токен</label>
          <input class="form-input" id="authToken" type="password" placeholder="eyJhbG..." value="${escapeHtml(p.token || '')}">
        </div>`;
    }
    return '';
  }

  // Helper: collect auth_payload from modal fields
  function collectAuthPayload() {
    const authMode = $('newConnAuth')?.value || 'none';
    if (authMode === 'basic') {
      return { username: $('authUsername')?.value || '', password: $('authPassword')?.value || '' };
    }
    if (authMode === 'bearer' || authMode === 'token') {
      return { token: $('authToken')?.value || '' };
    }
    return {};
  }

  // Helper: open connector modal (create or edit)
  function openConnectorModal(connector) {
    const isEdit = !!connector;
    const c = connector || {};
    const authMode = c.auth_mode || 'none';
    const authPayload = c.auth_payload || {};

    showModal(isEdit ? 'Редактировать коннектор' : 'Новый коннектор', `
      <div class="form-group">
        <label class="form-label">Имя</label>
        <input class="form-input" id="newConnName" placeholder="Например: 1C Бухгалтерия" value="${escapeHtml(c.name || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Тип</label>
        <select class="form-select" id="newConnType">
          <option value="ollama" ${c.type==='ollama'?'selected':''}>🤖 Ollama LLM</option>
          <option value="one_c_odata" ${c.type==='one_c_odata'?'selected':''}>📦 1C OData</option>
          <option value="sap_odata" ${c.type==='sap_odata'?'selected':''}>🏢 SAP OData</option>
          <option value="opc_ua" ${c.type==='opc_ua'?'selected':''}>🏭 OPC UA / SCADA</option>
          <option value="telegram" ${c.type==='telegram'?'selected':''}>✈️ Telegram Bot</option>
          <option value="askug" ${c.type==='askug'?'selected':''}>💳 АСКУГ / UGaz / E-GAZ</option>
          <option value="mqtt" ${c.type==='mqtt'?'selected':''}>📡 MQTT IoT</option>
          <option value="database" ${c.type==='database'?'selected':''}>🗄️ База данных (SQL)</option>
          <option value="crm_rest" ${c.type==='crm_rest'?'selected':''}>👥 CRM REST</option>
          <option value="erp_rest" ${c.type==='erp_rest'?'selected':''}>⚙️ ERP REST</option>
          <option value="rest" ${c.type==='rest'?'selected':''}>🌐 REST API</option>
          <option value="graphql" ${c.type==='graphql'?'selected':''}>🔮 GraphQL</option>
          <option value="email" ${c.type==='email'?'selected':''}>📧 Email / SMTP</option>
          <option value="webhook" ${c.type==='webhook'?'selected':''}>🔔 Webhook</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Base URL</label>
        <input class="form-input" id="newConnUrl" placeholder="http://..." value="${escapeHtml(c.base_url || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Auth Mode</label>
        <select class="form-select" id="newConnAuth">
          <option value="none" ${authMode==='none'?'selected':''}>Нет</option>
          <option value="basic" ${authMode==='basic'?'selected':''}>Basic (login/password)</option>
          <option value="bearer" ${authMode==='bearer'?'selected':''}>Bearer Token</option>
          <option value="token" ${authMode==='token'?'selected':''}>API Token</option>
        </select>
      </div>
      <div id="authFieldsContainer">${authFieldsHtml(authMode, authPayload)}</div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveConn">${isEdit ? 'Обновить' : 'Сохранить'}</button>
    `);

    // Toggle auth fields on change
    $('newConnAuth')?.addEventListener('change', () => {
      const container = $('authFieldsContainer');
      if (container) container.innerHTML = authFieldsHtml($('newConnAuth').value, {});
    });

    $('btnSaveConn')?.addEventListener('click', async () => {
      try {
        const body = {
          name: $('newConnName').value,
          type: $('newConnType').value,
          base_url: $('newConnUrl').value,
          auth_mode: $('newConnAuth').value,
          auth_payload: collectAuthPayload(),
        };
        if (isEdit) {
          await api(`/api/connectors/${c.id}`, { method: 'PUT', body: JSON.stringify(body) });
          showToast('Коннектор обновлён', 'success');
        } else {
          await api('/api/connectors', { method: 'POST', body: JSON.stringify(body) });
          showToast('Коннектор создан', 'success');
        }
        hideModal();
        await renderConnectors(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  }

  $('btnAddConnector')?.addEventListener('click', () => openConnectorModal(null));

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

  $$('.del-connector').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить коннектор?')) return;
      await api(`/api/connectors/${btn.dataset.id}`, { method: 'DELETE' });
      showToast('Коннектор удален', 'info');
      await renderConnectors(container);
    });
  });

  $$('.edit-connector').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = connectors.find(x => x.id == btn.dataset.id);
      if (c) openConnectorModal(c);
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
              <button class="btn btn-sm edit-scenario" data-id="${s.id}">✏️ Изменить</button>
              <button class="btn btn-sm toggle-scenario" data-id="${s.id}" data-enabled="${s.enabled ? 1 : 0}">${s.enabled ? '⏸ Выключить' : '▶ Включить'}</button>
              <button class="btn btn-sm btn-danger del-scenario" data-id="${s.id}">✕ Удалить</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  $('btnAddScenario')?.addEventListener('click', async () => {
    // Fetch connectors for selection
    let connectors = [];
    try { connectors = await api('/api/connectors'); } catch {}

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
      <div class="form-group">
        <label class="form-label">Коннекторы</label>
        <div id="scConnectorCheckboxes" style="max-height:180px;overflow-y:auto">
          ${connectors.length === 0 ? '<span class="text-muted">Нет коннекторов</span>' : connectors.map(c => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
              <input type="checkbox" class="sc-conn-check" value="${c.id}" style="accent-color:#59a8ff">
              <span>${typeIcons[c.type] || '🔌'} ${escapeHtml(c.name)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveScenario">Сохранить</button>
    `);
    $('btnSaveScenario')?.addEventListener('click', async () => {
      try {
        const connectorIds = [...$$('.sc-conn-check:checked')].map(cb => parseInt(cb.value));
        await api('/api/scenarios', {
          method: 'POST',
          body: JSON.stringify({
            name: $('newScName').value,
            category: $('newScCategory').value,
            cron_expr: $('newScCron').value,
            objective: $('newScObjective').value,
            delivery_channel: $('newScChannel').value,
            connector_ids: connectorIds,
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

  $$('.del-scenario').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить сценарий?')) return;
      await api(`/api/scenarios/${btn.dataset.id}`, { method: 'DELETE' });
      showToast('Сценарий удален', 'info');
      await renderScenarios(container);
    });
  });

  $$('.toggle-scenario').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isEnabled = btn.dataset.enabled === '1';
      try {
        await api(`/api/scenarios/${btn.dataset.id}`, {
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

  $$('.edit-scenario').forEach(btn => {
    btn.addEventListener('click', async () => {
      const s = scenarios.find(x => x.id == btn.dataset.id);
      if (!s) return;
      // Fetch connectors for selection
      let allConnectors = [];
      try { allConnectors = await api('/api/connectors'); } catch {}

      showModal('Редактировать сценарий', `
        <div class="form-group">
          <label class="form-label">Название</label>
          <input class="form-input" id="editScName" value="${escapeHtml(s.name)}">
        </div>
        <div class="form-group">
          <label class="form-label">Категория</label>
          <select class="form-select" id="editScCategory">
            <option value="operations" ${s.category==='operations'?'selected':''}>Operations</option>
            <option value="finance" ${s.category==='finance'?'selected':''}>Finance</option>
            <option value="monitoring" ${s.category==='monitoring'?'selected':''}>Monitoring</option>
            <option value="risk" ${s.category==='risk'?'selected':''}>Risk</option>
            <option value="integration" ${s.category==='integration'?'selected':''}>Integration</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Cron Expression</label>
          <input class="form-input" id="editScCron" value="${escapeHtml(s.cron_expr || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Цель / Описание</label>
          <textarea class="form-textarea" id="editScObjective">${escapeHtml(s.objective || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Канал доставки</label>
          <select class="form-select" id="editScChannel">
            <option value="none" ${s.delivery_channel==='none'?'selected':''}>Нет (только генерация)</option>
            <option value="telegram" ${s.delivery_channel==='telegram'?'selected':''}>Telegram</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Коннекторы</label>
          <div id="scEditConnectorCheckboxes" style="max-height:180px;overflow-y:auto">
            ${allConnectors.length === 0 ? '<span class="text-muted">Нет коннекторов</span>' : allConnectors.map(c => {
              const checked = (s.connector_ids || []).includes(c.id) ? 'checked' : '';
              return `
                <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
                  <input type="checkbox" class="sc-edit-conn-check" value="${c.id}" ${checked} style="accent-color:#59a8ff">
                  <span>${typeIcons[c.type] || '🔌'} ${escapeHtml(c.name)}</span>
                </label>`;
            }).join('')}
          </div>
        </div>
      `, `
        <button class="btn" onclick="hideModal()">Отмена</button>
        <button class="btn btn-primary" id="btnUpdateScenario">Обновить</button>
      `);
      $('btnUpdateScenario')?.addEventListener('click', async () => {
        try {
          const connectorIds = [...$$('.sc-edit-conn-check:checked')].map(cb => parseInt(cb.value));
          await api(`/api/scenarios/${s.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: $('editScName').value,
              category: $('editScCategory').value,
              cron_expr: $('editScCron').value,
              objective: $('editScObjective').value,
              delivery_channel: $('editScChannel').value,
              connector_ids: connectorIds,
              enabled: s.enabled,
            }),
          });
          hideModal();
          showToast('Сценарий обновлён', 'success');
          await renderScenarios(container);
        } catch (err) {
          showToast('Ошибка: ' + err.message, 'error');
        }
      });
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

      const endpointMap = {
        gas_balance: '/api/analytics/gas-balance',
        consumption: '/api/analytics/consumption',
        payments: '/api/analytics/payments',
        finance: '/api/analytics/tariffs',
        risks: '/api/analytics/risks',
      };

      try {
        if (!endpointMap[code]) {
          showToast(`Аналитика для модуля "${name}" пока недоступна`, 'warning');
          btn.disabled = false;
          btn.textContent = '📊 Запросить анализ';
          return;
        }
        const endpoint = endpointMap[code];
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

/* ══════════════ DOCUMENTS PAGE ══════════════ */

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
                    <button class="btn btn-sm btn-danger del-document" data-id="${d.id}">✕</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  $$('.del-document').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить документ?')) return;
      await api(`/api/documents/${btn.dataset.id}`, { method: 'DELETE' });
      showToast('Документ удалён', 'info');
      await renderDocuments(container);
    });
  });
}

/* ══════════════ TRAINING PAGE ══════════════ */
async function renderTraining(container) {
  const jobs = await api('/api/training');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Обучение моделей</h2>
        <p class="page-subtitle">Локальное дообучение (LoRA/QLoRA) моделей на корпоративных данных</p>
      </div>
      <button class="btn btn-primary" id="btnNewTraining">+ Новая задача обучения</button>
    </div>

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

    ${jobs.length > 0 ? `
      <div class="card">
        <div class="card-title mb-16">Задачи обучения</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Название</th><th>Модель</th><th>Метод</th><th>Статус</th><th>Прогресс</th><th>Дата</th><th>Действия</th></tr></thead>
            <tbody>
              ${jobs.map(j => `
                <tr>
                  <td>#${j.id}</td>
                  <td>${escapeHtml(j.name)}</td>
                  <td><span class="chip">${j.base_model}</span></td>
                  <td><span class="chip">${j.method}</span></td>
                  <td><span class="badge ${j.status === 'completed' ? 'badge-success' : j.status === 'running' ? 'badge-warning' : 'badge-neutral'}">${j.status}</span></td>
                  <td>
                    <div class="progress-bar" style="width:100px"><div class="progress-fill" style="width:${j.progress}%"></div></div>
                    <span class="text-sm text-muted">${j.progress}%</span>
                  </td>
                  <td class="text-muted">${formatDate(j.created_at)}</td>
                  <td>
                    <button class="btn btn-sm btn-danger del-training" data-id="${j.id}">✕</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}
  `;

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

  $$('.del-training').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить задачу обучения?')) return;
      await api(`/api/training/${btn.dataset.id}`, { method: 'DELETE' });
      showToast('Задача обучения удалена', 'info');
      await renderTraining(container);
    });
  });

  showToast('⚠️ Выполнение обучения — Скоро будет доступно в следующем обновлении', 'warning');
}

/* ══════════════ ETL PAGE ══════════════ */
async function renderETL(container) {
  const pipelines = await api('/api/etl');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">ETL Пайплайны</h2>
        <p class="page-subtitle">Настройка выгрузки данных из ERP/1C/SCADA/биллинг, очистка, разметка и обогащение</p>
      </div>
      <button class="btn btn-primary" id="btnNewETL">+ Новый пайплайн</button>
    </div>

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
        <div class="card-title">Активные пайплайны</div>
        <div class="card-subtitle mb-16">Настроенные процессы обработки данных</div>
        ${pipelines.length === 0 ? `
          <p class="text-muted">Пайплайны ещё не созданы. Нажмите «+ Новый пайплайн».</p>
        ` : `
          <div class="item-list">
            ${pipelines.map(p => `
              <div class="item-row">
                <div class="item-info">
                  <div class="item-name">${escapeHtml(p.name)}</div>
                  <div class="item-meta">
                    <span class="badge ${p.status === 'running' ? 'badge-success' : 'badge-neutral'}">${p.status}</span>
                    <span>${p.schedule || 'manual'}</span>
                    <span>→ ${p.target}</span>
                  </div>
                </div>
                <button class="btn btn-sm btn-danger del-etl" data-id="${p.id}">✕</button>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  $('btnNewETL')?.addEventListener('click', () => {
    showModal('Новый ETL пайплайн', `
      <div class="form-group">
        <label class="form-label">Название</label>
        <input class="form-input" id="etlName" placeholder="Например: 1C → Газовый баланс">
      </div>
      <div class="form-group">
        <label class="form-label">Расписание (cron)</label>
        <input class="form-input" id="etlSchedule" placeholder="0 4 * * * (каждый день в 4:00)">
      </div>
      <div class="form-group">
        <label class="form-label">Target</label>
        <input class="form-input" id="etlTarget" value="local_db">
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
            schedule: $('etlSchedule').value,
            target: $('etlTarget').value,
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

  $$('.del-etl').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить ETL пайплайн?')) return;
      await api(`/api/etl/${btn.dataset.id}`, { method: 'DELETE' });
      showToast('ETL пайплайн удалён', 'info');
      await renderETL(container);
    });
  });

  showToast('⚠️ Запуск ETL пайплайнов — Скоро будет доступно в следующем обновлении', 'warning');
}

/* ══════════════ AUDIT PAGE ══════════════ */
async function renderAudit(container) {
  const logs = await api('/api/audit?limit=100');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Журнал аудита</h2>
        <p class="page-subtitle">Полная история всех действий системы: создание, изменение, выполнение, ошибки</p>
      </div>
      <button class="btn" onclick="renderPage('audit')">🔄 Обновить</button>
    </div>

    <div class="table-wrap card">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Событие</th>
            <th>Детали</th>
            <th>Время</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(l => {
            let payload;
            try { payload = JSON.parse(l.payload); } catch { payload = l.payload; }
            const payloadStr = typeof payload === 'object' ? JSON.stringify(payload, null, 0) : String(payload);
            return `
              <tr>
                <td class="text-muted">#${l.id}</td>
                <td>
                  <span class="badge ${l.event_type.includes('error') ? 'badge-danger' : l.event_type.includes('created') ? 'badge-success' : l.event_type.includes('executed') ? 'badge-info' : 'badge-neutral'}">${escapeHtml(l.event_type)}</span>
                </td>
                <td class="text-sm text-muted font-mono truncate" style="max-width:400px" title="${escapeHtml(payloadStr)}">${escapeHtml(payloadStr.slice(0, 120))}</td>
                <td class="text-muted text-sm">${formatDate(l.created_at)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ══════════════ SETTINGS PAGE ══════════════ */
async function renderSettings(container) {
  const settings = await api('/api/settings');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Настройки</h2>
        <p class="page-subtitle">Конфигурация платформы AegisOps Local AI</p>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title mb-16">🤖 Ollama / LLM</div>
        <div class="form-group">
          <label class="form-label">URL Ollama</label>
          <input class="form-input" id="setOllamaUrl" value="${escapeHtml(settings.ollama_url || 'http://127.0.0.1:11434')}">
        </div>
        <div class="form-group">
          <label class="form-label">Модель по умолчанию</label>
          <input class="form-input" id="setOllamaModel" value="${escapeHtml(settings.ollama_model || 'qwen2.5:7b-instruct')}">
        </div>
        <button class="btn btn-primary btn-sm" id="btnSaveOllama">Сохранить</button>
      </div>

      <div class="card">
        <div class="card-title mb-16">✈️ Telegram</div>
        <div class="form-group">
          <label class="form-label">Включен</label>
          <select class="form-select" id="setTelegramEnabled">
            <option value="false" ${settings.telegram_enabled !== 'true' ? 'selected' : ''}>Нет</option>
            <option value="true" ${settings.telegram_enabled === 'true' ? 'selected' : ''}>Да</option>
          </select>
        </div>
        <p class="text-sm text-muted mt-8">Для настройки Telegram Bot откройте раздел Коннекторы и задайте token и chat_id.</p>
        <button class="btn btn-primary btn-sm mt-16" id="btnSaveTelegram">Сохранить</button>
      </div>

      <div class="card">
        <div class="card-title mb-16">📊 Данные</div>
        <div class="form-group">
          <label class="form-label">Хранить данные (дней)</label>
          <input class="form-input" id="setRetention" type="number" value="${settings.data_retention_days || 365}">
        </div>
        <div class="form-group">
          <label class="form-label">Автогенерация отчетов</label>
          <select class="form-select" id="setAutoReports">
            <option value="true" ${settings.auto_reports !== 'false' ? 'selected' : ''}>Да</option>
            <option value="false" ${settings.auto_reports === 'false' ? 'selected' : ''}>Нет</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" id="btnSaveData">Сохранить</button>
      </div>

      <div class="card">
        <div class="card-title mb-16">ℹ️ О системе</div>
        <div class="item-list">
          <div class="item-row" style="padding:10px 14px">
            <span class="text-muted">Версия</span>
            <strong>1.1.0</strong>
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

  $('btnSaveOllama')?.addEventListener('click', async () => {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ ollama_url: $('setOllamaUrl').value, ollama_model: $('setOllamaModel').value }) });
    // Also update the Ollama connector's base_url
    try {
      const connectors = await api('/api/connectors');
      const ollamaConn = connectors.find(c => c.type === 'ollama');
      if (ollamaConn) {
        await api(`/api/connectors/${ollamaConn.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: ollamaConn.name,
            type: ollamaConn.type,
            base_url: $('setOllamaUrl').value,
            auth_mode: ollamaConn.auth_mode,
            auth_payload: ollamaConn.auth_payload || {},
            enabled: ollamaConn.enabled,
          }),
        });
      }
    } catch {}
    showToast('Настройки Ollama сохранены', 'success');
  });

  $('btnSaveTelegram')?.addEventListener('click', async () => {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ telegram_enabled: $('setTelegramEnabled').value }) });
    showToast('Настройки Telegram сохранены', 'success');
  });

  $('btnSaveData')?.addEventListener('click', async () => {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ data_retention_days: $('setRetention').value, auto_reports: $('setAutoReports').value }) });
    showToast('Настройки данных сохранены', 'success');
  });
}

/* ══════════════ INIT ══════════════ */
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

  // Sidebar toggle (mobile) — both the in-sidebar toggle and the external hamburger
  $('sidebarToggle')?.addEventListener('click', toggleSidebar);
  $('mobileHamburger')?.addEventListener('click', toggleSidebar);
  $('sidebarBackdrop')?.addEventListener('click', closeSidebar);

  // Close sidebar on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('modalOverlay')?.classList.contains('visible')) hideModal();
      else if ($('sidebar')?.classList.contains('open')) closeSidebar();
    }
  });

  // Ensure sidebar state is correct on resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      closeSidebar();
    }
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
