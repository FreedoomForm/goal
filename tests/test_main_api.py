"""Smoke tests for the FastAPI backend (main.py)."""
import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="module")
def client():
    # Use a temp DB per test-module so we don't pollute the real one.
    tmp_dir = tempfile.mkdtemp()
    tmp_db = Path(tmp_dir) / "aegisops_test.db"
    # main.py reads DB_PATH at import time; override via monkey-patch of module attr.
    import main as main_module  # noqa: E402
    main_module.DB_PATH = tmp_db
    main_module.REPORTS_DIR = Path(tmp_dir) / "reports"
    main_module.REPORTS_DIR.mkdir(exist_ok=True)
    main_module.init_db()
    with TestClient(main_module.app) as c:
        yield c


def test_health_endpoint(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["product"] == "AegisOps Local AI"
    assert "connectors" in body and body["connectors"] >= 0
    assert "scenarios" in body


def test_dashboard_endpoint(client):
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert "hero" in body
    assert "modules" in body and isinstance(body["modules"], list)
    assert "connectors" in body and isinstance(body["connectors"], list)
    # Seeded data should include 5 gas-analytics modules
    assert len(body["modules"]) >= 5


def test_connectors_list(client):
    r = client.get("/api/connectors")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    assert any(c.get("type") == "ollama" for c in rows)


def test_create_connector(client):
    payload = {
        "name": "Test REST",
        "type": "crm_rest",
        "base_url": "https://example.com",
        "auth_mode": "bearer",
        "auth_payload": {"token": "x"},
        "config": {},
        "enabled": True,
    }
    r = client.post("/api/connectors", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Test REST"
    assert body["enabled"] is True


def test_assistant_requires_prompt(client):
    r = client.post("/api/assistant", json={})
    assert r.status_code == 400
    r2 = client.post("/api/assistant", json={"prompt": "Hi"})
    # No Ollama in CI → falls back
    assert r2.status_code == 200
    body = r2.json()
    assert "content" in body
    assert body["provider"] in ("ollama", "fallback")


def test_scenarios_list(client):
    r = client.get("/api/scenarios")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_run_scenario_returns_report(client):
    r = client.get("/api/scenarios")
    scenarios = r.json()
    assert scenarios, "seed should create at least one scenario"
    sid = scenarios[0]["id"]
    r2 = client.post(f"/api/scenarios/{sid}/run", json={"ask": "test"})
    assert r2.status_code == 200
    payload = r2.json()
    assert "report_path" in payload
    assert Path(payload["report_path"]).exists()


def test_run_missing_scenario_returns_404(client):
    r = client.post("/api/scenarios/999999/run", json={})
    assert r.status_code == 404
