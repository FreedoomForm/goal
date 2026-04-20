/**
 * AegisOps — AI Engine Page & Enhanced Assistant
 * Manages Ollama (local + cloud), OpenClaw, model selection, and streaming AI chat
 */

/* ══════════════ AI ENGINE PAGE ══════════════ */
async function renderAIEngine(container) {
  let status;
  try {
    status = await api('/api/ai/status');
  } catch (err) {
    container.innerHTML = `<div class="card"><h3>Ошибка</h3><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const ollamaRunning = status.ollama?.running;
  const openclawRunning = status.openclaw?.running;
  const ollamaInstalled = status.ollama?.installed;
  const openclawInstalled = status.openclaw?.installed;
  const cloudEndpoints = status.cloud?.endpoints || [];
  const cloudModels = status.cloud?.models || [];
  const localModels = status.ollama?.models || [];
  const allModels = status.allModels || [];
  const hasCloud = cloudEndpoints.length > 0;
  const ollamaCloudConfigured = status.ollamaCloud?.configured || false;
  const ollamaCloudOnline = status.ollamaCloud?.online || false;
  const ollamaCloudModels = status.ollamaCloud?.models || [];
  const ollamaCloudAvailable = status.ollamaCloud?.available || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">AI Движок</h2>
        <p class="page-subtitle">Управление Ollama (локальный + облачный), OpenClaw (MCP агент) и моделями</p>
      </div>
      <button class="btn btn-primary" id="btnEnsureAll">🚀 Запустить всё автоматически</button>
    </div>

    <!-- Status Overview -->
    <div class="stats-grid mb-24">
      <div class="stat-card">
        <div class="stat-label">Ollama LLM (Локальный)</div>
        <div class="stat-value" style="color:${ollamaRunning ? '#23c483' : '#ff6a6a'}">${ollamaRunning ? '🟢 Запущен' : '🔴 Остановлен'}</div>
        <div class="stat-change">${ollamaInstalled ? 'Установлен' : 'Не установлен'} | Моделей: ${localModels.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ollama Cloud (Удалённый)</div>
        <div class="stat-value" style="color:${hasCloud ? '#23c483' : '#ffb347'}">${hasCloud ? '🟢 Подключен' : '🟡 Не настроен'}</div>
        <div class="stat-change">Эндпоинтов: ${cloudEndpoints.length} | Моделей: ${cloudModels.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">☁️ Ollama Cloud (Official)</div>
        <div class="stat-value" style="color:${ollamaCloudOnline ? '#23c483' : ollamaCloudConfigured ? '#ffb347' : '#ff6a6a'}">${ollamaCloudOnline ? '🟢 Онлайн' : ollamaCloudConfigured ? '🟡 Ключ установлен' : '🔴 Не настроен'}</div>
        <div class="stat-change">${ollamaCloudConfigured ? 'API ключ установлен' : 'Нужен API ключ'} | Моделей: ${ollamaCloudModels.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">OpenClaw (MCP)</div>
        <div class="stat-value" style="color:${openclawRunning ? '#23c483' : '#ff6a6a'}">${openclawRunning ? '🟢 Запущен' : '🔴 Остановлен'}</div>
        <div class="stat-change">${openclawInstalled ? 'Установлен' : 'Не установлен'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Активная модель</div>
        <div class="stat-value" style="font-size:16px">${escapeHtml(status.activeModel || 'не выбрана')}</div>
        <div class="stat-change">Провайдер: ${status.activeProvider === 'cloud' ? '☁️ Облако' : status.activeProvider === 'ollama' ? '🖥️ Локальный' : status.activeProvider}</div>
      </div>
    </div>

    <!-- Ollama Control Panel -->
    <div class="grid-2 mb-24">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🤖 Ollama — Локальный LLM</div>
            <div class="card-subtitle">Автоматическое скачивание, установка и запуск нейросетей</div>
          </div>
          <div class="item-actions">
            ${ollamaRunning
              ? '<button class="btn btn-sm btn-danger" id="btnStopOllama">⏹ Остановить</button>'
              : '<button class="btn btn-sm btn-primary" id="btnStartOllama">▶ Запустить</button>'
            }
            ${!ollamaInstalled ? '<button class="btn btn-sm btn-primary" id="btnInstallOllama">📥 Установить</button>' : ''}
          </div>
        </div>
        <div class="item-list mt-16">
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">Статус</div>
              <div class="item-meta">
                <span class="badge ${ollamaRunning ? 'badge-success' : 'badge-danger'}">${ollamaRunning ? 'Онлайн' : 'Оффлайн'}</span>
                ${status.ollama?.version ? `<span class="chip">${escapeHtml(status.ollama.version)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">Endpoint</div>
              <div class="item-meta"><span class="chip font-mono">${escapeHtml(status.ollama?.baseUrl || 'http://127.0.0.1:11434')}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">☁️ Ollama — Облачные модели</div>
            <div class="card-subtitle">Подключение к удалённым Ollama серверам (RunPod, Vast.ai, свой сервер)</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-primary" id="btnAddCloudEndpoint">+ Добавить эндпоинт</button>
          </div>
        </div>
        <div class="item-list mt-16">
          ${cloudEndpoints.length === 0 ? `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name" style="color:#8ea1c9">Облачные эндпоинты не настроены</div>
                <div class="item-meta"><span>Нажмите «+ Добавить» для подключения к облачному Ollama</span></div>
              </div>
            </div>
          ` : cloudEndpoints.map(ep => `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name">☁️ ${escapeHtml(ep.name)}</div>
                <div class="item-meta">
                  <span class="chip font-mono">${escapeHtml(ep.url)}</span>
                  <span class="chip">auth: ${ep.auth_mode}</span>
                  <span class="badge badge-success">Активен</span>
                </div>
              </div>
              <div class="item-actions">
                <button class="btn btn-sm test-cloud-ep" data-url="${escapeHtml(ep.url)}" data-auth="${ep.auth_mode}" data-token="${escapeHtml(ep.config?.token || '')}" data-apikey="${escapeHtml(ep.config?.apiKey || '')}">🔍 Тест</button>
                <button class="btn btn-sm btn-danger del-cloud-ep" data-id="${ep.id}">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🌐 Ollama Cloud (Official — ollama.com)</div>
            <div class="card-subtitle">Официальный облачный сервис Ollama — модели до 671B параметров без мощного GPU</div>
          </div>
          <div class="item-actions">
            ${ollamaCloudConfigured
              ? `<span class="badge ${ollamaCloudOnline ? 'badge-success' : 'badge-warning'}">${ollamaCloudOnline ? '✅ Онлайн' : '⚠️ Оффлайн'}</span>`
              : ''
            }
          </div>
        </div>
        <div class="item-list mt-16">
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">Ollama Cloud API</div>
              <div class="item-meta">
                <span class="chip font-mono">https://ollama.com</span>
                ${ollamaCloudConfigured
                  ? '<span class="badge badge-success">API ключ установлен</span>'
                  : '<span class="badge badge-neutral">Требуется API ключ</span>'
                }
              </div>
            </div>
            <div class="item-actions">
              <button class="btn btn-sm btn-primary" id="btnConfigOllamaCloud">⚙️ Настроить</button>
              <button class="btn btn-sm" id="btnOllamaSignin">🔑 Ollama Signin</button>
            </div>
          </div>
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">Доступные облачные модели</div>
              <div class="item-meta">
                <span class="chip">gpt-oss:120b-cloud</span>
                <span class="chip">llama3.3:70b-cloud</span>
                <span class="chip">deepseek-r1:671b-cloud</span>
              </div>
            </div>
          </div>
          <div style="padding:12px;background:${ollamaCloudOnline ? '#0d1f12' : '#1a1510'};border-radius:12px;border:1px solid ${ollamaCloudOnline ? '#1a3a20' : '#3a2a10'};font-size:13px;color:${ollamaCloudOnline ? '#8ecf9a' : '#cfaa5a'}">
            ${ollamaCloudOnline
              ? '✅ Ollama Cloud подключен! Облачные модели доступны в селекторе моделей. Запускайте модели до 671B параметров без GPU.'
              : '💡 Для подключения к Ollama Cloud получите API ключ на <a href="https://ollama.com" target="_blank" style="color:#59a8ff">ollama.com</a> или выполните <code style="background:#0b1220;padding:2px 6px;border-radius:4px">ollama signin</code> в терминале.'
            }
          </div>
        </div>
        ${ollamaCloudAvailable.length > 0 ? `
          <div class="grid-auto mt-16">
            ${ollamaCloudAvailable.map(m => `
              <div class="module-card" style="padding:16px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="font-size:20px">${m.recommended ? '⭐' : '☁️'}</span>
                  <span style="font-weight:600;font-size:13px">${escapeHtml(m.name)}</span>
                </div>
                <p style="font-size:12px;color:#8ea1c9;margin-bottom:8px">${escapeHtml(m.desc)}</p>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="chip">${m.size}</span>
                  ${m.available
                    ? `<button class="btn btn-sm btn-primary select-model" data-model="${escapeHtml(m.name)}" data-provider="ollama-cloud">☁️ Использовать</button>`
                    : '<span class="badge badge-neutral">Нужен API ключ</span>'
                  }
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
    <div class="card mb-24">
      <div class="card-header">
        <div>
          <div class="card-title">🎯 Управление моделями</div>
          <div class="card-subtitle">Выбор, скачивание и переключение AI моделей (локальные + облачные)</div>
        </div>
      </div>

      <!-- Current Model Selector -->
      <div style="padding:16px;background:#09101d;border-radius:12px;margin-top:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <span style="font-weight:600">Активная модель:</span>
          <select class="form-select" id="activeModelSelect" style="flex:1;min-width:250px">
            <optgroup label="🖥️ Локальные модели">
              ${localModels.map(m =>
                `<option value="${escapeHtml(m.name)}" data-provider="local" ${m.name === status.activeModel ? 'selected' : ''}>🖥️ ${escapeHtml(m.name)} (${m.parameterSize || m.family || '?'})</option>`
              ).join('')}
              ${localModels.length === 0 ? '<option value="" disabled>Нет локальных моделей</option>' : ''}
            </optgroup>
            <optgroup label="☁️ Облачные модели">
              ${cloudModels.map(m =>
                `<option value="${escapeHtml(m.name)}" data-provider="cloud" ${m.name === status.activeModel && status.activeProvider === 'cloud' ? 'selected' : ''}>☁️ ${escapeHtml(m.name)} (${m.parameterSize || m.family || '?'}) — ${escapeHtml(m.endpointName || 'cloud')}</option>`
              ).join('')}
              ${cloudModels.length === 0 ? '<option value="" disabled>Нет облачных моделей — добавьте эндпоинт</option>' : ''}
            </optgroup>
            <optgroup label="🌐 Ollama Cloud (Official)">
              ${ollamaCloudModels.map(m =>
                `<option value="${escapeHtml(m.name)}" data-provider="ollama-cloud" ${m.name === status.activeModel && status.activeProvider === 'ollama-cloud' ? 'selected' : ''}>🌐 ${escapeHtml(m.name)} (${m.parameterSize || m.family || 'Cloud'})</option>`
              ).join('')}
              ${ollamaCloudAvailable.filter(m => m.available && !ollamaCloudModels.find(om => om.name === m.name)).map(m =>
                `<option value="${escapeHtml(m.name)}" data-provider="ollama-cloud">🌐 ${escapeHtml(m.name)} (${m.size})</option>`
              ).join('')}
              ${!ollamaCloudOnline ? '<option value="" disabled>Настройте API ключ для Ollama Cloud</option>' : ''}
            </optgroup>
          </select>
          <button class="btn btn-primary" id="btnSelectModel">Применить</button>
        </div>
      </div>

      <!-- Installed Models -->
      <div class="card-title" style="font-size:14px;margin-bottom:12px">📦 Локальные модели (${localModels.length})</div>
      ${localModels.length === 0
        ? '<p class="text-muted">Нет установленных моделей. Скачайте рекомендованную модель ниже или подключите облачный эндпоинт.</p>'
        : `<div class="item-list">
            ${localModels.map(m => `
              <div class="item-row">
                <span style="font-size:20px">🖥️</span>
                <div class="item-info">
                  <div class="item-name">${escapeHtml(m.name)}</div>
                  <div class="item-meta">
                    <span class="chip">${m.parameterSize || m.family || '?'}</span>
                    <span class="chip">${m.size ? (m.size / 1e9).toFixed(1) + ' GB' : '?'}</span>
                    ${m.name === status.activeModel ? '<span class="badge badge-success">АКТИВНА</span>' : ''}
                    <span class="chip">Локальный</span>
                  </div>
                </div>
                <div class="item-actions">
                  ${m.name !== status.activeModel ? `<button class="btn btn-sm select-model" data-model="${escapeHtml(m.name)}" data-provider="local">Выбрать</button>` : ''}
                  <button class="btn btn-sm btn-danger delete-model" data-model="${escapeHtml(m.name)}">Удалить</button>
                </div>
              </div>
            `).join('')}
          </div>`
      }

      <!-- Cloud Models -->
      ${cloudModels.length > 0 ? `
        <div class="card-title" style="font-size:14px;margin-top:24px;margin-bottom:12px">☁️ Облачные модели (${cloudModels.length})</div>
        <div class="item-list">
          ${cloudModels.map(m => `
            <div class="item-row">
              <span style="font-size:20px">☁️</span>
              <div class="item-info">
                <div class="item-name">${escapeHtml(m.name)}</div>
                <div class="item-meta">
                  <span class="chip">${m.parameterSize || m.family || '?'}</span>
                  <span class="chip">${escapeHtml(m.endpointName || 'cloud')}</span>
                  ${m.name === status.activeModel && status.activeProvider === 'cloud' ? '<span class="badge badge-success">АКТИВНА</span>' : ''}
                  <span class="chip" style="background:#1a2540;color:#59a8ff">Облачный</span>
                </div>
              </div>
              <div class="item-actions">
                ${!(m.name === status.activeModel && status.activeProvider === 'cloud') ? `<button class="btn btn-sm select-model" data-model="${escapeHtml(m.name)}" data-provider="cloud">Выбрать</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Recommended Models -->
      <div class="card-title" style="font-size:14px;margin-top:24px;margin-bottom:12px">⭐ Рекомендованные модели для газового сектора</div>
      <div class="grid-auto">
        ${(status.recommended || []).map(m => `
          <div class="module-card" style="padding:16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:20px">${m.recommended ? '⭐' : '🤖'}</span>
              <span style="font-weight:600;font-size:13px">${escapeHtml(m.name)}</span>
            </div>
            <p style="font-size:12px;color:#8ea1c9;margin-bottom:8px">${escapeHtml(m.desc)}</p>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="chip">${m.size}</span>
              ${m.installed
                ? '<span class="badge badge-success">Установлена</span>'
                : `<button class="btn btn-sm btn-primary pull-model" data-model="${escapeHtml(m.name)}">📥 Скачать</button>`
              }
            </div>
            <!-- Pull progress -->
            <div class="pull-progress" data-model="${escapeHtml(m.name)}" style="display:none;margin-top:8px">
              <div class="progress-bar" style="width:100%"><div class="progress-fill" style="width:0%"></div></div>
              <span class="text-sm text-muted pull-status-text">Скачивание...</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- OpenClaw Card -->
    <div class="grid-2 mb-24">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🧩 OpenClaw — AI Агент (MCP)</div>
            <div class="card-subtitle">AI-агент платформа с инструментами (filesystem, github, shell, postgres)</div>
          </div>
          <div class="item-actions">
            ${openclawRunning
              ? '<button class="btn btn-sm btn-danger" id="btnStopOpenClaw">⏹ Остановить</button>'
              : '<button class="btn btn-sm btn-primary" id="btnStartOpenClaw">▶ Запустить</button>'
            }
            <button class="btn btn-sm" id="btnConfigOpenClaw">⚙ Настроить</button>
          </div>
        </div>
        <div class="item-list mt-16">
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">Статус</div>
              <div class="item-meta">
                <span class="badge ${openclawRunning ? 'badge-success' : 'badge-neutral'}">${openclawRunning ? 'Запущен' : 'Остановлен'}</span>
                <span class="chip">${openclawInstalled ? 'Установлен' : 'Не установлен'}</span>
              </div>
            </div>
          </div>
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">MCP Пресеты</div>
              <div class="item-meta"><span>filesystem • github • shell • postgres • custom</span></div>
            </div>
          </div>
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">LLM Провайдер</div>
              <div class="item-meta"><span>🖥️ Локальный Ollama • ☁️ Облачный Ollama</span></div>
            </div>
          </div>
          <div style="padding:12px;background:#0d1f12;border-radius:12px;border:1px solid #1a3a20;font-size:13px;color:#8ecf9a">
            ✅ OpenClaw MCP Bridge активен. Управление MCP-серверами доступно в разделе «MCP серверы».
          </div>
        </div>
      </div>

      <!-- How it works -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">📖 Как это работает?</div>
            <div class="card-subtitle">Локальный и облачный Ollama, OpenClaw</div>
          </div>
        </div>
        <div style="padding:16px;line-height:1.8">
          <p><strong>Ollama (Локальный)</strong> — запускает нейросети прямо на вашем компьютере. Никакие данные не уходят в интернет. Требует 4-10 ГБ RAM и диска.</p>
          <p><strong>Ollama (Облачный)</strong> — подключается к удалённому Ollama серверу через интернет. Модели работают на сервере (RunPod, Vast.ai, ваш сервер). Данные отправляются на сервер.</p>
          <p><strong>OpenClaw</strong> — AI-агент платформа с инструментами через протокол MCP (Model Context Protocol).</p>
          <p><strong>Как подключить облачный Ollama:</strong></p>
          <ol style="padding-left:20px">
            <li>Нажмите «+ Добавить эндпоинт» в блоке «Облачные модели»</li>
            <li>Введите URL удалённого Ollama сервера (например, https://your-server:11434)</li>
            <li>При необходимости укажите токен авторизации</li>
            <li>Нажмите «Тест» для проверки соединения</li>
            <li>Облачные модели появятся в списке и будут доступны для выбора</li>
          </ol>
        </div>
      </div>
    </div>
  `;

  // Event bindings
  $('btnEnsureAll')?.addEventListener('click', async () => {
    $('btnEnsureAll').disabled = true;
    $('btnEnsureAll').textContent = '⏳ Запуск...';
    try {
      const result = await api('/api/ai/ensure', { method: 'POST' });
      showToast(`AI движок готов! Ollama: ${result.ollama?.running ? '✅' : '❌'}, OpenClaw: ${result.openclaw?.running ? '✅' : '❌'}`, result.ollama?.running ? 'success' : 'warning');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    } finally {
      $('btnEnsureAll').disabled = false;
      $('btnEnsureAll').textContent = '🚀 Запустить всё автоматически';
    }
  });

  $('btnStartOllama')?.addEventListener('click', async () => {
    $('btnStartOllama').disabled = true;
    try {
      const result = await api('/api/ai/ollama/start', { method: 'POST' });
      showToast(`Ollama: ${result.status}`, 'success');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  $('btnStopOllama')?.addEventListener('click', async () => {
    try {
      await api('/api/ai/ollama/stop', { method: 'POST' });
      showToast('Ollama остановлен', 'info');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  $('btnInstallOllama')?.addEventListener('click', async () => {
    $('btnInstallOllama').disabled = true;
    $('btnInstallOllama').textContent = '⏳ Установка...';
    try {
      await api('/api/ai/ollama/install', { method: 'POST' });
      showToast('Ollama установлен!', 'success');
      await api('/api/ai/ollama/start', { method: 'POST' });
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка установки: ' + err.message, 'error');
    }
  });

  // Ollama Cloud configuration
  $('btnConfigOllamaCloud')?.addEventListener('click', () => {
    showModal('🌐 Настройка Ollama Cloud', `
      <div style="padding:12px;background:#0d1525;border-radius:12px;border:1px solid #1a2540;font-size:13px;color:#8ea1c9;margin-bottom:16px;line-height:1.6">
        <strong>Ollama Cloud</strong> — официальный облачный сервис Ollama. Позволяет запускать модели до 671B параметров без мощного GPU.<br><br>
        <strong>Как получить API ключ:</strong><br>
        1. Зарегистрируйтесь на <a href="https://ollama.com" target="_blank" style="color:#59a8ff">ollama.com</a><br>
        2. Создайте API ключ в настройках аккаунта<br>
        3. Вставьте ключ ниже или выполните <code style="background:#0b1220;padding:2px 6px;border-radius:4px">ollama signin</code> в терминале
      </div>
      <div class="form-group">
        <label class="form-label">Ollama Cloud API Key</label>
        <input class="form-input" id="ollamaCloudApiKey" type="password" placeholder="Введите API ключ от ollama.com">
      </div>
      <div style="margin-top:12px">
        <button class="btn" id="btnTestOllamaCloudKey" style="margin-right:8px">🔍 Тест ключа</button>
        <span id="ollamaCloudTestResult" style="font-size:13px"></span>
      </div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveOllamaCloudKey">Сохранить и подключить</button>
    `);

    $('btnTestOllamaCloudKey')?.addEventListener('click', async () => {
      const apiKey = $('ollamaCloudApiKey')?.value;
      if (!apiKey) return showToast('Введите API ключ', 'warning');
      $('btnTestOllamaCloudKey').disabled = true;
      $('btnTestOllamaCloudKey').textContent = '⏳ Тест...';
      try {
        const result = await api('/api/ai/ollama-cloud/test', {
          method: 'POST',
          body: JSON.stringify({ apiKey }),
        });
        const resultEl = $('ollamaCloudTestResult');
        if (result.status === 'online') {
          resultEl.innerHTML = `<span style="color:#23c483">✅ Ключ действителен! Моделей: ${result.modelCount || result.models?.length || 0}</span>`;
        } else {
          resultEl.innerHTML = `<span style="color:#ff6a6a">❌ Ошибка: ${escapeHtml(result.error || 'неверный ключ')}</span>`;
        }
      } catch (err) {
        $('ollamaCloudTestResult').innerHTML = `<span style="color:#ff6a6a">❌ ${escapeHtml(err.message)}</span>`;
      } finally {
        $('btnTestOllamaCloudKey').disabled = false;
        $('btnTestOllamaCloudKey').textContent = '🔍 Тест ключа';
      }
    });

    $('btnSaveOllamaCloudKey')?.addEventListener('click', async () => {
      const apiKey = $('ollamaCloudApiKey')?.value;
      if (!apiKey) return showToast('Введите API ключ', 'warning');
      try {
        const result = await api('/api/ai/ollama-cloud/configure', {
          method: 'POST',
          body: JSON.stringify({ apiKey }),
        });
        if (result.configured) {
          hideModal();
          showToast('Ollama Cloud подключен! Доступно моделей: ' + (result.modelCount || 0), 'success');
          await renderAIEngine(container);
        } else {
          showToast('Ошибка: ' + (result.error || 'неверный ключ'), 'error');
        }
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  $('btnOllamaSignin')?.addEventListener('click', async () => {
    showToast('Запуск ollama signin... Откройте терминал если появится окно авторизации', 'info');
    try {
      await api('/api/ai/ollama-cloud/signin', { method: 'POST' });
      showToast('Ollama signin завершен', 'success');
    } catch (err) {
      showToast('Ollama signin: ' + err.message, 'warning');
    }
  });

  // Cloud endpoint management
  $('btnAddCloudEndpoint')?.addEventListener('click', () => {
    showModal('☁️ Добавить облачный Ollama', `
      <div class="form-group">
        <label class="form-label">Название</label>
        <input class="form-input" id="cloudEpName" placeholder="Например: RunPod Ollama">
      </div>
      <div class="form-group">
        <label class="form-label">URL сервера</label>
        <input class="form-input" id="cloudEpUrl" placeholder="https://your-server.com:11434">
      </div>
      <div class="form-group">
        <label class="form-label">Авторизация</label>
        <select class="form-select" id="cloudEpAuth">
          <option value="none">Нет</option>
          <option value="bearer">Bearer Token</option>
          <option value="token">API Key</option>
        </select>
      </div>
      <div class="form-group" id="cloudEpTokenGroup" style="display:none">
        <label class="form-label">Токен / API Key</label>
        <input class="form-input" id="cloudEpToken" type="password" placeholder="Введите токен">
      </div>
      <div style="margin-top:12px">
        <button class="btn" id="btnTestCloudEp" style="margin-right:8px">🔍 Тест соединения</button>
        <span id="cloudEpTestResult" style="font-size:13px"></span>
      </div>
    `, `
      <button class="btn" onclick="hideModal()">Отмена</button>
      <button class="btn btn-primary" id="btnSaveCloudEp">Сохранить</button>
    `);

    // Toggle token field visibility
    $('cloudEpAuth')?.addEventListener('change', () => {
      const authMode = $('cloudEpAuth').value;
      $('cloudEpTokenGroup').style.display = authMode !== 'none' ? 'block' : 'none';
    });

    // Test cloud endpoint
    $('btnTestCloudEp')?.addEventListener('click', async () => {
      const url = $('cloudEpUrl')?.value;
      if (!url) return showToast('Введите URL', 'warning');
      $('btnTestCloudEp').disabled = true;
      $('btnTestCloudEp').textContent = '⏳ Тест...';
      try {
        const authMode = $('cloudEpAuth')?.value || 'none';
        const config = {};
        if (authMode === 'bearer') config.token = $('cloudEpToken')?.value;
        if (authMode === 'token') config.apiKey = $('cloudEpToken')?.value;

        const result = await api('/api/ai/cloud/test', {
          method: 'POST',
          body: JSON.stringify({ url, auth_mode: authMode, config }),
        });
        const resultEl = $('cloudEpTestResult');
        if (result.status === 'online') {
          resultEl.innerHTML = `<span style="color:#23c483">✅ Онлайн! Моделей: ${result.modelCount || result.models?.length || 0}</span>`;
        } else {
          resultEl.innerHTML = `<span style="color:#ff6a6a">❌ Оффлайн: ${escapeHtml(result.error || 'не отвечает')}</span>`;
        }
      } catch (err) {
        $('cloudEpTestResult').innerHTML = `<span style="color:#ff6a6a">❌ ${escapeHtml(err.message)}</span>`;
      } finally {
        $('btnTestCloudEp').disabled = false;
        $('btnTestCloudEp').textContent = '🔍 Тест соединения';
      }
    });

    // Save cloud endpoint
    $('btnSaveCloudEp')?.addEventListener('click', async () => {
      const name = $('cloudEpName')?.value;
      const url = $('cloudEpUrl')?.value;
      const authMode = $('cloudEpAuth')?.value || 'none';
      if (!name || !url) return showToast('Заполните название и URL', 'warning');

      const config = {};
      if (authMode === 'bearer') config.token = $('cloudEpToken')?.value;
      if (authMode === 'token') config.apiKey = $('cloudEpToken')?.value;

      try {
        await api('/api/ai/cloud/endpoints', {
          method: 'POST',
          body: JSON.stringify({ name, url, auth_mode: authMode, config }),
        });
        hideModal();
        showToast('Облачный эндпоинт добавлен', 'success');
        await renderAIEngine(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // Test cloud endpoint buttons
  $$('.test-cloud-ep').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳...';
      try {
        const result = await api('/api/ai/cloud/test', {
          method: 'POST',
          body: JSON.stringify({
            url: btn.dataset.url,
            auth_mode: btn.dataset.auth || 'none',
            config: { token: btn.dataset.token, apiKey: btn.dataset.apikey },
          }),
        });
        showModal('Результат теста', `<pre class="console">${escapeHtml(JSON.stringify(result, null, 2))}</pre>`, `<button class="btn" onclick="hideModal()">OK</button>`);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Тест';
      }
    });
  });

  // Delete cloud endpoint buttons
  $$('.del-cloud-ep').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить облачный эндпоинт?')) return;
      try {
        await api(`/api/ai/cloud/endpoints/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Эндпоинт удален', 'info');
        await renderAIEngine(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // OpenClaw buttons
  $('btnStartOpenClaw')?.addEventListener('click', async () => {
    $('btnStartOpenClaw').disabled = true;
    $('btnStartOpenClaw').textContent = '⏳ Запуск...';
    try {
      const result = await api('/api/ai/openclaw/start', { method: 'POST' });
      showToast(`OpenClaw: ${result.status || 'запущен'}`, 'success');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка запуска OpenClaw: ' + err.message, 'error');
      $('btnStartOpenClaw').disabled = false;
      $('btnStartOpenClaw').textContent = '▶ Запустить';
    }
  });

  $('btnStopOpenClaw')?.addEventListener('click', async () => {
    try {
      await api('/api/ai/openclaw/stop', { method: 'POST' });
      showToast('OpenClaw остановлен', 'info');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  $('btnConfigOpenClaw')?.addEventListener('click', () => {
    navigateTo('mcp');
  });

  $('btnSelectModel')?.addEventListener('click', async () => {
    const select = $('activeModelSelect');
    const model = select?.value;
    if (!model) return showToast('Выберите модель', 'warning');
    const provider = select?.selectedOptions?.[0]?.dataset?.provider || 'local';
    try {
      await api('/api/ai/models/select', { method: 'POST', body: JSON.stringify({ model, provider }) });
      showToast(`Модель "${model}" выбрана как активная (${provider === 'cloud' ? '☁️ облако' : '🖥️ локальный'})`, 'success');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  // Select model buttons
  $$('.select-model').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api('/api/ai/models/select', { method: 'POST', body: JSON.stringify({ model: btn.dataset.model, provider: btn.dataset.provider || 'local' }) });
        showToast(`Модель "${btn.dataset.model}" выбрана`, 'success');
        await renderAIEngine(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // Delete model buttons
  $$('.delete-model').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Удалить модель "${btn.dataset.model}"? Это освободит место на диске.`)) return;
      try {
        await api(`/api/ai/models/${encodeURIComponent(btn.dataset.model)}`, { method: 'DELETE' });
        showToast('Модель удалена', 'info');
        await renderAIEngine(container);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    });
  });

  // Pull model buttons with progress polling
  $$('.pull-model').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modelName = btn.dataset.model;
      btn.disabled = true;
      btn.textContent = '⏳ Скачивание...';

      const progressEl = document.querySelector(`.pull-progress[data-model="${modelName}"]`);
      if (progressEl) progressEl.style.display = 'block';

      try {
        await api(`/api/ai/models/pull/${encodeURIComponent(modelName)}`, { method: 'POST' });

        const pollInterval = setInterval(async () => {
          try {
            const pullStatus = await api('/api/ai/models/pull-status');
            const modelStatus = pullStatus[modelName];
            if (modelStatus) {
              const fillEl = progressEl?.querySelector('.progress-fill');
              const textEl = progressEl?.querySelector('.pull-status-text');
              if (fillEl) fillEl.style.width = `${modelStatus.progress || 0}%`;
              if (textEl) textEl.textContent = `${modelStatus.statusText || 'Скачивание...'} ${modelStatus.progress || 0}%`;

              if (modelStatus.status === 'completed') {
                clearInterval(pollInterval);
                showToast(`Модель "${modelName}" скачана!`, 'success');
                await renderAIEngine(container);
              } else if (modelStatus.status === 'failed') {
                clearInterval(pollInterval);
                showToast(`Ошибка скачивания: ${modelStatus.error}`, 'error');
                btn.disabled = false;
                btn.textContent = '📥 Скачать';
              }
            }
          } catch {}
        }, 3000);

      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '📥 Скачать';
      }
    });
  });
}

/* ══════════════ ENHANCED AI ASSISTANT WITH STREAMING ══════════════ */
async function renderAssistantEnhanced(container) {
  // Load available models (local + cloud)
  let localModels = [];
  let cloudModels = [];
  let activeModel = '';
  let activeProvider = 'local';
  try {
    const modelStatus = await api('/api/ai/status');
    localModels = modelStatus.ollama?.models || [];
    cloudModels = modelStatus.cloud?.models || [];
    activeModel = modelStatus.activeModel || '';
    activeProvider = modelStatus.activeProvider || 'local';
  } catch {}

  const allModels = [
    ...localModels.map(m => ({ ...m, provider: 'local' })),
    ...cloudModels.map(m => ({ ...m, provider: 'cloud' })),
  ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">AI Ассистент</h2>
        <p class="page-subtitle">Диалог с нейросетью (Ollama локальный + облачный) с выбором модели и потоковым выводом</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:#8ea1c9">Модель:</span>
        <select class="form-select" id="chatModelSelect" style="width:250px;font-size:12px;padding:6px 8px">
          <optgroup label="🖥️ Локальные">
            ${localModels.map(m => `<option value="${escapeHtml(m.name)}" data-provider="local" ${m.name === activeModel && activeProvider !== 'cloud' ? 'selected' : ''}>🖥️ ${escapeHtml(m.name)}</option>`).join('')}
          </optgroup>
          <optgroup label="☁️ Облачные">
            ${cloudModels.map(m => `<option value="${escapeHtml(m.name)}" data-provider="cloud" ${m.name === activeModel && activeProvider === 'cloud' ? 'selected' : ''}>☁️ ${escapeHtml(m.name)} — ${escapeHtml(m.endpointName || 'cloud')}</option>`).join('')}
          </optgroup>
          ${allModels.length === 0 ? '<option value="">Нет моделей — настройте в AI Движок</option>' : ''}
        </select>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#8ea1c9;cursor:pointer">
          <input type="checkbox" id="chatStreamToggle" checked style="accent-color:#59a8ff">
          Потоковый вывод
        </label>
      </div>
    </div>

    <div class="card chat-container">
      <div class="chat-messages" id="chatMessages">
        ${state.chatHistory.length === 0 ? `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <p>Задайте вопрос AI-ассистенту</p>
            <div class="chips">
              <button class="chip quick-prompt" data-prompt="Сформируй отчет по газовому балансу за текущий период">📊 Газовый баланс</button>
              <button class="chip quick-prompt" data-prompt="Анализ дебиторской задолженности и платежной дисциплины">💰 Платежи</button>
              <button class="chip quick-prompt" data-prompt="Прогноз рисков недопоставки газа на следующий месяц">🔍 Риски</button>
              <button class="chip quick-prompt" data-prompt="Тарифный анализ с точкой безубыточности и моделирование субсидий">📈 Тарифы</button>
              <button class="chip quick-prompt" data-prompt="Подготовь архитектуру enterprise AI-платформы для локальной интеграции с 1C, SAP, SCADA">🏗️ Архитектура</button>
            </div>
          </div>
        ` : state.chatHistory.map(msg => renderChatMessage(msg)).join('')}
      </div>
      <div class="chat-input-area">
        <textarea id="chatInput" placeholder="Введите запрос для AI..." rows="1"></textarea>
        <button class="btn btn-primary" id="chatSend">Отправить</button>
      </div>
      <div class="chat-quick-actions" id="chatQuickActions">
        <button class="chat-quick-action" data-prompt="Сформируй отчет по газовому балансу за текущий период">📊 Газовый баланс</button>
        <button class="chat-quick-action" data-prompt="Анализ дебиторской задолженности и платежной дисциплины">💰 Платежи</button>
        <button class="chat-quick-action" data-prompt="Прогноз рисков недопоставки газа на следующий месяц">🔍 Риски</button>
        <button class="chat-quick-action" data-prompt="Тарифный анализ с точкой безубыточности">📈 Тарифы</button>
        <button class="chat-quick-action" data-prompt="Покажи статус всех коннекторов">🔌 Коннекторы</button>
      </div>
    </div>
  `;

  const chatInput = $('chatInput');
  const chatSend = $('chatSend');
  const chatMessages = $('chatMessages');
  const chatModelSelect = $('chatModelSelect');
  const chatStreamToggle = $('chatStreamToggle');

  async function sendMessage(prompt) {
    if (!prompt.trim()) return;
    const model = chatModelSelect?.value;
    const provider = chatModelSelect?.selectedOptions?.[0]?.dataset?.provider || 'local';
    const useStream = chatStreamToggle?.checked && model;

    state.chatHistory.push({ role: 'user', content: prompt });
    chatMessages.innerHTML = state.chatHistory.map(msg => renderChatMessage(msg)).join('');
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const loadingId = 'chatStreaming_' + Date.now();
    const providerIcon = provider === 'cloud' ? '☁️' : '🖥️';
    chatMessages.innerHTML += `<div class="chat-message ai" id="${loadingId}">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        <span class="provider-tag">${providerIcon} ${provider === 'cloud' ? 'cloud' : 'ollama'}${model ? ' / ' + model : ''}</span>
        <div class="streaming-content"><div class="streaming-dots"><span></span><span></span><span></span></div></div>
      </div>
    </div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (useStream) {
      try {
        const response = await fetch('/api/assistant/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model, provider }),
        });

        if (!response.ok || !response.body) {
          const result = await api('/api/assistant', {
            method: 'POST',
            body: JSON.stringify({ prompt, model: model || undefined, provider: provider || undefined }),
          });
          state.chatHistory.push({ role: 'ai', content: result.content, provider: result.provider, model: result.model });
          chatMessages.innerHTML = state.chatHistory.map(msg => renderChatMessage(msg)).join('');
          chatMessages.scrollTop = chatMessages.scrollHeight;
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        const loadingEl = document.getElementById(loadingId);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('event: ')) continue;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content && !data.done) {
                  fullContent += data.content;
                  if (loadingEl) {
                    const contentDiv = loadingEl.querySelector('.streaming-content');
                    if (contentDiv) contentDiv.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(fullContent)}<span class="cursor-blink">|</span></pre>`;
                  }
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                if (data.done) {
                  fullContent = data.content || fullContent;
                  state.chatHistory.push({ role: 'ai', content: fullContent, provider: provider === 'cloud' ? 'cloud' : 'ollama', model: data.model || model });
                  chatMessages.innerHTML = state.chatHistory.map(msg => renderChatMessage(msg)).join('');
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
              } catch {}
            }
          }
        }
      } catch (err) {
        state.chatHistory.push({ role: 'ai', content: `Ошибка стриминга: ${err.message}`, provider: 'error' });
        chatMessages.innerHTML = state.chatHistory.map(msg => renderChatMessage(msg)).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } else {
      try {
        const result = await api('/api/assistant', {
          method: 'POST',
          body: JSON.stringify({ prompt, model: model || undefined, provider: provider || undefined }),
        });
        state.chatHistory.push({ role: 'ai', content: result.content, provider: result.provider, model: result.model });
      } catch (err) {
        state.chatHistory.push({ role: 'ai', content: `Ошибка: ${err.message}`, provider: 'error' });
      }
      chatMessages.innerHTML = state.chatHistory.map(msg => renderChatMessage(msg)).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  chatSend?.addEventListener('click', () => sendMessage(chatInput.value));
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  $$('.quick-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.prompt;
      sendMessage(btn.dataset.prompt);
    });
  });

  $$('.chat-quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.prompt;
      sendMessage(btn.dataset.prompt);
    });
  });
}

// Expose globally
window.renderAIEngine = renderAIEngine;
window.renderAssistantEnhanced = renderAssistantEnhanced;
