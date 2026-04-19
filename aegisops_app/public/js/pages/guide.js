/**
 * AegisOps — Connectors Guide Page
 * Интерактивное руководство по коннекторам с вкладками, поиском и пошаговыми инструкциями
 */

/* ══════════════ Guide Data ══════════════ */
const GUIDE_SECTIONS = [
  {
    id: 'overview',
    icon: '📖',
    title: 'Что такое коннекторы',
    content: `
      <p><strong>Коннекторы</strong> — это программные модули-«мосты» между AegisOps и внешними информационными системами (1С, SAP, SCADA, Telegram, базы данных и т.д.). Каждый коннектор инкапсулирует всю логику взаимодействия с конкретным типом системы: знает, как подключиться, как передать данные, как получить ответ и как обработать ошибки.</p>
      <p><strong>Аналогия:</strong> Представьте AegisOps как умного диспетчера на центральном пульте газовой компании. Коннекторы — это телефонные линии и радиоканалы к каждому подразделению. Диспетчеру не нужно знать, как работает каждое подразделение изнутри — он просто использует нужную линию связи.</p>
      <p><strong>Зачем нужны коннекторы:</strong> Без них каждый модуль AegisOps должен был бы самостоятельно реализовывать аутентификацию, обработку ошибок, таймауты и форматирование запросов. Коннекторы выносят эту логику в общий слой: модули просто вызывают <code>connector.fetchData()</code>, а коннектор сам заботится о деталях.</p>
    `
  },
  {
    id: 'architecture',
    icon: '🏗️',
    title: 'Архитектура',
    content: `
      <div class="guide-arch">
        <pre class="guide-diagram">
┌───────────────────────────────────────────────────┐
│                 AegisOps AI Platform               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Сценарии  │ │ AI Чат   │ │ Модули   │           │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘           │
│        └─────────────┼───────────┘                  │
│              ┌───────▼───────┐                      │
│              │  Connector    │                      │
│              │  Registry     │                      │
│              └───────┬───────┘                      │
│         ┌────────────┼────────────┐                 │
│         │    BaseConnector        │                 │
└─────────┼────────────┼────────────┼─────────────────┘
   ┌──────┴────┐  ┌────┴─────┐  ┌───┴──────┐
   │  Ollama   │  │ 1C/SAP   │  │ SCADA    │  ...
   │  LLM      │  │ OData    │  │ OPC UA   │
   └───────────┘  └──────────┘  └──────────┘</pre>
        <p>Все 10 коннекторов наследуются от <code>BaseConnector</code>, который предоставляет методы <code>testConnection()</code>, <code>fetchData()</code>, <code>pushData()</code>, <code>discoverSchema()</code>, <code>getAuthHeaders()</code> и <code>safeFetch()</code>. Connector Registry создаёт нужный экземпляр по строковому типу.</p>
      </div>
    `
  },
  {
    id: 'lifecycle',
    icon: '🔄',
    title: 'Жизненный цикл',
    content: `
      <div class="guide-steps">
        <div class="guide-step">
          <div class="guide-step-num">1</div>
          <div class="guide-step-content">
            <strong>Создание</strong>
            <p>Пользователь добавляет коннектор через UI → Конфигурация сохраняется в SQLite → Коннектор НЕ создан в памяти до первого запроса.</p>
          </div>
        </div>
        <div class="guide-step">
          <div class="guide-step-num">2</div>
          <div class="guide-step-content">
            <strong>Инстанциация</strong>
            <p>При запросе (тест/данные/сценарий) → Registry читает конфиг из БД → Создаёт экземпляр: <code>new OllamaConnector(cfg)</code> → Вызывает нужный метод.</p>
          </div>
        </div>
        <div class="guide-step">
          <div class="guide-step-num">3</div>
          <div class="guide-step-content">
            <strong>Выполнение запроса</strong>
            <p><code>getAuthHeaders()</code> формирует заголовки → <code>safeFetch()</code> выполняет HTTP-запрос с AbortController таймаутом → При ошибке возвращается структура с <code>status:'offline'</code> и <code>suggestion</code>.</p>
          </div>
        </div>
        <div class="guide-step">
          <div class="guide-step-num">4</div>
          <div class="guide-step-content">
            <strong>Возврат результата</strong>
            <p>Стандартный формат: <code>{ status, data?, error?, suggestion? }</code>. UI отображает результат или AI использует данные для анализа.</p>
          </div>
        </div>
      </div>
    `
  },
  {
    id: 'errors',
    icon: '⚠️',
    title: 'Обработка ошибок',
    content: `
      <p>Каждый коннектор <strong>не выбрасывает исключения</strong> при ошибке подключения. Вместо этого он возвращает структурированный ответ с рекомендацией:</p>
      <div class="guide-code-group">
        <div class="guide-code-item">
          <div class="guide-code-label">Успех</div>
          <pre class="guide-code">{
  "status": "online",
  "data": { ... },
  "vendor": "cometa"
}</pre>
        </div>
        <div class="guide-code-item">
          <div class="guide-code-label">Ошибка подключения</div>
          <pre class="guide-code">{
  "status": "offline",
  "error": "Connection refused",
  "suggestion": "Убедитесь что Ollama запущена: ollama serve"
}</pre>
        </div>
      </div>
      <p>Это позволяет AI-движку продолжать работу даже когда часть систем недоступна. Если SCADA-сервер перезагружается, AI использует fallback-анализ на основе данных из других источников.</p>
    `
  }
];

const CONNECTOR_GUIDES = [
  {
    id: 'ollama',
    icon: '🤖',
    title: 'Ollama (LLM)',
    type: 'ollama',
    color: '#7c5cff',
    what: 'Подключается к локальному серверу Ollama для генерации текста, анализа данных и ответов на вопросы. Это «мозг» всей AI-платформы.',
    tasks: [
      'Генерация аналитических отчётов по газовому балансу',
      'Ответы на вопросы в AI-ассистенте',
      'Анализ рисков и прогнозирование потребления',
      'Векторизация текста для семантического поиска'
    ],
    prerequisites: [
      'Ollama установлена и запущена (ollama serve)',
      'Хотя бы одна модель скачана (рекомендация: qwen2.5:7b-instruct, 4.4 ГБ)',
      'Ollama работает на http://127.0.0.1:11434'
    ],
    setup: [
      'Откройте раздел «AI Движок»',
      'Нажмите «Запустить всё автоматически»',
      'Или добавьте коннектор вручную: Тип=ollama, URL=http://127.0.0.1:11434, Auth=none'
    ],
    methods: [
      { name: 'chat(messages, model)', desc: 'Генерация ответа в формате чата' },
      { name: 'embed(text, model)', desc: 'Векторные представления текста' },
      { name: 'listModels()', desc: 'Список установленных моделей' },
      { name: 'showModel(name)', desc: 'Информация о модели' }
    ],
    example: `// AI Ассистент вызывает:
OllamaConnector.chat({
  model: 'qwen2.5:7b-instruct',
  messages: [
    { role: 'system', content: 'Ты аналитик газовой компании...' },
    { role: 'user', content: 'Сформируй отчёт по балансу' }
  ]
})
→ POST http://127.0.0.1:11434/api/chat`
  },
  {
    id: 'onec',
    icon: '📦',
    title: '1С:Предприятие (OData)',
    type: 'one_c_odata',
    color: '#ff8c42',
    what: 'Подключается к 1С через стандартный OData-интерфейс. Читает справочники, документы, регистры — все опубликованные данные.',
    tasks: [
      'Выгрузка данных по потреблению газа из 1С:Бухгалтерия',
      'Чтение справочников (Контрагенты, Номенклатура)',
      'Получение документов реализации и поступления',
      'Автоматическое обнаружение схемы через $metadata'
    ],
    prerequisites: [
      '1С:Предприятие 8.3.6+ с опубликованным OData HTTP-сервисом',
      'URL публикации (например: http://1c-server/erp/odata/standard.odata)',
      'Логин/пароль с правами на OData'
    ],
    setup: [
      'В 1С: Администрирование → Публикация → OData → выбрать объекты',
      'В AegisOps: Тип=one_c_odata, Auth=basic',
      'Auth Payload: {"login":"Администратор","password":"***"}'
    ],
    methods: [
      { name: 'fetchData({entity, $filter, $select})', desc: 'Чтение сущностей с фильтрацией' },
      { name: 'discoverSchema()', desc: 'Обнаружение структуры через $metadata' },
      { name: 'pushData({entity, data})', desc: 'Создание/обновление записей' }
    ],
    example: `ODataConnector.fetchData({
  entity: 'Document_РеализацияТоваровУслуг',
  $filter: "Date ge datetime'2025-01-01'",
  $select: 'Ref,Date,СуммаДокумента',
  $top: 1000
})
→ GET http://1c-server/erp/odata/standard.odata/Document_РеализацияТоваровУслуг?$filter=...`
  },
  {
    id: 'sap',
    icon: '🏢',
    title: 'SAP S/4HANA (OData)',
    type: 'sap_odata',
    color: '#4285f4',
    what: 'Подключается к SAP через OData API. Читает заказы, инвойсы, финансы и данные о материалах.',
    tasks: [
      'Синхронизация заказов и поставок',
      'Получение финансовых данных для модуля «Финансы»',
      'Анализ дебиторской/кредиторской задолженности',
      'Мониторинг статусов заказов'
    ],
    prerequisites: [
      'SAP S/4HANA или SAP ECC с активированным OData сервисом',
      'URL сервиса (например: https://sap:443/sap/opu/odata/sap/API_SALES_ORDER_SRV/)',
      'SAP Username + Password, SAP Client'
    ],
    setup: [
      'В SAP: активируйте OData через /IWFND/MAINT_SERVICE',
      'В AegisOps: Тип=sap_odata, Auth=basic',
      'Config: {"sap-client": "100"}'
    ],
    methods: [
      { name: 'fetchData({entitySet, $filter})', desc: 'Чтение бизнес-данных' },
      { name: 'pushData({entitySet, data})', desc: 'Создание/обновление с CSRF-токеном' },
      { name: 'discoverSchema()', desc: 'Обнаружение через $metadata' }
    ],
    example: `ODataConnector.fetchData({
  entitySet: 'A_SalesOrder',
  $filter: "SalesOrderType eq 'OR'",
  $top: 100
})
→ GET https://sap:443/.../A_SalesOrder?$filter=...`
  },
  {
    id: 'opcua',
    icon: '🏭',
    title: 'SCADA / OPC UA',
    type: 'opc_ua',
    color: '#23c483',
    what: 'Подключается к SCADA-системам через OPC UA. Читает показания датчиков: давление, температура, расход газа.',
    tasks: [
      'Мониторинг давления и температуры на ГРС',
      'Чтение расхода газа с кориолисовых расходомеров',
      'Контроль уровня в резервуарах',
      'AI-обнаружение аномалий в показаниях'
    ],
    prerequisites: [
      'OPC UA сервер (WinCC OA, Ignition, Genesis64, zenon)',
      'Endpoint URL (например: opc.tcp://scada-server:4840)',
      'Сетевая доступность порта 4840'
    ],
    setup: [
      'Убедитесь что OPC UA сервер запущен',
      'В AegisOps: Тип=opc_ua, URL=opc.tcp://192.168.1.100:4840',
      'Auth Mode: none (или basic при включённой аутентификации)'
    ],
    methods: [
      { name: 'fetchData({nodeIds})', desc: 'Чтение значений узлов OPC UA' },
      { name: 'discoverSchema()', desc: 'Обзор адресного пространства (browse)' },
      { name: 'pushData({nodeId, value})', desc: 'Запись значений (setpoint)' }
    ],
    example: `OpcUaConnector.fetchData({
  nodeIds: [
    'ns=2;s=GasPipeline.Pressure',
    'ns=2;s=GasPipeline.Temperature',
    'ns=2;s=GasPipeline.FlowRate'
  ]
})
→ { Pressure: 2.4, Temperature: 18.5, FlowRate: 1250 }`
  },
  {
    id: 'telegram',
    icon: '✈️',
    title: 'Telegram Bot',
    type: 'telegram',
    color: '#0088cc',
    what: 'Отправляет сообщения, документы и уведомления в Telegram. Основной канал доставки отчётов и оповещений.',
    tasks: [
      'Отправка ежедневных отчётов по газовому балансу',
      'Экстренные оповещения при аномалиях давления',
      'Отправка PDF/Excel документов с аналитикой',
      'Интерактивное взаимодействие через чат-бота'
    ],
    prerequisites: [
      'Бот создан через @BotFather (получен Bot Token)',
      'ID чата или группы для отправки',
      'Бот добавлен в целевую группу/чат'
    ],
    setup: [
      'В Telegram: @BotFather → /newbot → получите токен',
      'Добавьте бота в группу',
      'В AegisOps: Тип=telegram, URL=https://api.telegram.org, Auth=token',
      'Auth Payload: {"token":"123456:ABC-DEF..."}'
    ],
    methods: [
      { name: 'sendMessage(chatId, text)', desc: 'Отправка текста с HTML форматированием' },
      { name: 'sendDocument(chatId, fileUrl)', desc: 'Отправка файлов (PDF, Excel)' },
      { name: 'sendPhoto(chatId, photoUrl)', desc: 'Отправка изображений' },
      { name: 'getMe()', desc: 'Проверка работоспособности бота' }
    ],
    example: `TelegramConnector.sendMessage(
  '-1001234567890',
  '⚠️ ВНИМАНИЕ: Давление на ГРС-3 упало до 1.8 бар!',
  'HTML'
)`
  },
  {
    id: 'askug',
    icon: '💳',
    title: 'АСКУГ / UGaz / E-GAZ',
    type: 'askug',
    color: '#ff6a6a',
    what: 'Подключается к системам учёта газа Узбекистана: Cometa, NEKTA, UGaz, E-GAZ. Получает данные потребления, архивы, заправки и биллинг.',
    tasks: [
      'Часовые архивы потребления газа по узлам учёта',
      'Текущие показания в реальном времени',
      'Данные по заправкам на АГНКС (UGaz)',
      'Биллинговые данные и начисления (E-GAZ)'
    ],
    prerequisites: [
      'URL API системы (зависит от вендора: Cometa, NEKTA, UGaz, E-GAZ)',
      'API-ключ или логин/пароль',
      'Идентификаторы узлов учёта (node IDs)'
    ],
    setup: [
      'Получите API-доступ у администратора системы',
      'В AegisOps: Тип=askug, Auth=bearer',
      'Config: {"vendor":"cometa","api_version":"v1"}'
    ],
    methods: [
      { name: 'fetchData({endpoint, period})', desc: 'Получение данных потребления' },
      { name: 'getHourlyArchive(nodeId, date)', desc: 'Часовой архив по узлу' },
      { name: 'getCurrentReadings(nodeIds)', desc: 'Текущие показания' },
      { name: 'getUgazRefuelData(station, from, to)', desc: 'Заправки на АГНКС' },
      { name: 'getEgazBilling(period)', desc: 'Биллинговые данные' }
    ],
    example: `AskugConnector.getHourlyArchive('node-001', '2025-01-15')
→ Почасовые данные потребления

AskugConnector.getUgazRefuelData('st-1', '2025-01-01', '2025-01-31')
→ Заправки на АГНКС за январь`
  },
  {
    id: 'mqtt',
    icon: '📡',
    title: 'MQTT (Телеметрия / IoT)',
    type: 'mqtt',
    color: '#59a8ff',
    what: 'Получает данные телеметрии от IoT-датчиков через MQTT брокер. Лёгкий протокол для систем АСКУГ-ON-LINE и Tekinsoft.',
    tasks: [
      'Подписка на топики телеметрии в реальном времени',
      'Данные от газовых датчиков (расход, давление, температура)',
      'Интеграция с АСКУГ-ON-LINE и Tekinsoft',
      'Агрегация телеметрии для AI-анализа'
    ],
    prerequisites: [
      'MQTT брокер (Mosquitto, HiveMQ, EMQX)',
      'Хост и порт (стандартный 1883, WebSocket 8080)',
      'Логин/пароль (если включена аутентификация)'
    ],
    setup: [
      'Установите брокер: sudo apt install mosquitto',
      'В AegisOps: Тип=mqtt, URL=mqtt://192.168.1.50:1883',
      'Config: {"topic":"gas/telemetry/#","qos":0}'
    ],
    methods: [
      { name: 'fetchData({topic, limit})', desc: 'Получение последних сообщений' },
      { name: 'testConnection()', desc: 'Проверка доступности брокера' }
    ],
    example: `// Топики для газового сектора:
gas/telemetry/GRS-3/pressure  → 2.4 бар
gas/telemetry/GRS-3/flow      → 1250 м³/ч
gas/alerts/GRS-3/low_pressure → ALARM`
  },
  {
    id: 'database',
    icon: '🗄️',
    title: 'Базы данных (SQL)',
    type: 'database',
    color: '#336791',
    what: 'Выполняет SQL-запросы к PostgreSQL, MySQL и MSSQL для извлечения аналитических данных.',
    tasks: [
      'SQL-запросы к базам биллинговых систем',
      'Извлечение исторических данных для прогнозирования',
      'Агрегация данных из хранилищ (Data Warehouse)',
      'Обнаружение схемы базы данных'
    ],
    prerequisites: [
      'Хост, порт, имя базы данных',
      'Логин/пароль с правами SELECT (рекомендуется read-only)',
      'Сетевая доступность СУБД'
    ],
    setup: [
      'Создайте read-only пользователя',
      'В AegisOps: Тип=database, Auth=basic',
      'Config: {"driver":"postgresql"}'
    ],
    methods: [
      { name: 'fetchData({query})', desc: 'Выполнение SQL-запроса' },
      { name: 'discoverSchema()', desc: 'Обнаружение таблиц и колонок' }
    ],
    example: `-- PostgreSQL: потребление за неделю
SELECT node_id, DATE_TRUNC('hour', reading_time) AS hour,
       AVG(volume) AS avg_consumption
FROM gas_readings
WHERE reading_time >= NOW() - INTERVAL '7 days'
GROUP BY node_id, hour ORDER BY hour DESC;`
  },
  {
    id: 'rest',
    icon: '🌐',
    title: 'REST API / GraphQL',
    type: 'rest',
    color: '#ff9800',
    what: 'Универсальный коннектор для любого REST или GraphQL API. Подходит для CRM, ERP, GIS, GPS и других HTTP-сервисов.',
    tasks: [
      'Интеграция с любыми REST API (CRM, ERP, GIS)',
      'GraphQL-запросы к современным API',
      'Подключение к Tekinsoft, Autocad, Seismic',
      'Пагинация и JSON Path извлечение данных'
    ],
    prerequisites: [
      'URL API',
      'Метод аутентификации (API Key, Bearer, Basic)',
      'Документация API (endpoints, параметры)'
    ],
    setup: [
      'Получите API-документацию',
      'В AegisOps: Тип=crm_rest/erp_rest/rest/graphql',
      'Config: {"pagination":"offset","jsonPath":"$.data.items"}'
    ],
    methods: [
      { name: 'fetchData({path, params})', desc: 'GET-запрос к REST API' },
      { name: 'pushData({path, body})', desc: 'POST/PUT-запрос' },
      { name: 'fetchAllPages(path)', desc: 'Автоматическая пагинация' }
    ],
    example: `RestConnector.fetchData({
  path: '/customers',
  params: { status: 'active', limit: 100 }
})
→ GET https://crm.example.com/api/v2/customers?status=active&limit=100`
  },
  {
    id: 'email_webhook',
    icon: '📧',
    title: 'Email / Webhook',
    type: 'email',
    color: '#e91e63',
    what: 'Отправка email через SMTP и уведомлений через вебхуки (Slack, Microsoft Teams) с HMAC-подписью.',
    tasks: [
      'Отправка ежедневных отчётов по email',
      'Экстренные уведомления о проблемах',
      'Рассылка PDF/Excel отчётов с вложениями',
      'Slack/Teams уведомления через вебхуки'
    ],
    prerequisites: [
      'SMTP-сервер (корпоративный, Gmail, Mail.ru)',
      'Логин/пароль для SMTP-авторизации',
      'Или URL вебхука (Slack/Teams)'
    ],
    setup: [
      'Получите SMTP-реквизиты',
      'Для Email: Тип=email, URL=smtp://smtp.company.com:587, Auth=basic',
      'Для Webhook: Тип=webhook, URL=https://hooks.slack.com/...',
      'Config: {"secret":"hmac_key","format":"json"}'
    ],
    methods: [
      { name: 'pushData({to, subject, body})', desc: 'Отправка email' },
      { name: 'sendSlackMessage(text)', desc: 'Уведомление в Slack' },
      { name: 'sendTeamsMessage(text, title)', desc: 'Уведомление в Teams' },
      { name: 'verifySignature(body, sig)', desc: 'Проверка HMAC подписи' }
    ],
    example: `// Slack уведомление:
WebhookConnector.sendSlackMessage(
  '⚠️ Аномалия: Давление на ГРС-5 ниже нормы (1.8 бар)',
  { channel: '#gas-alerts', icon: ':rotating_light:' }
)

// Email отчёт:
EmailConnector.pushData({
  to: 'director@gas.uz',
  subject: 'Отчёт по газовому балансу',
  body: '...'
})`
  }
];

const FAQ_ITEMS = [
  {
    q: 'Нужно ли устанавливать драйверы для коннекторов?',
    a: 'Большинство коннекторов работают через HTTP и не требуют дополнительного ПО. Исключения: OPC UA (node-opcua-client ставится автоматически), базы данных (pg, mysql2, tedious входят в установку), Email (nodemailer входит в стандартную установку).'
  },
  {
    q: 'Что если внешняя система в другой сети?',
    a: 'Настройте VPN или используйте встроенный Cloudflare Tunnel (раздел «Мобильный доступ»). Туннель создаёт безопасное соединение через интернет без открытия портов.'
  },
  {
    q: 'Можно ли подключить несколько систем одного типа?',
    a: 'Да! Добавляйте несколько коннекторов одного типа, каждый со своим URL и учётными данными. Например: «1С Бухгалтерия» и «1С ERP» — это два отдельных коннектора типа one_c_odata.'
  },
  {
    q: 'Что делать если тест показывает «offline»?',
    a: '1) Проверьте что сервер запущен; 2) Проверьте URL (нет ли опечатки); 3) Проверьте сеть: ping и curl; 4) Проверьте учётные данные; 5) Проверьте брандмауэр; 6) Проверьте SSL-сертификат (для HTTPS).'
  },
  {
    q: 'Могу ли я написать свой коннектор?',
    a: 'Да! Создайте файл в server/connectors/, унаследуйте от BaseConnector и зарегистрируйте в connectors/index.js. Минимальный пример — реализуйте testConnection(), fetchData() и pushData().'
  },
  {
    q: 'Как коннекторы работают с AI-модулями?',
    a: 'При запуске модуля AegisOps: 1) Определяет нужные коннекторы; 2) Опрашивает их через fetchData(); 3) Объединяет данные; 4) Формирует контекст для Ollama; 5) AI генерирует отчёт.'
  },
  {
    q: 'Безопасно ли хранить пароли в AegisOps?',
    a: 'Да: AegisOps работает локально, API-ключи хешируются через scrypt, для подключения нужна аутентификация. Рекомендуется использовать read-only учётные записи для БД и отдельных пользователей для 1С/SAP.'
  },
  {
    q: 'Можно ли использовать AegisOps без Ollama?',
    a: 'Да, но с ограничениями. Коннекторы будут работать, но вместо AI-анализа будет встроенный анализ по ключевым словам. AI Ассистент будет недоступен. Рекомендуется установить Ollama — это бесплатно.'
  },
  {
    q: 'Сколько коннекторов можно добавить?',
    a: 'Технических ограничений нет. Практически — ограничено ресурсами компьютера. Рекомендуется не более 20-30 активных коннекторов на одной установке.'
  },
  {
    q: 'Работают ли коннекторы через прокси?',
    a: 'Да. Установите переменные окружения HTTP_PROXY и HTTPS_PROXY перед запуском AegisOps. Коннекторы используют fetch(), который автоматически подхватывает настройки прокси.'
  }
];

const STEP_BY_STEP = [
  {
    num: 1,
    title: 'Определите тип системы',
    desc: 'Ответьте на вопрос: к какой системе вы хотите подключиться? Выберите тип коннектора из списка ниже.'
  },
  {
    num: 2,
    title: 'Соберите информацию',
    desc: 'Вам нужно знать: URL доступа, учётные данные (логин/пароль/API-токен), сетевую доступность и документацию API.'
  },
  {
    num: 3,
    title: 'Добавьте коннектор в AegisOps',
    desc: 'Откройте «Коннекторы» → «+ Добавить» → Заполните форму: имя, тип, URL, авторизация → Сохранить.'
  },
  {
    num: 4,
    title: 'Протестируйте подключение',
    desc: 'Нажмите «Тест» рядом с коннектором. Если «online» — работает! Если «offline» — проверьте URL, учётные данные и сеть.'
  },
  {
    num: 5,
    title: 'Используйте в сценариях',
    desc: 'Создайте сценарий → Укажите коннекторы → Опишите цель → Запустите. AegisOps опросит коннекторы, AI проанализирует данные.'
  }
];

/* ══════════════ Render Guide Page ══════════════ */
async function renderGuidePage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">📖 Руководство по коннекторам</h2>
        <p class="page-subtitle">Полная документация: как работают коннекторы, как их подключить и настроить</p>
      </div>
      <div style="display:flex;gap:8px">
        <input class="form-input" id="guideSearch" placeholder="🔍 Поиск по руководству..." style="width:260px">
      </div>
    </div>

    <!-- Quick Nav Tabs -->
    <div class="guide-tabs mb-24">
      <button class="guide-tab active" data-tab="connectors">🔌 Коннекторы (10)</button>
      <button class="guide-tab" data-tab="howto">📋 Пошаговая инструкция</button>
      <button class="guide-tab" data-tab="architecture">🏗️ Архитектура и детали</button>
      <button class="guide-tab" data-tab="faq">❓ Частые вопросы</button>
    </div>

    <!-- Connectors Tab -->
    <div class="guide-tab-content active" id="guideTabConnectors">
      <div class="guide-connector-grid" id="guideConnectorGrid">
        ${CONNECTOR_GUIDES.map(c => `
          <div class="guide-connector-card" data-connector="${c.id}" style="border-left:4px solid ${c.color}">
            <div class="guide-connector-header" onclick="toggleGuideConnector('${c.id}')">
              <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:28px">${c.icon}</span>
                <div>
                  <div style="font-weight:700;font-size:15px">${escapeHtml(c.title)}</div>
                  <div style="font-size:12px;color:#8ea1c9">Тип: <code>${c.type}</code></div>
                </div>
              </div>
              <svg class="guide-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="guide-connector-body" id="guideBody_${c.id}">
              <p style="color:#c0d0e8;line-height:1.7;margin-bottom:16px">${c.what}</p>

              <div class="guide-section-label">Задачи:</div>
              <ul class="guide-task-list">
                ${c.tasks.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
              </ul>

              <div class="guide-section-label">Что нужно для подключения:</div>
              <ul class="guide-prereq-list">
                ${c.prerequisites.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
              </ul>

              <div class="guide-section-label">Как настроить:</div>
              <ol class="guide-setup-list">
                ${c.setup.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
              </ol>

              <div class="guide-section-label">API методы:</div>
              <div class="guide-methods">
                ${c.methods.map(m => `
                  <div class="guide-method">
                    <code>${escapeHtml(m.name)}</code>
                    <span>${escapeHtml(m.desc)}</span>
                  </div>
                `).join('')}
              </div>

              <div class="guide-section-label">Пример:</div>
              <pre class="guide-code">${escapeHtml(c.example)}</pre>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- How-To Tab -->
    <div class="guide-tab-content" id="guideTabHowto">
      <div class="card" style="padding:24px">
        <div class="card-title mb-24">📋 Пошаговая инструкция «Как подключить коннектор»</div>
        <div class="guide-steps-vertical">
          ${STEP_BY_STEP.map(s => `
            <div class="guide-step-v">
              <div class="guide-step-v-num" style="background:linear-gradient(135deg,#59a8ff,#7c5cff)">${s.num}</div>
              <div class="guide-step-v-content">
                <div class="guide-step-v-title">${escapeHtml(s.title)}</div>
                <div class="guide-step-v-desc">${escapeHtml(s.desc)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card mt-24" style="padding:24px">
        <div class="card-title mb-16">🔧 Типовой коннектор — выбор по системе</div>
        <div class="guide-type-table">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr><th style="text-align:left;padding:8px 12px">Система</th><th style="text-align:left;padding:8px 12px">Тип коннектора</th><th style="text-align:left;padding:8px 12px">Протокол</th></tr>
            </thead>
            <tbody>
              <tr><td style="padding:8px 12px">1С:Бухгалтерия / ERP</td><td style="padding:8px 12px"><code>one_c_odata</code></td><td style="padding:8px 12px">OData v3 / HTTP</td></tr>
              <tr><td style="padding:8px 12px">SAP S/4HANA</td><td style="padding:8px 12px"><code>sap_odata</code></td><td style="padding:8px 12px">OData v2/v4 / HTTPS</td></tr>
              <tr><td style="padding:8px 12px">SCADA (WinCC, Ignition)</td><td style="padding:8px 12px"><code>opc_ua</code></td><td style="padding:8px 12px">OPC UA / TCP</td></tr>
              <tr><td style="padding:8px 12px">Telegram (уведомления)</td><td style="padding:8px 12px"><code>telegram</code></td><td style="padding:8px 12px">Telegram Bot API / HTTPS</td></tr>
              <tr><td style="padding:8px 12px">АСКУГ / Cometa / NEKTA</td><td style="padding:8px 12px"><code>askug</code></td><td style="padding:8px 12px">REST / HTTPS</td></tr>
              <tr><td style="padding:8px 12px">UGaz (АГНКС)</td><td style="padding:8px 12px"><code>askug</code> (vendor: ugaz)</td><td style="padding:8px 12px">REST / HTTPS</td></tr>
              <tr><td style="padding:8px 12px">E-GAZ (биллинг)</td><td style="padding:8px 12px"><code>askug</code> (vendor: egaz)</td><td style="padding:8px 12px">REST / HTTPS</td></tr>
              <tr><td style="padding:8px 12px">IoT / MQTT датчики</td><td style="padding:8px 12px"><code>mqtt</code></td><td style="padding:8px 12px">MQTT / WebSocket</td></tr>
              <tr><td style="padding:8px 12px">Tekinsoft</td><td style="padding:8px 12px"><code>rest</code></td><td style="padding:8px 12px">REST / HTTPS</td></tr>
              <tr><td style="padding:8px 12px">PostgreSQL / MySQL / MSSQL</td><td style="padding:8px 12px"><code>database</code></td><td style="padding:8px 12px">SQL / TCP</td></tr>
              <tr><td style="padding:8px 12px">CRM / ERP (любые)</td><td style="padding:8px 12px"><code>crm_rest</code> / <code>erp_rest</code></td><td style="padding:8px 12px">REST / HTTPS</td></tr>
              <tr><td style="padding:8px 12px">Email (отчёты)</td><td style="padding:8px 12px"><code>email</code></td><td style="padding:8px 12px">SMTP / TCP</td></tr>
              <tr><td style="padding:8px 12px">Slack / Teams (вебхуки)</td><td style="padding:8px 12px"><code>webhook</code></td><td style="padding:8px 12px">HTTPS POST</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Architecture Tab -->
    <div class="guide-tab-content" id="guideTabArchitecture">
      ${GUIDE_SECTIONS.map(s => `
        <div class="card mb-16" style="padding:24px">
          <div class="card-title" style="display:flex;align-items:center;gap:8px">
            <span>${s.icon}</span> ${escapeHtml(s.title)}
          </div>
          <div class="guide-section-body" style="margin-top:12px;line-height:1.8;color:#c0d0e8">
            ${s.content}
          </div>
        </div>
      `).join('')}

      <div class="card mb-16" style="padding:24px">
        <div class="card-title" style="display:flex;align-items:center;gap:8px">
          <span>🔐</span> Безопасность
        </div>
        <div style="margin-top:12px;line-height:1.8;color:#c0d0e8">
          <ul style="padding-left:20px">
            <li><strong>Учётные данные</strong> хранятся в локальной SQLite базе данных</li>
            <li><strong>API-ключи</strong> хешируются с помощью scrypt (одностороннее хеширование)</li>
            <li><strong>JWT-токены</strong> для админ-доступа — срок действия 24 часа</li>
            <li><strong>Localhost bypass</strong> — запросы с 127.0.0.1 не требуют аутентификации (отключаемо)</li>
            <li><strong>Rate Limiting</strong> — максимум 300 запросов/минуту на API</li>
            <li><strong>HMAC-SHA256</strong> подпись — для вебхуков при указании секрета</li>
            <li><strong>Таймауты</strong> — все запросы к внешним системам имеют таймаут 15 секунд</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- FAQ Tab -->
    <div class="guide-tab-content" id="guideTabFaq">
      <div class="card" style="padding:24px">
        <div class="card-title mb-24">❓ Частые вопросы</div>
        <div class="guide-faq-list">
          ${FAQ_ITEMS.map((f, i) => `
            <div class="guide-faq-item" data-faq="${i}">
              <div class="guide-faq-q" onclick="toggleGuideFaq(${i})">
                <span>${escapeHtml(f.q)}</span>
                <svg class="guide-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div class="guide-faq-a" id="guideFaq_${i}">
                <p>${escapeHtml(f.a)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Tab switching
  $$('.guide-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.guide-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.guide-tab-content').forEach(c => c.classList.remove('active'));
      const tabId = 'guideTab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
      const el = document.getElementById(tabId);
      if (el) el.classList.add('active');
    });
  });

  // Search
  $('guideSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('.guide-connector-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    });
  });
}

/* ══════════════ Guide Interactions ══════════════ */
function toggleGuideConnector(id) {
  const body = document.getElementById('guideBody_' + id);
  const card = document.querySelector(`[data-connector="${id}"]`);
  if (body && card) {
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open');
    card.classList.toggle('expanded');
    if (!isOpen) {
      body.style.maxHeight = body.scrollHeight + 'px';
    } else {
      body.style.maxHeight = '0px';
    }
  }
}

function toggleGuideFaq(idx) {
  const el = document.getElementById('guideFaq_' + idx);
  const item = document.querySelector(`[data-faq="${idx}"]`);
  if (el && item) {
    const isOpen = el.classList.contains('open');
    el.classList.toggle('open');
    item.classList.toggle('expanded');
    if (!isOpen) {
      el.style.maxHeight = el.scrollHeight + 'px';
    } else {
      el.style.maxHeight = '0px';
    }
  }
}

// Expose globally
window.renderGuidePage = renderGuidePage;
window.toggleGuideConnector = toggleGuideConnector;
window.toggleGuideFaq = toggleGuideFaq;
