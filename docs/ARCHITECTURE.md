# Архитектура AegisOps

## Обзор

AegisOps — трёхслойная гибридная система:

1. **Backend (ПК)** — Node.js/Express (основной) + Python/FastAPI (legacy/reference).
2. **Desktop UI** — Electron + vanilla JS SPA.
3. **Mobile Client** — Flutter (Android), подключается к backend через интернет.

```
        ┌────────────── ПК (Server) ─────────────────┐
        │                                            │
User ──▶│  Electron shell  ──▶  Express (server/)   │
        │                         │                  │
        │                         ├─▶ sql.js (local) │
        │                         ├─▶ Connectors     │
        │                         │    ├─ Ollama     │
        │                         │    ├─ 1C OData   │
        │                         │    ├─ SAP OData  │
        │                         │    ├─ OPC UA     │
        │                         │    └─ Telegram   │
        │                         ├─▶ MCP Client     │
        │                         │    (stdio ↔ OpenClaw)
        │                         └─▶ Workflow Engine │
        │                                             │
        │       Cloudflare Tunnel / ngrok ◀──────────┘
        │             (public HTTPS URL)              │
        └──────────────────┬──────────────────────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │  Android APK     │
                 │  (Flutter)       │
                 │  API-key auth    │
                 └──────────────────┘
```

## Компоненты

### `server/index.js` — Express app factory
Собирает middleware-стек:
1. `securityHeaders` — CSP, X-Frame-Options и др.
2. `payloadGuard(10MB)` — предотвращает DoS больших тел.
3. `express.json()` — парсинг.
4. `inputSanitizer` — strip control chars + prototype pollution defense.
5. `requestLogger` — JSON-line логи с ID запроса и latency.
6. `rateLimiter(300/мин)` — per-IP, per-route.
7. `authMiddleware` — на `/api/workflows`, `/api/mcp`, `/api/tunnel`.

### `server/auth.js` — Аутентификация
Два механизма:
- **JWT** (формат `v1.<b64(payload)>.<b64(hmac)>`), HMAC-SHA256 с серверным секретом. 24ч TTL. Используется для админ-логина.
- **API Keys** (формат `aos_<base64url(24b)>`), хешируются SHA256+secret в БД. Используются для мобильных клиентов.

**Бутстрап**: при первом запросе `POST /api/auth/bootstrap` с паролем админа. Сервер сам генерирует и хранит `server_secret` в `settings` таблице (48-байт crypto-random), если переменная окружения `AEGISOPS_SECRET` не задана.

**Localhost bypass**: если запрос с `127.0.0.1`, auth не требуется (кроме сценариев с `AEGISOPS_ENFORCE_LOCAL_AUTH=1`). Это даёт «zero-config» UX для локальной работы.

### `server/mcp/client.js` — Model Context Protocol
Полная реализация MCP-клиента по спецификации 2025-06-18:
- **Транспорт**: stdio (spawn дочернего процесса).
- **Формат**: JSON-RPC 2.0, line-delimited.
- **Методы**: `initialize`, `initialized` notification, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`.
- **Timeout**: 30 секунд на запрос.
- **Reconnect**: при exit процесса — reject всех pending запросов.

`openclaw-bridge.js` добавляет преднастроенные пресеты (`@modelcontextprotocol/server-filesystem`, `-github`, `-postgres` и т. д.) и регистрирует их в общем `McpRegistry`.

### `server/workflow/engine.js` — Workflow Engine
Выполняет ациклический граф нод (DAG). Тип графа:
```js
{ nodes: [{ id, type, params, position }], edges: [{ from, to }] }
```

**Алгоритм**:
1. Вычисляем in-degree каждой ноды.
2. Очередь = ноды с in-degree = 0.
3. Извлекаем из очереди, выполняем `runNode()`, записываем результат.
4. Для каждого исходящего ребра уменьшаем in-degree, если =0 — добавляем в очередь.
5. Пропускаем ноды, у которых хоть один родитель был skipped или errored.

**Node types**:
- `trigger.manual`, `trigger.cron`
- `connector.test`, `connector.fetch`
- `ai.ask` (Ollama)
- `mcp.call` (любой MCP tool)
- `data.transform`, `data.filter` (JS expression в `new Function`, без доступа к глобальной области)
- `output.webhook`, `output.telegram`, `output.report`

Интерполяция шаблонов: `{{$input.foo}}` → вычисляется как JS-выражение в изолированной функции.

### `server/tunnel.js` — Удалённый доступ
Поддерживает 3 провайдера:
- **cloudflared** (рекомендуется, без аккаунта) — парсит stdout на регэксп `*.trycloudflare.com`.
- **ngrok** (если `NGROK_AUTHTOKEN` установлен).
- **manual** — пользователь вводит URL сам.

Публичный URL сохраняется в `settings.public_base_url` — используется для QR-кода сопряжения.

### Frontend: Node-based Canvas (`public/js/planning/canvas.js`)
Vanilla-JS реализация (без React):
- **SVG-слой** — Безье-кривые между нодами (curved wires).
- **DIV-слой** — ноды с портами (left=input, right=output).
- **Transform** — единый `transform: translate() scale()` на родительском контейнере для pan/zoom.
- **Drag & drop** — mousedown на ноде → mousemove перетаскивает; mousedown на порту → rubber-band линия → mouseup на другом порту = edge.
- **Import/Export** — JSON-совместимый с API `/api/workflows`.

### Android App (`android_app/`)
- **State**: Riverpod (минимально) + SharedPreferences/FlutterSecureStorage.
- **Routing**: go_router с ShellRoute (нижняя навигация).
- **API**: `http` package + retry + timeout.
- **QR-сканер**: `mobile_scanner` (ML Kit).
- **Pairing flow**:
  1. Пользователь сканирует QR — содержит `{ "base": "https://...", "code": "123456" }`.
  2. APK вызывает `POST /api/auth/pair/consume` с кодом.
  3. Сервер возвращает одноразовый API-key и URL.
  4. APK сохраняет в Android KeyStore через `flutter_secure_storage`.

## Данные

SQLite (через `sql.js` WASM для JS backend, через `sqlite3` для Python legacy). Таблицы:
- `connectors`, `scenarios`, `documents`, `audit_log`
- `modules`, `training_jobs`, `etl_pipelines`, `settings`
- **Новые**: `workflows`, `workflow_runs`, `api_keys`, `mcp_servers`

## CI/CD

GitHub Actions публикует:
- **Windows installer (NSIS)** + portable — `AegisOps-LocalAI-{ver}-x64.exe`
- **Linux AppImage** + .deb
- **macOS dmg**
- **Android APK** — universal + per-ABI (arm64, armv7, x86_64)

При push тега `v*` все артефакты автоматически прикрепляются к GitHub Release.

## Производительность

- sql.js хранит всю БД в памяти (~2 МБ для seeded данных), flush на диск после каждой записи.
- Workflow Engine сериализует выполнение нод (нет parallel fan-out пока).
- MCP-клиент использует persistent stdin/stdout — меньше оверхеда, чем HTTP-MCP.
- Rate limit: 300 req/мин per-IP, достаточно для 2-3 активных мобильных клиентов.
