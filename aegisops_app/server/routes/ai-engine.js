/**
 * AegisOps — AI Engine Routes
 * REST API for managing AI models, Ollama (local + cloud), and OpenClaw status
 * Uses Node.js built-in fetch (Node 18+)
 */
const express = require('express');
const path = require('path');
const { queryOne, queryAll, runSQL, nowISO } = require('../db');
const ollamaManager = require('../services/ollama-manager');

const router = express.Router();

// Recommended models for gas sector (local + cloud)
const RECOMMENDED_MODELS = [
  { name: 'qwen2.5:7b-instruct', desc: 'Оптимальный баланс качества и скорости для аналитики', size: '4.4 GB', recommended: true, localOnly: false },
  { name: 'llama3.1:8b', desc: 'Универсальная модель для анализа и генерации', size: '4.7 GB', recommended: false, localOnly: false },
  { name: 'gemma3:4b', desc: 'Компактная модель для быстрого инференса', size: '3.3 GB', recommended: false, localOnly: false },
  { name: 'mistral:7b', desc: 'Хорошая для структурированных задач', size: '4.1 GB', recommended: false, localOnly: false },
  { name: 'qwen2.5:14b', desc: 'Высокое качество анализа для мощных машин', size: '8.7 GB', recommended: false, localOnly: false },
];

// Ollama Cloud models (available via ollama.com with OLLAMA_API_KEY)
// These are official Ollama Cloud models with the -cloud suffix
const OLLAMA_CLOUD_MODELS = [
  { name: 'gpt-oss:120b-cloud', desc: 'Мощная облачная модель 120B — Ollama Cloud', size: 'Cloud', recommended: true },
  { name: 'gpt-oss:70b-cloud', desc: 'Облачная модель 70B — Ollama Cloud', size: 'Cloud', recommended: false },
  { name: 'llama3.3:70b-cloud', desc: 'Llama 3.3 70B — Ollama Cloud', size: 'Cloud', recommended: true },
  { name: 'qwen2.5:72b-cloud', desc: 'Qwen 2.5 72B — Ollama Cloud', size: 'Cloud', recommended: false },
  { name: 'deepseek-r1:671b-cloud', desc: 'DeepSeek R1 671B — Ollama Cloud', size: 'Cloud', recommended: false },
  { name: 'gemma3:27b-cloud', desc: 'Gemma 3 27B — Ollama Cloud', size: 'Cloud', recommended: false },
  { name: 'mistral-small:24b-cloud', desc: 'Mistral Small 24B — Ollama Cloud', size: 'Cloud', recommended: false },
];

// Track pull progress
const pullProgress = {};

/* ── AI Status (comprehensive) ── */
router.get('/status', async (req, res) => {
  try {
    const ollamaRow = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
    let localModels = [];
    let cloudModels = [];
    let activeModel = ollamaManager.getActiveModel();
    let ollamaOnline = false;
    let ollamaVersion = '';
    let ollamaBaseUrl = ollamaRow?.base_url || 'http://localhost:11434';
    let ollamaInstalled = false;

    // Check local Ollama
    if (ollamaRow) {
      try {
        const { createConnector } = require('../connectors');
        const connector = createConnector(ollamaRow);
        const status = await connector.testConnection();
        ollamaOnline = status.status === 'online';
        ollamaInstalled = true;

        if (ollamaOnline) {
          try {
            const response = await fetch(`${ollamaBaseUrl}/api/tags`);
            const data = await response.json();
            localModels = (data.models || []).map(m => ({
              name: m.name,
              size: m.size,
              family: m.details?.family || '',
              parameterSize: m.details?.parameter_size || '',
              modified_at: m.modified_at,
              provider: 'local',
            }));
          } catch {}

          try {
            const verRes = await fetch(`${ollamaBaseUrl}/api/version`);
            const verData = await verRes.json();
            ollamaVersion = verData.version || '';
          } catch {}
        }
      } catch (err) {
        ollamaOnline = false;
      }
    }

    // Check if Ollama binary exists
    const { execSync } = require('child_process');
    const isWin = process.platform === 'win32';
    try {
      execSync(isWin ? 'where ollama' : 'which ollama', { stdio: 'ignore' });
      ollamaInstalled = true;
    } catch {
      const fs = require('fs');
      if (isWin) {
        const homeDir = require('os').homedir();
        ollamaInstalled = fs.existsSync(path.join(homeDir, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe')) ||
                          fs.existsSync('C:\\Program Files\\Ollama\\ollama.exe') ||
                          ollamaOnline;
      } else {
        ollamaInstalled = fs.existsSync('/usr/local/bin/ollama') || fs.existsSync('/usr/bin/ollama') || ollamaOnline;
      }
    }

    // Load cloud Ollama endpoints and their models
    const cloudEndpoints = await ollamaManager.loadCloudEndpoints();
    for (const endpoint of cloudEndpoints) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (endpoint.auth_mode === 'bearer' && endpoint.config?.token) {
          headers['Authorization'] = `Bearer ${endpoint.config.token}`;
        } else if (endpoint.auth_mode === 'token' && endpoint.config?.apiKey) {
          headers['Authorization'] = `Bearer ${endpoint.config.apiKey}`;
        }

        const checkRes = await fetch(`${endpoint.url}/api/tags`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (checkRes.ok) {
          const data = await checkRes.json();
          cloudModels.push(...(data.models || []).map(m => ({
            name: m.name,
            size: m.size,
            family: m.details?.family || '',
            parameterSize: m.details?.parameter_size || '',
            modified_at: m.modified_at,
            provider: 'cloud',
            endpointId: endpoint.id,
            endpointName: endpoint.name,
            endpointUrl: endpoint.url,
          })));
        }
      } catch {}
    }

    // Check Ollama Cloud (ollama.com)
    const ollamaCloudKey = await ollamaManager.loadOllamaCloudKey();
    let ollamaCloudOnline = false;
    let ollamaCloudModels = [];
    if (ollamaCloudKey) {
      try {
        const ocRes = await fetch('https://ollama.com/api/tags', {
          headers: { 'Authorization': `Bearer ${ollamaCloudKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (ocRes.ok) {
          ollamaCloudOnline = true;
          const ocData = await ocRes.json();
          ollamaCloudModels = (ocData.models || []).map(m => ({
            name: m.name,
            size: m.size,
            family: m.details?.family || '',
            parameterSize: m.details?.parameter_size || '',
            modified_at: m.modified_at,
            provider: 'ollama-cloud',
            endpointName: 'Ollama Cloud',
            endpointUrl: 'https://ollama.com',
          }));
        }
      } catch {}
    }

    // OpenClaw status — check MCP servers
    let openclawRunning = false;
    let openclawInstalled = false;
    try {
      const mcpServers = await queryAll("SELECT * FROM mcp_servers");
      const activeServers = mcpServers.filter(s => s.status === 'running' || s.status === 'active');
      openclawRunning = activeServers.length > 0;
      openclawInstalled = true;
    } catch {
      openclawInstalled = true;
    }

    // Merge all models for the model selector
    const allModels = [...localModels, ...cloudModels, ...ollamaCloudModels];

    // Add installed flag to recommended models
    const installedNames = allModels.map(m => m.name);
    const recommended = RECOMMENDED_MODELS.map(m => ({
      ...m,
      installed: installedNames.includes(m.name),
    }));

    // Ollama Cloud available models (can be used even if not yet in installed list)
    const ollamaCloudAvailable = OLLAMA_CLOUD_MODELS.map(m => ({
      ...m,
      installed: installedNames.includes(m.name),
      available: ollamaCloudOnline,
    }));

    res.json({
      ollama: {
        running: ollamaOnline,
        installed: ollamaInstalled,
        models: localModels,
        version: ollamaVersion,
        baseUrl: ollamaBaseUrl,
      },
      cloud: {
        endpoints: cloudEndpoints,
        models: cloudModels,
      },
      ollamaCloud: {
        configured: !!ollamaCloudKey,
        online: ollamaCloudOnline,
        models: ollamaCloudModels,
        available: ollamaCloudAvailable,
      },
      openclaw: {
        running: openclawRunning,
        installed: openclawInstalled,
      },
      activeModel,
      activeProvider: ollamaManager.getActiveProvider() || (ollamaOnline ? 'local' : 'fallback'),
      recommended,
      allModels,
      providers: [
        { id: 'ollama', name: 'Ollama (Локальный)', online: ollamaOnline },
        { id: 'ollama_cloud', name: 'Ollama Cloud (Удалённый)', online: cloudEndpoints.length > 0 },
        { id: 'ollama-cloud', name: 'Ollama Cloud (Official)', online: ollamaCloudOnline },
        { id: 'openclaw', name: 'OpenClaw (MCP)', online: openclawRunning },
        { id: 'fallback', name: 'Built-in Fallback', online: true },
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Ensure all AI services are running ── */
router.post('/ensure', async (req, res) => {
  const results = { ollama: { running: false }, openclaw: { running: false } };

  try {
    const ollamaRow = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
    if (ollamaRow) {
      const { createConnector } = require('../connectors');
      const connector = createConnector(ollamaRow);
      const status = await connector.testConnection();
      results.ollama.running = status.status === 'online';
    }

    if (!results.ollama.running) {
      try {
        const isWin = process.platform === 'win32';
        const { spawn } = require('child_process');
        if (isWin) {
          spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', shell: true }).unref();
        } else {
          spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
        }
        await new Promise(r => setTimeout(r, 3000));

        const ollamaRow2 = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
        if (ollamaRow2) {
          const { createConnector } = require('../connectors');
          const connector = createConnector(ollamaRow2);
          const status = await connector.testConnection();
          results.ollama.running = status.status === 'online';
        }
      } catch {}
    }
  } catch {}

  try {
    const mcpServers = await queryAll("SELECT * FROM mcp_servers");
    const activeServers = mcpServers.filter(s => s.status === 'running' || s.status === 'active');
    results.openclaw.running = activeServers.length > 0;
  } catch {}

  res.json(results);
});

/* ── Ollama start ── */
router.post('/ollama/start', async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const isWin = process.platform === 'win32';
    if (isWin) {
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', shell: true }).unref();
    } else {
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
    }
    await new Promise(r => setTimeout(r, 2000));
    res.json({ status: 'started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Ollama stop ── */
router.post('/ollama/stop', async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const isWin = process.platform === 'win32';
    try { execSync(isWin ? 'taskkill /F /IM ollama.exe' : 'pkill ollama', { stdio: 'ignore' }); } catch {}
    res.json({ status: 'stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Ollama install ── */
router.post('/ollama/install', async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const isWin = process.platform === 'win32';
    if (isWin) {
      execSync('curl -L -o "%TEMP%\\OllamaSetup.exe" https://ollama.com/download/OllamaSetup.exe && start "" "%TEMP%\\OllamaSetup.exe"', { stdio: 'inherit', shell: true });
    } else {
      execSync('curl -fsSL https://ollama.com/install.sh | sh', { stdio: 'inherit' });
    }
    res.json({ status: 'installed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Cloud Ollama: List endpoints ── */
router.get('/cloud/endpoints', async (req, res) => {
  try {
    const endpoints = await ollamaManager.loadCloudEndpoints();
    const ollamaCloudKey = await ollamaManager.loadOllamaCloudKey();
    res.json({
      endpoints,
      ollamaCloudConfigured: !!ollamaCloudKey,
      ollamaCloudModels: OLLAMA_CLOUD_MODELS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Cloud Ollama: Add endpoint ── */
router.post('/cloud/endpoints', async (req, res) => {
  try {
    const { name, url, auth_mode, config } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });

    // Validate URL format
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }

    const result = await ollamaManager.addCloudEndpoint(name, url, auth_mode || 'none', config || {});
    res.json({ ok: true, endpoint: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Cloud Ollama: Test endpoint ── */
router.post('/cloud/test', async (req, res) => {
  try {
    const { url, auth_mode, config } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const result = await ollamaManager.testCloudEndpoint(url, auth_mode || 'none', config || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Cloud Ollama: Delete endpoint ── */
router.delete('/cloud/endpoints/:id', async (req, res) => {
  try {
    await ollamaManager.removeCloudEndpoint(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Cloud Ollama: List models from specific endpoint ── */
router.get('/cloud/models', async (req, res) => {
  try {
    const { url, auth_mode, token, apiKey } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param required' });

    const config = {};
    if (token) config.token = token;
    if (apiKey) config.apiKey = apiKey;

    const headers = { 'Content-Type': 'application/json' };
    if (auth_mode === 'bearer' && token) headers['Authorization'] = `Bearer ${token}`;
    if (auth_mode === 'token' && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
      const fetchRes = await fetch(`${url.replace(/\/$/, '')}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!fetchRes.ok) return res.json({ online: false, models: [], error: `HTTP ${fetchRes.status}` });
      const data = await fetchRes.json();
      res.json({
        online: true,
        models: (data.models || []).map(m => ({
          name: m.name,
          size: m.size,
          family: m.details?.family || '',
          parameterSize: m.details?.parameter_size || '',
          provider: 'cloud',
        })),
      });
    } catch (err) {
      res.json({ online: false, models: [], error: err.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Ollama Cloud: Configure API key ── */
router.post('/ollama-cloud/configure', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'apiKey required' });

    // Test the key first
    const testResult = await ollamaManager.testOllamaCloud(apiKey);
    if (testResult.status !== 'online') {
      return res.json({ configured: false, error: testResult.error || 'Invalid API key', models: [] });
    }

    // Save the key
    await ollamaManager.saveOllamaCloudKey(apiKey);
    res.json({
      configured: true,
      models: testResult.models || [],
      modelCount: testResult.modelCount || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Ollama Cloud: Test API key ── */
router.post('/ollama-cloud/test', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
    const result = await ollamaManager.testOllamaCloud(apiKey);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Ollama Cloud: Get status ── */
router.get('/ollama-cloud/status', async (req, res) => {
  try {
    const apiKey = await ollamaManager.loadOllamaCloudKey();
    const online = await ollamaManager.isOllamaCloudOnline();
    let models = [];
    if (online && apiKey) {
      try {
        const modelList = await ollamaManager.listModels();
        models = modelList.ollamaCloud || [];
      } catch {}
    }
    res.json({
      configured: !!apiKey,
      online,
      models,
      cloudModelsAvailable: OLLAMA_CLOUD_MODELS,
    });
  } catch (err) {
    res.json({ configured: false, online: false, models: [], cloudModelsAvailable: OLLAMA_CLOUD_MODELS });
  }
});

/* ── Ollama Cloud: Get env var status ── */
router.get('/ollama-cloud/env', (req, res) => {
  res.json({
    OLLAMA_API_KEY_set: !!process.env.OLLAMA_API_KEY,
    OLLAMA_API_KEY_prefix: process.env.OLLAMA_API_KEY
      ? process.env.OLLAMA_API_KEY.slice(0, 8) + '...'
      : null,
  });
});

/* ── OpenClaw status ── */
router.get('/openclaw/status', async (req, res) => {
  try {
    const mcpServers = await queryAll('SELECT * FROM mcp_servers');
    const { registry } = require('../mcp/openclaw-bridge');
    const running = registry.list();
    const runningNames = new Set(running.map(r => r.name));
    const activeServers = mcpServers.filter(s => runningNames.has(s.name));
    res.json({
      running: activeServers.length > 0,
      installed: true,
      servers: mcpServers.map(s => ({
        name: s.name,
        preset: s.preset,
        running: runningNames.has(s.name),
        auto_start: s.auto_start,
      })),
      runningDetails: running,
    });
  } catch (err) {
    res.json({ running: false, installed: true, servers: [], runningDetails: [] });
  }
});

/* ── OpenClaw configure (set Ollama as LLM provider) ── */
router.post('/openclaw/configure', async (req, res) => {
  try {
    const ollamaRow = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
    const ollamaUrl = ollamaRow?.base_url || 'http://127.0.0.1:11434';
    let ollamaOnline = false;
    try {
      const check = await fetch(`${ollamaUrl}/api/tags`);
      ollamaOnline = check.ok;
    } catch {}
    res.json({
      configured: true,
      llm_provider: 'ollama',
      ollama_url: ollamaUrl,
      ollama_online: ollamaOnline,
      message: ollamaOnline ? 'OpenClaw configured with Ollama as LLM provider' : 'Ollama not running - start Ollama first',
    });
  } catch (err) {
    res.json({ configured: true, llm_provider: 'ollama', ollama_online: false });
  }
});

/* ── OpenClaw start (starts MCP bridge) ── */
router.post('/openclaw/start', async (req, res) => {
  try {
    const existingServers = await queryAll('SELECT * FROM mcp_servers');
    if (existingServers.length === 0) {
      const os = require('os');
      const { runSQL: runSQL2, nowISO: nowISO2 } = require('../db');
      const now = nowISO2();
      await runSQL2(
        'INSERT INTO mcp_servers (name, preset, config, auto_start, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['local-filesystem', 'filesystem', JSON.stringify({ allowedDir: os.homedir() }), 1, now, now]
      );
    }

    const { autoStartPersisted } = require('./mcp');
    await autoStartPersisted();
    res.json({ status: 'started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── OpenClaw stop ── */
router.post('/openclaw/stop', async (req, res) => {
  try {
    const { registry } = require('../mcp/openclaw-bridge');
    const running = registry.list();
    for (const server of running) {
      try {
        const client = registry.get(server.name);
        if (client) client.stop();
      } catch {}
    }
    res.json({ status: 'stopped', stoppedServers: running.map(s => s.name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Select active model ── */
router.post('/models/select', (req, res) => {
  const { model, provider } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  ollamaManager.setModel(model, provider);
  res.json({ ok: true, activeModel: model, provider: provider || 'ollama' });
});

/* ── Pull a new model ── */
router.post('/models/pull/:name', async (req, res) => {
  const modelName = decodeURIComponent(req.params.name);
  if (!modelName) return res.status(400).json({ error: 'model name required' });

  try {
    const ollamaRow = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
    const ollamaUrl = ollamaRow?.base_url || 'http://localhost:11434';

    pullProgress[modelName] = { status: 'pulling', progress: 0, statusText: 'Starting...' };

    fetch(`${ollamaUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    }).then(async (pullRes) => {
      if (!pullRes.ok) {
        pullProgress[modelName] = { status: 'failed', error: `HTTP ${pullRes.status}` };
        return;
      }
      const reader = pullRes.body;
      if (!reader) {
        pullProgress[modelName] = { status: 'completed', progress: 100 };
        return;
      }

      let buffer = '';
      reader.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.status) {
              if (data.status === 'pulling manifest' || data.status.includes('pulling')) {
                const pct = data.total ? Math.round((data.completed || 0) / data.total * 100) : 0;
                pullProgress[modelName] = { status: 'pulling', progress: pct, statusText: data.status };
              } else if (data.status === 'verifying sha256') {
                pullProgress[modelName] = { status: 'pulling', progress: 95, statusText: 'Verifying...' };
              } else if (data.status === 'success') {
                pullProgress[modelName] = { status: 'completed', progress: 100, statusText: 'Done!' };
              }
            }
          } catch {}
        }
      });
      reader.on('end', () => {
        if (pullProgress[modelName]?.status !== 'completed') {
          pullProgress[modelName] = { status: 'completed', progress: 100, statusText: 'Done!' };
        }
      });
      reader.on('error', (err) => {
        pullProgress[modelName] = { status: 'failed', error: err.message };
      });
    }).catch(err => {
      pullProgress[modelName] = { status: 'failed', error: err.message };
    });

    res.json({ ok: true, message: `Pulling ${modelName}...` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Pull status ── */
router.get('/models/pull-status', (req, res) => {
  res.json(pullProgress);
});

/* ── Delete a model ── */
router.delete('/models/:name', async (req, res) => {
  try {
    await ollamaManager.deleteModel(decodeURIComponent(req.params.name));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
