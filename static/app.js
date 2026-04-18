const state = { dashboard: null };

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

function byId(id) {
  return document.getElementById(id);
}

function renderChips(items) {
  return items.map((item) => `<span class="chip">${item}</span>`).join('');
}

function renderModules(modules) {
  return modules.map((module) => `
    <div class="module-item">
      <div>
        <strong>${module.name}</strong>
        <p class="muted">Статус: ${module.status}</p>
      </div>
      <span class="pill small">${module.status}</span>
    </div>
  `).join('');
}

function renderConnectors(connectors) {
  return connectors.map((connector) => `
    <div class="connector-item">
      <div>
        <strong>${connector.name}</strong>
        <p class="muted">${connector.type} • ${connector.base_url || 'URL не задан'}</p>
      </div>
      <span class="badge ${connector.enabled ? 'success' : 'idle'}">${connector.enabled ? 'включен' : 'выключен'}</span>
    </div>
  `).join('');
}

function renderScenarios(scenarios) {
  return scenarios.map((scenario) => `
    <div class="scenario-item">
      <div>
        <strong>${scenario.name}</strong>
        <p class="muted">${scenario.objective}</p>
        <div class="chips compact">
          <span class="chip">${scenario.category}</span>
          <span class="chip">cron: ${scenario.cron_expr || 'manual'}</span>
          <span class="chip">delivery: ${scenario.delivery_channel}</span>
        </div>
      </div>
      <button class="btn primary run-scenario" data-id="${scenario.id}">Запустить</button>
    </div>
  `).join('');
}

function renderDocuments(documents) {
  if (!documents.length) return '<p class="muted">Документы пока не созданы.</p>';
  return documents.map((doc) => `
    <div class="doc-item">
      <div>
        <strong>${doc.title}</strong>
        <p class="muted">${doc.kind} • ${doc.created_at}</p>
      </div>
      <a class="btn ghost small" href="/api/documents/${doc.id}/download" target="_blank" rel="noreferrer">Открыть</a>
    </div>
  `).join('');
}

function renderLogs(logs) {
  if (!logs.length) return '<p class="muted">Логи отсутствуют.</p>';
  return logs.map((log) => `
    <div class="log-item">
      <strong>${log.event_type}</strong>
      <p class="muted">${log.created_at}</p>
      <pre>${log.payload}</pre>
    </div>
  `).join('');
}

async function loadDashboard() {
  const dashboard = await api('/api/dashboard');
  state.dashboard = dashboard;

  byId('heroTitle').textContent = dashboard.hero.title;
  byId('heroSubtitle').textContent = dashboard.hero.subtitle;
  byId('highlights').innerHTML = renderChips(dashboard.hero.highlights);

  byId('statConnectors').textContent = dashboard.connectors.length;
  byId('statScenarios').textContent = dashboard.scenarios.length;
  byId('statDocuments').textContent = dashboard.documents.length;
  byId('statLogs').textContent = dashboard.logs.length;

  byId('modulesList').innerHTML = renderModules(dashboard.modules);
  byId('connectorsList').innerHTML = renderConnectors(dashboard.connectors);
  byId('scenariosList').innerHTML = renderScenarios(dashboard.scenarios);
  byId('documentsList').innerHTML = renderDocuments(dashboard.documents);
  byId('logsList').innerHTML = renderLogs(dashboard.logs);

  document.querySelectorAll('.run-scenario').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = 'Выполняется...';
      try {
        const result = await api(`/api/scenarios/${id}/run`, {
          method: 'POST',
          body: JSON.stringify({ ask: 'Сделай акцент на рисках, интеграциях и том, что нужно автоматизировать следующим этапом.', send_to_telegram: false }),
        });
        alert(`Сценарий выполнен. Отчет: ${result.report_path}`);
        await loadDashboard();
      } catch (err) {
        alert(`Ошибка запуска: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Запустить';
      }
    });
  });
}

async function askAssistant() {
  const prompt = byId('assistantPrompt').value.trim();
  if (!prompt) return;
  const output = byId('assistantOutput');
  output.textContent = 'Ожидание ответа...';
  try {
    const result = await api('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
    output.textContent = `[${result.provider}]\n\n${result.content}`;
    await loadDashboard();
  } catch (err) {
    output.textContent = `Ошибка: ${err.message}`;
  }
}

async function checkHealth() {
  try {
    const result = await api('/api/health');
    alert(`Health: ${result.status}\nВерсия: ${result.version}\nКоннекторы: ${result.connectors}`);
  } catch (err) {
    alert(`Health error: ${err.message}`);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  byId('refreshBtn').addEventListener('click', loadDashboard);
  byId('assistantBtn').addEventListener('click', askAssistant);
  byId('healthBtn').addEventListener('click', checkHealth);
  await loadDashboard();
});
