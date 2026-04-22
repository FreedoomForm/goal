/**
 * AegisOps — Interactive Guide for the Planning page v3.
 * Updated to match the new CSS class names.
 */
(function () {
  'use strict';

  const STEPS = [
    {
      title: 'Визуальный конструктор workflow',
      body: '<p>Эта вкладка — нода-редактор пайплайнов в стиле n8n.</p>' +
        '<ul><li><b>Триггер</b> — что запускает workflow</li>' +
        '<li><b>Коннекторы / Данные</b> — получение из 1С, SCADA, БД</li>' +
        '<li><b>AI / ML</b> — прогнозирование, скоринг, анализ</li>' +
        '<li><b>Вывод</b> — Telegram, Webhook, отчёт, алерт</li></ul>',
    },
    {
      title: 'Палитра нод',
      body: '<p>Слева — каталог нод. <b>Перетащите</b> на холст.</p>' +
        '<p>Поиск сверху для быстрого поиска.</p>',
      selector: '#wfPalette',
    },
    {
      title: 'Холст',
      body: '<ul><li>Перетаскивайте ноды мышью</li>' +
        '<li>Соединяйте: правую точку (выход) → левую точку (вход)</li>' +
        '<li>Колесо — зум, фон — панорамирование</li>' +
        '<li>Двойной клик по связи — удалить</li>' +
        '<li>Двойной клик по ноде — инспектор</li></ul>',
      selector: '.wf-canvas-area',
    },
    {
      title: 'Новые типы нод',
      body: '<ul><li><b>ML Прогноз</b> — Prophet/XGBoost/ARIMA прогноз баланса газа</li>' +
        '<li><b>Обучение модели</b> — обучить ML-модель на исторических данных</li>' +
        '<li><b>Оценка рисков</b> — комплексный риск-индекс системы</li>' +
        '<li><b>Скоринг</b> — оценка платежеспособности потребителей</li>' +
        '<li><b>ETL Пайплайн</b> — запуск ETL-конвейеров</li></ul>',
      selector: '#wfPalList',
    },
    {
      title: 'Инспектор',
      body: '<p>Справа — параметры выбранной ноды. Шаблоны используют <code>{{$input}}</code> — данные с предыдущей ноды.</p>',
      selector: '#wfInspector',
    },
    {
      title: 'Запуск',
      body: '<p>1. Сохраните workflow (💾)</p>' +
        '<p>2. Нажмите ▶ <b>Запустить</b></p>' +
        '<p>3. Трассировка появится в инспекторе — статус, время, результат каждой ноды.</p>',
      selector: '.wf-canvas-toolbar',
    },
  ];

  let _cur = 0;

  function render() {
    const overlay = document.getElementById('wfGuideOverlay');
    if (!overlay) return;
    const s = STEPS[_cur];
    overlay.innerHTML =
      '<div class="wf-guide-card">' +
        '<div class="wf-guide-progress">' + (_cur + 1) + ' / ' + STEPS.length + '</div>' +
        '<h2>' + s.title + '</h2>' +
        '<div class="wf-guide-body">' + s.body + '</div>' +
        '<div class="wf-guide-footer">' +
          '<button class="btn btn-ghost" id="wfgPrev"' + (_cur === 0 ? ' disabled' : '') + '>Назад</button>' +
          '<button class="btn btn-ghost" id="wfgClose">Закрыть</button>' +
          '<button class="btn btn-primary" id="wfgNext">' + (_cur === STEPS.length - 1 ? 'Готово' : 'Далее →') + '</button>' +
        '</div></div>';
    overlay.hidden = false;

    document.getElementById('wfgPrev').onclick = () => { if (_cur > 0) { _cur--; render(); } };
    document.getElementById('wfgNext').onclick = () => { if (_cur < STEPS.length - 1) { _cur++; render(); } else close(); };
    document.getElementById('wfgClose').onclick = close;
  }

  function open() { _cur = 0; render(); }
  function close() {
    const o = document.getElementById('wfGuideOverlay');
    if (o) o.hidden = true;
  }

  window.WorkflowGuide = { open, close };
})();
