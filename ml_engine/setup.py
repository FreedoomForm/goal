"""
AegisOps ML Engine Setup — Auto-install ML dependencies
Автоматическая установка всех необходимых ML библиотек
"""

import subprocess
import sys
import os
from pathlib import Path

# ML Dependencies by category
ML_DEPS = {
    'core': [
        'numpy>=1.24.0',
        'pandas>=2.0.0',
        'scikit-learn>=1.3.0',
        'scipy>=1.11.0',
    ],
    'forecasting': [
        'prophet>=1.1.5',           # Facebook Prophet
        'statsmodels>=0.14.0',      # ARIMA, SARIMAX
        'pmdarima>=2.0.0',          # Auto-ARIMA
        'xgboost>=2.0.0',           # Gradient Boosting
        'lightgbm>=4.0.0',          # LightGBM
    ],
    'nixtla': [
        'statsforecast>=1.7.0',     # Nixtla StatsForecast (100x faster ARIMA)
        'neuralforecast>=1.6.0',    # Nixtla NeuralForecast (N-BEATS, NHITS, TFT)
        'utilsforecast>=0.1.0',     # Utilities
    ],
    'neural': [
        'neuralprophet>=0.6.0',     # NeuralProphet (PyTorch-based Prophet)
        'torch>=2.0.0',             # PyTorch
        'pytorch-lightning>=2.0.0', # Lightning
    ],
    'automl': [
        'pycaret[time_series]>=3.3.0',  # PyCaret Time Series AutoML
        'optuna>=3.4.0',                 # Hyperparameter optimization
        'hyperopt>=0.2.7',               # Hyperopt
    ],
    'viz': [
        'matplotlib>=3.7.0',
        'seaborn>=0.12.0',
        'plotly>=5.18.0',
    ],
}

# Optional/extras
ML_OPTIONAL = {
    'darts': ['darts>=0.27.0'],           # Unit8 Darts
    'sktime': ['sktime>=0.24.0'],         # sktime
    'azure': ['azure-ai-ml>=1.12.0'],     # Azure AutoML
}


def check_package(package_name):
    """Check if package is installed"""
    try:
        __import__(package_name.replace('-', '_').replace('[', '').replace(']', ''))
        return True
    except ImportError:
        return False


def install_packages(packages, upgrade=False):
    """Install packages via pip"""
    cmd = [sys.executable, '-m', 'pip', 'install']
    if upgrade:
        cmd.append('--upgrade')
    cmd.extend(packages)
    
    print(f"📦 Installing: {', '.join(packages[:3])}{'...' if len(packages) > 3 else ''}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            print(f"✅ Installed successfully")
            return True
        else:
            print(f"❌ Failed: {result.stderr[:200]}")
            return False
    except subprocess.TimeoutExpired:
        print(f"❌ Timeout")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def setup_ml_engine(install_optional=False):
    """Main setup function"""
    print("=" * 60)
    print("🚀 AegisOps ML Engine Setup")
    print("=" * 60)
    
    results = {'installed': [], 'skipped': [], 'failed': []}
    
    # Install core dependencies first
    for category, packages in ML_DEPS.items():
        print(f"\n📁 Category: {category}")
        print("-" * 40)
        
        for pkg in packages:
            pkg_name = pkg.split('>=')[0].split('==')[0].split('[')[0]
            
            if check_package(pkg_name):
                print(f"  ✓ {pkg_name} already installed")
                results['skipped'].append(pkg_name)
            else:
                if install_packages([pkg], upgrade=False):
                    results['installed'].append(pkg_name)
                else:
                    results['failed'].append(pkg_name)
    
    # Optional packages
    if install_optional:
        print(f"\n📁 Optional packages")
        print("-" * 40)
        for category, packages in ML_OPTIONAL.items():
            for pkg in packages:
                pkg_name = pkg.split('>=')[0].split('==')[0]
                if not check_package(pkg_name):
                    install_packages([pkg])
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Setup Summary")
    print("=" * 60)
    print(f"  ✅ Installed: {len(results['installed'])}")
    print(f"  ⏭️  Skipped (already installed): {len(results['skipped'])}")
    print(f"  ❌ Failed: {len(results['failed'])}")
    
    if results['failed']:
        print(f"\n⚠️ Failed packages: {', '.join(results['failed'])}")
        print("Try installing manually: pip install <package>")
    
    # Create model directory
    model_dir = Path(__file__).parent / 'data' / 'models'
    model_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n📁 Model directory: {model_dir}")
    
    return results


def check_ml_status():
    """Check status of ML packages"""
    print("\n📊 ML Engine Status")
    print("=" * 60)
    
    status = {}
    
    packages_to_check = [
        ('numpy', 'NumPy'),
        ('pandas', 'Pandas'),
        ('sklearn', 'scikit-learn'),
        ('prophet', 'Prophet'),
        ('statsmodels', 'StatsModels'),
        ('pmdarima', 'pmdarima (AutoARIMA)'),
        ('xgboost', 'XGBoost'),
        ('lightgbm', 'LightGBM'),
        ('statsforecast', 'StatsForecast (Nixtla)'),
        ('neuralforecast', 'NeuralForecast (Nixtla)'),
        ('neuralprophet', 'NeuralProphet'),
        ('torch', 'PyTorch'),
        ('optuna', 'Optuna'),
        ('pycaret', 'PyCaret'),
    ]
    
    for module, name in packages_to_check:
        installed = check_package(module)
        status[module] = installed
        icon = '✅' if installed else '❌'
        print(f"  {icon} {name}")
    
    return status


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='AegisOps ML Engine Setup')
    parser.add_argument('--check', action='store_true', help='Check ML status only')
    parser.add_argument('--install', action='store_true', help='Install ML packages')
    parser.add_argument('--optional', action='store_true', help='Install optional packages')
    parser.add_argument('--all', action='store_true', help='Install all packages including optional')
    
    args = parser.parse_args()
    
    if args.check:
        check_ml_status()
    elif args.install or args.all:
        setup_ml_engine(install_optional=args.all or args.optional)
    else:
        # Default: check and offer to install
        check_ml_status()
        print("\n" + "=" * 60)
        response = input("Install missing packages? [y/N]: ").strip().lower()
        if response == 'y':
            setup_ml_engine(install_optional=False)
