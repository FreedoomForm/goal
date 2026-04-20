/**
 * AegisOps — AI Engine Routes
 * REST API for managing AI models, Ollama, and OpenClaw status
 * Uses Node.js built-in fetch (Node 18+)
 */
const express = require('express');
const path = require('path');
const { queryOne, queryAll, runSQL, nowISO } = require('../db');
const ollamaManager = require('../services/ollama-manager');

const router = express.Router();

// Recommended models for gas sector
const RECOMMENDED_MODELS = [
  { name: 'qwen2.5:7b-instruct', desc: 'Оптимальный баланс качества и скорости для аналитики', size: '4.4 GB', recommended: true },
  { name: 'llama3.1:8b', desc: 'Универсальная модель для анализа и генерации', size: '4.7 GB', recommended: false },
  { name: 'gemma3:4b', desc: 'Компактная модель для быстрого инференса', size: '3.3 GB', recommended: false },
  { name: 'mistral:7b', desc: 'Хорошая для структурированных задач', size: '4.1 GB', recommended: false },
  { name: 'qwen2.5:14b', desc: 'Высокое качество анализа для мощных машин', size: '8.7 GB', recommended: false },
];

// Track pull progress
const pullProgress = {};

/* ── AI Status (comprehensive) ── */
router.get('/status', async (req, res) => {
  try {
    const ollamaRow = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
    let models = [];
    let activeModel = ollamaManager.getActiveModel();
    let ollamaOnline = false;
    let ollamaVersion = '';
    let ollamaBaseUrl = ollamaRow?.base_url || 'http://localhost:11434';
    let ollamaInstalled = false;

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
            models = (data.models || []).map(m => ({
              name: m.name,
              size: m.size,
              family: m.details?.family || '',
              parameterSize: m.details?.parameter_size || '',
              modified_at: m.modified_at,
            }));
          } catch {}

          // Try to get version
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
      // Check common paths
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

    // OpenClaw status — check MCP servers
    let openclawRunning = false;
    let openclawInstalled = false;
    try {
      const mcpServers = await queryAll("SELECT * FROM mcp_servers");
      const activeServers = mcpServers.filter(s => s.status === 'running' || s.status === 'active');
      openclawRunning = activeServers.length > 0;
      openclawInstalled = true; // MCP bridge is always available
    } catch {
      openclawInstalled = true; // MCP module exists
    }

    // Add installed flag to recommended models
    const installedNames = models.map(m => m.name);
    const recommended = RECOMMENDED_MODELS.map(m => ({
      ...m,
      installed: installedNames.includes(m.name),
    }));

    res.json({
      ollama: {
        running: ollamaOnline,
        installed: ollamaInstalled,
        models,
        version: ollamaVersion,
        baseUrl: ollamaBaseUrl,
      },
      openclaw: {
        running: openclawRunning,
        installed: openclawInstalled,
      },
      activeModel,
      activeProvider: ollamaOnline ? 'ollama' : 'fallback',
      recommended,
      providers: [
        { id: 'ollama', name: 'Ollama', online: ollamaOnline },
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

  // Try to start Ollama
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
        // Wait a bit for Ollama to start
        await new Promise(r => setTimeout(r, 3000));

        const ollamaRow = await queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
        if (ollamaRow) {
          const { createConnector } = require('../connectors');
          const connector = createConnector(ollamaRow);
          const status = await connector.testConnection();
          results.ollama.running = status.status === 'online';
        }
      } catch {}
    }
  } catch {}

  // Check OpenClaw/MCP
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
      // On Windows, download the installer
      execSync('curl -L -o "%TEMP%\\OllamaSetup.exe" https://ollama.com/download/OllamaSetup.exe && start "" "%TEMP%\\OllamaSetup.exe"', { stdio: 'inherit', shell: true });
    } else {
      execSync('curl -fsSL https://ollama.com/install.sh | sh', { stdio: 'inherit' });
    }
    res.json({ status: 'installed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    // OpenClaw uses Ollama as its LLM provider
    // This endpoint confirms the configuration is set
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
    // First, ensure at least one MCP server exists (create default filesystem server if none)
    const existingServers = await queryAll('SELECT * FROM mcp_servers');
    if (existingServers.length === 0) {
      // Auto-create a default filesystem MCP server for immediate functionality
      const os = require('os');
      const { runSQL: runSQL2, nowISO: nowISO2 } = require('../db');
      const now = nowISO2();
      await runSQL2(
        'INSERT INTO mcp_servers (name, preset, config, auto_start, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['local-filesystem', 'filesystem', JSON.stringify({ allowedDir: os.homedir() }), 1, now, now]
      );
    }

    // OpenClaw works through MCP servers - auto-start persisted servers
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
    // Stop all running MCP servers via the registry
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
  ollamaManager.setModel(model);
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

    // Fire and forget the pull - stream progress in background
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
