"""
Подключение к PostgreSQL/TimescaleDB для ML Engine.
Извлекает исторические данные для обучения и прогнозирования.
"""

import logging
import os
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("ml_engine.db")

# Конфигурация из переменных окружения или значений по умолчанию
DB_CONFIG = {
    "host": os.getenv("AEGISOPS_PG_HOST", "localhost"),
    "port": int(os.getenv("AEGISOPS_PG_PORT", "5432")),
    "database": os.getenv("AEGISOPS_PG_DB", "aegisops"),
    "user": os.getenv("AEGISOPS_PG_USER", "aegisops"),
    "password": os.getenv("AEGISOPS_PG_PASSWORD", ""),
}


def get_connection_string() -> str:
    return (
        f"postgresql://{DB_CONFIG['user']}:{DB_CONFIG['password']}"
        f"@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
    )


def _get_engine():
    try:
        from sqlalchemy import create_engine
        return create_engine(get_connection_string(), pool_size=5, max_overflow=10)
    except ImportError:
        logger.warning("sqlalchemy not installed, falling back to sqlite")
        return None


def _get_sqlite():
    """Fallback на SQLite если PostgreSQL недоступен."""
    try:
        import sqlite3
        db_path = os.getenv("AEGISOPS_SQLITE_PATH", "../aegisops.db")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        logger.error(f"SQLite fallback failed: {e}")
        return None


def fetch_gas_balance(days: int = 365) -> pd.DataFrame:
    """Извлечь исторический баланс газа за N дней.

    Returns:
        DataFrame с колонками ['ds', 'supply_mcm', 'demand_mcm', 'net_balance_mcm']
    """
    try:
        engine = _get_engine()
        if engine:
            query = f"""
                SELECT
                    time_bucket('1 day', time) AS ds,
                    SUM(CASE WHEN metric_name LIKE '%supply%' OR metric_name LIKE '%inlet%'
                             THEN value ELSE 0 END) AS supply_mcm,
                    SUM(CASE WHEN metric_name LIKE '%demand%' OR metric_name LIKE '%consumption%'
                             THEN value ELSE 0 END) AS demand_mcm
                FROM telemetry_readings
                WHERE time >= NOW() - INTERVAL '{days} days'
                GROUP BY 1
                ORDER BY 1
            """
            df = pd.read_sql(query, engine)
            df["net_balance_mcm"] = df["supply_mcm"] - df["demand_mcm"]
            return df
    except Exception as e:
        logger.warning(f"PostgreSQL query failed: {e}")

    # SQLite fallback — генерируем синтетические данные для демо
    logger.info("Using synthetic data for demo")
    dates = pd.date_range(end=pd.Timestamp.now(), periods=days, freq="D")
    np.random.seed(42)
    base = 5000 + np.sin(np.arange(days) * 2 * np.pi / 365) * 1000  # сезонность
    noise = np.random.normal(0, 200, days)
    supply = base + noise + np.arange(days) * 2  # лёгкий рост
    demand = base * 0.85 + np.random.normal(0, 150, days)

    return pd.DataFrame({
        "ds": dates,
        "supply_mcm": np.round(supply, 2),
        "demand_mcm": np.round(demand, 2),
        "net_balance_mcm": np.round(supply - demand, 2),
    })


def fetch_telemetry(metric_name: str = None, days: int = 30,
                    connector_id: int = None) -> pd.DataFrame:
    """Извлечь телеметрические данные."""
    try:
        engine = _get_engine()
        if engine:
            where_clauses = [f"time >= NOW() - INTERVAL '{days} days'"]
            params = {}
            if metric_name:
                where_clauses.append("metric_name = :metric")
                params["metric"] = metric_name
            if connector_id:
                where_clauses.append("connector_id = :cid")
                params["cid"] = connector_id

            where = " AND ".join(where_clauses)
            query = f"SELECT time AS ds, connector_id, node_id, metric_name, value, quality FROM telemetry_readings WHERE {where} ORDER BY time"
            return pd.read_sql(query, engine, params=params)
    except Exception as e:
        logger.warning(f"Telemetry query failed: {e}")

    # SQLite fallback — синтетические данные
    logger.info("Using synthetic telemetry data")
    dates = pd.date_range(end=pd.Timestamp.now(), periods=days * 24, freq="H")
    return pd.DataFrame({
        "ds": dates,
        "connector_id": 1,
        "node_id": "sim_pressure_node",
        "metric_name": metric_name or "pressure_mpa",
        "value": np.random.uniform(2.0, 6.5, len(dates)),
        "quality": "Good",
    })


def fetch_consumers() -> pd.DataFrame:
    """Извлечь данные потребителей для скоринга."""
    try:
        engine = _get_engine()
        if engine:
            query = """
                SELECT
                    c.id AS consumer_id,
                    c.name AS consumer_name,
                    c.type AS consumer_type,
                    c.region,
                    COALESCE(b.current_debt, 0) AS current_debt,
                    COALESCE(b.monthly_bill, 0) AS monthly_bill,
                    COALESCE(b.payment_history, '[]') AS payment_history,
                    COALESCE(b.consumption_history, '[]') AS consumption_history
                FROM consumers c
                LEFT JOIN billing b ON b.consumer_id = c.id
                ORDER BY c.id
            """
            return pd.read_sql(query, engine)
    except Exception as e:
        logger.warning(f"Consumers query failed: {e}")

    # SQLite fallback — синтетические данные
    logger.info("Using synthetic consumer data")
    np.random.seed(42)
    n = 50
    regions = ["Ташкент", "Самарканд", "Бухара", "Наманган", "Фергана"]
    types = ["промышленный", "коммунальный", "бытовой"]
    data = {
        "consumer_id": list(range(1, n + 1)),
        "consumer_name": [f"Потребитель {i}" for i in range(1, n + 1)],
        "consumer_type": np.random.choice(types, n),
        "region": np.random.choice(regions, n),
        "current_debt": np.random.exponential(500, n).round(2),
        "monthly_bill": np.random.uniform(100, 5000, n).round(2),
    }
    # Генерируем историю оплат
    data["payment_history"] = [
        [{"on_time": bool(np.random.random() > 0.2), "delay_days": int(np.random.exponential(5))}
         for _ in range(np.random.randint(6, 24))]
        for _ in range(n)
    ]
    # Генерируем историю потребления
    data["consumption_history"] = [
        np.random.lognormal(7, 0.5, np.random.randint(6, 24)).tolist()
        for _ in range(n)
    ]
    return pd.DataFrame(data)


def fetch_billing(days: int = 365) -> pd.DataFrame:
    """Извлечь финансовые данные."""
    try:
        engine = _get_engine()
        if engine:
            query = f"""
                SELECT
                    date AS ds,
                    SUM(revenue) AS revenue,
                    SUM(cost) AS cost,
                    SUM(receivables) AS receivables
                FROM billing_daily
                WHERE date >= CURRENT_DATE - INTERVAL '{days} days'
                GROUP BY 1 ORDER BY 1
            """
            return pd.read_sql(query, engine)
    except Exception as e:
        logger.warning(f"Billing query failed: {e}")

    # Fallback
    logger.info("Using synthetic billing data")
    dates = pd.date_range(end=pd.Timestamp.now(), periods=days, freq="D")
    np.random.seed(42)
    revenue = 800000 + np.sin(np.arange(days) * 2 * np.pi / 365) * 200000 + np.random.normal(0, 50000, days)
    cost = revenue * np.random.uniform(0.6, 0.85, days)
    return pd.DataFrame({
        "ds": dates,
        "revenue": np.round(revenue, 2),
        "cost": np.round(cost, 2),
        "receivables": np.round(np.random.uniform(100000, 2000000, days), 2),
    })


def save_forecast_result(forecast_df: pd.DataFrame, model_name: str,
                         metric_name: str = "gas_balance") -> bool:
    """Сохранить результат прогноза в базу данных."""
    try:
        engine = _get_engine()
        if engine:
            forecast_df["model_name"] = model_name
            forecast_df["metric_name"] = metric_name
            forecast_df["created_at"] = pd.Timestamp.now()
            forecast_df.to_sql("forecast_results", engine, if_exists="append", index=False)
            return True
    except Exception as e:
        logger.warning(f"Save forecast failed: {e}")
    return False
