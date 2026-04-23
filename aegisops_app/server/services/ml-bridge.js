/**
 * AegisOps ML Engine Integration
 * Автоматическая установка и запуск Python ML сервисов из Node.js
 */

const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ML_PORT = parseInt(process.env.ML_PORT || '18092');
const ML_HOST = process.env.ML_HOST || '127.0.0.1';

// Paths
const ML_DIR = path.join(__dirname, '..', '..', 'ml_engine');
const PYTHON_SCRIPT = path.join(ML_DIR, 'start_ml.py');
const VENV_DIR = path.join(ML_DIR, 'venv');
const REQUIREMENTS = path.join(ML_DIR, 'requirements.txt');

let mlProcess = null;
let isRunning = false;

/**
 * Check if Python is available
 */
function findPython() {
  const pythonCommands = ['python3', 'python'];
  
  for (const cmd of pythonCommands) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Check if ML server is responding
 */
function checkMLHealth() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: ML_HOST,
      port: ML_PORT,
      path: '/health',
      method: 'GET',
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ running: true, health: JSON.parse(data) });
        } catch {
          resolve({ running: true, health: null });
        }
      });
    });
    
    req.on('error', () => resolve({ running: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false });
    });
    req.end();
  });
}

/**
 * Install ML dependencies
 */
async function installMLDependencies() {
  console.log('📦 Installing ML dependencies...');
  
  const python = findPython();
  if (!python) {
    console.error('❌ Python not found. Install Python 3.9+ first.');
    return { success: false, error: 'Python not found' };
  }
  
  console.log(`✅ Using Python: ${python}`);
  
  // Install packages
  const packages = [
    'numpy', 'pandas', 'scikit-learn', 'scipy',
    'prophet', 'statsmodels', 'pmdarima',
    'xgboost', 'lightgbm',
    'statsforecast', 'neuralforecast',
    'fastapi', 'uvicorn', 'pydantic'
  ];
  
  return new Promise((resolve) => {
    const proc = spawn(python, [
      '-m', 'pip', 'install', '--upgrade',
      ...packages,
      '--quiet'
    ], {
      cwd: ML_DIR,
      stdio: 'inherit'
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('✅ ML dependencies installed');
        resolve({ success: true });
      } else {
        console.error('❌ ML dependency installation failed');
        resolve({ success: false, code });
      }
    });
    
    proc.on('error', (err) => {
      console.error('❌ Installation error:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Start ML API server
 */
async function startMLServer() {
  // Check if already running
  const health = await checkMLHealth();
  if (health.running) {
    console.log('✅ ML server already running');
    isRunning = true;
    return { success: true, alreadyRunning: true };
  }
  
  const python = findPython();
  if (!python) {
    console.error('❌ Python not found');
    return { success: false, error: 'Python not found' };
  }
  
  console.log(`🚀 Starting ML Engine on port ${ML_PORT}...`);
  
  return new Promise((resolve) => {
    // Use the Python starter script
    mlProcess = spawn(python, [
      PYTHON_SCRIPT,
      '--start',
      '--port', String(ML_PORT)
    ], {
      cwd: path.join(ML_DIR, '..'),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let started = false;
    let output = '';
    
    mlProcess.stdout?.on('data', (data) => {
      output += data.toString();
      if (!started && output.includes('Started') || output.includes('Uvicorn running')) {
        started = true;
      }
    });
    
    mlProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });
    
    mlProcess.on('error', (err) => {
      console.error('❌ ML server error:', err.message);
      resolve({ success: false, error: err.message });
    });
    
    // Wait for server to start
    let attempts = 0;
    const checkInterval = setInterval(async () => {
      attempts++;
      
      const health = await checkMLHealth();
      if (health.running) {
        clearInterval(checkInterval);
        isRunning = true;
        console.log(`✅ ML Engine started on http://localhost:${ML_PORT}`);
        console.log(`📚 API docs: http://localhost:${ML_PORT}/docs`);
        resolve({ success: true, port: ML_PORT });
      } else if (attempts > 15) {
        clearInterval(checkInterval);
        console.error('❌ ML server failed to start within timeout');
        resolve({ success: false, error: 'Startup timeout', output });
      }
    }, 1000);
    
    // Detach to let it run independently
    mlProcess.unref();
  });
}

/**
 * Stop ML server
 */
async function stopMLServer() {
  const python = findPython();
  if (!python) {
    return { success: false, error: 'Python not found' };
  }
  
  return new Promise((resolve) => {
    const proc = spawn(python, [PYTHON_SCRIPT, '--stop'], {
      cwd: path.join(ML_DIR, '..'),
      stdio: 'inherit'
    });
    
    proc.on('close', (code) => {
      isRunning = false;
      console.log('✅ ML server stopped');
      resolve({ success: code === 0 });
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Get ML status
 */
async function getMLStatus() {
  const python = findPython();
  const health = await checkMLHealth();
  
  // Check installed packages
  const packages = {};
  const packageList = ['numpy', 'pandas', 'sklearn', 'prophet', 'xgboost', 
                       'lightgbm', 'statsforecast', 'neuralforecast', 'torch'];
  
  for (const pkg of packageList) {
    try {
      execSync(`${python} -c "import ${pkg}"`, { stdio: 'ignore' });
      packages[pkg] = true;
    } catch {
      packages[pkg] = false;
    }
  }
  
  return {
    python: python,
    serverRunning: health.running,
    serverHealth: health.health,
    port: ML_PORT,
    packages
  };
}

/**
 * Make forecast request to ML server
 */
async function mlForecast(data, horizon = 30, model = 'ensemble') {
  const health = await checkMLHealth();
  if (!health.running) {
    // Try to start
    const startResult = await startMLServer();
    if (!startResult.success) {
      throw new Error('ML server not available');
    }
  }
  
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      data,
      horizon,
      model
    });
    
    const req = http.request({
      hostname: ML_HOST,
      port: ML_PORT,
      path: '/forecast',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`ML API error: ${res.statusCode}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ML request timeout'));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Auto-setup: install dependencies and start server
 */
async function autoSetupML() {
  console.log('\n🔧 AegisOps ML Auto-Setup');
  console.log('='.repeat(50));
  
  // Check Python
  const python = findPython();
  if (!python) {
    console.error('❌ Python not found. Install Python 3.9+ and try again.');
    return { success: false, error: 'Python not found' };
  }
  
  console.log(`✅ Python: ${python}`);
  
  // Check if server already running
  const health = await checkMLHealth();
  if (health.running) {
    console.log('✅ ML server already running');
    return { success: true, alreadyRunning: true, port: ML_PORT };
  }
  
  // Check packages
  const status = await getMLStatus();
  const missingPackages = Object.entries(status.packages)
    .filter(([_, installed]) => !installed)
    .map(([name]) => name);
  
  if (missingPackages.length > 3) {
    console.log(`📦 Installing ${missingPackages.length} missing packages...`);
    const installResult = await installMLDependencies();
    if (!installResult.success) {
      return installResult;
    }
  }
  
  // Start server
  const startResult = await startMLServer();
  return startResult;
}

module.exports = {
  findPython,
  checkMLHealth,
  installMLDependencies,
  startMLServer,
  stopMLServer,
  getMLStatus,
  mlForecast,
  autoSetupML,
  ML_PORT,
  ML_HOST
};
