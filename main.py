from __future__ import annotations

import json
import os
import sqlite3
import textwrap
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "aegisops.db"
STATIC_DIR = BASE_DIR / "static"
REPORTS_DIR = BASE_DIR / "generated_reports"
REPORTS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="AegisOps Local AI", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler = BackgroundScheduler()


class ConnectorIn(BaseModel):
    name: str
    type: str
    base_url: str = ""
    auth_mode: str = "none"
    auth_payload: Dict[str, Any] = Field(default_factory=dict)
    config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ScenarioIn(BaseModel):
    name: str
    category: str
    cron_expr: str = ""
    connector_ids: List[int] = Field(default_factory=list)
    objective: str
    delivery_channel: str = "none"
    config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ExecuteScenarioIn(BaseModel):
    ask: str = ""
    send_to_telegram: bool = False


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS connectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT,
    auth_mode TEXT,
    auth_payload TEXT,
    config TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    cron_expr TEXT,
    connector_ids TEXT,
    objective TEXT,
    delivery_channel TEXT,
    config TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    scenario_id INTEGER,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def log_event(event_type: str, payload: Dict[str, Any]) -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO audit_log(event_type, payload, created_at) VALUES (?, ?, ?)",
            (event_type, json.dumps(payload, ensure_ascii=False), now_iso()),
        )


def init_db() -> None:
    seeded = False
    with get_db() as conn:
        conn.executescript(SCHEMA_SQL)
        count = conn.execute("SELECT COUNT(*) AS c FROM connectors").fetchone()["c"]
        if count == 0:
            seed(conn)
            seeded = True
    if seeded:
        log_event("system.seeded", {"status": "ok"})


def seed(conn: sqlite3.Connection) -> None:
    ts = now_iso()
    connectors = [
        (
            "Локальная LLM (Ollama)",
            "ollama",
            "http://127.0.0.1:11434",
            "none",
            {},
            {"model": "qwen2.5:7b-instruct", "embedding_model": "nomic-embed-text"},
            1,
        ),
        (
            "1C / OData",
            "one_c_odata",
            "http://localhost/odata/standard.odata",
            "basic",
            {"username": "demo", "password": "demo"},
            {"entity": "Document_РеализацияТоваровУслуг"},
            0,
        ),
        (
            "SAP / OData",
            "sap_odata",
            "https://sap.example.local/odata",
            "bearer",
            {"token": "CHANGE_ME"},
            {"service": "A_SALESORDER_SRV"},
            0,
        ),
        (
            "SCADA / OPC UA",
            "opc_ua",
            "opc.tcp://127.0.0.1:4840",
            "none",
            {},
            {"nodes": ["ns=2;i=2", "ns=2;i=3"]},
            0,
        ),
        (
            "Telegram Bot",
            "telegram",
            "https://api.telegram.org",
            "token",
            {"token": "CHANGE_ME", "chat_id": "CHANGE_ME"},
            {},
            0,
        ),
    ]
    for name, ctype, base_url, auth_mode, auth_payload, config, enabled in connectors:
        conn.execute(
            """
            INSERT INTO connectors(name, type, base_url, auth_mode, auth_payload, config, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                ctype,
                base_url,
                auth_mode,
                json.dumps(auth_payload, ensure_ascii=False),
                json.dumps(config, ensure_ascii=False),
                enabled,
                ts,
                ts,
            ),
        )
    scenarios = [
        (
            "Ежедневный отчет по состоянию газопровода",
            "operations",
            "0 5 * * *",
            [1, 4, 5],
            "Каждый день в 05:00 собирать данные по газовому балансу, технологическим показателям и формировать управленческий отчет с отправкой руководителю.",
            "telegram",
            {"template": "gas_daily", "audience": "руководитель департамента"},
            1,
        ),
        (
            "Контроль дебиторской задолженности",
            "finance",
            "0 8 * * 1-5",
            [1, 2, 3],
            "Анализировать платежи, прогнозировать кассовые разрывы и формировать список рискованных контрагентов.",
            "none",
            {"template": "finance_risk", "threshold": 0.72},
            1,
        ),
    ]
    for name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled in scenarios:
        conn.execute(
            """
            INSERT INTO scenarios(name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                category,
                cron_expr,
                json.dumps(connector_ids),
                objective,
                delivery_channel,
                json.dumps(config, ensure_ascii=False),
                enabled,
                ts,
                ts,
            ),
        )

def row_to_connector(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "base_url": row["base_url"],
        "auth_mode": row["auth_mode"],
        "auth_payload": json.loads(row["auth_payload"] or "{}"),
        "config": json.loads(row["config"] or "{}"),
        "enabled": bool(row["enabled"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_scenario(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "cron_expr": row["cron_expr"],
        "connector_ids": json.loads(row["connector_ids"] or "[]"),
        "objective": row["objective"],
        "delivery_channel": row["delivery_channel"],
        "config": json.loads(row["config"] or "{}"),
        "enabled": bool(row["enabled"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


async def fetch_connector_payload(connector: Dict[str, Any]) -> Dict[str, Any]:
    ctype = connector["type"]
    base_url = connector["base_url"].rstrip("/")
    auth = connector["auth_payload"]
    config = connector["config"]

    if ctype == "ollama":
        model = config.get("model", "qwen2.5:7b-instruct")
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    f"{base_url}/api/chat",
                    json={
                        "model": model,
                        "stream": False,
                        "messages": [
                            {"role": "system", "content": "You are an enterprise analyst."},
                            {"role": "user", "content": "Сформируй короткий статус готовности локальной AI-платформы для enterprise интеграций."},
                        ],
                    },
                )
                r.raise_for_status()
                data = r.json()
                return {"connector": connector["name"], "status": "online", "sample": data.get("message", {}).get("content", "")}
        except Exception as exc:
            return {"connector": connector["name"], "status": "offline", "error": str(exc)}

    if ctype == "one_c_odata":
        entity = config.get("entity", "")
        url = f"{base_url}/{entity}?$top=5" if entity else base_url
        try:
            async with httpx.AsyncClient(timeout=20.0, auth=(auth.get("username", ""), auth.get("password", ""))) as client:
                r = await client.get(url, headers={"Accept": "application/json"})
                r.raise_for_status()
                return {"connector": connector["name"], "status": "online", "payload": r.json()}
        except Exception as exc:
            return {
                "connector": connector["name"],
                "status": "demo",
                "note": "Подключите реальный URL 1C OData. Сейчас показан демо-режим.",
                "sample": {
                    "warehouse_balance": 124500,
                    "contracts_overdue": 17,
                    "latest_document": "РеализацияТоваровУслуг-000154",
                    "error": str(exc),
                },
            }

    if ctype == "sap_odata":
        service = config.get("service", "")
        url = f"{base_url}/{service}" if service else base_url
        headers = {"Accept": "application/json"}
        if auth.get("token"):
            headers["Authorization"] = f"Bearer {auth['token']}"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(url, headers=headers)
                r.raise_for_status()
                return {"connector": connector["name"], "status": "online", "payload": r.json()}
        except Exception as exc:
            return {
                "connector": connector["name"],
                "status": "demo",
                "sample": {
                    "sales_orders_at_risk": 12,
                    "inventory_health": "amber",
                    "last_sync": now_iso(),
                    "error": str(exc),
                },
            }

    if ctype == "opc_ua":
        try:
            from asyncua import Client  # type: ignore

            values = []
            async with Client(url=base_url) as client:
                for node_id in config.get("nodes", []):
                    node = client.get_node(node_id)
                    value = await node.read_value()
                    values.append({"node": node_id, "value": value})
            return {"connector": connector["name"], "status": "online", "payload": values}
        except Exception as exc:
            return {
                "connector": connector["name"],
                "status": "demo",
                "sample": {
                    "pressure_mpa": 5.4,
                    "temperature_c": 14.7,
                    "anomaly_score": 0.12,
                    "error": str(exc),
                },
            }

    if ctype == "telegram":
        return {"connector": connector["name"], "status": "configured" if auth.get("token") and auth.get("chat_id") else "not_configured"}

    return {"connector": connector["name"], "status": "unknown"}


async def ask_ai(prompt: str) -> Dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM connectors WHERE type='ollama' LIMIT 1").fetchone()
    if row:
        connector = row_to_connector(row)
        model = connector["config"].get("model", "qwen2.5:7b-instruct")
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                r = await client.post(
                    f"{connector['base_url'].rstrip('/')}/api/chat",
                    json={
                        "model": model,
                        "stream": False,
                        "messages": [
                            {"role": "system", "content": "Ты enterprise AI-архитектор. Отвечай структурированно и по делу."},
                            {"role": "user", "content": prompt},
                        ],
                    },
                )
                r.raise_for_status()
                data = r.json()
                return {"provider": "ollama", "content": data.get("message", {}).get("content", "")}
        except Exception:
            pass

    fallback = textwrap.dedent(
        f"""
        Локальная модель недоступна, поэтому сработал безопасный fallback.
        Рекомендация: разверните Ollama и подключите модель уровня 7B-32B для локального инференса.
        Запрос: {prompt[:800]}
        """
    ).strip()
    return {"provider": "fallback", "content": fallback}


async def send_telegram_report(html_path: Path, caption: str) -> Dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM connectors WHERE type='telegram' LIMIT 1").fetchone()
    if not row:
        return {"status": "skipped", "reason": "telegram connector not found"}
    connector = row_to_connector(row)
    token = connector["auth_payload"].get("token")
    chat_id = connector["auth_payload"].get("chat_id")
    if not token or token == "CHANGE_ME" or not chat_id or chat_id == "CHANGE_ME":
        return {"status": "skipped", "reason": "telegram connector not configured"}

    send_message_url = f"https://api.telegram.org/bot{token}/sendMessage"
    send_doc_url = f"https://api.telegram.org/bot{token}/sendDocument"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(send_message_url, json={"chat_id": chat_id, "text": caption})
            with open(html_path, "rb") as fh:
                files = {"document": (html_path.name, fh, "text/html")}
                data = {"chat_id": chat_id}
                r = await client.post(send_doc_url, data=data, files=files)
                r.raise_for_status()
        return {"status": "sent"}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


async def build_report(scenario: Dict[str, Any], extra_ask: str = "", send_to_telegram: bool = False) -> Dict[str, Any]:
    connectors: List[Dict[str, Any]] = []
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM connectors WHERE enabled=1").fetchall()
        connector_map = {row["id"]: row_to_connector(row) for row in rows}
    for connector_id in scenario["connector_ids"]:
        if connector_id in connector_map:
            connectors.append(connector_map[connector_id])

    collected = []
    for connector in connectors:
        collected.append(await fetch_connector_payload(connector))

    prompt = textwrap.dedent(
        f"""
        Сценарий: {scenario['name']}
        Цель: {scenario['objective']}
        Дополнительный запрос: {extra_ask}
        Собранные данные: {json.dumps(collected, ensure_ascii=False, indent=2)}

        Подготовь краткий управленческий отчет на русском языке в формате:
        1. Итоговый статус
        2. Ключевые отклонения и риски
        3. Рекомендованные действия на сегодня
        4. Что автоматизировать дальше
        """
    ).strip()

    ai = await ask_ai(prompt)
    report_id = uuid4().hex[:8]
    html = f"""
    <!DOCTYPE html>
    <html lang='ru'>
    <head>
      <meta charset='UTF-8'>
      <meta name='viewport' content='width=device-width, initial-scale=1.0'>
      <title>{scenario['name']}</title>
      <style>
        body {{ font-family: Inter, Arial, sans-serif; margin: 0; background: #0b1220; color: #e8eefc; }}
        .wrap {{ max-width: 980px; margin: 0 auto; padding: 32px; }}
        .card {{ background: #121b31; border: 1px solid #24304e; border-radius: 20px; padding: 24px; margin-bottom: 20px; }}
        h1, h2 {{ margin: 0 0 14px; }}
        pre {{ white-space: pre-wrap; word-break: break-word; background: #09101d; padding: 16px; border-radius: 14px; border: 1px solid #23314f; }}
        .muted {{ color: #8ea1c9; }}
        .badge {{ display: inline-block; padding: 8px 12px; border-radius: 999px; background: #18315e; color: #9fcbff; }}
      </style>
    </head>
    <body>
      <div class='wrap'>
        <div class='card'>
          <div class='badge'>AegisOps Local AI</div>
          <h1>{scenario['name']}</h1>
          <p class='muted'>Сгенерировано: {now_iso()}</p>
          <p>{scenario['objective']}</p>
        </div>
        <div class='card'>
          <h2>Управленческий вывод</h2>
          <pre>{ai['content']}</pre>
        </div>
        <div class='card'>
          <h2>Собранные данные</h2>
          <pre>{json.dumps(collected, ensure_ascii=False, indent=2)}</pre>
        </div>
      </div>
    </body>
    </html>
    """
    html_path = REPORTS_DIR / f"report_{report_id}.html"
    html_path.write_text(html, encoding="utf-8")

    with get_db() as conn:
        conn.execute(
            "INSERT INTO documents(title, kind, scenario_id, path, created_at) VALUES (?, ?, ?, ?, ?)",
            (scenario["name"], "html_report", scenario["id"], str(html_path), now_iso()),
        )

    telegram = {"status": "skipped"}
    if send_to_telegram or scenario["delivery_channel"] == "telegram":
        telegram = await send_telegram_report(html_path, f"Отчет готов: {scenario['name']}")

    payload = {
        "scenario": scenario["name"],
        "report_path": str(html_path),
        "ai_provider": ai["provider"],
        "telegram": telegram,
    }
    log_event("scenario.executed", payload)
    return payload


@app.on_event("startup")
async def startup_event() -> None:
    init_db()
    if not scheduler.running:
        scheduler.start()


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    with get_db() as conn:
        connectors = conn.execute("SELECT COUNT(*) AS c FROM connectors").fetchone()["c"]
        scenarios = conn.execute("SELECT COUNT(*) AS c FROM scenarios").fetchone()["c"]
        docs = conn.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]
    return {
        "status": "ok",
        "product": "AegisOps Local AI",
        "version": "0.1.0",
        "connectors": connectors,
        "scenarios": scenarios,
        "documents": docs,
        "ts": now_iso(),
    }


@app.get("/api/dashboard")
async def dashboard() -> Dict[str, Any]:
    with get_db() as conn:
        connectors = [row_to_connector(r) for r in conn.execute("SELECT * FROM connectors ORDER BY id").fetchall()]
        scenarios = [row_to_scenario(r) for r in conn.execute("SELECT * FROM scenarios ORDER BY id").fetchall()]
        logs = [dict(r) for r in conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 10").fetchall()]
        docs = [dict(r) for r in conn.execute("SELECT * FROM documents ORDER BY id DESC LIMIT 10").fetchall()]
    return {
        "hero": {
            "title": "Universal Local AI Platform for Enterprise",
            "subtitle": "Локальная AI-оркестрация для 1C, SAP, SCADA, Telegram и on-prem LLM",
            "highlights": [
                "Локальные модели и RAG",
                "Коннекторы к enterprise системам",
                "Сценарии и планировщик",
                "Аудит, документы, агенты",
            ],
        },
        "modules": [
            {"name": "Газовый баланс и инфраструктура", "status": "prototype"},
            {"name": "Аналитика потребления", "status": "prototype"},
            {"name": "Мониторинг платежей и задолженности", "status": "prototype"},
            {"name": "Финансовое моделирование и тарифы", "status": "prototype"},
            {"name": "Управление рисками", "status": "prototype"},
        ],
        "connectors": connectors,
        "scenarios": scenarios,
        "logs": logs,
        "documents": docs,
    }


@app.get("/api/connectors")
async def list_connectors() -> List[Dict[str, Any]]:
    with get_db() as conn:
        return [row_to_connector(r) for r in conn.execute("SELECT * FROM connectors ORDER BY id").fetchall()]


@app.post("/api/connectors")
async def create_connector(payload: ConnectorIn) -> Dict[str, Any]:
    ts = now_iso()
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO connectors(name, type, base_url, auth_mode, auth_payload, config, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.name,
                payload.type,
                payload.base_url,
                payload.auth_mode,
                json.dumps(payload.auth_payload, ensure_ascii=False),
                json.dumps(payload.config, ensure_ascii=False),
                int(payload.enabled),
                ts,
                ts,
            ),
        )
        connector_id = cur.lastrowid
        row = conn.execute("SELECT * FROM connectors WHERE id=?", (connector_id,)).fetchone()
    result = row_to_connector(row)
    log_event("connector.created", result)
    return result


@app.get("/api/scenarios")
async def list_scenarios() -> List[Dict[str, Any]]:
    with get_db() as conn:
        return [row_to_scenario(r) for r in conn.execute("SELECT * FROM scenarios ORDER BY id").fetchall()]


@app.post("/api/scenarios")
async def create_scenario(payload: ScenarioIn) -> Dict[str, Any]:
    ts = now_iso()
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO scenarios(name, category, cron_expr, connector_ids, objective, delivery_channel, config, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.name,
                payload.category,
                payload.cron_expr,
                json.dumps(payload.connector_ids, ensure_ascii=False),
                payload.objective,
                payload.delivery_channel,
                json.dumps(payload.config, ensure_ascii=False),
                int(payload.enabled),
                ts,
                ts,
            ),
        )
        scenario_id = cur.lastrowid
        row = conn.execute("SELECT * FROM scenarios WHERE id=?", (scenario_id,)).fetchone()
    result = row_to_scenario(row)
    log_event("scenario.created", result)
    return result


@app.post("/api/scenarios/{scenario_id}/run")
async def run_scenario(scenario_id: int, payload: ExecuteScenarioIn) -> Dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM scenarios WHERE id=?", (scenario_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Scenario not found")
    scenario = row_to_scenario(row)
    return await build_report(scenario, payload.ask, payload.send_to_telegram)


@app.get("/api/documents")
async def list_documents() -> List[Dict[str, Any]]:
    with get_db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM documents ORDER BY id DESC").fetchall()]


@app.get("/api/documents/{document_id}/download")
async def download_document(document_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(row["path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(path, filename=path.name)


@app.post("/api/assistant")
async def assistant(payload: Dict[str, Any]) -> Dict[str, Any]:
    prompt = payload.get("prompt", "")
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")
    result = await ask_ai(prompt)
    log_event("assistant.asked", {"prompt": prompt[:500], "provider": result["provider"]})
    return result


@app.get("/")
async def index() -> HTMLResponse:
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
