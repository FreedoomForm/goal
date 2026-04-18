"""Pytest configuration shared across tests."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

# Make project root importable as a package root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture
def temp_db(monkeypatch):
    """Isolated SQLite database per test."""
    with tempfile.TemporaryDirectory() as d:
        db_path = Path(d) / "test.db"
        monkeypatch.setenv("AEGISOPS_DB_PATH", str(db_path))
        yield db_path


@pytest.fixture
def anyio_backend():
    return "asyncio"
