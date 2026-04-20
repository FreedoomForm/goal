/**
 * AegisOps — Planning Page Controller.
 * Wires WorkflowCanvas to palette (from /api/workflows/catalog) and to
 * the save/load/run API. Shows trace results inline and offers guided help.
 */
(function () {
  'use strict';

  async function apiJson(path, opts = {}) {
    const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
    return r.json();
  }

  async function renderPlanningPage(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Планирование — Workflow Builder</h1>
          <p class="page-subtitle">n8n-подобный редактор: соберите пайплайн из нод «Триггер → Данные → AI/MCP → Вывод»</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" id="wfGuideBtn">📘 Гид</button>
          <button class="btn btn-ghost" id="wfLoadBtn">📂 Открыть</button>
          <button class="btn btn-primary" id="wfSaveBtn">💾 Сохранить</button>
        </div>
      </div>

      <div class="planning-wrap">
        <aside class="planning-palette" id="wfPalette">
          <div class="palette-search">
            <input type="text" placeholder="Поиск нод..." id="wfPaletteSearch"/>
          </div>
          <div class="palette-categories" id="wfPaletteList"></div>
        </aside>

        <section class="planning-canvas-container">
          <div class="wf-meta">
            <input type="text" id="wfName" placeholder="Название workflow" value="Новый workflow"/>
            <input type="text" id="wfCron" placeholder="cron (напр. 0 9 * * *)"/>
          </div>
          <div id="wfCanvas" class="wf-canvas-host"></div>
        </section>

        <aside class="planning-inspector" id="wfInspector">
          <h3>Инспектор</h3>
          <div id="wfInspectorBody"><p class="muted">Выберите ноду (двойной клик)</p></div>
          <div class="inspector-trace" id="wfTrace" hidden>
            <h4>Трассировка запуска</h4>
            <div id="wfTraceBody"></div>
          </div>
        </aside>
      </div>

      <div id="wfGuideOverlay" class="wf-guide-overlay" hidden></div>
    `;

    // Fetch catalog with robust fallback
    let catalog = [];
    try {
      catalog = await Promise.race([
        apiJson('/api/workflows/catalog'),
        new Promise((resolve) => setTimeout(() => resolve([]), 4000))
      ]);
    } catch (e) {
      catalog = [];
    }

    // Provide built-in catalog if server returned empty or error
    if (!Array.isArray(catalog) || catalog.length === 0) {
      catalog = [
        { category: 'Триггеры', items: [
          { type: 'trigger.manual', label: 'Ручной запуск', icon: '▶️', params: {} },
          { type: 'trigger.cron', label: 'Cron распис.', icon: '⏰', params: { cron: '0 9 * * *' } },
          { type: 'trigger.webhook', label: 'Webhook', icon: '🌐', params: { path: '/hook' } },
        ]},
        { category: 'Коннекторы', items: [
          { type: 'connector.fetch', label: 'Запрос данных', icon: '📥', params: { connector_id: null, query: {} } },
          { type: 'connector.write', label: 'Запись данных', icon: '📤', params: { connector_id: null } },
        ]},
        { category: 'Данные', items: [
          { type: 'data.transform', label: 'JS выражение', icon: '🔧', params: { expression: '$input' } },
          { type: 'data.filter', label: 'Фильтр', icon: '🔍', params: { expression: 'true' } },
          { type: 'data.merge', label: 'Объединение', icon: '🔗', params: {} },
        ]},
        { category: 'AI / MCP', items: [
          { type: 'ai.ask', label: 'AI-запрос', icon: '🤖', params: { system: '', prompt_template: '' } },
          { type: 'mcp.call', label: 'MCP Tool', icon: '🧩', params: { server: '', tool: '', args: {} } },
        ]},
        { category: 'Вывод', items: [
          { type: 'output.telegram', label: 'Telegram', icon: '✈️', params: { text: '' } },
          { type: 'output.webhook', label: 'Webhook POST', icon: '🔔', params: { url: '', method: 'POST', body_template: '' } },
          { type: 'output.report', label: 'HTML отчёт', icon: '📄', params: { template: '' } },
        ]},
      ];
    }
    const paletteList = document.getElementById('wfPaletteList');
    paletteList.innerHTML = catalog.map(group => `
      <div class="palette-group">
        <div class="palette-group-title">${group.category}</div>
        ${group.items.map(item => `
          <div class="palette-item" draggable="true"
               data-node='${JSON.stringify({ type: item.type, label: item.label, icon: item.icon, params: item.params }).replace(/'/g, '&#39;')}'>
            <span class="palette-icon">${item.icon}</span>
            <span class="palette-label">${item.label}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
    paletteList.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('application/aegisops-node', el.dataset.node);
      });
    });
    document.getElementById('wfPaletteSearch').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      paletteList.querySelectorAll('.palette-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // Fetch connectors & MCP servers for inspector enums (with timeout + fallback)
    let connectors = [];
    let mcpServers = [];
    try {
      connectors = await Promise.race([apiJson('/api/connectors'), new Promise(r => setTimeout(() => r([]), 3000))]).catch(() => []);
    } catch { connectors = []; }
    try {
      const mcpRes = await Promise.race([apiJson('/api/mcp/servers'), new Promise(r => setTimeout(() => r({ persisted: [] }), 3000))]).catch(() => ({ persisted: [] }));
      mcpServers = mcpRes.persisted || [];
    } catch { mcpServers = []; }

    const canvas = new window.WorkflowCanvas(document.getElementById('wfCanvas'), {
      onChange: () => { /* autosave hook could go here */ },
      onOpenInspector: node => openInspector(node),
      onRunPreview: () => runCurrent(),
    });

    // Inspector
    function openInspector(node) {
      const body = document.getElementById('wfInspectorBody');
      const fields = inspectorFieldsFor(node);
      body.innerHTML = `
        <div class="inspector-node-header">
          <span>${node.icon || '⚙️'}</span>
          <strong>${escapeHtml(node.label)}</strong>
        </div>
        <div class="inspector-fields">${fields}</div>
        <button class="btn btn-primary" id="wfParamsSave">Применить</button>
      `;
      document.getElementById('wfParamsSave').onclick = () => {
        const params = readInspectorValues(node);
        canvas.updateNodeParams(node.id, params);
        window.showToast?.('Параметры ноды сохранены', 'success');
      };
    }

    function inspectorFieldsFor(node) {
      const p = node.params || {};
      const t = node.type;
      const rows = [];
      const connOpts = connectors.map(c => `<option value="${c.id}" ${String(p.connector_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)} (${c.type})</option>`).join('');
      const mcpOpts = mcpServers.map(s => `<option value="${s.name}" ${p.server === s.name ? 'selected' : ''}>${escapeHtml(s.name)} (${s.preset})</option>`).join('');

      if (t === 'trigger.cron') rows.push(row('Cron', 'cron', `<input name="cron" value="${escapeHtml(p.cron || '0 9 * * *')}"/>`));
      if (t.startsWith('connector.')) rows.push(row('Коннектор', 'connector_id', `<select name="connector_id">${connOpts}</select>`));
      if (t === 'connector.fetch') rows.push(row('Query (JSON)', 'query', `<textarea name="query">${escapeHtml(JSON.stringify(p.query || {}, null, 2))}</textarea>`));
      if (t === 'ai.ask') {
        rows.push(row('System prompt', 'system', `<textarea name="system">${escapeHtml(p.system || '')}</textarea>`));
        rows.push(row('User prompt (шаблон)', 'prompt_template', `<textarea name="prompt_template">${escapeHtml(p.prompt_template || '')}</textarea>`));
      }
      if (t === 'mcp.call') {
        rows.push(row('MCP сервер', 'server', `<select name="server">${mcpOpts}</select>`));
        rows.push(row('Tool', 'tool', `<input name="tool" value="${escapeHtml(p.tool || '')}"/>`));
        rows.push(row('Args (JSON)', 'args', `<textarea name="args">${escapeHtml(JSON.stringify(p.args || {}, null, 2))}</textarea>`));
      }
      if (t.startsWith('data.')) rows.push(row('JS выражение', 'expression', `<textarea name="expression">${escapeHtml(p.expression || '$input')}</textarea>`));
      if (t === 'output.telegram') rows.push(row('Сообщение', 'text', `<textarea name="text">${escapeHtml(p.text || '')}</textarea>`));
      if (t === 'output.webhook') {
        rows.push(row('URL', 'url', `<input name="url" value="${escapeHtml(p.url || '')}"/>`));
        rows.push(row('Method', 'method', `<select name="method"><option>POST</option><option>GET</option><option>PUT</option></select>`));
        rows.push(row('Body template', 'body_template', `<textarea name="body_template">${escapeHtml(p.body_template || '')}</textarea>`));
      }
      if (t === 'output.report') rows.push(row('HTML шаблон', 'template', `<textarea name="template">${escapeHtml(p.template || '')}</textarea>`));
      return rows.join('');
    }
    function row(label, name, control) {
      return `<label class="inspector-row"><span>${label}</span>${control}</label>`;
    }
    function readInspectorValues(node) {
      const body = document.getElementById('wfInspectorBody');
      const obj = { ...(node.params || {}) };
      body.querySelectorAll('[name]').forEach(el => {
        const k = el.name;
        let v = el.value;
        if (k === 'query' || k === 'args') { try { v = JSON.parse(v || '{}'); } catch { /* ignore */ } }
        if (k === 'connector_id') v = parseInt(v) || null;
        obj[k] = v;
      });
      return obj;
    }

    /* Actions */
    let currentId = null;
    document.getElementById('wfSaveBtn').onclick = async () => {
      try {
        const saved = await apiJson('/api/workflows', {
          method: 'POST',
          body: JSON.stringify({
            id: currentId,
            name: document.getElementById('wfName').value,
            cron_expr: document.getElementById('wfCron').value,
            graph: canvas.exportGraph(),
            enabled: true,
          }),
        });
        currentId = saved.id;
        window.showToast?.('Workflow сохранён', 'success');
      } catch (err) { window.showToast?.('Ошибка: ' + err.message, 'error'); }
    };

    document.getElementById('wfLoadBtn').onclick = async () => {
      const list = await apiJson('/api/workflows');
      if (!list.length) return window.showToast?.('Нет сохранённых workflow', 'info');
      const id = prompt('ID workflow:\n' + list.map(w => `${w.id}. ${w.name}`).join('\n'));
      if (!id) return;
      const wf = await apiJson('/api/workflows/' + parseInt(id));
      currentId = wf.id;
      document.getElementById('wfName').value = wf.name;
      document.getElementById('wfCron').value = wf.cron_expr || '';
      canvas.importGraph(wf.graph);
    };

    async function runCurrent() {
      if (!currentId) {
        window.showToast?.('Сначала сохраните workflow', 'warning');
        return;
      }
      window.showToast?.('Запускаем...', 'info');
      try {
        const res = await apiJson('/api/workflows/' + currentId + '/run', { method: 'POST', body: JSON.stringify({}) });
        canvas.highlightTrace(res.trace);
        const el = document.getElementById('wfTrace');
        el.hidden = false;
        document.getElementById('wfTraceBody').innerHTML = res.trace.map(t => `
          <div class="trace-row trace-${t.status}">
            <span class="trace-id">${t.id}</span>
            <span class="trace-type">${t.type}</span>
            <span class="trace-status">${t.status}</span>
            <span class="trace-ms">${t.ms} мс</span>
            ${t.error ? `<div class="trace-error-msg">${escapeHtml(t.error)}</div>` : ''}
            ${t.output_preview ? `<pre class="trace-preview">${escapeHtml(t.output_preview)}</pre>` : ''}
          </div>
        `).join('');
        window.showToast?.('Готово', 'success');
      } catch (err) { window.showToast?.('Ошибка: ' + err.message, 'error'); }
    }

    // Guide
    document.getElementById('wfGuideBtn').onclick = () => window.WorkflowGuide.open();

    // Seed starter graph if empty
    if (canvas.nodes.size === 0) {
      const trigger = canvas.addNode({ type: 'trigger.manual', label: 'Ручной запуск', icon: '▶️', x: 60, y: 80 });
      const ai = canvas.addNode({ type: 'ai.ask', label: 'AI-запрос', icon: '🤖', params: { prompt_template: 'Сформируй ежедневную сводку по газовому балансу', system: 'Ты enterprise аналитик.' }, x: 340, y: 80 });
      const out = canvas.addNode({ type: 'output.report', label: 'HTML отчёт', icon: '📄', params: { template: '<h1>Сводка</h1><pre>{{$input.content}}</pre>' }, x: 620, y: 80 });
      canvas.addEdge(trigger.id, ai.id);
      canvas.addEdge(ai.id, out.id);
      canvas.fit();
    }
  }

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }

  window.renderPlanningPage = renderPlanningPage;
})();
