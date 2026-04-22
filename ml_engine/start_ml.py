#!/usr/bin/env python3
"""
AegisOps ML Auto-Starter
Автоматическая установка и запуск ML сервисов

Usage:
    python ml_engine/start_ml.py --install    # Установить зависимости
    python ml_engine/start_ml.py --start       # Запустить ML API
    python ml_engine/start_ml.py --all         # Установить и запустить
    python ml_engine/start_ml.py --check       # Проверить статус
"""

import os
import sys
import subprocess
import signal
import time
import json
from pathlib import Path
from datetime import datetime

# Add to path
sys.path.insert(0, str(Path(__file__).parent.parent))

ML_PORT = 18092
PID_FILE = Path(__file__).parent / "data" / "ml_server.pid"
LOG_FILE = Path(__file__).parent / "data" / "ml_server.log"


def log(msg: str, level: str = "INFO"):
    """Log message"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [{level}] {msg}"
    print(line)
    
    # Also write to log file
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except:
        pass


def run_command(cmd: list, timeout: int = 300) -> tuple:
    """Run command and return (success, output)"""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def check_python():
    """Check Python version"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 9):
        log("❌ Python 3.9+ required", "ERROR")
        return False
    log(f"✅ Python {version.major}.{version.minor}.{version.micro}")
    return True


def install_dependencies():
    """Install ML dependencies"""
    log("📦 Installing ML dependencies...")
    
    # Core packages
    packages = [
        # Core
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "scikit-learn>=1.3.0",
        "scipy>=1.11.0",
        
        # Forecasting
        "prophet>=1.1.5",
        "statsmodels>=0.14.0",
        "pmdarima>=2.0.0",
        "xgboost>=2.0.0",
        "lightgbm>=4.0.0",
        
        # Nixtla (100x faster)
        "statsforecast>=1.7.0",
        "neuralforecast>=1.6.0",
        
        # API
        "fastapi>=0.109.0",
        "uvicorn>=0.27.0",
        "pydantic>=2.0.0",
    ]
    
    # Optional but recommended
    optional = [
        "neuralprophet>=0.6.0",  # Neural Prophet
        "torch>=2.0.0",           # PyTorch
        "optuna>=3.4.0",          # Hyperparameter tuning
    ]
    
    success, failed = [], []
    
    for pkg in packages:
        log(f"  Installing {pkg.split('>=')[0]}...")
        ok, output = run_command([
            sys.executable, "-m", "pip", "install", pkg, "--quiet"
        ])
        if ok:
            success.append(pkg)
        else:
            failed.append(pkg)
            log(f"  ⚠️ Failed: {output[:100]}", "WARN")
    
    # Try optional
    for pkg in optional:
        log(f"  Installing optional: {pkg.split('>=')[0]}...")
        ok, _ = run_command([
            sys.executable, "-m", "pip", "install", pkg, "--quiet"
        ], timeout=600)
        if ok:
            success.append(pkg)
    
    log(f"✅ Installed: {len(success)} packages")
    if failed:
        log(f"⚠️ Failed: {len(failed)} packages: {failed}", "WARN")
    
    return len(failed) == 0


def check_dependencies():
    """Check installed dependencies"""
    log("🔍 Checking ML dependencies...")
    
    packages = {
        'numpy': 'NumPy',
        'pandas': 'Pandas',
        'sklearn': 'scikit-learn',
        'prophet': 'Prophet',
        'statsmodels': 'StatsModels',
        'pmdarima': 'pmdarima',
        'xgboost': 'XGBoost',
        'lightgbm': 'LightGBM',
        'statsforecast': 'StatsForecast (Nixtla)',
        'neuralforecast': 'NeuralForecast (Nixtla)',
        'torch': 'PyTorch',
        'fastapi': 'FastAPI',
        'uvicorn': 'Uvicorn',
    }
    
    installed = []
    missing = []
    
    for module, name in packages.items():
        try:
            __import__(module)
            log(f"  ✅ {name}")
            installed.append(module)
        except ImportError:
            log(f"  ❌ {name}")
            missing.append(module)
    
    return {
        'installed': installed,
        'missing': missing,
        'ready': len(missing) < 5  # Allow some missing
    }


def is_server_running():
    """Check if ML server is running"""
    if not PID_FILE.exists():
        return False
    
    try:
        pid = int(PID_FILE.read_text().strip())
        # Check if process exists
        os.kill(pid, 0)
        return True
    except (ValueError, ProcessLookupError, PermissionError):
        # Clean stale PID file
        try:
            PID_FILE.unlink()
        except:
            pass
        return False


def start_server():
    """Start ML API server"""
    if is_server_running():
        log("⚠️ ML server already running", "WARN")
        return True
    
    # Check dependencies
    status = check_dependencies()
    if not status['ready']:
        log("❌ Missing critical dependencies. Run --install first", "ERROR")
        return False
    
    log(f"🚀 Starting ML Engine API on port {ML_PORT}...")
    
    # Start server
    cmd = [
        sys.executable, "-m", "uvicorn",
        "ml_engine.api.ml_api:app",
        "--host", "0.0.0.0",
        "--port", str(ML_PORT),
        "--log-level", "info"
    ]
    
    try:
        # Start in background
        process = subprocess.Popen(
            cmd,
            stdout=open(LOG_FILE, "a"),
            stderr=subprocess.STDOUT,
            cwd=str(Path(__file__).parent.parent),
            start_new_session=True
        )
        
        # Save PID
        PID_FILE.parent.mkdir(parents=True, exist_ok=True)
        PID_FILE.write_text(str(process.pid))
        
        # Wait a bit and check
        time.sleep(2)
        
        if is_server_running():
            log(f"✅ ML Engine API started on http://localhost:{ML_PORT}")
            log(f"📚 API docs: http://localhost:{ML_PORT}/docs")
            return True
        else:
            log("❌ Server failed to start", "ERROR")
            return False
            
    except Exception as e:
        log(f"❌ Failed to start server: {e}", "ERROR")
        return False


def stop_server():
    """Stop ML API server"""
    if not is_server_running():
        log("⚠️ ML server not running", "WARN")
        return True
    
    try:
        pid = int(PID_FILE.read_text().strip())
        os.kill(pid, signal.SIGTERM)
        
        # Wait for graceful shutdown
        for _ in range(10):
            try:
                os.kill(pid, 0)
                time.sleep(0.5)
            except ProcessLookupError:
                break
        
        # Force kill if still running
        try:
            os.kill(pid, signal.SIGKILL)
        except:
            pass
        
        PID_FILE.unlink()
        log("✅ ML server stopped")
        return True
        
    except Exception as e:
        log(f"❌ Failed to stop server: {e}", "ERROR")
        return False


def get_status():
    """Get ML engine status"""
    log("=" * 50)
    log("📊 AegisOps ML Engine Status")
    log("=" * 50)
    
    # Python version
    check_python()
    
    # Dependencies
    status = check_dependencies()
    
    # Server status
    running = is_server_running()
    log(f"\n🌐 ML API Server: {'🟢 Running' if running else '🔴 Stopped'}")
    
    if running:
        try:
            import urllib.request
            with urllib.request.urlopen(f"http://localhost:{ML_PORT}/health", timeout=5) as r:
                health = json.loads(r.read().decode())
                log(f"   Health: {health.get('status', 'unknown')}")
        except:
            log(f"   Health: unable to check")
    
    log("\n" + "=" * 50)
    
    return {
        'dependencies': status,
        'server_running': running,
        'port': ML_PORT if running else None
    }


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="AegisOps ML Auto-Starter")
    parser.add_argument("--install", action="store_true", help="Install ML dependencies")
    parser.add_argument("--start", action="store_true", help="Start ML API server")
    parser.add_argument("--stop", action="store_true", help="Stop ML API server")
    parser.add_argument("--check", action="store_true", help="Check ML status")
    parser.add_argument("--all", action="store_true", help="Install and start")
    parser.add_argument("--port", type=int, default=ML_PORT, help="ML API port")
    
    args = parser.parse_args()
    
    global ML_PORT
    ML_PORT = args.port
    
    if args.install:
        install_dependencies()
    elif args.start:
        start_server()
    elif args.stop:
        stop_server()
    elif args.check:
        get_status()
    elif args.all:
        install_dependencies()
        time.sleep(2)
        start_server()
        get_status()
    else:
        # Default: check status
        get_status()
        print("\n💡 Usage:")
        print("   python ml_engine/start_ml.py --install   # Install dependencies")
        print("   python ml_engine/start_ml.py --start      # Start ML server")
        print("   python ml_engine/start_ml.py --stop       # Stop ML server")
        print("   python ml_engine/start_ml.py --all        # Install & start")


if __name__ == "__main__":
    main()
