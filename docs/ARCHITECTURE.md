# Архитектура AegisOps v2.0

## Обзор

AegisOps — трёхслойная гибридная система production-класса:

1. **Backend (ПК)** — Node.js/Express (основной) + Python/FastAPI (legacy/reference).
2. **Desktop UI** — Electron + vanilla JS SPA.
3. **Mobile Client** — Flutter (Android), подключается к backend через интернет.

```
        ┌────────────────── ПК (Server) ──────────────────────┐
        │                                                      │
User ──▶│  Electron shell  ──▶  Express (server/)              │
        │                         │                            │
        │                         ├─▶ PostgreSQL / TimescaleDB │
        │                         │    (primary data store)     │
        │                         │    ├─ Core tables           │
        │                         │    └─ Telemetry hypertable  │
        │                         │                             │
        │                         ├─▶ Apache Kafka Event Bus    │
        │                         │    (central event streaming)│
        │                         │    ├─ Connector data        │
        │                         │    ├─ ETL events            │
        │                         │    ├─ Workflow events       │
        │                         │    ├─ AI request/response   │
        │                         │    ├─ SCADA telemetry       │
        │                         │    └─ Audit stream          │
        │                         │                             │
        │                         ├─▶ Connectors                │
        │                         │    ├─ Ollama               │
        │                         │    ├─ 1C OData             │
        │                         │    ├─ SAP OData            │
        │                         │    ├─ OPC UA (via DMZ)     │
        │                         │    ├─ MQTT/IoT             │
        │                         │    └─ Telegram             │
        │                         │                             │
        │                         ├─▶ SCADA DMZ Proxy          │
        │                         │    (ISA/IEC 62443)         │
        │                         │    ├─ Read-only default    │
        │                         │    ├─ Rate limiting         │
        │                         │    ├─ Full audit trail     │
        │                         │    └─ Emergency stop       │
        │                         │                             │
        │                         ├─▶ ETL Pipeline Engine      │
        │                         │    ├─ Extract (connector)  │
        │                         │    ├─ Clean (null/dup)     │
        │                         │    ├─ Transform (map/cast) │
        │                         │    ├─ Enrich (compute)     │
        │                         │    ├─ Validate (rules)     │
        │                         │    └─ Load (PG/Kafka/Ext) │
        │                         │                             │
        │                         ├─▶ DAG Workflow Engine      │
        │                         │    ├─ Parallel fan-out     │
        │                         │    ├─ Cron scheduler       │
        │                         │    ├─ Retry + backoff      │
        │                         │    ├─ Timeout enforcement  │
        │                         │    └─ Sub-workflows        │
        │                         │                             │
        │                         ├─▶ MCP Client               │
        │                         │    (stdio ↔ OpenClaw)       │
        │                         │                             │
        │                         └─▶ Credential Encryption    │
        │                              (AES-256-GCM)           │
        │                                                      │
        │       Cloudflare Tunnel / ngrok ◀──────────────────┘ │
        │             (public HTTPS URL)                        │
        └──────────────────┬──────────────────────────────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │  Android APK     │
                 │  (Flutter)       │
                 │  API-key auth    │
                 └──────────────────┘
```

## Компоненты

### `server/db/pg.js` — PostgreSQL + TimescaleDB

**Primary database** — PostgreSQL 15+ с расширением TimescaleDB для time-series данных.

Особенности:
- **Connection pooling**: pg.Pool (20 соединений)
- **Автоматическая миграция**: при запуске создаются все таблицы, индексы, гипертаблицы
- **TimescaleDB hypertable**: `telemetry_readings` с chunk_interval = 1 день, 6 партиций
- **Continuous aggregates**: часовые и дневные агрегаты для быстрых дашборд-запросов
- **Retention policy**: автоудаление raw telemetry старше 90 дней (агрегаты хранятся дольше)
- **SQLite fallback**: если PostgreSQL недоступен, автоматически используется sql.js

Новые таблицы:
- `telemetry_readings` — TimescaleDB hypertable (time, connector_id, node_id, metric_name, value, quality, metadata)
- `etl_run_log` — история ETL-выполнений (rows_extracted/transformed/loaded/rejected, errors, metrics)
- `workflow_schedules` — cron-расписания для Airflow-подобной оркестрации
- `dmz_proxies` — конфигурации SCADA DMZ прокси

Конфигурация через env: `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`, `PG_SSL`

### `server/events/kafka.js` — Apache Kafka Event Bus

**Центральная шина событий** для всех реалтайм-данных платформы.

Топики:
| Топик | Назначение |
|-------|-----------|
| `aegisops.connector.data` | Сырые данные коннекторов |
| `aegisops.connector.status` | Изменения статуса коннекторов |
| `aegisops.etl.extracted` | ETL: данные после извлечения |
| `aegisops.etl.transformed` | ETL: данные после трансформации |
| `aegisops.etl.loaded` | ETL: данные после загрузки |
| `aegisops.workflow.event` | События выполнения workflows |
| `aegisops.ai.request` | Запросы к AI |
| `aegisops.ai.response` | Ответы AI |
| `aegisops.alert` | Алерты и уведомления |
| `aegisops.audit` | Аудит-события (для SIEM) |
| `aegisops.scada.telemetry` | Time-series SCADA телеметрия |

Особенности:
- **kafkajs** — production-клиент для Apache Kafka
- **Idempotent producer** — нет дубликатов при ретраях
- **LZ4 compression** — сжатие сообщений
- **Consumer groups** — параллельная обработка
- **EventEmitter fallback** — работает без Kafka (degraded mode)

Конфигурация: `KAFKA_BROKERS` (comma-separated), `KAFKA_CLIENT_ID`, `KAFKA_SASL_*`, `KAFKA_SSL`

### `server/services/etl/engine.js` — Real ETL Pipeline Engine

**6-фазный пайплайн**: Extract → Clean → Transform → Enrich → Validate → Load

Фазы:
1. **EXTRACT** — получение данных из source connector (OData, OPC UA, MQTT, DB)
2. **CLEAN** — удаление null, пустых строк, trim whitespace
3. **TRANSFORM** — маппинг полей, приведение типов, конвертация единиц (bar→MPa, °F→°C), нормализация
4. **ENRICH** — вычисляемые поля, агрегация, дедупликация
5. **VALIDATE** — проверка диапазонов, обязательные поля, бизнес-правила
6. **LOAD** — загрузка в TimescaleDB, Kafka, или внешний коннектор

12 встроенных трансформеров:
- `clean`, `rename`, `castTypes`, `normalize`, `unitConvert`, `filter`, `compute`, `deduplicate`, `aggregate`
- Валидаторы: `range`, `required`, `businessRule`

Метрики выполнения: rows_extracted, rows_transformed, rows_loaded, rows_rejected, dead-letter queue

Интеграция с Kafka: publishes на ETL_EXTRACTED, ETL_TRANSFORMED, ETL_LOADED топики

### `server/security/dmz.js` — SCADA DMZ Security Proxy

**ISA/IEC 62443** совместимая сетевая изоляция для OPC UA/SCADA соединений.

Архитектура (Purdue Model):
```
Enterprise Network (Level 5)     ← AegisOps
         │
    DMZ (Level 3.5)              ← ScadaDmzProxy
    - Read-only по умолчанию
    - Rate limiting (token bucket)
    - Полный audit trail
    - Фильтрация команд
    - Emergency stop
         │
Control Network (Level 2-3)      ← OPC UA SCADA Server
```

Режимы доступа:
| Режим | Разрешённые операции |
|-------|---------------------|
| `read_only` | read, browse, subscribe |
| `monitor` | read, browse, subscribe |
| `read_write` | read, browse, subscribe, write, call |
| `admin` | все операции |

Безопасность:
- **Read-only по умолчанию** — если DMZ прокси не настроен, создаётся restrictive default
- **Rate limiting** — token bucket, настраиваемый (по умолчанию 10 req/sec)
- **Node ID валидация** — защита от injection через malformed node IDs
- **Write value constraints** — проверка диапазонов, safety threshold (1e9)
- **Emergency stop** — мгновенная блокировка всего SCADA доступа
- **Полный аудит** — каждое авторизованное и заблокированное действие логируется

### `server/workflow/scheduler.js` — Enhanced DAG Workflow Engine

**Airflow-подобная оркестрация** с параллельным выполнением DAG.

Новые возможности:
1. **Parallel fan-out**: независимые ветки выполняются concurrently (Promise.all)
2. **Cron scheduler**: node-cron автоматически запускает workflows по расписанию
3. **Retry logic**: настраиваемые retry с exponential backoff
4. **Timeout enforcement**: kill долгих нод
5. **Sub-workflow nodes**: вызов других workflows как нод
6. **Loop/iteration**: for-each обработка массивов
7. **DMZ-aware SCADA**: OPC UA операции проходят через DMZ прокси
8. **Kafka events**: workflow events публикуются в event bus

Типы нод:
- Триггеры: `trigger.manual`, `trigger.cron`
- Коннекторы: `connector.test`, `connector.fetch`, `connector.write` (DMZ-protected)
- ИИ: `ai.ask`
- MCP: `mcp.call`
- Данные: `data.transform`, `data.filter`, `data.foreach`
- Вывод: `output.telegram`, `output.webhook`, `output.report`
- Оркестрация: `subworkflow`

### `server/security/crypto.js` — Credential Encryption

**AES-256-GCM** шифрование учётных данных коннекторов.

- Ключ: HKDF-SHA256 от serverSecret, 256-bit
- IV: 12-byte random per encryption
- Формат: base64(iv:ciphertext:authTag)
- Автоматическая миграция plaintext → encrypted при запуске

### `server/services/retention.js` — Data Retention Service

**Автоматическая очистка** старых данных по расписанию (ежедневно в 03:00).

- Очищает audit_log, workflow_runs, telemetry_readings старше N дней
- N настраивается через `settings.data_retention_days` (по умолчанию 365)

## Данные

PostgreSQL/TimescaleDB (primary) или SQLite (fallback):

Core tables: `connectors`, `scenarios`, `documents`, `audit_log`, `modules`, `training_jobs`, `etl_pipelines`, `settings`, `workflows`, `workflow_runs`, `api_keys`, `mcp_servers`

New v2.0 tables: `telemetry_readings` (hypertable), `etl_run_log`, `workflow_schedules`, `dmz_proxies`

## CI/CD

GitHub Actions публикует:
- **Windows installer (NSIS)** + portable
- **Linux AppImage** + .deb
- **macOS dmg**
- **Android APK**

## Производительность

- PostgreSQL connection pool (20 соединений) для high-concurrency
- TimescaleDB hypertable с 6 партициями для телеметрии (миллионы записей)
- Kafka LZ4 compression для event streaming
- Parallel DAG execution (Promise.all для fan-out)
- Rate limiting: 300 req/мин per-IP
- ETL pipeline: row-level processing с dead-letter queue
