"""
Модели оценки рисков газотранспортной системы.

Оценивает:
  - Риск дефицита баланса газа (supply-demand mismatch)
  - Риск превышения давления в трубах
  - Финансовые риски (невыплата субсидий, тарифные убытки)
  - Комбинированный риск-индекс по регионам
"""

import logging
import pickle
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("ml_engine.risk")

MODEL_DIR = Path(__file__).parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


class RiskAssessor:
    """Комплексная оценка рисков газотранспортной системы."""

    def __init__(self):
        self.model_name = "risk_assessor"
        self._model_path = MODEL_DIR / f"{self.model_name}.pkl"
        self.is_fitted = False
        self.risk_thresholds = {
            "balance_deficit": {"low": 0.10, "medium": 0.25, "high": 0.40},
            "pressure_exceed": {"low": 0.85, "medium": 0.95, "high": 1.05},
            "financial": {"low": 0.15, "medium": 0.30, "high": 0.50},
        }

    def assess_balance_risk(self, supply_df: pd.DataFrame,
                            demand_df: pd.DataFrame,
                            forecast_horizon: int = 30) -> pd.DataFrame:
        """Оценка риска дефицита баланса газа.

        Args:
            supply_df: DataFrame с колонками ['ds', 'supply_mcm'] (тыс. м³/день)
            demand_df: DataFrame с колонками ['ds', 'demand_mcm']
            forecast_horizon: горизонт прогноза в днях

        Returns:
            DataFrame с ежедневными рисками и рекомендации
        """
        merged = pd.merge(supply_df, demand_df, on="ds", how="outer").sort_values("ds")
        merged = merged.fillna(method="ffill")

        merged["balance"] = merged["supply_mcm"] - merged["demand_mcm"]
        merged["balance_ratio"] = merged["demand_mcm"] / (merged["supply_mcm"] + 1e-8)
        merged["deficit_days"] = (merged["balance"] < 0).astype(int)

        # Скользящие метрики
        for w in [7, 14, 30]:
            merged[f"balance_ma_{w}"] = merged["balance"].rolling(w).mean()
            merged[f"balance_std_{w}"] = merged["balance"].rolling(w).std()

        merged["risk_level"] = merged["balance_ratio"].apply(self._classify_balance_risk)
        merged["risk_score"] = merged["balance_ratio"].apply(self._balance_risk_score)

        # Рекомендации
        merged["recommendation"] = merged.apply(self._balance_recommendation, axis=1)

        result_cols = ["ds", "supply_mcm", "demand_mcm", "balance", "balance_ratio",
                       "risk_level", "risk_score", "recommendation"]
        available = [c for c in result_cols if c in merged.columns]
        return merged[available]

    def assess_pressure_risk(self, telemetry_df: pd.DataFrame,
                             max_pressure: float = 7.5,
                             min_pressure: float = 1.0) -> pd.DataFrame:
        """Оценка риска превышения/падения давления.

        Args:
            telemetry_df: DataFrame с колонками ['ds', 'node_id', 'pressure_mpa']
            max_pressure: максимально допустимое давление (МПа)
            min_pressure: минимально допустимое давление (МПа)
        """
        if "node_id" not in telemetry_df.columns:
            telemetry_df = telemetry_df.copy()
            telemetry_df["node_id"] = "default"

        results = []
        for node_id, group in telemetry_df.groupby("node_id"):
            group = group.sort_values("ds")
            pressure = group["pressure_mpa"]

            exceed_pct = ((pressure > max_pressure).sum() / len(pressure) * 100)
            low_pct = ((pressure < min_pressure).sum() / len(pressure) * 100)

            if exceed_pct > 5:
                level, score = "CRITICAL", 95
            elif exceed_pct > 1:
                level, score = "HIGH", 75
            elif low_pct > 10:
                level, score = "HIGH", 70
            elif low_pct > 3:
                level, score = "MEDIUM", 50
            elif exceed_pct > 0 or low_pct > 0:
                level, score = "LOW", 25
            else:
                level, score = "NORMAL", 5

            results.append({
                "node_id": node_id,
                "pressure_mean": round(pressure.mean(), 3),
                "pressure_max": round(pressure.max(), 3),
                "pressure_min": round(pressure.min(), 3),
                "pressure_std": round(pressure.std(), 3),
                "exceed_max_pct": round(exceed_pct, 2),
                "below_min_pct": round(low_pct, 2),
                "risk_level": level,
                "risk_score": score,
            })

        return pd.DataFrame(results)

    def assess_financial_risk(self, billing_df: pd.DataFrame,
                              subsidy_df: Optional[pd.DataFrame] = None) -> Dict:
        """Оценка финансовых рисков.

        Args:
            billing_df: DataFrame с колонками ['ds', 'revenue', 'cost', 'receivables']
            subsidy_df: DataFrame с субсидиями ['ds', 'subsidy_amount']
        """
        billing = billing_df.copy().sort_values("ds")

        # Ключевые метрики
        billing["margin"] = billing["revenue"] - billing["cost"]
        billing["margin_ratio"] = billing["margin"] / (billing["revenue"] + 1e-8)
        billing["receivable_days"] = billing["receivables"] / (billing["revenue"].rolling(30).mean() + 1e-8) * 30

        # Тренды
        for col in ["margin_ratio", "receivable_days"]:
            if col in billing.columns:
                billing[f"{col}_trend"] = billing[col].rolling(7).mean()

        latest = billing.iloc[-1] if len(billing) > 0 else {}

        risk_indicators = {
            "margin_ratio": float(latest.get("margin_ratio", 0)),
            "receivable_days": float(latest.get("receivable_days", 0)),
            "margin_trend": float(latest.get("margin_ratio_trend", 0)),
            "revenue_stability": float(billing["revenue"].rolling(30).std().mean()
                                       / (billing["revenue"].mean() + 1e-8)),
        }

        # Композитный скор
        risk_score = 0
        if risk_indicators["margin_ratio"] < 0:
            risk_score += 30
        elif risk_indicators["margin_ratio"] < 0.05:
            risk_score += 15

        if risk_indicators["receivable_days"] > 60:
            risk_score += 25
        elif risk_indicators["receivable_days"] > 30:
            risk_score += 15

        if risk_indicators["margin_trend"] < -0.02:
            risk_score += 20
        elif risk_indicators["margin_trend"] < -0.01:
            risk_score += 10

        if risk_indicators["revenue_stability"] > 0.3:
            risk_score += 15

        risk_score = min(risk_score, 100)

        if risk_score >= 60:
            level = "HIGH"
        elif risk_score >= 35:
            level = "MEDIUM"
        elif risk_score >= 15:
            level = "LOW"
        else:
            level = "NORMAL"

        return {
            "risk_score": risk_score,
            "risk_level": level,
            "indicators": risk_indicators,
            "recommendations": self._financial_recommendations(risk_indicators),
        }

    def composite_risk_index(self, balance_risk: float, pressure_risk: float,
                             financial_risk: float, weights: Optional[Dict] = None) -> Dict:
        """Композитный риск-индекс системы."""
        w = weights or {"balance": 0.40, "pressure": 0.35, "financial": 0.25}
        composite = (
            w.get("balance", 0.4) * balance_risk +
            w.get("pressure", 0.35) * pressure_risk +
            w.get("financial", 0.25) * financial_risk
        )

        if composite >= 70:
            level = "CRITICAL"
        elif composite >= 50:
            level = "HIGH"
        elif composite >= 30:
            level = "MEDIUM"
        elif composite >= 15:
            level = "LOW"
        else:
            level = "NORMAL"

        return {
            "composite_score": round(composite, 1),
            "risk_level": level,
            "components": {
                "balance": {"score": balance_risk, "weight": w.get("balance", 0.4)},
                "pressure": {"score": pressure_risk, "weight": w.get("pressure", 0.35)},
                "financial": {"score": financial_risk, "weight": w.get("financial", 0.25)},
            },
        }

    def _classify_balance_risk(self, ratio: float) -> str:
        if ratio >= self.risk_thresholds["balance_deficit"]["high"]:
            return "CRITICAL"
        elif ratio >= self.risk_thresholds["balance_deficit"]["medium"]:
            return "HIGH"
        elif ratio >= self.risk_thresholds["balance_deficit"]["low"]:
            return "MEDIUM"
        return "LOW"

    def _balance_risk_score(self, ratio: float) -> float:
        return min(ratio / 0.5 * 100, 100)

    def _balance_recommendation(self, row) -> str:
        if row.get("risk_level") == "CRITICAL":
            return "СРОЧНО: подключить резервные источники, ограничить промышленных потребителей"
        elif row.get("risk_level") == "HIGH":
            return "Увеличить объём закачки, активировать резервуары"
        elif row.get("risk_level") == "MEDIUM":
            return "Мониторинг, подготовка резервных мощностей"
        return "Нормальный режим"

    def _financial_recommendations(self, indicators: Dict) -> List[str]:
        recs = []
        if indicators["margin_ratio"] < 0:
            recs.append("Маржинальность отрицательная — пересмотреть тарифы")
        if indicators["receivable_days"] > 45:
            recs.append("Высокая дебиторская задолженность — усилить взыскание")
        if indicators["margin_trend"] < -0.01:
            recs.append("Снижающаяся маржа — проанализировать структуру затрат")
        if indicators["revenue_stability"] > 0.25:
            recs.append("Нестабильная выручка — диверсифицировать потребительскую базу")
        if not recs:
            recs.append("Финансовые показатели в норме")
        return recs
