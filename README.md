# AegisOps Local AI v2.0 — Enterprise Integration Platform

[![Build Desktop](https://github.com/FreedoomForm/goal/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/FreedoomForm/goal/actions/workflows/build-desktop.yml)
[![Build Android](https://github.com/FreedoomForm/goal/actions/workflows/build-android.yml/badge.svg)](https://github.com/FreedoomForm/goal/actions/workflows/build-android.yml)
[![Tests](https://github.com/FreedoomForm/goal/actions/workflows/tests.yml/badge.svg)](https://github.com/FreedoomForm/goal/actions/workflows/tests.yml)

Локальная AI-платформа корпоративного уровня для газовых компаний Ташкента.
Соответствует ТЗ: 5 модулей (газовый баланс, потребление, платежи, тарифы, риски),
реальные коннекторы к 1C/SAP/SCADA/Telegram/Ollama, локальная AI-аналитика,
node-based workflow builder (n8n-style), реальная интеграция MCP (Model Context Protocol),
и мобильное приложение Android.

## 🆕 Что нового в v2.0

| Компонент | До v2.0 | После v2.0 |
|-----------|---------|------------|
| **База данных** | SQLite (sql.js WASM, ~2MB in-memory) | PostgreSQL 15+ / TimescaleDB (миллионы записей телеметрии) |
| **Event Bus** | Нет | Apache Kafka (11 топиков, LZ4 compression, idempotent producer) |
| **ETL Pipeline** | Заглушка (fetchData + sleep 1.5s) | Реальный 6-фазный пайплайн: Extract → Clean → Transform → Enrich → Validate → Load |
| **SCADA Security** | Прямое подключение к OPC UA | DMZ Proxy (ISA/IEC 62443, read-only default, rate limiting, emergency stop) |
| **Workflow Engine** | Серийный DAG, нет scheduler'а | Parallel DAG (Promise.all), cron scheduler, retry + backoff, sub-workflows |
| **Credential Storage** | Plaintext в БД | AES-256-GCM зашифровано (HKDF-SHA256 от serverSecret) |
| **Data Retention** | Нет автоматической очистки | Ежедневная очистка в 03:00 по retention_days политике |
| **Audit** | Только локальная таблица | Kafka audit stream для SIEM интеграции (Splunk, Elastic) |

---

## 📦 Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    AegisOps Local AI Platform v2.0               │
├─────────────────────────────────────────────────────────────────┤
│  Electron Desktop (Windows/Linux/macOS)                         │
│  ├─ UI: Dashboard, Connectors, Scenarios, Modules,              │
│  │       AI Assistant, Documents, Training, ETL, Planning,      │
│  │       MCP, DMZ, Telemetry, Audit, Settings                   │
│  └─ Embedded Express server (port 18090)                        │
│     ├─ PostgreSQL/TimescaleDB (primary)                         │
│     │   ├─ Core tables (connectors, scenarios, etc.)            │
│     │   ├─ telemetry_readings (hypertable, 6 partitions)        │
│     │   ├─ Continuous aggregates (hourly, daily)                │
│     │   └─ etl_run_log, workflow_schedules, dmz_proxies         │
│     │                                                            │
│     ├─ Apache Kafka Event Bus (11 topics)                       │
│     │   ├─ aegisops.connector.data/status                       │
│     │   ├─ aegisops.etl.extracted/transformed/loaded            │
│     │   ├─ aegisops.workflow.event                               │
│     │   ├─ aegisops.ai.request/response                          │
│     │   ├─ aegisops.scada.telemetry                              │
│     │   ├─ aegisops.alert                                        │
│     │   └─ aegisops.audit (for SIEM)                             │
│     │                                                            │
│     ├─ SCADA DMZ Proxy (ISA/IEC 62443)                         │
│     │   ├─ Read-only default + rate limiting                     │
│     │   ├─ Full audit trail                                      │
│     │   └─ Emergency stop                                        │
│     │                                                            │
│     ├─ Real ETL Pipeline Engine                                 │
│     │   ├─ 12 transformers (clean, rename, castTypes, etc.)     │
│     │   ├─ 3 validators (range, required, businessRule)          │
│     │   └─ Load to: TimescaleDB / Kafka / External connector     │
│     │                                                            │
│     ├─ Enhanced DAG Workflow Engine                             │
│     │   ├─ Parallel fan-out (Promise.all)                        │
│     │   ├─ Cron scheduler (node-cron)                            │
│     │   ├─ Retry with exponential backoff                        │
│     │   ├─ Timeout enforcement                                   │
│     │   └─ Sub-workflow + for-each nodes                         │
│     │                                                            │
│     ├─ Credential Encryption (AES-256-GCM)                     │
│     ├─ MCP Client (stdio ↔ OpenClaw)                            │
│     └─ Data Retention Service                                   │
│                                                                  │
│  Android App (Flutter)                                           │
│  ├─ Pairing via QR code → API-key auth                          │
│  └─ Dashboard, Scenarios, AI Chat, MCP, Settings                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Безопасность

### SCADA DMZ (ISA/IEC 62443)
Все OPC UA соединения изолированы через DMZ-прокси по Purdue модели:
- **Read-only по умолчанию**: write операции заблокированы без явной конфигурации
- **Rate limiting**: token bucket (10 req/sec по умолчанию)
- **Emergency stop**: мгновенная блокировка через `POST /api/dmz/emergency-stop`
- **Полный audit trail**: каждое действие логируется

### Credential Encryption
Учётные данные коннекторов зашифрованы AES-256-GCM:
- Ключ: HKDF-SHA256 от serverSecret
- Автоматическая миграция plaintext → encrypted при запуске

### Authentication
- JWT (HMAC-SHA256, 24ч TTL) + API Keys (SHA256+secret)
- Admin: scrypt с timing-safe сравнением
- QR-pairing для мобильного приложения

---

## 🚀 Быстрый старт

### На ПК (Windows / Linux / macOS)

```bash
cd aegisops_app
npm install
npm start               # запустит Electron + встроенный сервер на :18090
```

### С PostgreSQL и Kafka (production)

```bash
# Установите PostgreSQL 15+ и создайте БД
createdb aegisops

# Установите Apache Kafka и запустите
# (или используйте Docker Compose)

# Настройте переменные окружения
export PG_HOST=localhost
export PG_PORT=5432
export PG_DATABASE=aegisops
export PG_USER=aegisops
export PG_PASSWORD=your_password
export KAFKA_BROKERS=localhost:9092
export AEGISOPS_SECRET=your-secret-key

# Запустите сервер
cd aegisops_app
node server/standalone.js
```

### Без PostgreSQL/Kafka (standalone)
Сервер автоматически откатится на SQLite и EventEmitter, если PostgreSQL или Kafka недоступны.

### На Android
APK скачивается из GitHub Releases. Сканируйте QR → приложение сохранит `base_url` + `api_key`.

---

## 🧩 API Endpoints (v2.0)

### Новые endpoints v2.0

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/health` | GET | Статус + версия + инфраструктура (DB, Kafka, DMZ) |
| `/api/telemetry` | GET | Запрос телеметрии (TimescaleDB) с агрегацией |
| `/api/telemetry` | POST | Вставка телеметрических данных |
| `/api/etl/:id/run` | POST | Запуск реального ETL пайплайна |
| `/api/etl/:id/runs` | GET | История выполнения ETL пайплайна |
| `/api/etl/transformers` | GET | Доступные трансформеры для UI builder'а |
| `/api/dmz/proxies` | GET | Список DMZ прокси |
| `/api/dmz/proxies` | POST | Создание DMZ прокси |
| `/api/dmz/emergency-stop` | POST | Экстренная остановка всех SCADA |
| `/api/dmz/:id/release` | POST | Снятие emergency stop |
| `/api/dmz/modes` | GET | Режимы DMZ и операции |
| `/api/events/status` | GET | Статус Kafka event bus |
| `/api/events/topics` | GET | Список Kafka топиков |
| `/api/db/info` | GET | Информация о базе данных |
| `/api/db/cleanup` | POST | Ручная очистка старых данных |

---

## 📂 Структура репозитория

```
goal/
├── aegisops_app/              # Electron desktop + Express backend
│   ├── main.js                # Electron main process
│   ├── server/
│   │   ├── index.js           # Express app (core API v2.0)
│   │   ├── standalone.js      # Standalone server launcher
│   │   ├── db/
│   │   │   ├── pg.js          # PostgreSQL + TimescaleDB (primary)
│   │   │   └── (db.js)       # SQLite fallback (legacy)
│   │   ├── auth.js            # JWT + API keys + scopes
│   │   ├── tunnel.js          # cloudflared / ngrok / manual
│   │   ├── events/
│   │   │   └── kafka.js       # Apache Kafka Event Bus
│   │   ├── security/
│   │   │   ├── dmz.js         # SCADA DMZ Proxy (ISA/IEC 62443)
│   │   │   └── crypto.js      # AES-256-GCM credential encryption
│   │   ├── services/
│   │   │   ├── etl/
│   │   │   │   └── engine.js  # Real ETL Pipeline Engine
│   │   │   └── retention.js   # Data Retention Cleanup
│   │   ├── workflow/
│   │   │   ├── engine.js      # DAG executor (legacy)
│   │   │   └── scheduler.js   # Enhanced DAG + cron + parallel + retry
│   │   ├── middleware/         # security.js, logger.js
│   │   ├── routes/            # auth.js, mcp.js, workflows.js
│   │   ├── mcp/               # client.js, openclaw-bridge.js
│   │   └── connectors/        # ollama, odata, opcua, telegram, mqtt, …
│   ├── public/                # Frontend SPA
│   └── tests/                 # Jest tests
│
├── android_app/               # Flutter mobile app
├── .github/workflows/         # CI/CD
├── docs/                      # ARCHITECTURE.md, SECURITY.md, MOBILE.md
└── main.py                    # Legacy FastAPI
```

---

## 🧪 Запуск тестов

```bash
# Backend
cd aegisops_app && npm test

# Python
pip install -r requirements.txt pytest pytest-asyncio httpx
python -m pytest tests/ -v

# Android
cd android_app && flutter test
```

## 📄 Документация

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — подробная архитектура v2.0
- [`docs/SECURITY.md`](docs/SECURITY.md) — модель угроз и меры защиты v2.0
- [`docs/CONNECTORS_GUIDE.md`](docs/CONNECTORS_GUIDE.md) — гид по коннекторам
- [`docs/MOBILE.md`](docs/MOBILE.md) — гид по мобильному приложению
