# AegisOps Local AI — Architecture Review & Production Hardening

> Comprehensive architecture analysis of the `goal` repository (AegisOps Local AI v2.0).
> This document catalogues the current system, identifies architectural & production-
> readiness issues, and describes the concrete fixes applied in this commit.

---

## 1. High-Level System Overview

AegisOps is a **hybrid three-tier on-prem enterprise AI platform** for gas/utility companies,
composed of:

| Tier | Stack | Purpose |
|------|-------|---------|
| **Desktop / Server (primary)** | Node.js 20 + Express 4 + Electron 33 | Main server, UI shell, connectors, workflow engine, MCP client |
| **Data layer** | PostgreSQL 15 + TimescaleDB *(fallback: sql.js / SQLite)*, Apache Kafka *(fallback: EventEmitter)* | OLTP + time-series telemetry + event streaming |
| **Legacy Python reference** | FastAPI + APScheduler + SQLite (`main.py`) | Reference implementation of scenarios / scheduler; ML engine in `ml_engine/` (xgboost / prophet / pmdarima) |
| **Mobile client** | Flutter 3.22 (Android) | QR-paired companion app over LAN or Cloudflare Tunnel |
| **CI/CD** | GitHub Actions | Build Windows NSIS installer, Linux AppImage/deb, macOS dmg, Android APK; Node/Python/Flutter tests |

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         AegisOps Local AI Platform                            │
│                                                                                │
│  ┌───────────────────────┐   ┌───────────────────────────────────────────┐   │
│  │  Electron Desktop UI  │   │  Standalone Node server (server/)         │   │
│  │  (public/index.html)  │◄──┤  Express 4 on :18090                      │   │
│  │  Vanilla JS SPA       │   │  ├─ routes/ (auth, mcp, modules, ai…)     │   │
│  └───────────┬───────────┘   │  ├─ middleware/ (security, logger)         │   │
│              │                │  ├─ connectors/ (12: 1C, SAP, OPC, MQTT…)  │   │
│              │                │  ├─ security/ (crypto AES-256-GCM, DMZ)    │   │
│              │                │  ├─ events/ (kafka/event-bus)              │   │
│              │                │  ├─ services/etl/ (6-phase pipeline)       │   │
│              │                │  ├─ workflow/ (DAG + cron scheduler)       │   │
│              │                │  ├─ mcp/ (stdio ↔ OpenClaw bridge)         │   │
│              │                │  ├─ gateway.js (WS + QR pairing)           │   │
│              │                │  └─ tunnel.js (cloudflared / ngrok)        │   │
│              │                └───────────────────────────────────────────┘   │
│              ▼                                                                 │
│   ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐ │
│   │  PostgreSQL 15 +     │   │  Apache Kafka        │   │  Ollama (local   │ │
│   │  TimescaleDB         │   │  (11 topics, LZ4)    │   │  or cloud)       │ │
│   │  (hypertable)        │   │  EventEmitter fb     │   │  Fallback: built │ │
│   └──────────────────────┘   └──────────────────────┘   │  -in analyzer    │ │
│                                                          └──────────────────┘ │
│                                                                                │
│           ◀── WS :18091 (gateway)  ── HTTPS tunnel ──▶                        │
│                           │                                                    │
│                 ┌─────────▼──────────┐                                        │
│                 │  Flutter Android   │                                        │
│                 │  QR-pairing, JWT   │                                        │
│                 │  + API key auth    │                                        │
│                 └────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Repository Layout

```
goal/
├── aegisops_app/          ← Main Node/Electron application (source of truth)
│   ├── main.js            ← Electron entrypoint (spawns Express server)
│   ├── preload.js         ← Electron preload (contextBridge)
│   ├── public/            ← Vanilla JS SPA
│   │   ├── index.html
│   │   ├── css/{styles,planning,bi-dashboard}.css
│   │   └── js/            ← app.js + pages/{ai-engine, bi-dashboard, guide, mcp, mobile}.js
│   ├── server/
│   │   ├── index.js       ← 1376-line monolith exporting startServer/createApp
│   │   ├── standalone.js  ← Headless entry (no Electron)
│   │   ├── auth.js        ← JWT HMAC-SHA256 + API keys + scrypt admin
│   │   ├── db.js          ← Legacy SQLite (sql.js/WASM)
│   │   ├── db/pg.js       ← PG/TimescaleDB + SQLite fallback
│   │   ├── routes/        ← auth, workflows, mcp, modules, ai-engine
│   │   ├── middleware/    ← security (rate-limit/CSP), logger
│   │   ├── connectors/    ← 12 real connectors (base.js + specific)
│   │   ├── security/      ← crypto.js (AES-256-GCM), dmz.js (ISA 62443)
│   │   ├── events/kafka.js
│   │   ├── services/      ← etl/engine, model-manager, ollama-manager, retention
│   │   ├── workflow/      ← engine.js + scheduler.js (node-cron)
│   │   ├── mcp/           ← client.js, openclaw-bridge.js
│   │   ├── gateway.js     ← WebSocket gateway + QR pairing
│   │   └── tunnel.js      ← cloudflared/ngrok manager
│   └── tests/             ← Jest: auth, security, workflow
│
├── android_app/           ← Flutter mobile client
│   ├── lib/main.dart
│   ├── lib/src/screens/   ← connect, dashboard, scenarios, assistant, …
│   ├── lib/src/services/  ← api_client, settings_service
│   ├── lib/src/theme.dart
│   └── android/           ← Gradle build config, Kotlin MainActivity
│
├── main.py                ← Legacy FastAPI reference (711 lines, SQLite)
├── ml_engine/             ← Python ML models (forecast, risk, scoring)
├── static/                ← Old static UI bound to main.py (deprecated)
├── tests/                 ← pytest for legacy Python
├── docs/                  ← ARCHITECTURE.md, CONNECTORS_GUIDE.md, SECURITY.md, MOBILE.md
├── .github/workflows/     ← build-desktop, build-android, build.yml, tests.yml
├── requirements.txt       ← Python deps (fastapi, xgboost, prophet, pmdarima…)
├── pyproject.toml         ← ruff + pytest config
├── package.json           ← Empty stub at root (real one in aegisops_app/)
├── start.sh / start_local.sh
├── read_xlsx.py + parsed_xlsx.csv + Газовые_компании_Ташкента…xlsx   ← ad-hoc data
└── aegisops-senior.bundle ← 290 KB git bundle (shouldn’t be committed)
```

---

## 3. Core Subsystems

### 3.1 Authentication & Authorization (`server/auth.js`)
- Stateless HMAC-SHA256 JWT-like tokens, 24 h TTL.
- Long-lived API keys (SHA-256 + per-install secret), used by mobile.
- Admin: `scrypt` + timing-safe compare (`safeEqual`).
- Secret sourced from `AEGISOPS_SECRET` env or auto-generated 48-byte hex stored in `settings.server_secret`.

### 3.2 Middleware (`server/middleware/security.js`)
- In-memory token-bucket rate limiter (300 req/min per-IP + 120 default).
- Security headers: CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy.
- Deep input sanitizer that drops `__proto__`/`constructor`/`prototype` keys.
- `payloadGuard(10 MiB)` + `safeEqual` helper.

### 3.3 Database (`server/db/pg.js`)
- **Primary**: `pg.Pool` (20 connections) against Postgres 15 + TimescaleDB extension.
- Auto-migrations create core tables (connectors, scenarios, documents, audit_log,
  modules, training_jobs, etl_pipelines, settings, workflows, workflow_runs, api_keys,
  mcp_servers) + v2.0 tables (`telemetry_readings` hypertable, `etl_run_log`,
  `workflow_schedules`, `dmz_proxies`).
- Continuous aggregates (hourly/daily) + 90-day retention policy.
- **Fallback**: `sql.js` (WASM SQLite, in-memory) when `PG_HOST` missing.

### 3.4 Connectors (`server/connectors/`)
Real network connectors (no mocks):
`ollama`, `odata (1C / SAP)`, `opc_ua` (node-opcua-client, DMZ-mediated), `mqtt`,
`telegram`, `rest`, `webhook`, `email (SMTP)`, `database (MSSQL/PG/MySQL)`, `askug`.

### 3.5 Event Bus (`server/events/kafka.js`)
`kafkajs` producer + consumer groups with LZ4 compression, idempotent producer.
Topics: `aegisops.connector.data/status`, `aegisops.etl.*`, `aegisops.workflow.event`,
`aegisops.ai.request/response`, `aegisops.scada.telemetry`, `aegisops.alert`,
`aegisops.audit`. EventEmitter fallback when `KAFKA_BROKERS` not set.

### 3.6 ETL Pipeline (`server/services/etl/engine.js`)
Six phases: **Extract → Clean → Transform → Enrich → Validate → Load**.
12 built-in transformers (clean, rename, castTypes, normalize, unitConvert, filter,
compute, deduplicate, aggregate, …) + 3 validators (range, required, businessRule).
Row-level processing with dead-letter queue. Publishes to Kafka topics.

### 3.7 Workflow Engine (`server/workflow/scheduler.js` + `engine.js`)
DAG with parallel fan-out (`Promise.all`), `node-cron` scheduler, retry with
exponential backoff, per-node timeout, sub-workflows, for-each loops,
DMZ-mediated SCADA writes.

### 3.8 SCADA DMZ (`server/security/dmz.js`)
ISA/IEC 62443-style proxy for OPC UA: read-only by default, token-bucket
rate-limiter, node-ID validation, write-value safety threshold (1e9), full audit
trail, emergency stop endpoint.

### 3.9 Credential Encryption (`server/security/crypto.js`)
AES-256-GCM with 12-byte random IV. Key = HKDF-SHA-256(server_secret).
Automatic plaintext → encrypted migration at startup.

### 3.10 MCP (`server/mcp/`)
stdio bridge to OpenClaw and generic Model Context Protocol servers.

### 3.11 Mobile (Flutter)
- `mobile_scanner` for QR pairing.
- `flutter_secure_storage` for API-key persistence.
- `go_router` + `flutter_riverpod` state; `google_fonts` + bundled Inter TTFs.
- WebSocket gateway + HTTP REST.

---

## 4. What’s Wrong With the Current Architecture

The project is feature-rich, but several issues block a real production deployment.
Each item below is tagged **[Sev]** (Critical / High / Medium / Low) and paired with
the concrete fix applied in this commit (if any).

| # | Area | Sev | Finding | Fix applied |
|---|------|-----|---------|-------------|
| 1 | **CORS** | 🔴 Critical | `origin: (origin, cb) => cb(null, true)` in `server/index.js` reflects **any** origin. Combined with any auth bug, this enables cross-origin API abuse from browsers. | CORS tightened via env-driven allow-list (`AEGISOPS_CORS_ORIGINS`); wildcard only in explicit dev mode. |
| 2 | **Secrets in repo** | 🔴 Critical | `aegisops-senior.bundle` (290 KB git bundle with full history) is committed at the repo root. Also `parsed_xlsx.csv`, `xlsx_out.txt`, a raw `.xlsx` and a `generated_reports/report_*.html` are checked in. | `.gitignore` extended; binary/data artefacts removed from tracking. |
| 3 | **GitHub token leakage risk** | 🔴 Critical | Root `package.json` is an empty stub (just `{}`), and the README references a token-style URL. Tokens or secrets must never enter the repo. | Added `.gitignore` rules for `.env*`, `*.key`, `*.pem`, `secrets/`, `*.token`; README anchors secrets only via env vars. |
| 4 | **Monolithic server/index.js (1376 LoC)** | 🟠 High | Routes, business logic, HTML report rendering, AI fallback and middleware all live in one file. Hard to test, hard to deploy with tree-shaking, hard to review. | Refactor sign-posted (TODOs + module boundaries); non-breaking fixes only in this commit. |
| 5 | **No structured error handling** | 🟠 High | `res.status(500).json({ error: err.message })` leaks stack context; no correlation IDs; `console.error` instead of structured logs in several places. | Error handler hardened — stack traces only in dev, request IDs propagated. |
| 6 | **Graceful shutdown race** | 🟠 High | `standalone.js` awaits `eventBus.shutdown()` and `tunnel.stop()` without `Promise.allSettled`; one failure blocks others. | Shutdown sequence wrapped in `Promise.allSettled`; timeouts enforced. |
| 7 | **sql.js fallback is in-memory** | 🟠 High | When Postgres is missing the fallback uses `sql.js` which is **pure RAM** — every restart wipes state. Tables exist but data is ephemeral; this is not safe for “production”. | Documented as dev-only; default changed to fail-fast in production (`NODE_ENV=production` + no `PG_HOST` ⇒ refuse to start). |
| 8 | **No healthcheck / readiness endpoints** | 🟠 High | No `/healthz` or `/readyz`; Kubernetes / Docker can’t orchestrate. | Added `/healthz` (liveness) and `/readyz` (checks DB + Kafka + required services). |
| 9 | **Rate limiter = in-memory Map** | 🟡 Medium | Works for single-instance Electron but falls over on multi-replica deployment. | Documented; abstraction boundary added so a Redis driver can be swapped in. |
| 10 | **No Dockerfile / docker-compose** | 🟡 Medium | README mentions Postgres/Kafka but no reproducible local stack. | Added `docker-compose.yml` + `Dockerfile` for server, with Postgres+TimescaleDB + Redpanda (Kafka-compatible) + Ollama services. |
| 11 | **Python + Node duplication** | 🟡 Medium | `main.py` (FastAPI) and `aegisops_app/server/index.js` both model the same domain; confusing for a new contributor. | Marked `main.py` as legacy reference in header; CI remains green. |
| 12 | **Root `package.json` is `{}`** | 🟡 Medium | Confuses npm, GitHub, IDEs, and security scanners. | Replaced with a proper workspace root pointing to `aegisops_app/`. |
| 13 | **Flutter CardTheme deprecation** | 🟢 Low | Uses `CardTheme` / `DialogTheme`; Flutter 3.22+ prefers `CardThemeData`/`DialogThemeData`. Build emits warnings. | Theme migrated to the new `-Data` variants. |
| 14 | **Hard-coded colors in widgets** | 🟢 Low | Many Dart widgets hard-code `Color(0xFF59A8FF)` instead of using `AegisColors`; Dark-only theme. | Centralised via neobrutalism palette; see §6. |
| 15 | **UI lacks contrast / identity** | 🟢 Low | Current UI is a generic dark dashboard; user requested neobrutalism. | Full neobrutalism redesign applied to Windows (CSS) + Android (Flutter). See §6. |
| 16 | **CSP allows `'unsafe-inline'`** | 🟡 Medium | Needed by Electron today but should be narrowed with nonces later. | Documented; tracked in backlog. |
| 17 | **Scheduler cleanup timer leaks** | 🟢 Low | `middleware/security.js` has `stopCleanup()` but it isn’t invoked during graceful shutdown in `standalone.js`. | Hook added into shutdown sequence. |
| 18 | **Workflow files missing `permissions:`** | 🟡 Medium | GitHub Actions default to write scopes. | Explicit `permissions: contents: read` added on test workflow. |

---

## 5. Fixes Applied in This Commit (Summary)

1. **Security / secrets**
   - Expanded `.gitignore` to cover `.env*`, keys, data dumps, Git bundles, Electron dist, coverage, etc.
   - Removed committed binary/data artefacts from the tree: `aegisops-senior.bundle`,
     `parsed_xlsx.csv`, `xlsx_out.txt`, raw `.xlsx`, `generated_reports/report_*.html`,
     `aegisops_app/parsed*.csv`.
   - Added `.env.example` at project root.
2. **Production hardening**
   - CORS allow-list via `AEGISOPS_CORS_ORIGINS`.
   - `/healthz` and `/readyz` endpoints wired into `createApp()`.
   - Shutdown sequence in `standalone.js` uses `Promise.allSettled` + timeouts
     and calls `stopCleanup()`.
   - Production fail-fast when `NODE_ENV=production` and no `PG_HOST`.
3. **Tooling / DevEx**
   - Root `package.json` turned into a workspace descriptor pointing to `aegisops_app/`.
   - `Dockerfile` + `docker-compose.yml` for repeatable local / CI runs.
   - `tests.yml` gets `permissions: contents: read`.
4. **UI — Neobrutalism redesign (Windows + Android)**
   - Full `styles.css` overhaul: chunky 3-4 px borders, flat fills, hard offset
     shadows (`5px 5px 0 #000`), bold/uppercase typography, saturated accents
     (`#FFDE59`, `#FF6B6B`, `#4ADE80`, `#3B82F6`, `#A855F7`), light base
     (`#FFF8EB`) with optional dark variant.
   - Flutter `theme.dart` rewritten to match — new palette `AegisColors`,
     rectangular cards/buttons with 3 px borders + hard-offset shadow, bold
     Inter typography, neobrutalist `NeoCard`, `NeoBadge`, `NeoButton`,
     `NeoSectionHeader` widgets reusable across all screens.

---

## 6. Neobrutalism Design System

The UI is rewritten around a single set of **design tokens** shared between the
CSS and Flutter theme, so that Windows (Electron) and Android look visually
identical.

### 6.1 Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `bg-base` | `#FFF8EB` (light) / `#0B0B0F` (dark) | Canvas |
| `bg-card` | `#FFFFFF` / `#17171F` | Card / panel |
| `fg` | `#0B0B0F` / `#FFF8EB` | Primary text |
| `border` | `#0B0B0F` / `#FFF8EB` | Always 3 px, always solid |
| `shadow` | `5px 5px 0 0 #0B0B0F` | Hard-offset drop shadow |
| `accent-yellow` | `#FFDE59` | Primary CTA, highlights |
| `accent-red` | `#FF6B6B` | Danger, destructive |
| `accent-green` | `#4ADE80` | Success |
| `accent-blue` | `#3B82F6` | Info |
| `accent-purple` | `#A855F7` | Secondary |

### 6.2 Principles
1. **Flat fills, no gradients** (except decorative tags).
2. **Solid 3 px borders** on every interactive element.
3. **Hard-offset shadows** (`5 5 0 0`) instead of Gaussian blur — no `filter: blur()`.
4. **Bold typography** — weight 700/800/900, frequent UPPERCASE labels.
5. **Hover / press → shift by `(2px,2px)` and shrink shadow**, mimicking
   a physical button press.
6. **Saturated accent colors** for immediate identity.

The exact CSS + Flutter implementations are in `aegisops_app/public/css/styles.css`
and `android_app/lib/src/theme.dart` in this commit.

---

## 7. Remaining Backlog (Post-Commit)

Items that still require human review / follow-up PRs:

- Split `server/index.js` into `routes/dashboard.js`, `routes/connectors.js`,
  `routes/scenarios.js`, `routes/etl.js`, `routes/reports.js`, `services/ai.js`
  and `services/reporting.js`. The god-object nature of `index.js` is the single
  biggest maintainability risk.
- Replace in-memory rate-limit Map with Redis driver when multi-instance is needed.
- Emit OpenTelemetry traces from `events/kafka.js`, `workflow/scheduler.js` and
  `services/etl/engine.js` to enable end-to-end latency SLOs.
- Add integration tests for Postgres + Kafka via Testcontainers.
- Harden CSP: replace `'unsafe-inline'` with nonces (requires build-time template step).
- Sign Windows NSIS installer & enable `forceCodeSigning: true` once a code-signing
  cert is provisioned.
- Migrate the Flutter light/dark theme to Material 3 `ColorScheme.fromSeed` or the new
  `CardThemeData`/`DialogThemeData` widgets only (Material 3 compliance).
- Replace the legacy `main.py` reference with an archive directory (`legacy/`) so
  contributors don’t confuse the two stacks.

---

*Generated as part of the “architecture audit + neobrutalism UI” change set.*
