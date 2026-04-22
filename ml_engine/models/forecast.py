"""
Модели прогнозирования временных рядов для баланса газа.

Поддерживаемые алгоритмы:
  - Prophet (Facebook) — прогноз с учётом сезонности и праздников
  - ARIMA / SARIMA — классическая статистика
  - XGBoost — градиентный бустинг на временных признаках
  - Ensemble — ансамбль с автоматическим взвешиванием
"""

import logging
import pickle
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("ml_engine.forecast")

MODEL_DIR = Path(__file__).parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


class BaseForecaster(ABC):
    """Базовый класс для всех моделей прогнозирования."""

    def __init__(self, model_name: str):
        self.model_name = model_name
        self.model = None
        self.is_fitted = False
        self.feature_columns: List[str] = []
        self._model_path = MODEL_DIR / f"{model_name}.pkl"

    @abstractmethod
    def fit(self, df: pd.DataFrame, target_col: str = "value") -> "BaseForecaster":
        ...

    @abstractmethod
    def predict(self, horizon: int = 30) -> pd.DataFrame:
        ...

    def save(self) -> str:
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted yet")
        with open(self._model_path, "wb") as f:
            pickle.dump({
                "model": self.model,
                "feature_columns": self.feature_columns,
                "model_name": self.model_name,
            }, f)
        logger.info(f"Model saved to {self._model_path}")
        return str(self._model_path)

    def load(self) -> bool:
        if not self._model_path.exists():
            return False
        try:
            with open(self._model_path, "rb") as f:
                data = pickle.load(f)
            self.model = data["model"]
            self.feature_columns = data.get("feature_columns", [])
            self.is_fitted = True
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False

    @staticmethod
    def validate_data(df: pd.DataFrame) -> pd.DataFrame:
        required_cols = {"ds", "value"}
        if not required_cols.issubset(df.columns):
            raise ValueError(f"Need columns {required_cols}, got {df.columns.tolist()}")
        df = df.copy()
        df["ds"] = pd.to_datetime(df["ds"])
        df["value"] = pd.to_numeric(df["value"], errors="coerce")
        before = len(df)
        df = df.dropna(subset=["ds", "value"])
        if len(df) < before:
            logger.warning(f"Dropped {before - len(df)} rows with NaN")
        df = df.sort_values("ds").reset_index(drop=True)
        df = df.drop_duplicates(subset=["ds"], keep="last")
        if len(df) < 10:
            raise ValueError(f"Not enough data: {len(df)} (min 10)")
        return df

    def calculate_metrics(self, actual: pd.Series, predicted: pd.Series) -> Dict:
        errors = actual - predicted
        mae = float(np.mean(np.abs(errors)))
        rmse = float(np.sqrt(np.mean(errors ** 2)))
        mape = float(np.mean(np.abs(errors / (actual + 1e-8))) * 100)
        return {"mae": round(mae, 4), "rmse": round(rmse, 4), "mape": round(mape, 2), "n_points": len(actual)}


class ProphetForecaster(BaseForecaster):
    """Facebook Prophet — автоматическое определение сезонности, учёт праздников."""

    def __init__(self):
        super().__init__("prophet_gas_balance")

    def fit(self, df: pd.DataFrame, target_col: str = "value") -> "ProphetForecaster":
        try:
            from prophet import Prophet
        except ImportError:
            raise ImportError("prophet not installed. pip install prophet")

        df = self.validate_data(df)
        prophet_df = df.rename(columns={"ds": "ds", "value": "y"})

        self.model = Prophet(
            growth="linear",
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10.0,
            seasonality_mode="multiplicative",
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            interval_width=0.95,
        )
        self.model.fit(prophet_df)
        self.is_fitted = True
        logger.info(f"Prophet fitted on {len(df)} points")
        return self

    def predict(self, horizon: int = 30) -> pd.DataFrame:
        if not self.is_fitted:
            raise RuntimeError("Model not fitted")
        future = self.model.make_future_dataframe(periods=horizon)
        forecast = self.model.predict(future)
        result = forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(horizon).reset_index(drop=True)
        result["model"] = self.model_name
        result["horizon"] = horizon
        return result


class ARIMAForecaster(BaseForecaster):
    """ARIMA/SARIMA — классическая статистическая модель для временных рядов."""

    def __init__(self):
        super().__init__("arima_gas_balance")
        self.order = (2, 1, 2)
        self.seasonal_order = (1, 1, 1, 7)

    def fit(self, df: pd.DataFrame, target_col: str = "value") -> "ARIMAForecaster":
        try:
            import statsmodels.api as sm
        except ImportError:
            raise ImportError("statsmodels not installed. pip install statsmodels")

        df = self.validate_data(df)
        ts = df.set_index("ds")["value"].asfreq("D").interpolate()

        # Попытка auto-arima
        try:
            import pmdarima as pm
            auto = pm.auto_arima(ts, seasonal=True, m=7, stepwise=True,
                                 suppress_warnings=True, error_action="ignore", max_order=8)
            self.order = auto.order
            self.seasonal_order = auto.seasonal_order
            logger.info(f"Auto-ARIMA: order={self.order}, seasonal={self.seasonal_order}")
        except ImportError:
            logger.info("pmdarima not available, using default order")

        self.model = sm.tsa.SARIMAX(
            ts, order=self.order, seasonal_order=self.seasonal_order,
            enforce_stationarity=False, enforce_invertibility=False,
        ).fit(disp=False)
        self.is_fitted = True
        logger.info(f"ARIMA fitted: order={self.order}")
        return self

    def predict(self, horizon: int = 30) -> pd.DataFrame:
        if not self.is_fitted:
            raise RuntimeError("Model not fitted")
        fc = self.model.get_forecast(steps=horizon)
        ci = fc.conf_int()
        yhat = fc.predicted_mean.values
        cols = list(ci.columns)
        yhat_lower = ci.iloc[:, 0].values
        yhat_upper = ci.iloc[:, 1].values
        last_date = self.model.data.dates[-1]
        dates = [last_date + timedelta(days=i + 1) for i in range(horizon)]
        result = pd.DataFrame({
            "ds": dates, "yhat": yhat,
            "yhat_lower": yhat_lower, "yhat_upper": yhat_upper,
        })
        result["model"] = self.model_name
        result["horizon"] = horizon
        return result


class XGBoostForecaster(BaseForecaster):
    """XGBoost — градиентный бустинг с engineered временными признаками."""

    def __init__(self, lags: int = 30):
        super().__init__("xgboost_gas_balance")
        self.lags = lags
        self._last_df = None

    def _create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        f = df.copy().sort_values("ds").reset_index(drop=True)
        for lag in range(1, self.lags + 1):
            f[f"lag_{lag}"] = f["value"].shift(lag)
        for w in [7, 14, 30, 90]:
            f[f"ma_{w}"] = f["value"].rolling(w).mean()
            f[f"std_{w}"] = f["value"].rolling(w).std()
        f["day_of_week"] = f["ds"].dt.dayofweek
        f["month"] = f["ds"].dt.month
        f["quarter"] = f["ds"].dt.quarter
        f["day_of_year"] = f["ds"].dt.dayofyear
        f["is_weekend"] = f["day_of_week"].isin([5, 6]).astype(int)
        f["diff_1"] = f["value"].diff(1)
        f["diff_7"] = f["value"].diff(7)
        f["lag_week"] = f["value"].shift(7)
        return f

    def fit(self, df: pd.DataFrame, target_col: str = "value", **kwargs) -> "XGBoostForecaster":
        try:
            from xgboost import XGBRegressor
        except ImportError:
            raise ImportError("xgboost not installed. pip install xgboost")

        df = self.validate_data(df)
        self._last_df = df
        feature_df = self._create_features(df)
        feature_df = feature_df.dropna()
        exclude = {"ds", "value"}
        self.feature_columns = [c for c in feature_df.columns if c not in exclude]
        X = feature_df[self.feature_columns].values
        y = feature_df["value"].values

        self.model = XGBRegressor(
            n_estimators=500, max_depth=6, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
            reg_alpha=0.1, reg_lambda=1.0, random_state=42, n_jobs=-1,
        )
        self.model.fit(X, y, verbose=False)
        self.is_fitted = True
        logger.info(f"XGBoost fitted on {len(X)} samples, {len(self.feature_columns)} features")
        return self

    def predict(self, horizon: int = 30) -> pd.DataFrame:
        if not self.is_fitted or self._last_df is None:
            raise RuntimeError("Model not fitted")

        # Рекурсивный multi-step прогноз
        history = self._last_df.copy()
        results = []
        for i in range(horizon):
            feat = self._create_features(history)
            feat = feat.dropna(subset=self.feature_columns)
            if len(feat) == 0:
                break
            last_row = feat.iloc[[-1]][self.feature_columns].values
            pred_val = float(self.model.predict(last_row)[0])
            pred_date = history["ds"].max() + timedelta(days=1)
            results.append({
                "ds": pred_date, "yhat": pred_val,
                "yhat_lower": pred_val * 0.92, "yhat_upper": pred_val * 1.08,
            })
            # Добавляем прогноз в историю для следующего шага
            history = pd.concat([history, pd.DataFrame([{"ds": pred_date, "value": pred_val}])],
                                ignore_index=True)

        result = pd.DataFrame(results)
        result["model"] = self.model_name
        result["horizon"] = horizon
        return result


class EnsembleForecaster(BaseForecaster):
    """Ансамбль Prophet + ARIMA + XGBoost с автоматическим взвешиванием по MAPE."""

    def __init__(self):
        super().__init__("ensemble_gas_balance")
        self.models: Dict[str, BaseForecaster] = {}
        self.weights: Dict[str, float] = {}

    def fit(self, df: pd.DataFrame, target_col: str = "value",
            val_split: float = 0.2) -> "EnsembleForecaster":
        df = self.validate_data(df)
        split_idx = int(len(df) * (1 - val_split))
        train_df, val_df = df.iloc[:split_idx], df.iloc[split_idx:]

        for cls in [ProphetForecaster, ARIMAForecaster]:
            try:
                name = cls.__name__
                m = cls().fit(train_df)
                vp = m.predict(horizon=min(len(val_df), 60))
                n = min(len(val_df), len(vp))
                actual = val_df["value"].values[:n]
                pred = vp["yhat"].values[:n]
                mape_val = float(np.mean(np.abs((actual - pred) / (actual + 1e-8))) * 100)
                self.models[name] = m
                self.weights[name] = 1.0 / (mape_val + 1e-6)
                logger.info(f"{name}: MAPE={mape_val:.2f}%")
            except Exception as e:
                logger.warning(f"Failed {cls.__name__}: {e}")

        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}
        self.is_fitted = len(self.models) > 0
        return self

    def predict(self, horizon: int = 30) -> pd.DataFrame:
        if not self.is_fitted:
            raise RuntimeError("Model not fitted")
        forecasts = {}
        for name, m in self.models.items():
            try:
                forecasts[name] = m.predict(horizon)
            except Exception as e:
                logger.warning(f"Predict failed {name}: {e}")
        if not forecasts:
            raise RuntimeError("All sub-models failed")

        first = list(forecasts.values())[0]
        result = pd.DataFrame({"ds": first["ds"], "yhat": np.zeros(len(first)),
                               "yhat_lower": np.full(len(first), np.inf),
                               "yhat_upper": np.full(len(first), -np.inf)})

        for name, pred in forecasts.items():
            w = self.weights.get(name, 0)
            n = min(len(result), len(pred))
            result["yhat"].iloc[:n] += w * pred["yhat"].iloc[:n].values
            result["yhat_lower"].iloc[:n] = np.minimum(result["yhat_lower"].iloc[:n].values,
                                                      pred["yhat_lower"].iloc[:n].values)
            result["yhat_upper"].iloc[:n] = np.maximum(result["yhat_upper"].iloc[:n].values,
                                                      pred["yhat_upper"].iloc[:n].values)
        result["model"] = self.model_name
        result["horizon"] = horizon
        result["weights"] = str(self.weights)
        return result


def create_forecaster(model_type: str = "ensemble", **kwargs) -> BaseForecaster:
    """Фабрика моделей прогнозирования."""
    registry = {
        "prophet": ProphetForecaster,
        "arima": ARIMAForecaster,
        "xgboost": XGBoostForecaster,
        "ensemble": EnsembleForecaster,
    }
    if model_type not in registry:
        raise ValueError(f"Unknown: {model_type}. Available: {list(registry.keys())}")
    return registry[model_type](**kwargs)
