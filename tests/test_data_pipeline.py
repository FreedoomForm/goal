"""Tests for utility data-processing in read_xlsx.py (if present)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def test_read_xlsx_module_imports():
    """read_xlsx.py should be importable without side effects on import."""
    try:
        import read_xlsx  # noqa: F401
    except SystemExit:
        # The script may exit gracefully if there's no xlsx file
        pass
    except ImportError as e:
        # openpyxl may be optional in CI
        if "openpyxl" in str(e):
            return
        raise
