"""
Скоринговые модели для оценки платежеспособности потребителей газа.

Использует:
  - Logistic Regression — базовый скоринг
  - Random Forest — нелинейные зависимости
  - Gradient Boosting — высокая точность

Фичи:
  - История оплат (доля вовремя, средняя задержка)
  - Объём потребления (тренд, стабильность)
  - Долги (текущая задолженность, частота просрочек)
  - Социально-демографические (тип потребителя, регион)
"""

import logging
import pickle
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger("ml_engine.scoring")

MODEL_DIR = Path(__file__).parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Риск-банды по скорингу
RISK_BANDS = {
    (0, 300): {"band": "Высокий риск", "color": "red", "action": "Предоплата или залог"},
    (300, 500): {"band": "Повышенный риск", "color": "orange", "action": "Контроль оплаты"},
    (500, 700): {"band": "Средний риск", "color": "yellow", "action": "Стандартные условия"},
    (700, 850): {"band": "Низкий риск", "color": "green", "action": "Льготные условия"},
    (850, 1000): {"band": "Минимальный риск", "color": "emerald", "action": "Максимальный кредит"},
}


class PaymentScorer:
    """Скоринговая модель для оценки платежеспособности потребителей газа."""

    def __init__(self, model_name: str = "payment_scorer"):
        self.model_name = model_name
        self.model = None
        self.is_fitted = False
        self.feature_columns: List[str] = []
        self._model_path = MODEL_DIR / f"{model_name}.pkl"
        self._scaler_path = MODEL_DIR / f"{model_name}_scaler.pkl"
        self._scaler = None

    def _engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Создание скоринговых признаков из сырых данных."""
        f = df.copy()

        # Признаки истории оплат
        if "payment_history" in f.columns:
            f["on_time_ratio"] = f["payment_history"].apply(
                lambda h: sum(1 for p in (h if isinstance(h, list) else []) if p.get("on_time"))
                       / max(len(h), 1)
            )
            f["avg_delay_days"] = f["payment_history"].apply(
                lambda h: np.mean([p.get("delay_days", 0) for p in (h if isinstance(h, list) else [])])
                       if isinstance(h, list) and len(h) > 0 else 0
            )
            f["max_delay_days"] = f["payment_history"].apply(
                lambda h: max([p.get("delay_days", 0) for p in (h if isinstance(h, list) else [])], default=0)
            )
            f["total_payments"] = f["payment_history"].apply(
                lambda h: len(h) if isinstance(h, list) else 0
            )

        # Признаки потребления
        if "consumption_history" in f.columns and "consumption_avg" not in f.columns:
            f["consumption_avg"] = f["consumption_history"].apply(
                lambda h: np.mean(h) if isinstance(h, list) and len(h) > 0 else 0
            )
            f["consumption_std"] = f["consumption_history"].apply(
                lambda h: np.std(h) if isinstance(h, list) and len(h) > 0 else 0
            )
            f["consumption_trend"] = f["consumption_history"].apply(self._calc_trend)

        # Признаки задолженности
        f["debt_ratio"] = f.get("current_debt", 0) / (f.get("monthly_bill", 1) + 1e-8)
        f["debt_to_income"] = f.get("current_debt", 0) / (f.get("income_proxy", 1) + 1e-8)

        # Заполняем NaN
        for col in f.columns:
            if f[col].dtype in [np.float64, np.int64, float, int]:
                f[col] = f[col].fillna(0)

        return f

    @staticmethod
    def _calc_trend(values: list) -> float:
        """Вычисление тренда потребления (положительный = рост)."""
        if not isinstance(values, list) or len(values) < 3:
            return 0.0
        arr = np.array(values[-12:])  # последние 12 месяцев
        x = np.arange(len(arr))
        if np.std(arr) < 1e-8:
            return 0.0
        slope = np.polyfit(x, arr, 1)[0]
        return float(slope)

    def fit(self, df: pd.DataFrame, target_col: str = "default_flag") -> "PaymentScorer":
        """Обучить скоринговую модель.

        Args:
            df: DataFrame с признаками потребителей и целевой переменной
            target_col: 1 = дефолт/просрочка, 0 = хорошая оплата
        """
        try:
            from sklearn.ensemble import GradientBoostingClassifier
            from sklearn.preprocessing import StandardScaler
        except ImportError:
            raise ImportError("scikit-learn not installed. pip install scikit-learn")

        df = self._engineer_features(df)

        exclude = {target_col, "consumer_id", "consumer_name", "region",
                   "payment_history", "consumption_history", "address"}
        self.feature_columns = [c for c in df.columns
                                if c not in exclude and df[c].dtype in [np.float64, np.int64, float, int]]

        X = df[self.feature_columns].values
        y = df[target_col].values

        # Масштабирование
        self._scaler = StandardScaler()
        X = self._scaler.fit_transform(X)

        self.model = GradientBoostingClassifier(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            min_samples_leaf=20,
            random_state=42,
        )
        self.model.fit(X, y)
        self.is_fitted = True

        # Логирование важности признаков
        importance = sorted(zip(self.feature_columns, self.model.feature_importances_),
                           key=lambda x: x[1], reverse=True)
        logger.info(f"Scorer fitted. Top features: {importance[:5]}")
        return self

    def predict_score(self, df: pd.DataFrame) -> pd.DataFrame:
        """Получить скоринговый балл (0-1000) для каждого потребителя."""
        if not self.is_fitted:
            raise RuntimeError("Model not fitted")

        df = self._engineer_features(df)
        # Добавляем отсутствующие фичи с нулями
        for col in self.feature_columns:
            if col not in df.columns:
                df[col] = 0
        X = df[self.feature_columns].values
        X = self._scaler.transform(X)

        # Вероятность НЕ дефолта -> скоринговый балл 0-1000
        prob_good = self.model.predict_proba(X)[:, 1]
        scores = (prob_good * 1000).astype(int)

        result = pd.DataFrame({
            "score": scores,
            "default_probability": (1 - prob_good).round(4),
            "risk_band": scores.apply(self._get_risk_band),
            "risk_color": scores.apply(self._get_risk_color),
            "recommended_action": scores.apply(self._get_action),
        })

        logger.info(f"Scores computed for {len(df)} consumers")
        return result

    @staticmethod
    def _get_risk_band(score: int) -> str:
        for (lo, hi), info in RISK_BANDS.items():
            if lo <= score < hi:
                return info["band"]
        return "Неопределён"

    @staticmethod
    def _get_risk_color(score: int) -> str:
        for (lo, hi), info in RISK_BANDS.items():
            if lo <= score < hi:
                return info["color"]
        return "gray"

    @staticmethod
    def _get_action(score: int) -> str:
        for (lo, hi), info in RISK_BANDS.items():
            if lo <= score < hi:
                return info["action"]
        return "Ручная проверка"

    def save(self) -> str:
        if not self.is_fitted:
            raise RuntimeError("Model not fitted")
        with open(self._model_path, "wb") as f:
            pickle.dump({"model": self.model, "feature_columns": self.feature_columns}, f)
        with open(self._scaler_path, "wb") as f:
            pickle.dump(self._scaler, f)
        return str(self._model_path)

    def load(self) -> bool:
        if not self._model_path.exists():
            return False
        try:
            with open(self._model_path, "rb") as f:
                data = pickle.load(f)
            self.model = data["model"]
            self.feature_columns = data.get("feature_columns", [])
            with open(self._scaler_path, "rb") as f:
                self._scaler = pickle.load(f)
            self.is_fitted = True
            return True
        except Exception as e:
            logger.error(f"Load failed: {e}")
            return False

    def calculate_metrics(self, y_true: np.ndarray, y_pred_proba: np.ndarray) -> Dict:
        """Метрики качества скоринговой модели."""
        from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score
        y_pred = (y_pred_proba > 0.5).astype(int)
        return {
            "roc_auc": round(float(roc_auc_score(y_true, y_pred_proba)), 4),
            "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
            "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        }
