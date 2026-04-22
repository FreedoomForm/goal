"""
AegisOps ML Engine API Server
FastAPI server for ML predictions with auto-start
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml_engine.api")

# Import models
try:
    from models.forecast_v2 import (
        create_forecaster_v2, create_time_features, create_energy_features,
        BaseForecasterV2, EnsembleForecasterV2, AutoMLForecaster
    )
    MODELS_V2_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Models v2 not available: {e}")
    MODELS_V2_AVAILABLE = False

try:
    from models.forecast import create_forecaster
    MODELS_V1_AVAILABLE = True
except ImportError:
    MODELS_V1_AVAILABLE = False

try:
    from models.risk import RiskAssessor
    RISK_AVAILABLE = True
except ImportError:
    RISK_AVAILABLE = False

try:
    from models.scoring import PaymentScorer
    SCORING_AVAILABLE = True
except ImportError:
    SCORING_AVAILABLE = False

# App
app = FastAPI(
    title="AegisOps ML Engine API",
    description="Machine Learning API for forecasting, risk assessment, and scoring",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model cache
_model_cache: Dict[str, Any] = {}


# ═══════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════

class ForecastRequest(BaseModel):
    data: List[Dict[str, Any]]  # [{ds: '2024-01-01', value: 100}, ...]
    horizon: int = 30
    model: str = "ensemble"
    include_features: bool = True


class ForecastResponse(BaseModel):
    forecast: List[Dict[str, Any]]
    model: str
    horizon: int
    mape: Optional[float] = None
    metrics: Optional[Dict[str, float]] = None


class RiskRequest(BaseModel):
    supply_data: Optional[List[Dict]] = None
    demand_data: Optional[List[Dict]] = None
    telemetry_data: Optional[List[Dict]] = None
    billing_data: Optional[List[Dict]] = None
    forecast_horizon: int = 30


class ScoreRequest(BaseModel):
    consumers: List[Dict[str, Any]]


class StatusResponse(BaseModel):
    status: str
    models_available: Dict[str, bool]
    version: str
    uptime_seconds: float


# ═══════════════════════════════════════════════════════════════
# Startup
# ═══════════════════════════════════════════════════════════════

_start_time = datetime.now()


@app.on_event("startup")
async def startup():
    """Auto-setup on startup"""
    logger.info("🚀 ML Engine starting...")
    
    # Check dependencies
    status = check_dependencies()
    logger.info(f"📊 Models available: {status}")
    
    # Warm up ensemble model
    if MODELS_V2_AVAILABLE:
        try:
            logger.info("🔥 Warming up ensemble model...")
            # Create dummy data for warmup
            dates = pd.date_range(end=datetime.now(), periods=100, freq='D')
            dummy_df = pd.DataFrame({
                'ds': dates,
                'value': np.random.randn(100).cumsum() + 100
            })
            
            model = create_forecaster_v2('ensemble')
            model.fit(dummy_df)
            _model_cache['ensemble'] = model
            logger.info("✅ Ensemble model warmed up")
        except Exception as e:
            logger.warning(f"Ensemble warmup failed: {e}")


def check_dependencies() -> Dict[str, bool]:
    """Check which ML libraries are available"""
    status = {
        'forecast_v2': MODELS_V2_AVAILABLE,
        'forecast_v1': MODELS_V1_AVAILABLE,
        'risk': RISK_AVAILABLE,
        'scoring': SCORING_AVAILABLE,
    }
    
    # Check individual libraries
    libs = ['prophet', 'xgboost', 'lightgbm', 'statsforecast', 'neuralforecast', 'torch', 'pycaret']
    for lib in libs:
        try:
            __import__(lib)
            status[lib] = True
        except ImportError:
            status[lib] = False
    
    return status


# ═══════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════

@app.get("/", response_class=dict)
async def root():
    return {
        "name": "AegisOps ML Engine API",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_class=dict)
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/status", response_model=StatusResponse)
async def status():
    return StatusResponse(
        status="running",
        models_available=check_dependencies(),
        version="2.0.0",
        uptime_seconds=(datetime.now() - _start_time).total_seconds()
    )


@app.get("/models")
async def list_models():
    """List available models"""
    models = {
        'forecasting': {
            'v2': ['ensemble', 'automl', 'prophet', 'arima', 'ets', 'theta', 
                   'xgboost', 'lightgbm', 'nbeats', 'nhits', 'tft', 'statsforecast'],
            'v1': ['prophet', 'arima', 'xgboost', 'ensemble']
        },
        'risk': ['balance', 'pressure', 'financial', 'composite'] if RISK_AVAILABLE else [],
        'scoring': ['payment'] if SCORING_AVAILABLE else []
    }
    return {"models": models, "available": check_dependencies()}


@app.post("/forecast", response_model=ForecastResponse)
async def forecast(request: ForecastRequest):
    """Generate forecast"""
    if not MODELS_V2_AVAILABLE and not MODELS_V1_AVAILABLE:
        raise HTTPException(500, "No forecasting models available")
    
    try:
        # Convert to DataFrame
        df = pd.DataFrame(request.data)
        
        if 'ds' not in df.columns or 'value' not in df.columns:
            raise HTTPException(400, "Data must have 'ds' and 'value' columns")
        
        # Create model
        model_type = request.model
        
        if MODELS_V2_AVAILABLE:
            model = create_forecaster_v2(model_type)
        else:
            model = create_forecaster(model_type)
        
        # Fit
        model.fit(df)
        
        # Predict
        result = model.predict(horizon=request.horizon)
        
        # Convert to list
        forecast_list = result.to_dict('records')
        
        return ForecastResponse(
            forecast=forecast_list,
            model=model_type,
            horizon=request.horizon,
            mape=None,
            metrics=None
        )
        
    except Exception as e:
        logger.error(f"Forecast error: {e}")
        raise HTTPException(500, str(e))


@app.post("/forecast/quick")
async def quick_forecast(
    data: List[Dict[str, Any]],
    horizon: int = 30,
    model: str = "ensemble"
):
    """Quick forecast with minimal parameters"""
    return await forecast(ForecastRequest(
        data=data,
        horizon=horizon,
        model=model
    ))


@app.post("/risk/assess")
async def assess_risk(request: RiskRequest):
    """Assess risks"""
    if not RISK_AVAILABLE:
        raise HTTPException(500, "Risk models not available")
    
    try:
        assessor = RiskAssessor()
        results = {}
        
        if request.supply_data and request.demand_data:
            supply_df = pd.DataFrame(request.supply_data)
            demand_df = pd.DataFrame(request.demand_data)
            
            if 'ds' in supply_df.columns:
                supply_df['ds'] = pd.to_datetime(supply_df['ds'])
            if 'ds' in demand_df.columns:
                demand_df['ds'] = pd.to_datetime(demand_df['ds'])
            
            results['balance_risk'] = assessor.assess_balance_risk(
                supply_df, demand_df, request.forecast_horizon
            ).to_dict('records')
        
        if request.telemetry_data:
            telemetry_df = pd.DataFrame(request.telemetry_data)
            results['pressure_risk'] = assessor.assess_pressure_risk(
                telemetry_df
            ).to_dict('records')
        
        if request.billing_data:
            billing_df = pd.DataFrame(request.billing_data)
            results['financial_risk'] = assessor.assess_financial_risk(billing_df)
        
        return {"risk_assessment": results}
        
    except Exception as e:
        logger.error(f"Risk assessment error: {e}")
        raise HTTPException(500, str(e))


@app.post("/scoring/score")
async def score_consumers(request: ScoreRequest):
    """Score consumers for payment risk"""
    if not SCORING_AVAILABLE:
        raise HTTPException(500, "Scoring models not available")
    
    try:
        scorer = PaymentScorer()
        df = pd.DataFrame(request.consumers)
        
        # Need target column for training in real scenario
        # Here we use pre-trained or fallback
        if 'default_flag' in df.columns:
            scorer.fit(df)
        else:
            # Use heuristics if no training
            results = []
            for consumer in request.consumers:
                score = 700  # Default middle score
                if consumer.get('current_debt', 0) > consumer.get('monthly_bill', 1) * 2:
                    score -= 100
                if consumer.get('payment_history', []):
                    on_time = sum(1 for p in consumer['payment_history'] if p.get('on_time'))
                    total = len(consumer['payment_history'])
                    if total > 0:
                        score = int(500 + (on_time / total) * 400)
                
                results.append({
                    'consumer_id': consumer.get('consumer_id', 'unknown'),
                    'score': max(300, min(850, score)),
                    'risk_band': 'High Risk' if score < 500 else 'Medium Risk' if score < 700 else 'Low Risk'
                })
            return {"scores": results}
        
        scores = scorer.predict_score(df)
        return {"scores": scores.to_dict('records')}
        
    except Exception as e:
        logger.error(f"Scoring error: {e}")
        raise HTTPException(500, str(e))


@app.post("/features/create")
async def create_features(data: List[Dict[str, Any]]):
    """Create time series features"""
    try:
        df = pd.DataFrame(data)
        
        if 'ds' in df.columns:
            df['ds'] = pd.to_datetime(df['ds'])
            df = df.set_index('ds')
        
        target_col = 'value' if 'value' in df.columns else df.columns[0]
        
        df = create_time_features(df, target_col)
        
        if 'temperature' in df.columns:
            df = create_energy_features(df, demand_col=target_col)
        
        return {"features": df.reset_index().to_dict('records')}
        
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════════
# Run
# ═══════════════════════════════════════════════════════════════

def run_server(host: str = "0.0.0.0", port: int = 18092):
    """Run the ML API server"""
    import uvicorn
    logger.info(f"🌐 Starting ML Engine API on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="AegisOps ML Engine API")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=18092, help="Port to bind")
    
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
