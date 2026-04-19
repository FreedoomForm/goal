/**
 * AegisOps — Interactive Guide for the Planning page.
 * Step-by-step onboarding overlay that explains how the node-based
 * workflow editor works, what each node type does, and how to publish
 * a workflow that works on both desktop and the Android app.
 */
(function () {
  'use strict';

  const STEPS = [
    {
      title: '👋 Добро пожаловать в Workflow Builder',
      body: `
        <p>Эта вкладка — <b>визуальный конструктор сценариев</b> в духе n8n.</p>
        <p>Сценарий = граф нод:</p>
        <ul>
          <li><b>Триггер</b> — что запускает workflow (ручной старт, cron, webhook)</li>
          <li><b>Данные / Коннекторы</b> — получают информацию из 1С, SAP, SCADA, БД</li>
          <li><b>AI / MCP</b> — анализируют данные через Ollama или вызывают инструменты через Model Context Protocol</li>
          <li><b>Вывод</b> — отправляют результат в Telegram, Webhook или сохраняют отчёт</li>
        </ul>
      `,
      selector: '.planning-wrap',
    },
    {
      title: '🧩 Палитра нод',
      body: `
        <p>Слева — каталог доступных нод. Просто <b>перетащите</b> нужную ноду на холст.</p>
        <p>Поиск сверху помогает быстро найти ноду по названию.</p>
      `,
      selector: '#wfPalette',
    },
    {
      title: '🎨 Холст',
      body: `
        <p>Центральная область — редактор графа:</p>
        <ul>
          <li>Перетаскивайте ноды мышью</li>
          <li>Соединяйте их: удерживайте <b>правую точку</b> одной ноды и отпустите на <b>левой точке</b> другой</li>
          <li>Колесо мыши — зум, перетаскивание фона — панорамирование</li>
          <li>Двойной клик по связи — удалить её</li>
          <li>Двойной клик по ноде — открыть Инспектор</li>
        </ul>
      `,
      selector: '.planning-canvas-container',
    },
    {
      title: '⚙️ Инспектор',
      body: `
        <p>Справа — инспектор параметров выбранной ноды. Там вы настраиваете, например:</p>
        <ul>
          <li>Какой коннектор использует нода <code>connector.fetch</code></li>
          <li>Какой промпт отправляется в <code>ai.ask</code></li>
          <li>К какому серверу MCP обращается <code>mcp.call</code> и какой tool вызвать</li>
        </ul>
        <p>В шаблонах можно использовать выражения <code>{{$input}}</code>, <code>{{$input.content}}</code> — это данные, пришедшие с предыдущей ноды.</p>
      `,
      selector: '#wfInspector',
    },
    {
      title: '🧩 Интеграция с OpenClaw MCP',
      body: `
        <p>AegisOps подключается к реальным <b>MCP-серверам</b> через stdio (OpenClaw-совместимо):</p>
        <ul>
          <li>Регистрируйте MCP-сервер в настройках → «MCP серверы»</li>
          <li>Выберите preset: <code>filesystem</code>, <code>github</code>, <code>shell</code>, <code>postgres</code> или custom</li>
          <li>Нода <b>mcp.call</b> позволяет вызывать любой tool, опубликованный сервером</li>
        </ul>
        <p>Это тот же протокол, что использует Claude Desktop / Claw — ни компромиссов, ни симуляций.</p>
      `,
      selector: '#wfPalette',
    },
    {
      title: '📱 Связка с Android APK',
      body: `
        <p>После сохранения workflow вы сможете запускать его с мобильного:</p>
        <ol>
          <li>На ПК откройте <b>Настройки → Удалённый доступ</b> и нажмите «Запустить туннель (Cloudflare)»</li>
          <li>Нажмите «Создать код сопряжения» — получите 6-значный код и QR-код</li>
          <li>В APK отсканируйте QR или введите код — приложение получит API-ключ и адрес сервера</li>
          <li>Все вкладки (Dashboard, Сценарии, Планирование) работают удалённо, используя ваш ПК как backend</li>
        </ol>
      `,
      selector: '.planning-canvas-container',
    },
    {
      title: '▶️ Запуск и трассировка',
      body: `
        <p>Нажмите <b>▶ Запустить</b> в верхней панели. Движок выполнит граф в топологическом порядке.</p>
        <p>Справа появится <b>Трассировка</b> — статус каждой ноды (ok / error / filtered), время выполнения и превью результата.</p>
        <p>Ноды подсвечиваются зелёным, жёлтым или красным прямо на холсте.</p>
      `,
      selector: '.planning-canvas-container',
    },
  ];

  let current = 0;

  function highlight(selector) {
    document.querySelectorAll('.wf-guide-highlight').forEach(el => el.classList.remove('wf-guide-highlight'));
    if (!selector) return;
    const el = document.querySelector(selector);
    if (el) { el.classList.add('wf-guide-highlight'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  function render() {
    const overlay = document.getElementById('wfGuideOverlay');
    const step = STEPS[current];
    overlay.innerHTML = `
      <div class="wf-guide-card">
        <div class="wf-guide-progress">${current + 1} / ${STEPS.length}</div>
        <h2>${step.title}</h2>
        <div class="wf-guide-body">${step.body}</div>
        <div class="wf-guide-footer">
          <button class="btn btn-ghost" id="wfGuidePrev" ${current === 0 ? 'disabled' : ''}>Назад</button>
          <button class="btn btn-ghost" id="wfGuideClose">Закрыть</button>
          <button class="btn btn-primary" id="wfGuideNext">${current === STEPS.length - 1 ? 'Готово' : 'Далее →'}</button>
        </div>
      </div>
    `;
    overlay.hidden = false;
    highlight(step.selector);
    document.getElementById('wfGuidePrev').onclick = () => { if (current > 0) { current--; render(); } };
    document.getElementById('wfGuideNext').onclick = () => {
      if (current < STEPS.length - 1) { current++; render(); }
      else close();
    };
    document.getElementById('wfGuideClose').onclick = close;
  }

  function open() { current = 0; render(); }
  function close() {
    const overlay = document.getElementById('wfGuideOverlay');
    if (overlay) overlay.hidden = true;
    document.querySelectorAll('.wf-guide-highlight').forEach(el => el.classList.remove('wf-guide-highlight'));
  }

  window.WorkflowGuide = { open, close };

  // Auto-open on first visit
  document.addEventListener('DOMContentLoaded', () => {
    // Triggered by renderPlanningPage; here we just ensure the overlay exists.
  });
})();
