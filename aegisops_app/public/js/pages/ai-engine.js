/**
 * AegisOps — AI Engine Page & Enhanced Assistant
 * Manages Ollama, OpenClaw, model selection, and streaming AI chat
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

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">AI Движок</h2>
        <p class="page-subtitle">Управление Ollama (LLM), OpenClaw (MCP агент) и моделями</p>
      </div>
      <button class="btn btn-primary" id="btnEnsureAll">🚀 Запустить всё автоматически</button>
    </div>

    <!-- Status Overview -->
    <div class="stats-grid mb-24">
      <div class="stat-card">
        <div class="stat-label">Ollama LLM</div>
        <div class="stat-value" style="color:${ollamaRunning ? '#23c483' : '#ff6a6a'}">${ollamaRunning ? '🟢 Запущен' : '🔴 Остановлен'}</div>
        <div class="stat-change">${ollamaInstalled ? 'Установлен' : 'Не установлен'} | Моделей: ${status.ollama?.models?.length || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">OpenClaw (MCP)</div>
        <div class="stat-value" style="color:${openclawRunning ? '#23c483' : '#ff6a6a'}">${openclawRunning ? '🟢 Запущен' : '🔴 Остановлен'}</div>
        <div class="stat-change">${openclawInstalled ? 'Установлен' : 'Не установлен'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Активная модель</div>
        <div class="stat-value" style="font-size:16px">${escapeHtml(status.activeModel || 'не выбрана')}</div>
        <div class="stat-change">Провайдер: ${status.activeProvider || 'ollama'}</div>
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
            <div class="card-title">🧩 OpenClaw — AI Агент (MCP)</div>
            <div class="card-subtitle">AI-агент платформа с инструментами (filesystem, github, shell, postgres)</div>
          </div>
          <div class="item-actions">
            ${openclawRunning
              ? '<button class="btn btn-sm btn-danger" id="btnStopOpenclaw">⏹ Остановить</button>'
              : '<button class="btn btn-sm btn-primary" id="btnStartOpenclaw">▶ Запустить</button>'
            }
            ${!openclawInstalled ? '<button class="btn btn-sm btn-primary" id="btnInstallOpenclaw">📥 Установить</button>' : ''}
          </div>
        </div>
        <div class="item-list mt-16">
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">Статус</div>
              <div class="item-meta">
                <span class="badge ${openclawRunning ? 'badge-success' : 'badge-danger'}">${openclawRunning ? 'Онлайн' : 'Оффлайн'}</span>
              </div>
            </div>
          </div>
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">Авто-конфигурация</div>
              <div class="item-meta"><span>OpenClaw автоматически использует Ollama API</span></div>
            </div>
            <button class="btn btn-sm" id="btnConfigureOpenclaw">⚙ Настроить</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Model Selection -->
    <div class="card mb-24">
      <div class="card-header">
        <div>
          <div class="card-title">🎯 Управление моделями</div>
          <div class="card-subtitle">Выбор, скачивание и переключение AI моделей</div>
        </div>
      </div>

      <!-- Current Model Selector -->
      <div style="padding:16px;background:#09101d;border-radius:12px;margin-top:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:16px">
          <span style="font-weight:600">Активная модель:</span>
          <select class="form-select" id="activeModelSelect" style="flex:1">
            ${(status.ollama?.models || []).map(m =>
              `<option value="${escapeHtml(m.name)}" ${m.name === status.activeModel ? 'selected' : ''}>${escapeHtml(m.name)} (${m.parameterSize || m.family || '?'})</option>`
            ).join('')}
            ${(status.ollama?.models || []).length === 0 ? '<option value="">Нет установленных моделей</option>' : ''}
          </select>
          <button class="btn btn-primary" id="btnSelectModel">Применить</button>
        </div>
      </div>

      <!-- Installed Models -->
      <div class="card-title" style="font-size:14px;margin-bottom:12px">📦 Установленные модели</div>
      ${(status.ollama?.models || []).length === 0
        ? '<p class="text-muted">Нет установленных моделей. Скачайте рекомендованную модель ниже.</p>'
        : `<div class="item-list">
            ${(status.ollama?.models || []).map(m => `
              <div class="item-row">
                <span style="font-size:20px">🤖</span>
                <div class="item-info">
                  <div class="item-name">${escapeHtml(m.name)}</div>
                  <div class="item-meta">
                    <span class="chip">${m.parameterSize || m.family || '?'}</span>
                    <span class="chip">${m.size ? (m.size / 1e9).toFixed(1) + ' GB' : '?'}</span>
                    ${m.name === status.activeModel ? '<span class="badge badge-success">АКТИВНА</span>' : ''}
                  </div>
                </div>
                <div class="item-actions">
                  ${m.name !== status.activeModel ? `<button class="btn btn-sm select-model" data-model="${escapeHtml(m.name)}">Выбрать</button>` : ''}
                  <button class="btn btn-sm btn-danger delete-model" data-model="${escapeHtml(m.name)}">Удалить</button>
                </div>
              </div>
            `).join('')}
          </div>`
      }

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

    <!-- How it works -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">📖 Как это работает?</div>
          <div class="card-subtitle">Что такое Ollama, OpenClaw и как они взаимодействуют</div>
        </div>
      </div>
      <div style="padding:16px;line-height:1.8">
        <p><strong>Ollama</strong> — это локальный сервер для запуска нейросетей (LLM). Он скачивает и запускает модели прямо на вашем компьютере. Никакие данные не уходят в интернет — всё работает локально.</p>
        <p><strong>OpenClaw</strong> — это AI-агент платформа, которая использует Ollama как «мозг» и добавляет инструменты: доступ к файлам, выполнение команд, работа с GitHub, базами данных и т.д. через протокол MCP (Model Context Protocol).</p>
        <p><strong>Как подключить:</strong></p>
        <ol style="padding-left:20px">
          <li>Нажмите «🚀 Запустить всё автоматически» — система сама скачает, установит и запустит Ollama и OpenClaw</li>
          <li>Выберите модель из рекомендованных и нажмите «Скачать» (нужно 3-5 ГБ диска)</li>
          <li>После скачивания выберите модель в выпадающем списке «Активная модель»</li>
          <li>Готово! Теперь AI Ассистент и все модули используют выбранную модель</li>
        </ol>
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

  $('btnStartOpenclaw')?.addEventListener('click', async () => {
    try {
      const result = await api('/api/ai/openclaw/start', { method: 'POST' });
      showToast(`OpenClaw: ${result.status}`, 'success');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  $('btnStopOpenclaw')?.addEventListener('click', async () => {
    try {
      await api('/api/ai/openclaw/stop', { method: 'POST' });
      showToast('OpenClaw остановлен', 'info');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  $('btnInstallOpenclaw')?.addEventListener('click', async () => {
    $('btnInstallOpenclaw').disabled = true;
    $('btnInstallOpenclaw').textContent = '⏳ Установка...';
    try {
      await api('/api/ai/openclaw/install', { method: 'POST' });
      showToast('OpenClaw установлен!', 'success');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка установки: ' + err.message, 'error');
    }
  });

  $('btnConfigureOpenclaw')?.addEventListener('click', async () => {
    try {
      const result = await api('/api/ai/openclaw/configure', { method: 'POST' });
      showToast(`OpenClaw настроен! Модель: ${result.config?.defaultModel || 'ok'}`, 'success');
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  $('btnSelectModel')?.addEventListener('click', async () => {
    const model = $('activeModelSelect')?.value;
    if (!model) return showToast('Выберите модель', 'warning');
    try {
      await api('/api/ai/models/select', { method: 'POST', body: JSON.stringify({ model, provider: 'ollama' }) });
      showToast(`Модель "${model}" выбрана как активная`, 'success');
      await renderAIEngine(container);
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  });

  // Select model buttons
  $$('.select-model').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api('/api/ai/models/select', { method: 'POST', body: JSON.stringify({ model: btn.dataset.model, provider: 'ollama' }) });
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

      // Show progress bar
      const progressEl = document.querySelector(`.pull-progress[data-model="${modelName}"]`);
      if (progressEl) progressEl.style.display = 'block';

      try {
        // Start pull (fire and forget from server side)
        await api(`/api/ai/models/pull/${encodeURIComponent(modelName)}`, { method: 'POST' });

        // Poll for progress
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
  // Load available models
  let models = [];
  let activeModel = '';
  try {
    const modelStatus = await api('/api/ai/status');
    models = modelStatus.ollama?.models || [];
    activeModel = modelStatus.activeModel || '';
  } catch {}

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">AI Ассистент</h2>
        <p class="page-subtitle">Диалог с локальной нейросетью (Ollama) с выбором модели и потоковым выводом</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:#8ea1c9">Модель:</span>
        <select class="form-select" id="chatModelSelect" style="width:220px;font-size:12px;padding:6px 8px">
          ${models.map(m => `<option value="${escapeHtml(m.name)}" ${m.name === activeModel ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
          ${models.length === 0 ? '<option value="">Нет моделей — настройте в AI Движок</option>' : ''}
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
    const useStream = chatStreamToggle?.checked && model; // Only stream with real model

    // Add user message
    state.chatHistory.push({ role: 'user', content: prompt });
    chatMessages.innerHTML = state.chatHistory.map(msg => renderChatMessage(msg)).join('');
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add loading message for streaming (OpenClaw style)
    const loadingId = 'chatStreaming_' + Date.now();
    chatMessages.innerHTML += `<div class="chat-message ai" id="${loadingId}">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        <span class="provider-tag">ollama${model ? ' / ' + model : ''}</span>
        <div class="streaming-content"><div class="streaming-dots"><span></span><span></span><span></span></div></div>
      </div>
    </div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (useStream) {
      // Streaming via SSE
      try {
        const response = await fetch('/api/assistant/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model }),
        });

        // If streaming endpoint fails, fall back to non-streaming
        if (!response.ok || !response.body) {
          const result = await api('/api/assistant', {
            method: 'POST',
            body: JSON.stringify({ prompt, model: model || undefined }),
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
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const eventType = line.slice(7).trim();
              continue;
            }
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.content && !data.done) {
                  // Token received
                  fullContent += data.content;
                  if (loadingEl) {
                    const contentDiv = loadingEl.querySelector('.streaming-content');
                    if (contentDiv) contentDiv.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(fullContent)}<span class="cursor-blink">|</span></pre>`;
                  }
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }

                if (data.done) {
                  // Stream complete
                  fullContent = data.content || fullContent;
                  state.chatHistory.push({ role: 'ai', content: fullContent, provider: 'ollama', model: data.model || model });
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
      // Non-streaming
      try {
        const result = await api('/api/assistant', {
          method: 'POST',
          body: JSON.stringify({ prompt, model: model || undefined }),
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

  // Quick action chips below input
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
