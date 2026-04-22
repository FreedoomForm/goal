/**
 * AegisOps Planning Page Controller v4 — Neo-brutalism redesign.
 *
 * Key changes from v3:
 *   - Scenarios list panel added on the right
 *   - Calendar for date/time and recurrence selection
 *   - Neo-brutalism visual style
 *   - Full connector catalog with real example parameters
 */
(function () {
  'use strict';

  const ML_PORT = 18091;

  /* ── Helpers ── */

  function apiJson(path, opts = {}) {
    return fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    }).then(async (r) => {
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(txt || 'HTTP ' + r.status);
      }
      return r.json();
    });
  }

  function esc(s) {
    const d = document.createElement('span');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms))]);
  }

  function formatDateRu(date) {
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatTimeRu(date) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  /* ── Full node catalog with real examples ── */

  const FULL_CATALOG = [
    { category: 'Триггеры', items: [
      { type: 'trigger.manual',  label: 'Ручной запуск',  icon: '▶️',  params: {} },
      { type: 'trigger.cron',    label: 'Cron',           icon: '⏰',  params: { cron: '0 9 * * *' } },
      { type: 'trigger.webhook', label: 'Webhook',        icon: '🌐',  params: { path: '/api/hooks/my-scenario', method: 'POST' } },
      { type: 'trigger.schedule', label: 'Расписание',    icon: '📅',  params: { 
        start_date: new Date().toISOString().split('T')[0], 
        start_time: '09:00',
        recurrence: 'once', // once, daily, weekly, monthly, yearly
        recurrence_interval: 1
      }},
    ]},
    { category: 'Коннекторы', items: [
      { type: 'connector.onec', label: '1C OData', icon: '📦', params: { 
        connector_id: null, 
        entity: 'Справочник.Номенклатура',
        query: { $top: 100, $filter: "ПометкаУдаления eq false" },
        example_response: '{"value": [{"Ref_Key": "abc-123", "Description": "Товар 1"}]}'
      }},
      { type: 'connector.sap', label: 'SAP OData', icon: '🏢', params: { 
        connector_id: null, 
        entity: 'SalesOrderSet',
        query: { $filter: "Status eq 'Open'" },
        example_response: '{"d": {"results": [{"SalesOrderID": "SO001"}]}}'
      }},
      { type: 'connector.opcua', label: 'OPC UA / SCADA', icon: '🏭', params: { 
        connector_id: null, 
        node_id: 'ns=2;s=Machine1.Temperature',
        attribute: 'Value',
        example_response: '{"value": 42.5, "statusCode": "Good"}'
      }},
      { type: 'connector.telegram', label: 'Telegram', icon: '✈️', params: { 
        connector_id: null, 
        action: 'sendMessage',
        chat_id: '-1001234567890',
        parse_mode: 'HTML',
        example_response: '{"ok": true, "result": {"message_id": 123}}'
      }},
      { type: 'connector.database', label: 'База данных', icon: '🗄️', params: { 
        connector_id: null, 
        query: 'SELECT * FROM orders WHERE created_at > NOW() - INTERVAL \'7 days\'',
        params: [],
        example_response: '[{"id": 1, "name": "Заказ #123", "total": 15000}]'
      }},
      { type: 'connector.askug', label: 'АСКУГ / UGaz', icon: '💳', params: { 
        connector_id: null, 
        method: 'GetMeterReadings',
        params: { period: '2024-01', region: 'Tashkent' },
        example_response: '{"readings": [{"meter_id": "M001", "value": 1234.5}]}'
      }},
      { type: 'connector.mqtt', label: 'MQTT IoT', icon: '📡', params: { 
        connector_id: null, 
        topic: 'sensors/temperature/room1',
        qos: 1,
        example_response: '{"payload": "23.5", "timestamp": "2024-01-15T10:30:00Z"}'
      }},
      { type: 'connector.email', label: 'Email / SMTP', icon: '📧', params: { 
        connector_id: null, 
        action: 'send',
        to: 'user@example.com',
        subject: 'Отчет за {{date}}',
        body: 'Содержимое отчета...',
        example_response: '{"accepted": ["user@example.com"], "messageId": "<abc123>"}'
      }},
      { type: 'connector.rest', label: 'REST API', icon: '🌐', params: { 
        connector_id: null, 
        method: 'GET',
        endpoint: '/api/v1/data',
        headers: { 'X-API-Key': '{{api_key}}' },
        example_response: '{"status": "success", "data": []}'
      }},
      { type: 'connector.fetch',  label: 'Запрос данных',  icon: '📥', params: { connector_id: null, query: {} } },
      { type: 'connector.write', label: 'Запись данных',  icon: '📤', params: { connector_id: null } },
    ]},
    { category: 'ML / AI', items: [
      { type: 'ml.forecast', label: 'Прогноз (ML)', icon: '📊', params: { 
        model: 'ensemble', 
        horizon: 30, 
        metric: 'gas_balance',
        confidence: 0.95,
        example_response: '{"forecast": [{"date": "2024-02-01", "value": 1000, "lower": 900, "upper": 1100}]}'
      }},
      { type: 'ml.train', label: 'Обучение модели', icon: '🧠', params: { 
        model_type: 'ensemble', 
        train_days: 365,
        features: ['temperature', 'consumption', 'day_of_week'],
        example_response: '{"model_id": "model_123", "accuracy": 0.92, "mape": 5.3}'
      }},
      { type: 'ml.anomaly', label: 'Детекция аномалий', icon: '🔍', params: { 
        sensitivity: 'medium',
        window_size: 24,
        example_response: '{"anomalies": [{"timestamp": "2024-01-15T10:00:00Z", "score": 0.95}]}'
      }},
      { type: 'ml.classify', label: 'Классификация', icon: '🏷️', params: { 
        model: 'classifier_v1',
        classes: ['normal', 'warning', 'critical'],
        example_response: '{"prediction": "warning", "probability": 0.87}'
      }},
      { type: 'ai.ask', label: 'AI-запрос', icon: '🤖', params: { 
        system: 'Ты аналитик газовой компании.',
        prompt_template: 'Проанализируй данные: {{$input}}',
        model: 'llama3',
        temperature: 0.7,
        example_response: '{"response": "Анализ показывает...", "tokens_used": 150}'
      }},
    ]},
    { category: 'Данные', items: [
      { type: 'data.transform', label: 'JS выражение', icon: '🔧', params: { expression: '$input.map(x => ({...x, total: x.price * x.qty}))' } },
      { type: 'data.filter', label: 'Фильтр', icon: '🔍', params: { expression: '$input.status === "active"' } },
      { type: 'data.merge', label: 'Объединение', icon: '🔗', params: { strategy: 'left_join', key: 'id' } },
      { type: 'data.aggregate', label: 'Агрегация', icon: '📈', params: { 
        group_by: 'category',
        metrics: { total: 'sum(amount)', count: 'count()', avg: 'avg(price)' }
      }},
    ]},
    { category: 'MCP', items: [
      { type: 'mcp.call', label: 'MCP Tool', icon: '🧩', params: { server: '', tool: '', args: {} } },
    ]},
    { category: 'Аналитика', items: [
      { type: 'analytics.risk', label: 'Оценка рисков', icon: '🛡️', params: { 
        forecast_horizon: 30,
        risk_threshold: 0.7,
        example_response: '{"risk_level": "medium", "factors": [{"name": "supply", "impact": 0.6}]}'
      }},
      { type: 'analytics.score', label: 'Скоринг', icon: '📋', params: { 
        model: 'credit_score_v1',
        factors: ['payment_history', 'debt_ratio', 'income'],
        example_response: '{"score": 750, "rating": "good", "breakdown": {}}'
      }},
    ]},
    { category: 'ETL', items: [
      { type: 'etl.pipeline', label: 'ETL Пайплайн', icon: '🔄', params: { pipeline_id: null } },
      { type: 'etl.extract', label: 'Извлечение', icon: '📤', params: { source: 'database', query: '' } },
      { type: 'etl.load', label: 'Загрузка', icon: '📥', params: { target: 'warehouse', table: '' } },
    ]},
    { category: 'Вывод', items: [
      { type: 'output.telegram', label: 'Telegram', icon: '✈️', params: { text: '' } },
      { type: 'output.webhook', label: 'Webhook POST', icon: '🔔', params: { url: '', method: 'POST', body_template: '' } },
      { type: 'output.report', label: 'HTML отчёт', icon: '📄', params: { template: '<h1>Сводка</h1><pre>{{$input}}</pre>' } },
      { type: 'output.pdf', label: 'PDF отчёт', icon: '📑', params: { 
        template: 'report_template',
        orientation: 'portrait',
        format: 'A4',
        example_response: '{"url": "/reports/report_20240115.pdf"}'
      }},
      { type: 'output.email', label: 'Email', icon: '📧', params: { to: '', subject: '', body: '' } },
      { type: 'output.alert', label: 'Алерт', icon: '⚡', params: { level: 'warning', message: '' } },
    ]},
  ];

  /* ── State ── */

  let _canvas = null;
  let _wfId = null;
  let _connectors = [];
  let _mcpServers = [];
  let _scenarios = [];
  let _selectedScenarioId = null;
  let _resizeObserver = null;

  /* ── Page renderer ── */

  async function renderPlanningPage(container) {
    destroy();

    // Load scenarios from API
    try {
      _scenarios = await withTimeout(apiJson('/api/scenarios'), 3000);
    } catch {
      _scenarios = [
        { id: 1, name: 'Ежедневный отчёт', category: 'operations', cron_expr: '0 9 * * *', enabled: true },
        { id: 2, name: 'Прогноз баланса', category: 'finance', cron_expr: '0 8 * * 1', enabled: true },
        { id: 3, name: 'Мониторинг SCADA', category: 'monitoring', cron_expr: '*/15 * * * *', enabled: false },
      ];
    }

    // Render HTML shell
    container.innerHTML = `
      <div class="page-header nb-header">
        <div>
          <h1 class="page-title nb-title">⚡ Планирование</h1>
          <p class="page-subtitle nb-subtitle">Визуальный конструктор сценариев автоматизации</p>
        </div>
        <div class="page-actions nb-actions">
          <button class="btn nb-btn nb-btn-ghost" id="wfGuideBtn">📘 Гид</button>
          <button class="btn nb-btn nb-btn-ghost" id="wfLoadBtn">📂 Открыть</button>
          <button class="btn nb-btn nb-btn-primary" id="wfSaveBtn">💾 Сохранить</button>
        </div>
      </div>
      <div class="wf-layout nb-layout" id="wfLayout">
        <aside class="wf-palette nb-palette" id="wfPalette">
          <div class="wf-palette-search nb-search"><input type="text" placeholder="🔍 Поиск нод..." id="wfSearch"/></div>
          <div class="wf-palette-list nb-pal-list" id="wfPalList"></div>
        </aside>
        <section class="wf-canvas-area nb-canvas-area">
          <div class="wf-topbar nb-topbar">
            <input type="text" id="wfName" placeholder="Название сценария" value="Новый сценарий" class="nb-input"/>
            <button class="btn nb-btn-sm nb-btn-calendar" id="wfCalendarBtn">📅 Расписание</button>
            <div class="wf-topbar-sep"></div>
          </div>
          <div class="wf-canvas-host nb-canvas-host" id="wfCanvasHost"></div>
        </section>
        <aside class="wf-inspector nb-inspector" id="wfInspector">
          <div class="wf-insp-head nb-insp-head">
            <h3>⚙️ Инспектор</h3>
          </div>
          <div class="wf-insp-body nb-insp-body" id="wfInsBody">
            <p style="color:#6b7fa3;font-size:12px">Кликните на ноду для редактирования</p>
          </div>
          <div class="wf-insp-trace" id="wfTrace" hidden>
            <h4>📊 Трассировка</h4>
            <div id="wfTraceBody"></div>
          </div>
        </aside>
        <aside class="wf-scenarios-panel nb-scenarios" id="wfScenariosPanel">
          <div class="wf-scenarios-head nb-scen-head">
            <h3>📋 Сценарии</h3>
            <button class="btn nb-btn-sm nb-btn-primary" id="wfNewScenarioBtn">+ Новый</button>
          </div>
          <div class="wf-scenarios-list nb-scen-list" id="wfScenariosList"></div>
        </aside>
      </div>
      <div id="wfCalendarModal" class="nb-modal" hidden>
        <div class="nb-modal-content nb-card">
          <div class="nb-modal-header">
            <h3>📅 Настройка расписания</h3>
            <button class="nb-modal-close" id="wfCalendarClose">✕</button>
          </div>
          <div class="nb-modal-body" id="wfCalendarBody"></div>
        </div>
      </div>
      <div id="wfGuideOverlay" class="wf-guide-overlay nb-overlay" hidden></div>
    `;

    // Measure available space
    const layout = document.getElementById('wfLayout');
    const headerH = container.querySelector('.page-header').offsetHeight;
    const availH = Math.max(500, window.innerHeight - headerH - 40);
    layout.style.height = availH + 'px';

    // Fetch connectors & MCP
    try { _connectors = await withTimeout(apiJson('/api/connectors'), 2000).catch(() => []); } catch { _connectors = []; }
    try {
      const r = await withTimeout(apiJson('/api/mcp/servers'), 2000).catch(() => ({ persisted: [] }));
      _mcpServers = r.persisted || [];
    } catch { _mcpServers = []; }

    // Render palette
    renderPalette(FULL_CATALOG);

    // Render scenarios list
    renderScenariosList();

    // Size canvas host
    const canvasHost = document.getElementById('wfCanvasHost');
    const sizeCanvas = () => {
      const topbar = container.querySelector('.wf-topbar');
      const tbH = topbar ? topbar.offsetHeight : 36;
      const hostH = Math.max(300, availH - tbH);
      canvasHost.style.height = hostH + 'px';
      canvasHost.style.width = canvasHost.parentElement.clientWidth + 'px';
    };
    sizeCanvas();
    _resizeObserver = new ResizeObserver(sizeCanvas);
    _resizeObserver.observe(canvasHost.parentElement);

    // Initialize canvas
    initCanvas(canvasHost);

    // Wire events
    wireActions();
  }

  /* ── Scenarios List ── */

  function renderScenariosList() {
    const list = document.getElementById('wfScenariosList');
    if (!list) return;

    list.innerHTML = _scenarios.map(s => `
      <div class="wf-scenario-item nb-scen-item ${_selectedScenarioId === s.id ? 'selected' : ''}" data-id="${s.id}">
        <div class="wf-scen-icon">${getCategoryIcon(s.category)}</div>
        <div class="wf-scen-info">
          <div class="wf-scen-name">${esc(s.name)}</div>
          <div class="wf-scen-meta">
            <span class="nb-chip">${s.cron_expr || 'manual'}</span>
            <span class="nb-badge ${s.enabled ? 'nb-badge-success' : 'nb-badge-neutral'}">${s.enabled ? '✓' : '○'}</span>
          </div>
        </div>
        <button class="wf-scen-del nb-del-btn" data-id="${s.id}" title="Удалить">✕</button>
      </div>
    `).join('');

    // Wire click events
    list.querySelectorAll('.wf-scenario-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.classList.contains('wf-scen-del')) return;
        _selectedScenarioId = parseInt(el.dataset.id);
        const scen = _scenarios.find(s => s.id === _selectedScenarioId);
        if (scen && scen.workflow_id) {
          try {
            const wf = await apiJson('/api/workflows/' + scen.workflow_id);
            _wfId = wf.id;
            document.getElementById('wfName').value = wf.name || scen.name;
            if (_canvas) _canvas.importGraph(wf.graph);
          } catch (err) {
            window.showToast('Ошибка загрузки сценария', 'error');
          }
        }
        renderScenariosList();
      });
    });

    list.querySelectorAll('.wf-scen-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        if (!confirm('Удалить сценарий?')) return;
        try {
          await apiJson('/api/scenarios/' + id, { method: 'DELETE' });
          _scenarios = _scenarios.filter(s => s.id !== id);
          if (_selectedScenarioId === id) _selectedScenarioId = null;
          renderScenariosList();
          window.showToast('Сценарий удалён', 'success');
        } catch (err) {
          window.showToast('Ошибка: ' + err.message, 'error');
        }
      });
    });
  }

  function getCategoryIcon(cat) {
    const icons = {
      operations: '⚙️',
      finance: '💰',
      monitoring: '📡',
      risk: '🛡️',
      integration: '🔗',
    };
    return icons[cat] || '📋';
  }

  /* ── Calendar Modal ── */

  function showCalendarModal() {
    const modal = document.getElementById('wfCalendarModal');
    const body = document.getElementById('wfCalendarBody');
    if (!modal || !body) return;

    const now = new Date();
    const startDate = now.toISOString().split('T')[0];
    const startTime = '09:00';

    body.innerHTML = `
      <div class="nb-calendar-grid">
        <div class="nb-calendar-row">
          <label>📅 Дата запуска</label>
          <input type="date" id="calStartDate" value="${startDate}" class="nb-input"/>
        </div>
        <div class="nb-calendar-row">
          <label>⏰ Время запуска</label>
          <input type="time" id="calStartTime" value="${startTime}" class="nb-input"/>
        </div>
        <div class="nb-calendar-row">
          <label>🔄 Повторение</label>
          <select id="calRecurrence" class="nb-select">
            <option value="once">Один раз</option>
            <option value="daily">Каждый день</option>
            <option value="weekly">Каждую неделю</option>
            <option value="monthly">Каждый месяц</option>
            <option value="yearly">Каждый год</option>
            <option value="custom">Cron выражение</option>
          </select>
        </div>
        <div class="nb-calendar-row" id="calCronRow" style="display:none">
          <label>⏱️ Cron выражение</label>
          <input type="text" id="calCron" placeholder="0 9 * * *" class="nb-input"/>
          <small style="color:#6b7fa3">мин час день месяц день_недели</small>
        </div>
        <div class="nb-calendar-row" id="calIntervalRow" style="display:none">
          <label>📊 Интервал</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="calInterval" value="1" min="1" max="100" class="nb-input" style="width:80px"/>
            <span id="calIntervalLabel">дней</span>
          </div>
        </div>
      </div>
      <div class="nb-calendar-preview" id="calPreview">
        <strong>Следующий запуск:</strong> <span id="calNextRun">-</span>
      </div>
      <div class="nb-modal-footer">
        <button class="btn nb-btn nb-btn-ghost" id="calCancel">Отмена</button>
        <button class="btn nb-btn nb-btn-primary" id="calApply">Применить</button>
      </div>
    `;

    const recurrenceEl = document.getElementById('calRecurrence');
    const cronRow = document.getElementById('calCronRow');
    const intervalRow = document.getElementById('calIntervalRow');
    const intervalLabel = document.getElementById('calIntervalLabel');

    recurrenceEl.addEventListener('change', () => {
      const val = recurrenceEl.value;
      cronRow.style.display = val === 'custom' ? '' : 'none';
      intervalRow.style.display = ['daily', 'weekly', 'monthly', 'yearly'].includes(val) ? '' : 'none';
      
      const labels = { daily: 'дней', weekly: 'недель', monthly: 'месяцев', yearly: 'лет' };
      intervalLabel.textContent = labels[val] || '';
      updateNextRun();
    });

    ['calStartDate', 'calStartTime', 'calInterval'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', updateNextRun);
    });

    function updateNextRun() {
      const rec = recurrenceEl.value;
      const date = document.getElementById('calStartDate')?.value;
      const time = document.getElementById('calStartTime')?.value || '09:00';
      const interval = parseInt(document.getElementById('calInterval')?.value) || 1;
      
      if (!date) return;
      
      let nextRun = '-';
      if (rec === 'once') {
        nextRun = `${date} в ${time}`;
      } else if (rec === 'custom') {
        const cron = document.getElementById('calCron')?.value || '0 9 * * *';
        nextRun = `Cron: ${cron}`;
      } else {
        const labels = { daily: 'каждый', weekly: 'каждую', monthly: 'каждый', yearly: 'каждый' };
        const units = { daily: 'день', weekly: 'неделю', monthly: 'месяц', yearly: 'год' };
        nextRun = `${labels[rec]} ${interval > 1 ? interval + ' ' + units[rec] : units[rec]} в ${time}`;
      }
      
      document.getElementById('calNextRun').textContent = nextRun;
    }

    document.getElementById('calCancel')?.addEventListener('click', () => {
      modal.hidden = true;
    });

    document.getElementById('calApply')?.addEventListener('click', () => {
      const rec = recurrenceEl.value;
      let cron = '';
      
      const time = document.getElementById('calStartTime')?.value || '09:00';
      const [hour, min] = time.split(':');
      const interval = parseInt(document.getElementById('calInterval')?.value) || 1;
      
      if (rec === 'custom') {
        cron = document.getElementById('calCron')?.value || '0 9 * * *';
      } else if (rec === 'once') {
        cron = '';
      } else if (rec === 'daily') {
        cron = interval === 1 ? `${min} ${hour} * * *` : `${min} ${hour} */${interval} * *`;
      } else if (rec === 'weekly') {
        cron = `${min} ${hour} * * ${interval === 1 ? '1' : `*/${interval}`}`;
      } else if (rec === 'monthly') {
        cron = `${min} ${hour} ${interval === 1 ? '1' : `*/${interval}`} * *`;
      } else if (rec === 'yearly') {
        cron = `${min} ${hour} 1 1 *`;
      }
      
      const cronInput = document.getElementById('wfCron');
      if (cronInput) cronInput.value = cron;
      
      modal.hidden = true;
      window.showToast('Расписание установлено: ' + (cron || 'один раз'), 'success');
    });

    modal.hidden = false;
    updateNextRun();
  }

  /* ── Palette ── */

  function renderPalette(catalog) {
    const list = document.getElementById('wfPalList');
    if (!list) return;

    list.innerHTML = catalog.map(g => `
      <div class="wf-pal-group nb-pal-group">
        <div class="wf-pal-group-title nb-pal-title">${esc(g.category)}</div>
        ${g.items.map(i => `
          <div class="wf-pal-item nb-pal-item" draggable="true"
               data-node='${esc(JSON.stringify({ type: i.type, label: i.label, icon: i.icon, params: i.params }))}'>
            <span class="wf-pal-icon">${i.icon}</span>
            <span class="wf-pal-label">${esc(i.label)}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    list.querySelectorAll('.wf-pal-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/aegisops-node', el.dataset.node);
      });
    });

    document.getElementById('wfSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      list.querySelectorAll('.wf-pal-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  /* ── Canvas init ── */

  function initCanvas(host) {
    try {
      _canvas = new window.WorkflowCanvas(host, {
        onChange: () => {},
        onOpenInspector: openInspector,
        onRunPreview: runCurrent,
      });

      if (_canvas.nodes.size === 0) {
        const t = _canvas.addNode({ type: 'trigger.schedule', label: 'Расписание', icon: '📅', 
          params: { start_date: new Date().toISOString().split('T')[0], start_time: '09:00', recurrence: 'daily' }, x: 50, y: 60 });
        const f = _canvas.addNode({ type: 'connector.database', label: 'Данные из БД', icon: '🗄️', 
          params: { connector_id: null, query: 'SELECT * FROM reports WHERE date = CURRENT_DATE' }, x: 300, y: 60 });
        const ml = _canvas.addNode({ type: 'ml.forecast', label: 'ML Прогноз', icon: '📊', 
          params: { model: 'ensemble', horizon: 30, metric: 'gas_balance' }, x: 550, y: 30 });
        const ai = _canvas.addNode({ type: 'ai.ask', label: 'AI Анализ', icon: '🤖', 
          params: { system: 'Ты аналитик.', prompt_template: 'Проанализируй: {{$input}}' }, x: 550, y: 150 });
        const out = _canvas.addNode({ type: 'output.pdf', label: 'PDF Отчёт', icon: '📑', 
          params: { template: 'report', format: 'A4' }, x: 820, y: 100 });
        _canvas.addEdge(t.id, f.id);
        _canvas.addEdge(f.id, ml.id);
        _canvas.addEdge(f.id, ai.id);
        _canvas.addEdge(ml.id, out.id);
        _canvas.addEdge(ai.id, out.id);
        setTimeout(() => _canvas.fit(), 50);
      }
    } catch (err) {
      console.error('[Planning] Canvas init error:', err);
      host.innerHTML = `<div class="nb-error"><p>Ошибка инициализации холста</p><p>${esc(err.message)}</p></div>`;
      if (window.showToast) window.showToast('Ошибка холста: ' + err.message, 'error');
    }
  }

  /* ── Actions ── */

  function wireActions() {
    document.getElementById('wfSaveBtn')?.addEventListener('click', saveWorkflow);
    document.getElementById('wfLoadBtn')?.addEventListener('click', loadWorkflow);
    document.getElementById('wfGuideBtn')?.addEventListener('click', () => { if (window.WorkflowGuide) window.WorkflowGuide.open(); });
    document.getElementById('wfCalendarBtn')?.addEventListener('click', showCalendarModal);
    document.getElementById('wfNewScenarioBtn')?.addEventListener('click', createNewScenario);
    document.getElementById('wfCalendarClose')?.addEventListener('click', () => {
      document.getElementById('wfCalendarModal').hidden = true;
    });
  }

  async function createNewScenario() {
    const name = prompt('Название нового сценария:', 'Новый сценарий');
    if (!name) return;

    try {
      const scen = await apiJson('/api/scenarios', {
        method: 'POST',
        body: JSON.stringify({
          name,
          category: 'operations',
          cron_expr: '',
          objective: '',
          delivery_channel: 'none',
        }),
      });
      _scenarios.push(scen);
      _selectedScenarioId = scen.id;
      renderScenariosList();
      window.showToast('Сценарий создан', 'success');
    } catch (err) {
      window.showToast('Ошибка: ' + err.message, 'error');
    }
  }

  async function saveWorkflow() {
    try {
      const name = document.getElementById('wfName')?.value || 'Без названия';
      const saved = await apiJson('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({
          id: _wfId,
          name,
          cron_expr: document.getElementById('wfCron')?.value || '',
          graph: _canvas.exportGraph(),
          enabled: true,
        }),
      });
      _wfId = saved.id;
      window.showToast('Сценарий сохранён', 'success');
    } catch (err) {
      window.showToast('Ошибка: ' + err.message, 'error');
    }
  }

  async function loadWorkflow() {
    try {
      const list = await apiJson('/api/workflows');
      if (!list.length) { window.showToast('Нет сохранённых сценариев', 'info'); return; }
      const id = prompt('ID сценария:\n' + list.map(w => w.id + '. ' + w.name).join('\n'));
      if (!id) return;
      const wf = await apiJson('/api/workflows/' + parseInt(id));
      _wfId = wf.id;
      document.getElementById('wfName').value = wf.name;
      const cronInput = document.getElementById('wfCron');
      if (cronInput) cronInput.value = wf.cron_expr || '';
      _canvas.importGraph(wf.graph);
      window.showToast('Сценарий загружен', 'success');
    } catch (err) {
      window.showToast('Ошибка загрузки: ' + err.message, 'error');
    }
  }

  async function runCurrent() {
    if (!_wfId) { window.showToast('Сначала сохраните сценарий', 'warning'); return; }
    window.showToast('Запускаем...', 'info');
    try {
      const res = await apiJson('/api/workflows/' + _wfId + '/run', { method: 'POST', body: JSON.stringify({}) });
      _canvas.highlightTrace(res.trace || []);
      const el = document.getElementById('wfTrace');
      if (el) el.hidden = false;
      const traceBody = document.getElementById('wfTraceBody');
      if (traceBody) {
        traceBody.innerHTML = (res.trace || []).map(t => `
          <div class="wf-trace-row nb-trace t-${t.status === 'ok' ? 'ok' : t.status === 'error' ? 'err' : 'skip'}">
            <span class="wf-trace-id">${esc(t.id)}</span>
            <span class="wf-trace-type">${esc(t.type)}</span>
            <span class="wf-trace-ms">${t.ms || 0} мс</span>
            ${t.error ? '<div class="wf-trace-err">' + esc(t.error) + '</div>' : ''}
            ${t.output_preview ? '<div class="wf-trace-out">' + esc(t.output_preview) + '</div>' : ''}
          </div>
        `).join('');
      }
      window.showToast('Выполнено', 'success');
    } catch (err) {
      window.showToast('Ошибка запуска: ' + err.message, 'error');
    }
  }

  /* ── Inspector ── */

  function openInspector(node) {
    const body = document.getElementById('wfInsBody');
    if (!body) return;

    const p = node.params || {};
    const t = node.type;
    const rows = [];

    const connOpts = _connectors.map(c =>
      `<option value="${c.id}"${String(p.connector_id) === String(c.id) ? ' selected' : ''}>${esc(c.name)} (${esc(c.type)})</option>`
    ).join('');
    
    const mcpOpts = _mcpServers.map(s =>
      `<option value="${esc(s.name)}"${p.server === s.name ? ' selected' : ''}>${esc(s.name)}</option>`
    ).join('');
    
    const modelOpts = ['prophet', 'arima', 'xgboost', 'ensemble'].map(m =>
      `<option value="${m}"${p.model === m ? ' selected' : ''}>${m}</option>`
    ).join('');
    
    const metricOpts = ['gas_balance', 'supply', 'demand', 'revenue', 'costs'].map(m =>
      `<option value="${m}"${p.metric === m ? ' selected' : ''}>${m}</option>`
    ).join('');

    function field(label, name, html) {
      return `<div class="nb-insp-field"><label>${esc(label)}</label>${html}</div>`;
    }
    function txt(name, val) {
      return `<input type="text" name="${name}" value="${esc(val || '')}" class="nb-input"/>`;
    }
    function num(name, val) {
      return `<input type="number" name="${name}" value="${val || ''}" class="nb-input"/>`;
    }
    function ta(name, val) {
      return `<textarea name="${name}" class="nb-textarea">${esc(val || '')}</textarea>`;
    }
    function sel(name, opts) {
      return `<select name="${name}" class="nb-select">${opts}</select>`;
    }

    // Show example response if available
    if (p.example_response) {
      rows.push(`<div class="nb-example-box"><strong>📄 Пример ответа:</strong><pre>${esc(typeof p.example_response === 'object' ? JSON.stringify(p.example_response, null, 2) : p.example_response)}</pre></div>`);
    }

    // Trigger params
    if (t === 'trigger.cron') rows.push(field('Cron', 'cron', txt('cron', p.cron)));
    if (t === 'trigger.webhook') {
      rows.push(field('Path', 'path', txt('path', p.path)));
      rows.push(field('Method', 'method', sel('method', '<option>POST</option><option>GET</option>')));
    }
    if (t === 'trigger.schedule') {
      rows.push(field('Дата', 'start_date', `<input type="date" name="start_date" value="${p.start_date || ''}" class="nb-input"/>`));
      rows.push(field('Время', 'start_time', `<input type="time" name="start_time" value="${p.start_time || '09:00'}" class="nb-input"/>`));
      rows.push(field('Повтор', 'recurrence', sel('recurrence', 
        '<option value="once"' + (p.recurrence === 'once' ? ' selected' : '') + '>Один раз</option>' +
        '<option value="daily"' + (p.recurrence === 'daily' ? ' selected' : '') + '>Ежедневно</option>' +
        '<option value="weekly"' + (p.recurrence === 'weekly' ? ' selected' : '') + '>Еженедельно</option>' +
        '<option value="monthly"' + (p.recurrence === 'monthly' ? ' selected' : '') + '>Ежемесячно</option>'
      )));
    }

    // Connector params
    if (t.startsWith('connector.') && !['connector.fetch', 'connector.write'].includes(t)) {
      rows.push(field('Коннектор', 'connector_id', sel('connector_id', '<option value="">-- выберите --</option>' + connOpts)));
    }
    if (t === 'connector.database') {
      rows.push(field('SQL запрос', 'query', ta('query', p.query)));
    }
    if (t === 'connector.onec') {
      rows.push(field('Сущность', 'entity', txt('entity', p.entity)));
      rows.push(field('Query (JSON)', 'query', ta('query', JSON.stringify(p.query || {}, null, 2))));
    }
    if (t === 'connector.telegram') {
      rows.push(field('Chat ID', 'chat_id', txt('chat_id', p.chat_id)));
      rows.push(field('Текст', 'text', ta('text', p.text)));
    }
    if (t === 'connector.email') {
      rows.push(field('Кому', 'to', txt('to', p.to)));
      rows.push(field('Тема', 'subject', txt('subject', p.subject)));
      rows.push(field('Текст', 'body', ta('body', p.body)));
    }
    if (t === 'connector.rest') {
      rows.push(field('Method', 'method', sel('method', '<option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>')));
      rows.push(field('Endpoint', 'endpoint', txt('endpoint', p.endpoint)));
    }
    if (t === 'connector.fetch') rows.push(field('Коннектор', 'connector_id', sel('connector_id', connOpts)));
    if (t === 'connector.write') {
      rows.push(field('Коннектор', 'connector_id', sel('connector_id', connOpts)));
      rows.push(field('Query (JSON)', 'query', ta('query', JSON.stringify(p.query || {}, null, 2))));
    }

    // Data params
    if (t.startsWith('data.')) rows.push(field('JS выражение', 'expression', ta('expression', p.expression || '$input')));

    // AI params
    if (t === 'ai.ask') {
      rows.push(field('System prompt', 'system', ta('system', p.system)));
      rows.push(field('Prompt шаблон', 'prompt_template', ta('prompt_template', p.prompt_template)));
      rows.push(field('Модель', 'model', txt('model', p.model || 'llama3')));
      rows.push(field('Temperature', 'temperature', num('temperature', p.temperature || 0.7)));
    }

    // MCP params
    if (t === 'mcp.call') {
      rows.push(field('MCP сервер', 'server', sel('server', mcpOpts)));
      rows.push(field('Tool', 'tool', txt('tool', p.tool)));
      rows.push(field('Args (JSON)', 'args', ta('args', JSON.stringify(p.args || {}, null, 2))));
    }

    // ML params
    if (t === 'ml.forecast') {
      rows.push(field('Модель', 'model', sel('model', modelOpts)));
      rows.push(field('Метрика', 'metric', sel('metric', metricOpts)));
      rows.push(field('Горизонт (дни)', 'horizon', num('horizon', p.horizon)));
    }
    if (t === 'ml.train') {
      rows.push(field('Тип модели', 'model_type', sel('model_type', modelOpts)));
      rows.push(field('Дней обучения', 'train_days', num('train_days', p.train_days)));
    }
    if (t === 'ml.anomaly') {
      rows.push(field('Чувствительность', 'sensitivity', sel('sensitivity', 
        '<option value="low"' + (p.sensitivity === 'low' ? ' selected' : '') + '>Низкая</option>' +
        '<option value="medium"' + (p.sensitivity === 'medium' ? ' selected' : '') + '>Средняя</option>' +
        '<option value="high"' + (p.sensitivity === 'high' ? ' selected' : '') + '>Высокая</option>'
      )));
    }

    // Analytics params
    if (t === 'analytics.risk') {
      rows.push(field('Горизонт (дни)', 'forecast_horizon', num('forecast_horizon', p.forecast_horizon)));
    }

    // Output params
    if (t === 'output.telegram') rows.push(field('Сообщение', 'text', ta('text', p.text)));
    if (t === 'output.webhook') {
      rows.push(field('URL', 'url', txt('url', p.url)));
      rows.push(field('Method', 'method', sel('method', '<option>POST</option><option>GET</option><option>PUT</option>')));
      rows.push(field('Body шаблон', 'body_template', ta('body_template', p.body_template)));
    }
    if (t === 'output.report') rows.push(field('HTML шаблон', 'template', ta('template', p.template)));
    if (t === 'output.pdf') {
      rows.push(field('Шаблон', 'template', txt('template', p.template)));
      rows.push(field('Формат', 'format', sel('format', 
        '<option value="A4"' + (p.format === 'A4' ? ' selected' : '') + '>A4</option>' +
        '<option value="A3"' + (p.format === 'A3' ? ' selected' : '') + '>A3</option>' +
        '<option value="Letter"' + (p.format === 'Letter' ? ' selected' : '') + '>Letter</option>'
      )));
    }
    if (t === 'output.email') {
      rows.push(field('Кому', 'to', txt('to', p.to)));
      rows.push(field('Тема', 'subject', txt('subject', p.subject)));
      rows.push(field('Текст', 'body', ta('body', p.body)));
    }
    if (t === 'output.alert') {
      rows.push(field('Уровень', 'level', sel('level', 
        '<option value="warning">Warning</option>' +
        '<option value="error">Error</option>' +
        '<option value="info">Info</option>'
      )));
      rows.push(field('Сообщение', 'message', ta('message', p.message)));
    }

    body.innerHTML = `
      <div class="nb-insp-node-hdr">
        <span class="nb-insp-icon">${node.icon || '⚙️'}</span>
        <strong>${esc(node.label)}</strong>
      </div>
      <div class="nb-insp-type">${esc(t)}</div>
      <div class="nb-insp-fields">${rows.join('')}</div>
      <button class="btn nb-btn nb-btn-primary nb-full-width" id="wfParamsApply">✓ Применить</button>
    `;

    document.getElementById('wfParamsApply')?.addEventListener('click', () => {
      const params = readParams(node);
      _canvas.updateNodeParams(node.id, params);
      window.showToast('Параметры сохранены', 'success');
    });
  }

  function readParams(node) {
    const body = document.getElementById('wfInsBody');
    const obj = { ...(node.params || {}) };
    body?.querySelectorAll('[name]').forEach(el => {
      let v = el.value;
      if (el.name === 'query' || el.name === 'args') { 
        try { v = JSON.parse(v || '{}'); } catch { /* keep string */ } 
      }
      if (['connector_id', 'pipeline_id', 'horizon', 'train_days', 'forecast_horizon', 'temperature', 'recurrence_interval'].includes(el.name)) {
        v = el.type === 'number' ? parseFloat(v) || null : parseInt(v) || null;
      }
      obj[el.name] = v;
    });
    return obj;
  }

  /* ── Cleanup ── */

  function destroy() {
    if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
    _canvas = null;
    _wfId = null;
    _selectedScenarioId = null;
  }

  /* ── Expose ── */
  window.renderPlanningPage = renderPlanningPage;
  window.destroyPlanningPage = destroy;
})();
