"""
AegisOps ML Engine — Прогнозирование баланса газа, скоринг, оценка рисков.

Модули:
  - models/forecast.py   — Prophet, ARIMA, XGBoost для временных рядов
  - models/scoring.py    — Скоринговые модели для оценки платежеспособности
  - models/risk.py       — Регрессионные модели для оценки рисков
  - api/main.py          — FastAPI endpoints для прогнозов и аналитики
  - utils/db.py          — Подключение к PostgreSQL/TimescaleDB
  - utils/preprocessing  — Очистка и подготовка данных
"""
__version__ = "1.0.0"
