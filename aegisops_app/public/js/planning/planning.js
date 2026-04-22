/**
 * AegisOps Planning Page Controller v3 — full rewrite.
 *
 * Key changes from v2:
 *   - Canvas host is sized via JS ResizeObserver — no double-rAF hacks
 *   - Entire layout uses flex with explicit pixel sizing — no CSS grid height:100% issues
 *   - Integrated new node categories: ML Forecast, Risk Assessment, ETL, Scoring
 *   - Proper cleanup on page leave
 *   - All showToast calls use window.showToast (guaranteed by app.js)
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

  /* ── Full node catalog (server + new ML/ETL/Risk types) ── */

  const FULL_CATALOG = [
    { category: 'Триггеры', items: [
      { type: 'trigger.manual',  label: 'Ручной запуск',  icon: '▶️',  params: {} },
      { type: 'trigger.cron',    label: 'Cron',           icon: '⏰',  params: { cron: '0 9 * * *' } },
      { type: 'trigger.webhook', label: 'Webhook',        icon: '🌐',  params: { path: '/hook' } },
    ]},
    { category: 'Коннекторы', items: [
      { type: 'connector.fetch',  label: 'Запрос данных',  icon: '📥', params: { connector_id: null, query: {} } },
      { type: 'connector.write', label: 'Запись данных',  icon: '📤', params: { connector_id: null } },
    ]},
    { category: 'Данные', items: [
      { type: 'data.transform', label: 'JS выражение',    icon: '🔧', params: { expression: '$input' } },
      { type: 'data.filter',    label: 'Фильтр',         icon: '🔍', params: { expression: 'true' } },
      { type: 'data.merge',     label: 'Объединение',     icon: '🔗', params: {} },
    ]},
    { category: 'AI / MCP', items: [
      { type: 'ai.ask',          label: 'AI-запрос',       icon: '🤖', params: { system: '', prompt_template: '' } },
      { type: 'mcp.call',        label: 'MCP Tool',        icon: '🧩', params: { server: '', tool: '', args: {} } },
    ]},
    { category: 'ML Прогноз', items: [
      { type: 'ml.forecast',    label: 'Прогноз баланса', icon: '📊', params: { model: 'ensemble', horizon: 30, metric: 'gas_balance' } },
      { type: 'ml.train',       label: 'Обучение модели', icon: '🧠', params: { model_type: 'ensemble', train_days: 365 } },
    ]},
    { category: 'Аналитика', items: [
      { type: 'analytics.risk',  label: 'Оценка рисков',  icon: '🛡️', params: { forecast_horizon: 30 } },
      { type: 'analytics.score', label: 'Скоринг',         icon: '📋', params: {} },
    ]},
    { category: 'ETL', items: [
      { type: 'etl.pipeline',   label: 'ETL Пайплайн',    icon: '🔄', params: { pipeline_id: null } },
      { type: 'etl.aggregate',  label: 'Агрегация',       icon: '📈', params: { group_by: '', metrics: '' } },
    ]},
    { category: 'Вывод', items: [
      { type: 'output.telegram',  label: 'Telegram',       icon: '✈️', params: { text: '' } },
      { type: 'output.webhook',   label: 'Webhook POST',    icon: '🔔', params: { url: '', method: 'POST', body_template: '' } },
      { type: 'output.report',    label: 'HTML отчёт',      icon: '📄', params: { template: '' } },
      { type: 'output.alert',     label: 'Алерт / Уведомление', icon: '⚡', params: { level: 'warning', message: '' } },
    ]},
  ];

  /* ── State ── */

  let _canvas = null;
  let _wfId = null;
  let _connectors = [];
  let _mcpServers = [];
  let _resizeObserver = null;

  /* ── Page renderer ── */

  async function renderPlanningPage(container) {
    // Cleanup previous instance
    destroy();

    // Render HTML shell
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Планирование — Workflow Builder</h1>
          <p class="page-subtitle">Визуальный конструктор: Триггер → Данные → AI/ML → Вывод</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" id="wfGuideBtn">📘 Гид</button>
          <button class="btn btn-ghost" id="wfLoadBtn">📂 Открыть</button>
          <button class="btn btn-primary" id="wfSaveBtn">💾 Сохранить</button>
        </div>
      </div>
      <div class="wf-layout" id="wfLayout">
        <aside class="wf-palette" id="wfPalette">
          <div class="wf-palette-search"><input type="text" placeholder="Поиск нод..." id="wfSearch"/></div>
          <div class="wf-palette-list" id="wfPalList"></div>
        </aside>
        <section class="wf-canvas-area">
          <div class="wf-topbar">
            <input type="text" id="wfName" placeholder="Название workflow" value="Новый workflow"/>
            <input type="text" id="wfCron" placeholder="cron (0 9 * * *)" style="max-width:160px"/>
            <div class="wf-topbar-sep"></div>
          </div>
          <div class="wf-canvas-host" id="wfCanvasHost"></div>
        </section>
        <aside class="wf-inspector" id="wfInspector">
          <div class="wf-insp-head"><h3>Инспектор</h3></div>
          <div class="wf-insp-body" id="wfInsBody"><p style="color:#6b7fa3;font-size:12px">Двойной клик по ноде</p></div>
          <div class="wf-insp-trace" id="wfTrace" hidden>
            <h4>Трассировка</h4>
            <div id="wfTraceBody"></div>
          </div>
        </aside>
      </div>
      <div id="wfGuideOverlay" class="wf-guide-overlay" hidden></div>
    `;

    // Measure available space and set explicit pixel sizes
    const layout = document.getElementById('wfLayout');
    const headerH = container.querySelector('.page-header').offsetHeight;
    const availH = Math.max(500, window.innerHeight - headerH - 40);
    layout.style.height = availH + 'px';

    // Fetch catalog from server, merge with local definitions
    let catalog = FULL_CATALOG;
    try {
      const serverCat = await withTimeout(apiJson('/api/workflows/catalog'), 3000);
      if (Array.isArray(serverCat) && serverCat.length > 0) {
        // Merge: server types override local ones, keep extras
        const serverTypes = new Set(serverCat.flatMap(g => g.items.map(i => i.type)));
        const extras = FULL_CATALOG.map(g => ({
          ...g,
          items: g.items.filter(i => !serverTypes.has(i.type)),
        })).filter(g => g.items.length > 0);
        catalog = [...serverCat, ...extras];
      }
    } catch { /* use local catalog */ }

    // Fetch connectors & MCP for inspector dropdowns
    try { _connectors = await withTimeout(apiJson('/api/connectors'), 2000).catch(() => []); } catch { _connectors = []; }
    try {
      const r = await withTimeout(apiJson('/api/mcp/servers'), 2000).catch(() => ({ persisted: [] }));
      _mcpServers = r.persisted || [];
    } catch { _mcpServers = []; }

    // Render palette
    renderPalette(catalog);

    // Size canvas host using ResizeObserver (reliable cross-platform)
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

    // Initialize canvas (synchronously after sizing)
    initCanvas(canvasHost);

    // Wire buttons
    wireActions();
  }

  /* ── Palette ── */

  function renderPalette(catalog) {
    const list = document.getElementById('wfPalList');
    list.innerHTML = catalog.map(g => `
      <div class="wf-pal-group">
        <div class="wf-pal-group-title">${esc(g.category)}</div>
        ${g.items.map(i => `
          <div class="wf-pal-item" draggable="true"
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

    document.getElementById('wfSearch').addEventListener('input', (e) => {
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

      // Seed starter graph
      if (_canvas.nodes.size === 0) {
        const t = _canvas.addNode({ type: 'trigger.manual', label: 'Ручной запуск', icon: '▶️', x: 50, y: 60 });
        const f = _canvas.addNode({ type: 'connector.fetch', label: 'Данные из 1С', icon: '📥', params: { connector_id: null }, x: 300, y: 60 });
        const ml = _canvas.addNode({ type: 'ml.forecast', label: 'Прогноз баланса', icon: '📊', params: { model: 'ensemble', horizon: 30 }, x: 550, y: 30 });
        const r = _canvas.addNode({ type: 'analytics.risk', label: 'Оценка рисков', icon: '🛡️', params: { forecast_horizon: 30 }, x: 550, y: 180 });
        const out = _canvas.addNode({ type: 'output.report', label: 'HTML отчёт', icon: '📄', params: { template: '<h1>Сводка</h1><pre>{{$input}}</pre>' }, x: 820, y: 100 });
        _canvas.addEdge(t.id, f.id);
        _canvas.addEdge(f.id, ml.id);
        _canvas.addEdge(f.id, r.id);
        _canvas.addEdge(ml.id, out.id);
        _canvas.addEdge(r.id, out.id);
        setTimeout(() => _canvas.fit(), 50);
      }
    } catch (err) {
      console.error('[Planning] Canvas init error:', err);
      host.innerHTML = '<div style="padding:24px;text-align:center;color:#ff6a6a"><p style="font-size:16px">Ошибка инициализации холста</p><p style="font-size:12px;color:#6b7fa3;margin-top:6px">' + esc(err.message) + '</p></div>';
      if (window.showToast) window.showToast('Ошибка холста: ' + err.message, 'error');
    }
  }

  /* ── Actions ── */

  function wireActions() {
    document.getElementById('wfSaveBtn').onclick = saveWorkflow;
    document.getElementById('wfLoadBtn').onclick = loadWorkflow;
    document.getElementById('wfGuideBtn').onclick = () => { if (window.WorkflowGuide) window.WorkflowGuide.open(); };
  }

  async function saveWorkflow() {
    try {
      const saved = await apiJson('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({
          id: _wfId,
          name: document.getElementById('wfName').value,
          cron_expr: document.getElementById('wfCron').value,
          graph: _canvas.exportGraph(),
          enabled: true,
        }),
      });
      _wfId = saved.id;
      window.showToast('Workflow сохранён', 'success');
    } catch (err) {
      window.showToast('Ошибка: ' + err.message, 'error');
    }
  }

  async function loadWorkflow() {
    try {
      const list = await apiJson('/api/workflows');
      if (!list.length) { window.showToast('Нет сохранённых workflow', 'info'); return; }
      const id = prompt('ID workflow:\n' + list.map(w => w.id + '. ' + w.name).join('\n'));
      if (!id) return;
      const wf = await apiJson('/api/workflows/' + parseInt(id));
      _wfId = wf.id;
      document.getElementById('wfName').value = wf.name;
      document.getElementById('wfCron').value = wf.cron_expr || '';
      _canvas.importGraph(wf.graph);
      window.showToast('Workflow загружен', 'success');
    } catch (err) {
      window.showToast('Ошибка загрузки: ' + err.message, 'error');
    }
  }

  async function runCurrent() {
    if (!_wfId) { window.showToast('Сначала сохраните workflow', 'warning'); return; }
    window.showToast('Запускаем...', 'info');
    try {
      const res = await apiJson('/api/workflows/' + _wfId + '/run', { method: 'POST', body: JSON.stringify({}) });
      _canvas.highlightTrace(res.trace || []);
      const el = document.getElementById('wfTrace');
      el.hidden = false;
      document.getElementById('wfTraceBody').innerHTML = (res.trace || []).map(t => `
        <div class="wf-trace-row t-${t.status === 'ok' ? 'ok' : t.status === 'error' ? 'err' : 'skip'}">
          <span class="wf-trace-id">${esc(t.id)}</span>
          <span class="wf-trace-type">${esc(t.type)}</span>
          <span class="wf-trace-ms">${t.ms || 0} мс</span>
          ${t.error ? '<div class="wf-trace-err">' + esc(t.error) + '</div>' : ''}
          ${t.output_preview ? '<div class="wf-trace-out">' + esc(t.output_preview) + '</div>' : ''}
        </div>
      `).join('');
      window.showToast('Выполнено', 'success');
    } catch (err) {
      window.showToast('Ошибка запуска: ' + err.message, 'error');
    }
  }

  /* ── Inspector ── */

  function openInspector(node) {
    const body = document.getElementById('wfInsBody');
    const p = node.params || {};
    const t = node.type;
    const rows = [];

    const connOpts = _connectors.map(c =>
      '<option value="' + c.id + '"' + (String(p.connector_id) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + ' (' + esc(c.type) + ')</option>'
    ).join('');
    const mcpOpts = _mcpServers.map(s =>
      '<option value="' + esc(s.name) + '"' + (p.server === s.name ? ' selected' : '') + '>' + esc(s.name) + '</option>'
    ).join('');
    const modelOpts = ['prophet', 'arima', 'xgboost', 'ensemble'].map(m =>
      '<option value="' + m + '"' + (p.model === m ? ' selected' : '') + '>' + m + '</option>'
    ).join('');
    const metricOpts = ['gas_balance', 'supply', 'demand'].map(m =>
      '<option value="' + m + '"' + (p.metric === m ? ' selected' : '') + '>' + m + '</option>'
    ).join('');

    function field(label, name, html) {
      return '<div class="wf-insp-field"><label>' + esc(label) + '</label>' + html + '</div>';
    }
    function txt(name, val) {
      return '<input type="text" name="' + name + '" value="' + esc(val || '') + '"/>';
    }
    function ta(name, val) {
      return '<textarea name="' + name + '">' + esc(val || '') + '</textarea>';
    }
    function sel(name, opts) {
      return '<select name="' + name + '">' + opts + '</select>';
    }

    // Trigger params
    if (t === 'trigger.cron') rows.push(field('Cron', 'cron', txt('cron', p.cron)));
    if (t === 'trigger.webhook') rows.push(field('Path', 'path', txt('path', p.path)));

    // Connector params
    if (t.startsWith('connector.')) rows.push(field('Коннектор', 'connector_id', sel('connector_id', connOpts)));
    if (t === 'connector.fetch') rows.push(field('Query (JSON)', 'query', ta('query', JSON.stringify(p.query || {}, null, 2))));
    if (t === 'connector.write') rows.push(field('Query (JSON)', 'query', ta('query', JSON.stringify(p.query || {}, null, 2))));

    // Data params
    if (t.startsWith('data.')) rows.push(field('JS выражение', 'expression', ta('expression', p.expression || '$input')));

    // AI params
    if (t === 'ai.ask') {
      rows.push(field('System prompt', 'system', ta('system', p.system)));
      rows.push(field('Prompt шаблон', 'prompt_template', ta('prompt_template', p.prompt_template)));
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
      rows.push(field('Горизонт (дни)', 'horizon', txt('horizon', p.horizon)));
    }
    if (t === 'ml.train') {
      rows.push(field('Тип модели', 'model_type', sel('model_type', modelOpts)));
      rows.push(field('Дней обучения', 'train_days', txt('train_days', p.train_days)));
    }

    // Analytics params
    if (t === 'analytics.risk') {
      rows.push(field('Горизонт (дни)', 'forecast_horizon', txt('forecast_horizon', p.forecast_horizon)));
    }

    // ETL params
    if (t === 'etl.pipeline') rows.push(field('Pipeline ID', 'pipeline_id', txt('pipeline_id', p.pipeline_id)));
    if (t === 'etl.aggregate') {
      rows.push(field('Группировка', 'group_by', txt('group_by', p.group_by)));
      rows.push(field('Метрики', 'metrics', ta('metrics', p.metrics)));
    }

    // Output params
    if (t === 'output.telegram') rows.push(field('Сообщение', 'text', ta('text', p.text)));
    if (t === 'output.webhook') {
      rows.push(field('URL', 'url', txt('url', p.url)));
      rows.push(field('Method', 'method', sel('method', '<option>POST</option><option>GET</option><option>PUT</option>')));
      rows.push(field('Body шаблон', 'body_template', ta('body_template', p.body_template)));
    }
    if (t === 'output.report') rows.push(field('HTML шаблон', 'template', ta('template', p.template)));
    if (t === 'output.alert') {
      rows.push(field('Уровень', 'level', sel('level', '<option>warning</option><option>error</option><option>info</option>')));
      rows.push(field('Сообщение', 'message', ta('message', p.message)));
    }

    body.innerHTML =
      '<div class="wf-insp-node-hdr"><span>' + (node.icon || '⚙️') + '</span><strong>' + esc(node.label) + '</strong></div>' +
      '<div>' + rows.join('') + '</div>' +
      '<button class="btn btn-primary" id="wfParamsApply" style="width:100%;margin-top:6px">Применить</button>';

    document.getElementById('wfParamsApply').onclick = () => {
      const params = readParams(node);
      _canvas.updateNodeParams(node.id, params);
      window.showToast('Параметры сохранены', 'success');
    };
  }

  function readParams(node) {
    const body = document.getElementById('wfInsBody');
    const obj = { ...(node.params || {}) };
    body.querySelectorAll('[name]').forEach(el => {
      let v = el.value;
      if (el.name === 'query' || el.name === 'args') { try { v = JSON.parse(v || '{}'); } catch { /* keep string */ } }
      if (el.name === 'connector_id' || el.name === 'pipeline_id' || el.name === 'horizon' || el.name === 'train_days' || el.name === 'forecast_horizon') v = parseInt(v) || null;
      obj[el.name] = v;
    });
    return obj;
  }

  /* ── Cleanup ── */

  function destroy() {
    if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
    _canvas = null;
    _wfId = null;
  }

  /* ── Expose ── */
  window.renderPlanningPage = renderPlanningPage;
  window.destroyPlanningPage = destroy;
})();
