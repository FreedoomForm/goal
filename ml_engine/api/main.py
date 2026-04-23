"""
AegisOps ML Engine — FastAPI сервер.

REST API для:
  - Прогнозирования баланса газа (Prophet, ARIMA, XGBoost, Ensemble)
  - Скоринга потребителей (платежеспособность)
  - Оценки рисков (баланс, давление, финансы)
  - Получения аналитических дашбордов
"""

import logging
import os
from datetime import datetime
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from models.forecast import create_forecaster, BaseForecaster
from models.scoring import PaymentScorer
from models.risk import RiskAssessor
from utils.db import (
    fetch_gas_balance, fetch_telemetry, fetch_consumers,
    fetch_billing, save_forecast_result,
)

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger("ml_engine.api")

app = FastAPI(
    title="AegisOps ML Engine",
    description="Микросервис ML для прогнозирования баланса газа, скоринга и оценки рисков",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Global instances ───
_scorer: Optional[PaymentScorer] = None
_risk_assessor: Optional[RiskAssessor] = None


def get_scorer() -> PaymentScorer:
    global _scorer
    if _scorer is None:
        _scorer = PaymentScorer()
        _scorer.load()
    return _scorer


def get_risk_assessor() -> RiskAssessor:
    global _risk_assessor
    if _risk_assessor is None:
        _risk_assessor = RiskAssessor()
    return _risk_assessor


# ═══════════════════════════════════════════════════
# MODELS: Pydantic schemas
# ═══════════════════════════════════════════════════

class ForecastRequest(BaseModel):
    model_type: str = Field("ensemble", description="prophet, arima, xgboost, ensemble")
    horizon: int = Field(30, ge=1, le=365, description="Горизонт прогноза в днях")
    metric: str = Field("gas_balance", description="Метрика: gas_balance, supply, demand")
    train_days: int = Field(365, ge=30, le=1825, description="Дней исторических данных для обучения")
    retrain: bool = Field(False, description="Переботать модель перед прогнозом")


class ScoreRequest(BaseModel):
    consumer_ids: Optional[List[int]] = Field(None, description="ID потребителей (все если None)")


class RiskRequest(BaseModel):
    forecast_horizon: int = Field(30, ge=1, le=365)
    include_pressure: bool = Field(True)
    include_financial: bool = Field(True)
    region: Optional[str] = None


class ForecastPoint(BaseModel):
    ds: str
    yhat: float
    yhat_lower: float
    yhat_upper: float


class ForecastResponse(BaseModel):
    model: str
    horizon: int
    forecast: List[ForecastPoint]
    metrics: Optional[Dict] = None
    trained_at: Optional[str] = None


class ScoreRow(BaseModel):
    consumer_id: Optional[int] = None
    score: int
    default_probability: float
    risk_band: str
    recommended_action: str


class RiskResponse(BaseModel):
    balance_risk: Optional[Dict] = None
    pressure_risk: Optional[List[Dict]] = None
    financial_risk: Optional[Dict] = None
    composite_index: Optional[Dict] = None


# ═══════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "ml_engine",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/models/available")
async def list_models():
    """Доступные модели прогнозирования."""
    return {
        "forecast": [
            {"type": "prophet", "description": "Facebook Prophet — сезонность + праздники"},
            {"type": "arima", "description": "ARIMA/SARIMA — классическая статистика"},
            {"type": "xgboost", "description": "XGBoost — градиентный бустинг"},
            {"type": "ensemble", "description": "Ансамбль — взвешенное среднее"},
        ],
        "scoring": ["payment_scorer"],
        "risk": ["balance_risk", "pressure_risk", "financial_risk", "composite"],
    }


# ─── Прогнозирование ───

@app.post("/api/forecast", response_model=ForecastResponse)
async def forecast(req: ForecastRequest):
    """Запустить прогноз баланса газа.

    Обучает выбранную модель на исторических данных и возвращает прогноз
    на заданный горизонт с доверительными интервалами.
    """
    logger.info(f"Forecast request: model={req.model_type}, horizon={req.horizon}, metric={req.metric}")

    try:
        # Извлекаем данные
        balance_df = fetch_gas_balance(days=req.train_days)

        # Подготавливаем DataFrame для модели
        if req.metric == "supply":
            model_df = balance_df[["ds", "supply_mcm"]].rename(columns={"supply_mcm": "value"})
        elif req.metric == "demand":
            model_df = balance_df[["ds", "demand_mcm"]].rename(columns={"demand_mcm": "value"})
        else:
            model_df = balance_df[["ds", "net_balance_mcm"]].rename(columns={"net_balance_mcm": "value"})

        # Создаём и обучаем модель
        forecaster = create_forecaster(req.model_type)

        if req.retrain or not forecaster.is_fitted:
            forecaster.fit(model_df)
            try:
                forecaster.save()
            except Exception as e:
                logger.warning(f"Save failed: {e}")
        else:
            forecaster.load()

        # Получаем прогноз
        pred_df = forecaster.predict(horizon=req.horizon)

        # Сохраняем результат
        try:
            save_forecast_result(pred_df, req.model_type, req.metric)
        except Exception as e:
            logger.warning(f"Save forecast failed: {e}")

        # Метрики качества
        metrics = None
        if req.retrain and len(model_df) >= 30:
            val_size = min(30, len(model_df) // 5)
            if val_size > 0:
                val_actual = model_df["value"].iloc[-val_size:]
                # Делаем короткий прогноз для валидации
                try:
                    val_pred = forecaster.predict(horizon=val_size)
                    metrics = forecaster.calculate_metrics(val_actual.values, val_pred["yhat"].values[:val_size])
                except Exception:
                    pass

        forecast_list = [
            ForecastPoint(
                ds=str(row["ds"].date()) if hasattr(row["ds"], "date") else str(row["ds"]),
                yhat=round(float(row["yhat"]), 4),
                yhat_lower=round(float(row["yhat_lower"]), 4),
                yhat_upper=round(float(row["yhat_upper"]), 4),
            )
            for _, row in pred_df.iterrows()
        ]

        return ForecastResponse(
            model=req.model_type,
            horizon=req.horizon,
            forecast=forecast_list,
            metrics=metrics,
            trained_at=datetime.now().isoformat(),
        )

    except Exception as e:
        logger.error(f"Forecast error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/forecast/latest")
async def get_latest_forecast(metric: str = "gas_balance", limit: int = 30):
    """Получить последний сохранённый прогноз."""
    balance_df = fetch_gas_balance(days=365)
    try:
        forecaster = create_forecaster("ensemble")
        if forecaster.load():
            pred = forecaster.predict(horizon=limit)
            return {
                "metric": metric,
                "model": "ensemble",
                "forecast": pred[["ds", "yhat", "yhat_lower", "yhat_upper"]].to_dict(orient="records"),
                "historical": balance_df.tail(90)[["ds", "supply_mcm", "demand_mcm", "net_balance_mcm"]].to_dict(orient="records"),
            }
    except Exception as e:
        logger.warning(f"Load model failed: {e}")

    # Если модели нет — возвращаем только исторические данные
    return {
        "metric": metric,
        "model": "none",
        "forecast": [],
        "historical": balance_df.tail(90).to_dict(orient="records"),
    }


# ─── Скоринг ───

@app.post("/api/scoring/score")
async def score_consumers(req: ScoreRequest = None):
    """Рассчитать скоринговые баллы для потребителей."""
    logger.info("Scoring request")

    try:
        consumers_df = fetch_consumers()
        scorer = get_scorer()

        if scorer.is_fitted:
            scores_df = scorer.predict_score(consumers_df)
            result_df = consumers_df[["consumer_id", "consumer_name", "consumer_type", "region"]].copy()
            result_df = pd.concat([result_df.reset_index(drop=True), scores_df.reset_index(drop=True)], axis=1)
        else:
            # Демо-режим: генерируем баллы на основе имеющихся данных
            np.random.seed(42)
            n = len(consumers_df)
            scores = np.random.randint(200, 900, n)
            result_df = consumers_df.copy()
            result_df["score"] = scores
            result_df["default_probability"] = (1 - scores / 1000).round(4)
            result_df["risk_band"] = scores.apply(lambda s: scorer._get_risk_band(s) if scorer else "N/A")
            result_df["recommended_action"] = scores.apply(lambda s: scorer._get_action(s) if scorer else "N/A")

        return {
            "total_consumers": len(result_df),
            "scores": result_df.to_dict(orient="records"),
            "summary": {
                "avg_score": float(result_df["score"].mean()),
                "high_risk_count": int((result_df["score"] < 500).sum()),
                "medium_risk_count": int(((result_df["score"] >= 500) & (result_df["score"] < 700)).sum()),
                "low_risk_count": int((result_df["score"] >= 700).sum()),
            },
        }

    except Exception as e:
        logger.error(f"Scoring error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/scoring/risk-distribution")
async def risk_distribution():
    """Распределение потребителей по риск-бандам."""
    consumers_df = fetch_consumers()
    scorer = get_scorer()

    if scorer.is_fitted:
        scores = scorer.predict_score(consumers_df)
    else:
        np.random.seed(42)
        scores = pd.DataFrame({"score": np.random.randint(200, 900, len(consumers_df))})

    bands = {
        "Высокий риск (0-300)": int((scores["score"] < 300).sum()),
        "Повышенный (300-500)": int(((scores["score"] >= 300) & (scores["score"] < 500)).sum()),
        "Средний (500-700)": int(((scores["score"] >= 500) & (scores["score"] < 700)).sum()),
        "Низкий (700-850)": int(((scores["score"] >= 700) & (scores["score"] < 850)).sum()),
        "Минимальный (850+)": int((scores["score"] >= 850).sum()),
    }

    return {"distribution": bands, "total": sum(bands.values())}


# ─── Оценка рисков ───

@app.post("/api/risk/assess", response_model=RiskResponse)
async def assess_risks(req: RiskRequest):
    """Комплексная оценка рисков системы."""
    logger.info(f"Risk assessment: horizon={req.forecast_horizon}")

    try:
        ra = get_risk_assessor()
        result = RiskResponse()

        # 1. Риск баланса газа
        balance_df = fetch_gas_balance(days=req.forecast_horizon * 2)
        supply = balance_df[["ds", "supply_mcm"]].rename(columns={"supply_mcm": "supply"})
        demand = balance_df[["ds", "demand_mcm"]].rename(columns={"demand_mcm": "demand"})
        balance_risk_df = ra.assess_balance_risk(supply, demand, req.forecast_horizon)

        latest = balance_risk_df.iloc[-1] if len(balance_risk_df) > 0 else {}
        result.balance_risk = {
            "current_risk_level": latest.get("risk_level", "UNKNOWN"),
            "current_risk_score": float(latest.get("risk_score", 0)),
            "current_balance": float(latest.get("balance", 0)),
            "recommendation": latest.get("recommendation", ""),
            "daily_forecast": balance_risk_df[["ds", "supply_mcm", "demand_mcm", "balance",
                                               "risk_level", "risk_score"]].tail(30).to_dict(orient="records"),
        }

        # 2. Риск давления
        if req.include_pressure:
            telemetry = fetch_telemetry(metric_name="pressure_mpa", days=7)
            if "pressure_mpa" not in telemetry.columns and "value" in telemetry.columns:
                telemetry["pressure_mpa"] = telemetry["value"]
            pressure_risk = ra.assess_pressure_risk(telemetry)
            result.pressure_risk = pressure_risk.to_dict(orient="records")

        # 3. Финансовые риски
        if req.include_financial:
            billing = fetch_billing(days=365)
            fin_risk = ra.assess_financial_risk(billing)
            result.financial_risk = fin_risk

        # 4. Композитный индекс
        b_score = result.balance_risk.get("current_risk_score", 0) if result.balance_risk else 0
        p_score = float(np.mean([n.get("risk_score", 0) for n in (result.pressure_risk or [])])) if result.pressure_risk else 0
        f_score = result.financial_risk.get("risk_score", 0) if result.financial_risk else 0
        result.composite_index = ra.composite_risk_index(b_score, p_score, f_score)

        return result

    except Exception as e:
        logger.error(f"Risk assessment error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/risk/dashboard")
async def risk_dashboard():
    """Данные для дашборда рисков в реальном времени."""
    ra = get_risk_assessor()

    # Быстрая оценка (без полного прогноза)
    balance_df = fetch_gas_balance(days=30)
    if len(balance_df) > 0:
        latest = balance_df.iloc[-1]
        supply = balance_df[["ds", "supply_mcm"]].rename(columns={"supply_mcm": "supply"})
        demand = balance_df[["ds", "demand_mcm"]].rename(columns={"demand_mcm": "demand"})
        br = ra.assess_balance_risk(supply, demand, 7)
        latest_risk = br.iloc[-1] if len(br) > 0 else {}
    else:
        latest_risk = {}
        latest = {}

    billing = fetch_billing(days=90)
    fin_risk = ra.assess_financial_risk(billing) if len(billing) > 0 else {}

    return {
        "timestamp": datetime.now().isoformat(),
        "balance": {
            "current_supply": float(latest.get("supply_mcm", 0)),
            "current_demand": float(latest.get("demand_mcm", 0)),
            "net_balance": float(latest.get("net_balance_mcm", 0)),
            "risk_level": latest_risk.get("risk_level", "UNKNOWN"),
            "risk_score": float(latest_risk.get("risk_score", 0)),
        },
        "financial": fin_risk,
        "trend_7d": {
            "supply_trend": float(balance_df["supply_mcm"].iloc[-7:].mean() - balance_df["supply_mcm"].iloc[-14:-7].mean()) if len(balance_df) >= 14 else 0,
            "demand_trend": float(balance_df["demand_mcm"].iloc[-7:].mean() - balance_df["demand_mcm"].iloc[-14:-7].mean()) if len(balance_df) >= 14 else 0,
        },
    }


# ─── Аналитика / Дашборды ───

@app.get("/api/analytics/gas-balance")
async def gas_balance_analytics(days: int = Query(90, ge=7, le=730)):
    """Аналитика баланса газа за N дней — для BI дашборда."""
    df = fetch_gas_balance(days=days)

    if len(df) == 0:
        return {"error": "no data", "days": days}

    # Агрегация по месяцам
    df["month"] = df["ds"].dt.to_period("M")
    monthly = df.groupby("month").agg(
        avg_supply=("supply_mcm", "mean"),
        avg_demand=("demand_mcm", "mean"),
        avg_balance=("net_balance_mcm", "mean"),
        total_supply=("supply_mcm", "sum"),
        total_demand=("demand_mcm", "sum"),
    ).reset_index()
    monthly["month"] = monthly["month"].astype(str)

    # Статистика
    stats = {
        "period": f"{df['ds'].min().date()} — {df['ds'].max().date()}",
        "avg_daily_supply": round(float(df["supply_mcm"].mean()), 2),
        "avg_daily_demand": round(float(df["demand_mcm"].mean()), 2),
        "avg_daily_balance": round(float(df["net_balance_mcm"].mean()), 2),
        "max_supply": round(float(df["supply_mcm"].max()), 2),
        "max_demand": round(float(df["demand_mcm"].max()), 2),
        "deficit_days": int((df["net_balance_mcm"] < 0).sum()),
        "supply_trend": "growth" if df["supply_mcm"].iloc[-7:].mean() > df["supply_mcm"].iloc[:7].mean() else "decline",
        "demand_trend": "growth" if df["demand_mcm"].iloc[-7:].mean() > df["demand_mcm"].iloc[:7].mean() else "decline",
    }

    return {
        "daily": df[["ds", "supply_mcm", "demand_mcm", "net_balance_mcm"]].to_dict(orient="records"),
        "monthly": monthly.to_dict(orient="records"),
        "statistics": stats,
    }


@app.get("/api/analytics/consumption-by-region")
async def consumption_by_region(days: int = Query(30, ge=1, le=365)):
    """Потребление по регионам."""
    consumers = fetch_consumers()
    if "region" not in consumers.columns:
        return {"regions": []}

    region_stats = consumers.groupby("region").agg(
        consumers_count=("consumer_id", "count"),
        avg_monthly_bill=("monthly_bill", "mean"),
        total_debt=("current_debt", "sum"),
    ).reset_index()

    return {"regions": region_stats.to_dict(orient="records")}


# ─── Training ───

@app.post("/api/train/scorer")
async def train_scorer():
    """Обучить скоринговую модель на текущих данных."""
    try:
        from sklearn.model_selection import train_test_split
    except ImportError:
        raise HTTPException(status_code=500, detail="scikit-learn not installed")

    consumers = fetch_consumers()
    if len(consumers) < 20:
        raise HTTPException(status_code=400, detail="Not enough consumer data (need >= 20)")

    # Генерируем target из имеющихся данных (демо)
    np.random.seed(42)
    consumers["default_flag"] = (
        (consumers["current_debt"] > consumers["monthly_bill"] * 2).astype(int) +
        np.random.randint(0, 2, len(consumers))
    ).clip(0, 1)

    train_df, test_df = train_test_split(consumers, test_size=0.2, random_state=42)

    scorer = PaymentScorer()
    scorer.fit(train_df)

    # Валидация
    if scorer.is_fitted and len(test_df) > 0:
        scores = scorer.predict_score(test_df)
        y_true = test_df["default_flag"].values[:len(scores)]
        y_prob = scores["default_probability"].values[:len(y_true)]
        metrics = scorer.calculate_metrics(y_true, y_prob)
    else:
        metrics = {}

    scorer.save()

    return {
        "status": "trained",
        "model": "payment_scorer",
        "training_samples": len(train_df),
        "validation_samples": len(test_df),
        "metrics": metrics,
    }


# ─── Запуск ───

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("ML_ENGINE_PORT", "18091"))
    logger.info(f"Starting ML Engine on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
