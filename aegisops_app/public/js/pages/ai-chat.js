/**
 * AegisOps AI Chat Page - Full featured AI assistant
 * With chat history, scheduling, and document generation
 */
(function () {
  'use strict';

  let chatHistory = [];
  let currentThreadId = null;
  let isLoading = false;
  let scheduledPrompts = [];

  // Helper functions
  function esc(s) {
    const d = document.createElement('span');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  function api(url, opts = {}) {
    return fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    }).then(async (r) => {
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(txt || 'HTTP ' + r.status);
      }
      return r.json();
    });
  }

  // Load scheduled prompts from localStorage
  function loadScheduledPrompts() {
    try {
      const saved = localStorage.getItem('aegisops_scheduled_prompts');
      scheduledPrompts = saved ? JSON.parse(saved) : [];
    } catch {
      scheduledPrompts = [];
    }
  }

  function saveScheduledPrompts() {
    localStorage.setItem('aegisops_scheduled_prompts', JSON.stringify(scheduledPrompts));
  }

  // Render the AI Chat page
  async function renderAIChatPage(container) {
    loadScheduledPrompts();

    container.innerHTML = `
      <div class="ai-chat-page">
        <div class="ai-chat-header">
          <div class="ai-chat-title">
            <h1>🤖 AI Ассистент</h1>
            <p>Задавайте вопросы, создавайте отчёты, анализируйте данные</p>
          </div>
          <div class="ai-chat-actions">
            <select id="aiScenarioSelect" class="nb-select" style="margin-right: 8px;">
              <option value="">🔧 Обычный режим (с ML коннекторами)</option>
              <option value="demo2">🎯 Demo2: JSON API Training</option>
            </select>
            <button class="btn nb-btn nb-btn-ghost" id="aiScheduleBtn">📅 Запланировать</button>
            <button class="btn nb-btn nb-btn-ghost" id="aiHistoryBtn">📜 История</button>
            <button class="btn nb-btn nb-btn-primary" id="aiNewChatBtn">+ Новый чат</button>
          </div>
        </div>
        
        <div class="ai-chat-layout">
          <aside class="ai-chat-sidebar" id="aiChatSidebar">
            <div class="ai-sidebar-section">
              <h3>💬 Чаты</h3>
              <div class="ai-chat-threads" id="aiChatThreads"></div>
            </div>
            <div class="ai-sidebar-section">
              <h3>📅 Запланированные</h3>
              <div class="ai-scheduled-list" id="aiScheduledList"></div>
            </div>
          </aside>
          
          <main class="ai-chat-main">
            <div class="ai-chat-messages" id="aiChatMessages">
              <div class="ai-welcome-message">
                <div class="ai-welcome-icon">🤖</div>
                <h2>Привет! Я AI Ассистент AegisOps</h2>
                <p>Я могу помочь вам с:</p>
                <ul>
                  <li>📊 Анализом данных из коннекторов</li>
                  <li>📈 Прогнозированием показателей</li>
                  <li>📄 Созданием отчётов (PDF, Excel, PowerPoint)</li>
                  <li>🔧 Настройкой сценариев автоматизации</li>
                  <li>💡 Ответами на вопросы о системе</li>
                </ul>
                <div class="ai-quick-prompts">
                  <button class="ai-quick-btn" data-prompt="Покажи последние данные из всех коннекторов">📊 Данные коннекторов</button>
                  <button class="ai-quick-btn" data-prompt="Создай прогноз на 30 дней в Excel">📈 Прогноз в Excel</button>
                  <button class="ai-quick-btn" data-prompt="Сгенерируй PDF отчёт за месяц">📄 PDF Отчёт</button>
                  <button class="ai-quick-btn" data-prompt="Покажи аномалии в данных">🔍 Поиск аномалий</button>
                </div>
              </div>
            </div>
            
            <div class="ai-chat-input-area">
              <div class="ai-input-container">
                <textarea id="aiChatInput" placeholder="Введите сообщение... (Enter для отправки, Shift+Enter для новой строки)" rows="1"></textarea>
                <div class="ai-input-actions">
                  <button class="btn nb-btn nb-btn-ghost" id="aiAttachBtn" title="Прикрепить файл">📎</button>
                  <button class="btn nb-btn nb-btn-primary" id="aiSendBtn">Отправить ➤</button>
                </div>
              </div>
              <div class="ai-input-hints">
                <span id="aiInputHint">💡 Попробуйте: "Дай данные за последние 5 месяцев в Excel" или "Создай прогноз на 14 дней"</span>
              </div>
            </div>
          </main>
        </div>
      </div>
      
      <!-- Schedule Modal -->
      <div class="nb-modal" id="aiScheduleModal" hidden>
        <div class="nb-modal-content nb-card ai-schedule-modal">
          <div class="nb-modal-header">
            <h3>📅 Запланировать промпты</h3>
            <button class="nb-modal-close" id="aiScheduleClose">✕</button>
          </div>
          <div class="nb-modal-body" id="aiScheduleBody">
            <div class="ai-schedule-form">
              <div class="ai-schedule-prompts">
                <h4>Выберите промпты для планирования:</h4>
                <div id="aiPromptsToSchedule"></div>
              </div>
              <div class="ai-schedule-dates">
                <h4>Выберите даты:</h4>
                <div class="ai-calendar-grid" id="aiCalendarGrid"></div>
              </div>
              <div class="ai-schedule-time">
                <h4>Время выполнения:</h4>
                <input type="time" id="aiScheduleTime" value="09:00" class="nb-input"/>
              </div>
              <div class="ai-schedule-recurrence">
                <h4>Повторение:</h4>
                <select id="aiScheduleRecurrence" class="nb-select">
                  <option value="once">Один раз</option>
                  <option value="daily">Каждый день</option>
                  <option value="weekly">Каждую неделю</option>
                  <option value="monthly">Каждый месяц</option>
                </select>
              </div>
              <div class="ai-schedule-name">
                <h4>Название сценария:</h4>
                <input type="text" id="aiScheduleName" placeholder="Мой запланированный чат" class="nb-input"/>
              </div>
            </div>
          </div>
          <div class="nb-modal-footer">
            <button class="btn nb-btn nb-btn-ghost" id="aiScheduleCancel">Отмена</button>
            <button class="btn nb-btn nb-btn-primary" id="aiScheduleSave">💾 Сохранить</button>
          </div>
        </div>
      </div>
    `;

    // Load chat threads
    await loadChatThreads();

    // Wire events
    wireEvents();
  }

  async function loadChatThreads() {
    const threadsContainer = document.getElementById('aiChatThreads');
    if (!threadsContainer) return;

    try {
      const threads = await api('/api/chat/threads');
      threadsContainer.innerHTML = threads.map(t => `
        <div class="ai-thread-item" data-id="${t.thread_id}">
          <span class="ai-thread-name">${esc(t.name || 'Чат ' + t.thread_id.slice(0, 8))}</span>
          <span class="ai-thread-date">${new Date(t.created_at).toLocaleDateString('ru-RU')}</span>
        </div>
      `).join('');

      threadsContainer.querySelectorAll('.ai-thread-item').forEach(el => {
        el.addEventListener('click', () => loadThread(el.dataset.id));
      });
    } catch {
      threadsContainer.innerHTML = '<p class="text-muted">Нет сохранённых чатов</p>';
    }
  }

  async function loadThread(threadId) {
    try {
      currentThreadId = threadId;
      const messages = await api(`/api/chat/threads/${threadId}`);
      chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      renderMessages();
    } catch (err) {
      window.showToast('Ошибка загрузки чата', 'error');
    }
  }

  function renderMessages() {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;

    if (chatHistory.length === 0) {
      // Show welcome message
      return;
    }

    container.innerHTML = chatHistory.map((msg, i) => `
      <div class="ai-message ${msg.role}">
        <div class="ai-message-avatar">${msg.role === 'user' ? '👤' : '🤖'}</div>
        <div class="ai-message-content">
          <div class="ai-message-text">${formatMessage(msg.content)}</div>
          ${msg.role === 'assistant' && i === chatHistory.length - 1 ? `
            <div class="ai-message-actions">
              <button class="ai-action-btn" data-action="copy">📋 Копировать</button>
              <button class="ai-action-btn" data-action="schedule">📅 Запланировать</button>
              <button class="ai-action-btn" data-action="export">📤 Экспорт</button>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
  }

  function formatMessage(content) {
    // Basic markdown-like formatting
    let formatted = esc(content);
    
    // Code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }

  async function sendMessage() {
    const input = document.getElementById('aiChatInput');
    const message = input?.value?.trim();
    if (!message || isLoading) return;

    // Get selected scenario
    const scenarioSelect = document.getElementById('aiScenarioSelect');
    const scenario = scenarioSelect?.value || '';
    
    // Update hint text based on scenario
    const hintEl = document.getElementById('aiInputHint');
    if (scenario === 'demo2' && hintEl) {
      hintEl.textContent = '🎯 Demo2 режим: Используйте команды API (get_forecast, get_weather, etc.) или спросите на естественном языке';
    }

    input.value = '';
    chatHistory.push({ role: 'user', content: message });
    renderMessages();

    isLoading = true;
    const sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) sendBtn.textContent = '⏳ Думаю...';

    try {
      const requestBody = {
        message,
        thread_id: currentThreadId,
        history: chatHistory.slice(0, -1)
      };
      
      // Add scenario for demo2 mode
      if (scenario) {
        requestBody.scenario = scenario;
      }
      
      const response = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      chatHistory.push({ role: 'assistant', content: response.response || response.message || 'Ответ получен' });
      currentThreadId = response.thread_id;
      renderMessages();

      // Check if response contains a file
      if (response.file_url) {
        showFileResult(response.file_url, response.file_type);
      }
    } catch (err) {
      chatHistory.push({ role: 'assistant', content: '❌ Ошибка: ' + err.message });
      renderMessages();
    } finally {
      isLoading = false;
      if (sendBtn) sendBtn.textContent = 'Отправить ➤';
    }
  }

  function showFileResult(url, type) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;

    const fileDiv = document.createElement('div');
    fileDiv.className = 'ai-file-result';
    
    if (type === 'xlsx') {
      fileDiv.innerHTML = `
        <div class="ai-file-preview">
          <div class="ai-file-icon">📊</div>
          <div class="ai-file-info">
            <strong>Excel файл готов</strong>
            <a href="${url}" download class="btn nb-btn nb-btn-primary">⬇️ Скачать</a>
          </div>
        </div>
      `;
    } else if (type === 'pdf') {
      fileDiv.innerHTML = `
        <div class="ai-file-preview">
          <div class="ai-file-icon">📄</div>
          <div class="ai-file-info">
            <strong>PDF документ готов</strong>
            <a href="${url}" download class="btn nb-btn nb-btn-primary">⬇️ Скачать</a>
            <button class="btn nb-btn nb-btn-ghost" onclick="window.open('${url}', '_blank')">👁️ Просмотр</button>
          </div>
        </div>
      `;
    } else if (type === 'pptx') {
      fileDiv.innerHTML = `
        <div class="ai-file-preview">
          <div class="ai-file-icon">📽️</div>
          <div class="ai-file-info">
            <strong>PowerPoint презентация готова</strong>
            <a href="${url}" download class="btn nb-btn nb-btn-primary">⬇️ Скачать</a>
          </div>
        </div>
      `;
    }

    container.appendChild(fileDiv);
    container.scrollTop = container.scrollHeight;
  }

  function showScheduleModal() {
    const modal = document.getElementById('aiScheduleModal');
    const promptsContainer = document.getElementById('aiPromptsToSchedule');
    const calendarContainer = document.getElementById('aiCalendarGrid');
    
    if (!modal || !promptsContainer || !calendarContainer) return;

    // Show current chat history for selection
    const userPrompts = chatHistory.filter(m => m.role === 'user');
    promptsContainer.innerHTML = userPrompts.map((msg, i) => `
      <label class="ai-prompt-checkbox">
        <input type="checkbox" data-index="${i}" checked/>
        <span>${esc(msg.content.slice(0, 100))}${msg.content.length > 100 ? '...' : ''}</span>
      </label>
    `).join('');

    // Create calendar grid
    const today = new Date();
    const days = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    calendarContainer.innerHTML = days.map(d => `
      <label class="ai-calendar-day">
        <input type="checkbox" data-date="${d.toISOString().split('T')[0]}"/>
        <span>${d.getDate()}</span>
        <small>${d.toLocaleDateString('ru-RU', { weekday: 'short' })}</small>
      </label>
    `).join('');

    modal.hidden = false;
  }

  function saveSchedule() {
    const name = document.getElementById('aiScheduleName')?.value || 'Запланированный чат';
    const time = document.getElementById('aiScheduleTime')?.value || '09:00';
    const recurrence = document.getElementById('aiScheduleRecurrence')?.value || 'once';
    
    const selectedPrompts = [];
    document.querySelectorAll('#aiPromptsToSchedule input:checked').forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      const userPrompts = chatHistory.filter(m => m.role === 'user');
      if (userPrompts[idx]) {
        selectedPrompts.push(userPrompts[idx].content);
      }
    });

    const selectedDates = [];
    document.querySelectorAll('#aiCalendarGrid input:checked').forEach(cb => {
      selectedDates.push(cb.dataset.date);
    });

    if (selectedPrompts.length === 0 || selectedDates.length === 0) {
      window.showToast('Выберите промпты и даты', 'warning');
      return;
    }

    const schedule = {
      id: 'sched_' + Date.now(),
      name,
      time,
      recurrence,
      prompts: selectedPrompts,
      dates: selectedDates,
      created_at: new Date().toISOString()
    };

    scheduledPrompts.push(schedule);
    saveScheduledPrompts();
    
    document.getElementById('aiScheduleModal').hidden = true;
    window.showToast('Промпты запланированы!', 'success');
    renderScheduledList();

    // Also save as scenario
    saveAsScenario(schedule);
  }

  async function saveAsScenario(schedule) {
    try {
      await api('/api/scenarios', {
        method: 'POST',
        body: JSON.stringify({
          name: schedule.name,
          category: 'operations',
          cron_expr: schedule.recurrence === 'daily' ? `${schedule.time.split(':')[1]} ${schedule.time.split(':')[0]} * * *` : '',
          objective: schedule.prompts.join('\n\n'),
          delivery_channel: 'none',
          metadata: { schedule }
        }),
      });
    } catch (err) {
      console.warn('Could not save as scenario:', err);
    }
  }

  function renderScheduledList() {
    const container = document.getElementById('aiScheduledList');
    if (!container) return;

    if (scheduledPrompts.length === 0) {
      container.innerHTML = '<p class="text-muted">Нет запланированных</p>';
      return;
    }

    container.innerHTML = scheduledPrompts.map(s => `
      <div class="ai-scheduled-item">
        <div class="ai-scheduled-name">${esc(s.name)}</div>
        <div class="ai-scheduled-info">
          <span>${s.dates.length} дат</span>
          <span>${s.time}</span>
        </div>
        <button class="ai-scheduled-del" data-id="${s.id}">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.ai-scheduled-del').forEach(btn => {
      btn.addEventListener('click', () => {
        scheduledPrompts = scheduledPrompts.filter(s => s.id !== btn.dataset.id);
        saveScheduledPrompts();
        renderScheduledList();
      });
    });
  }

  function wireEvents() {
    // Send message
    document.getElementById('aiSendBtn')?.addEventListener('click', sendMessage);
    document.getElementById('aiChatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Quick prompts
    document.querySelectorAll('.ai-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('aiChatInput');
        if (input) {
          input.value = btn.dataset.prompt;
          input.focus();
        }
      });
    });

    // New chat
    document.getElementById('aiNewChatBtn')?.addEventListener('click', () => {
      chatHistory = [];
      currentThreadId = null;
      renderMessages();
      document.getElementById('aiChatMessages').innerHTML = document.querySelector('.ai-welcome-message')?.outerHTML || '';
    });

    // Schedule modal
    document.getElementById('aiScheduleBtn')?.addEventListener('click', showScheduleModal);
    document.getElementById('aiScheduleClose')?.addEventListener('click', () => {
      document.getElementById('aiScheduleModal').hidden = true;
    });
    document.getElementById('aiScheduleCancel')?.addEventListener('click', () => {
      document.getElementById('aiScheduleModal').hidden = true;
    });
    document.getElementById('aiScheduleSave')?.addEventListener('click', saveSchedule);

    // History button
    document.getElementById('aiHistoryBtn')?.addEventListener('click', () => {
      const sidebar = document.getElementById('aiChatSidebar');
      if (sidebar) sidebar.classList.toggle('visible');
    });

    // Render scheduled list
    renderScheduledList();
  }

  // Export
  window.renderAIChatPage = renderAIChatPage;
})();
