# AegisOps Local AI — Enterprise Integration Platform

[![Build Desktop](https://github.com/FreedoomForm/goal/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/FreedoomForm/goal/actions/workflows/build-desktop.yml)
[![Build Android](https://github.com/FreedoomForm/goal/actions/workflows/build-android.yml/badge.svg)](https://github.com/FreedoomForm/goal/actions/workflows/build-android.yml)
[![Tests](https://github.com/FreedoomForm/goal/actions/workflows/tests.yml/badge.svg)](https://github.com/FreedoomForm/goal/actions/workflows/tests.yml)

Локальная AI-платформа корпоративного уровня для газовых компаний Ташкента.
Соответствует ТЗ: 5 модулей (газовый баланс, потребление, платежи, тарифы, риски),
реальные коннекторы к 1C/SAP/SCADA/Telegram/Ollama, локальная AI-аналитика,
node-based workflow builder (n8n-style), реальная интеграция MCP (Model Context Protocol),
и мобильное приложение Android, которое подключается к ПК-серверу из любой точки мира.

---

## 📦 Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    AegisOps Local AI Platform                   │
├─────────────────────────────────────────────────────────────────┤
│  Electron Desktop (Windows/Linux/macOS)                         │
│  ├─ UI: Dashboard, Connectors, Scenarios, Modules,              │
│  │       AI Assistant, Documents, Training, ETL, Planning*,     │
│  │       MCP*, Audit, Settings                                  │
│  └─ Embedded Express server (port 18090)                        │
│     ├─ /api/health, /api/dashboard, /api/connectors, ...        │
│     ├─ /api/workflows/*   — n8n-style graph engine*             │
│     ├─ /api/mcp/*         — real OpenClaw MCP bridge*           │
│     ├─ /api/auth/*        — JWT + API keys + QR pairing*        │
│     └─ /api/tunnel/*      — cloudflared/ngrok remote access*    │
│                                                                 │
│  Android App (Flutter)*                                         │
│  ├─ Pairing via QR code (scan once → stores base_url + key)     │
│  ├─ Screens: Dashboard, Scenarios, AI Chat, Planning, MCP,      │
│  │            Connect, Settings                                 │
│  └─ Connects to PC server via public tunnel from anywhere       │
│                                                                 │
│  CI/CD (GitHub Actions)*                                        │
│  ├─ build-desktop.yml  → Windows .exe / Linux .AppImage / .dmg  │
│  ├─ build-android.yml  → universal + per-ABI APK                │
│  └─ tests.yml          → jest + pytest on every PR              │
│                                                                 │
│  * = added during senior-level refactor                         │
└─────────────────────────────────────────────────────────────────┘
```

## 🔐 Что улучшено до уровня Senior Dev

### Безопасность (`aegisops_app/server/middleware/security.js`, `auth.js`)
- Строгие HTTP-заголовки (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- Rate-limiting (скользящее окно) против brute-force
- Санитизация ввода (вложенный обход `body`/`query`/`params`, запрет prototype-pollution)
- Ограничение размера payload'а
- **JWT-авторизация** (HS256) + **API-ключи со scopes** (`*`, `read`, `run`)
- `authMiddleware` с опциональным `required` и проверкой scopes
- **QR-pairing** для мобильного приложения: ПК генерирует одноразовый 6-значный код,
  мобильное приложение сканирует QR и получает API-ключ с ограниченными scopes
- Логи с автоматической редакцией секретов (`password`, `token`, `api_key`, …)

### Производительность / Эффективность
- Вся запись в SQLite — через подготовленные выражения (`prepare` → `run`)
- Workflow-движок — топологический DAG-исполнитель, узлы запускаются как только
  готовы все предки (никакого последовательного перебора)
- Структурированное логирование (`logger.js`) с уровнями и редакцией
- Connection pooling в HTTP-клиентах коннекторов (`keep-alive`)

### UI / UX
- Node-based **Workflow Canvas** (vanilla JS, SVG-провода, drag&drop, zoom/pan) —
  аналог n8n, встроен во вкладку «Планирование»
- **Встроенный Гид** (кнопка 📘): пошаговое обучение работе с нодами
- Inspector с live-трассировкой выполнения (каждая нода → статус + output-preview + ms)
- Панель палитры нод с поиском и категориями
- Сохранение/загрузка workflow, cron-расписание, история запусков (`workflow_runs`)

### Тестирование
- **Jest** для backend: 3 suite × 20 тестов (security, workflow engine, auth)
- **Flutter test** для Android: widget-тесты, theme-тесты
- **pytest** для Python-скрипта парсинга XLSX
- CI запускает все три набора на каждом PR

---

## 🧩 Реальная интеграция OpenClaw MCP

`aegisops_app/server/mcp/client.js` — полноценная имплементация клиента **MCP 2025-06-18**
по **stdio transport** с JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`,
`resources/list`, `resources/read`, `prompts/list`).

`openclaw-bridge.js` регистрирует OpenClaw-совместимые серверы одной строкой:

| Preset        | Описание                                                          |
|---------------|-------------------------------------------------------------------|
| `filesystem`  | `@modelcontextprotocol/server-filesystem` (локальные файлы)       |
| `github`      | `@modelcontextprotocol/server-github` (репо, issues, PR)          |
| `shell`       | `mcp-server-shell` (whitelisted commands)                         |
| `postgres`    | `@modelcontextprotocol/server-postgres` (read-only)               |
| `custom`      | Любая команда, которую укажет пользователь                        |

Запуск из UI (вкладка **MCP** → **Добавить → preset → Start**). Все тулы автоматически
становятся доступны в Workflow Builder как нода **«Вызвать MCP-инструмент»**.

---

## 🚀 Быстрый старт

### На ПК (Windows / Linux / macOS)

```bash
cd aegisops_app
npm install
npm start               # запустит Electron + встроенный сервер на :18090
```

При первом запуске:
1. Откройте **Настройки → Безопасность** → задайте пароль администратора (`/api/auth/bootstrap`).
2. Перейдите на вкладку **Мобильный доступ** → **Старт туннеля** (cloudflared/ngrok
   или вручную укажите публичный URL).
3. Нажмите **Создать код сопряжения** — получите QR.

### На Android

APK скачивается из GitHub Releases (автоматически собирается при `git tag v1.x.x`).
При первом запуске:
1. Нажмите **Сканировать QR**.
2. Приложение сохранит `base_url` + `api_key` и откроет панель управления.
3. С этого момента все запросы (Dashboard, Scenarios, AI-чат, Workflow, MCP)
   идут к вашему ПК через защищённый туннель.

---

## ⚙️ CI/CD: автоматическая сборка при push

Каждый `git push` в `main`/`master` запускает:

| Workflow               | Что делает                                                         |
|------------------------|--------------------------------------------------------------------|
| `build-desktop.yml`    | Матрица `windows-latest` / `ubuntu-latest` / `macos-latest` → `.exe`/`.AppImage`/`.dmg` через electron-builder |
| `build-android.yml`    | Flutter 3.24 → универсальный APK + per-ABI (arm64, armv7, x86_64) |
| `tests.yml`            | `npm test` (Jest) + `pytest` + `flutter analyze`                   |

При `git tag v*` артефакты автоматически прикрепляются к GitHub Release.
Подробности: [`.github/workflows/`](.github/workflows/).

---

## 📘 Workflow Builder (n8n-style)

Встроен во вкладку **Планирование**. Поддерживаемые типы нод:

| Категория    | Узлы                                                                 |
|--------------|----------------------------------------------------------------------|
| Триггеры     | `trigger.manual`, `trigger.cron`                                    |
| Коннекторы   | `connector.test`, `connector.fetch`                                 |
| ИИ и MCP     | `ai.ask` (Ollama), `mcp.call` (любой зарегистрированный MCP-сервер) |
| Данные       | `data.transform` (JS), `data.filter` (JS)                           |
| Вывод        | `output.telegram`, `output.webhook`, `output.report`                |

Граф выполняется топологически; фильтры помечают потомков как `skipped`;
выход каждой ноды сохраняется и доступен следующей через `$input`.

Гид (📘) объясняет, как соединять ноды, как использовать шаблоны `{{$input.path}}`
и как отлаживать workflow по трассировке.

---

## 📂 Структура репозитория

```
goal/
├── aegisops_app/              # Electron desktop + Express backend
│   ├── main.js                # Electron main process
│   ├── server/
│   │   ├── index.js           # Express app (core API)
│   │   ├── db.js              # sql.js wrapper + schema + seed
│   │   ├── auth.js            # JWT + API keys + scopes
│   │   ├── tunnel.js          # cloudflared / ngrok / manual
│   │   ├── middleware/        # security.js, logger.js
│   │   ├── routes/            # auth.js, mcp.js, workflows.js
│   │   ├── mcp/               # client.js (JSON-RPC stdio), openclaw-bridge.js
│   │   ├── workflow/          # engine.js (DAG executor)
│   │   └── connectors/        # ollama, odata, opcua, telegram, rest, email, …
│   ├── public/
│   │   ├── index.html
│   │   ├── css/               # styles.css, planning.css
│   │   └── js/
│   │       ├── app.js         # SPA router
│   │       └── planning/      # canvas.js, planning.js, guide.js
│   └── tests/                 # security.test.js, workflow.test.js, auth.test.js
│
├── android_app/               # Flutter mobile app
│   ├── pubspec.yaml
│   ├── lib/
│   │   ├── main.dart
│   │   └── src/
│   │       ├── theme.dart
│   │       ├── services/      # api_client.dart, settings_service.dart
│   │       └── screens/       # connect, dashboard, scenarios, assistant,
│   │                          # planning, mcp, settings
│   ├── android/app/src/main/res/xml/network_security_config.xml
│   └── test/widget_test.dart
│
├── .github/workflows/         # build-desktop.yml, build-android.yml, tests.yml
├── docs/                      # ARCHITECTURE.md, MOBILE.md, SECURITY.md
├── main.py                    # Legacy FastAPI (kept for compatibility)
├── tests/                     # pytest для Python-скриптов
└── pyproject.toml
```

---

## 🧪 Запуск тестов локально

```bash
# Backend + workflow engine + auth
cd aegisops_app && npm test

# Python парсеры
pip install -r requirements.txt pytest pytest-asyncio httpx
python -m pytest tests/ -v

# Android
cd android_app && flutter test
```

## 📄 Документация

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — подробная архитектура
- [`docs/SECURITY.md`](docs/SECURITY.md) — модель угроз и меры защиты
- [`docs/MOBILE.md`](docs/MOBILE.md) — гид по мобильному приложению
