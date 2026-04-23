/**
 * AegisOps — BI Dashboard: Газовый баланс
 * Real-time дашборд для диспетчеров с графиками, KPI и алертами.
 */
(function () {
  'use strict';

  const ML_PORT = 18091;
  const ML_BASE = `http://127.0.0.1:${ML_PORT}`;

  let balanceChart = null;
  let forecastChart = null;
  let riskGauge = null;
  let refreshInterval = null;

  /* ─── Форматирование чисел ─── */
  function fmt(n, decimals = 0) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: decimals });
  }
  function fmtDate(d) {
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  /* ─── KPI карточка ─── */
  function kpiCard(label, value, unit, color, icon, trend) {
    const trendHtml = trend !== undefined
      ? `<span class="kpi-trend ${trend > 0 ? 'trend-up' : 'trend-down'}">${trend > 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(1)}%</span>`
      : '';
    return `
      <div class="bi-kpi" style="border-left: 4px solid ${color}">
        <div class="kpi-header">
          <span class="kpi-icon">${icon}</span>
          <span class="kpi-label">${label}</span>
        </div>
        <div class="kpi-value" style="color: ${color}">${value}<small class="kpi-unit">${unit}</small></div>
        ${trendHtml}
      </div>
    `;
  }

  /* ─── Риск-индикатор ─── */
  function riskBadge(level, score) {
    const colors = { NORMAL: '#23c483', LOW: '#59a8ff', MEDIUM: '#ffb347', HIGH: '#ff6a6a', CRITICAL: '#ff3333' };
    const c = colors[level] || '#8ea1c9';
    return `<span class="risk-badge" style="background:${c}20;color:${c};border:1px solid ${c}">${level} (${score})</span>`;
  }

  /* ─── Bar chart for consumption by region ─── */
  function regionChart(regions) {
    if (!regions || regions.length === 0) return '<p class="muted">Нет данных по регионам</p>';
    const maxVal = Math.max(...regions.map(r => r.avg_monthly_bill || 0), 1);
    const bars = regions.map(r => {
      const pct = ((r.avg_monthly_bill || 0) / maxVal * 100).toFixed(0);
      const color = (r.avg_monthly_bill || 0) > maxVal * 0.7 ? '#ff6a6a' :
                    (r.avg_monthly_bill || 0) > maxVal * 0.4 ? '#ffb347' : '#23c483';
      return `
        <div class="region-bar-row">
          <span class="region-name">${r.region}</span>
          <div class="region-bar-track">
            <div class="region-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="region-val">${fmt(r.avg_monthly_bill)} сум</span>
          <span class="region-count">${r.consumers_count} потр.</span>
        </div>
      `;
    }).join('');
    return `<div class="region-bars">${bars}</div>`;
  }

  /* ─── Главная функция рендера ─── */
  async function renderBIDashboard(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">BI Дашборд — Газовый баланс</h1>
          <p class="page-subtitle">Real-time мониторинг баланса, рисков и финансов</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" id="biRefreshBtn">🔄 Обновить</button>
          <button class="btn btn-primary" id="biForecastBtn">📊 Прогноз</button>
          <select id="biPeriodSelect" class="bi-select">
            <option value="30">30 дней</option>
            <option value="90" selected>90 дней</option>
            <option value="180">180 дней</option>
            <option value="365">1 год</option>
          </select>
        </div>
      </div>

      <!-- KPI Row -->
      <div class="bi-kpi-row" id="biKpiRow">
        <div class="bi-kpi-placeholder">Загрузка...</div>
      </div>

      <!-- Charts Row -->
      <div class="bi-grid">
        <div class="bi-card bi-card-wide">
          <div class="bi-card-header">
            <h3>Динамика баланса газа</h3>
            <div class="bi-legend">
              <span class="legend-item"><span style="background:#59a8ff"></span>Поступление</span>
              <span class="legend-item"><span style="background:#ff6a6a"></span>Потребление</span>
              <span class="legend-item"><span style="background:#23c483"></span>Баланс</span>
            </div>
          </div>
          <div class="bi-chart-container">
            <canvas id="biBalanceChart"></canvas>
          </div>
        </div>

        <div class="bi-card">
          <div class="bi-card-header"><h3>Оценка рисков</h3></div>
          <div id="biRiskPanel" class="bi-risk-panel">
            <p class="muted">Загрузка рисков...</p>
          </div>
        </div>
      </div>

      <!-- Second Row -->
      <div class="bi-grid">
        <div class="bi-card">
          <div class="bi-card-header"><h3>Прогноз на 30 дней</h3></div>
          <div class="bi-chart-container">
            <canvas id="biForecastChart"></canvas>
          </div>
          <div id="biForecastInfo" class="bi-forecast-info"></div>
        </div>

        <div class="bi-card">
          <div class="bi-card-header"><h3>Потребление по регионам</h3></div>
          <div id="biRegionPanel" class="bi-region-panel">
            <p class="muted">Загрузка...</p>
          </div>
        </div>
      </div>

      <!-- Financial Row -->
      <div class="bi-grid">
        <div class="bi-card bi-card-wide">
          <div class="bi-card-header"><h3>Финансовые показатели</h3></div>
          <div id="biFinancialPanel" class="bi-financial-panel">
            <p class="muted">Загрузка...</p>
          </div>
        </div>
      </div>
    `;

    // Initial load
    await loadDashboard();

    // Bind buttons
    document.getElementById('biRefreshBtn').onclick = loadDashboard;
    document.getElementById('biForecastBtn').onclick = runForecast;
    document.getElementById('biPeriodSelect').onchange = loadDashboard;

    // Auto-refresh every 60 seconds
    refreshInterval = setInterval(loadDashboard, 60000);
  }

  /* ─── Загрузка данных ─── */
  async function loadDashboard() {
    const days = parseInt(document.getElementById('biPeriodSelect')?.value || '90');
    try {
      // Параллельно загружаем все данные
      const [analyticsRes, riskRes, regionRes] = await Promise.allSettled([
        fetch(`${ML_BASE}/api/analytics/gas-balance?days=${days}`).then(r => r.json()),
        fetch(`${ML_BASE}/api/risk/dashboard`).then(r => r.json()),
        fetch(`${ML_BASE}/api/analytics/consumption-by-region?days=${days}`).then(r => r.json()),
      ]);

      const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value : null;
      const risk = riskRes.status === 'fulfilled' ? riskRes.value : null;
      const regions = regionRes.status === 'fulfilled' ? regionRes.value : null;

      renderKPIs(analytics, risk);
      renderBalanceChart(analytics);
      renderRiskPanel(risk);
      renderRegionPanel(regions);
      renderFinancialPanel(risk);
    } catch (err) {
      console.error('[BI Dashboard] Load error:', err);
    }
  }

  /* ─── Render KPIs ─── */
  function renderKPIs(analytics, risk) {
    const row = document.getElementById('biKpiRow');
    if (!row) return;

    const s = analytics?.statistics || {};
    const r = risk?.balance || {};
    const fin = risk?.financial || {};
    const trend = analytics?.trend_7d || {};

    row.innerHTML =
      kpiCard('Поступление', fmt(s.avg_daily_supply), ' тыс. м³/день', '#59a8ff', '📥',
              trend.supply_trend === 'growth' ? Math.abs(Number(trend.supply_trend || 0)) * 2 : -2) +
      kpiCard('Потребление', fmt(s.avg_daily_demand), ' тыс. м³/день', '#ff6a6a', '📤',
              trend.demand_trend === 'growth' ? Math.abs(Number(trend.demand_trend || 0)) * 3 : -1.5) +
      kpiCard('Чистый баланс', fmt(s.avg_daily_balance), ' тыс. м³/день',
              Number(s.avg_daily_balance) >= 0 ? '#23c483' : '#ff3333', '⚖️') +
      kpiCard('Дефицитные дни', fmt(s.deficit_days), ' из ' + (analytics?.daily?.length || 0),
              Number(s.deficit_days) > 5 ? '#ff6a6a' : '#23c483', '⚠️') +
      kpiCard('Риск системы', risk?.composite_index?.composite_score || '—', '/100',
              (risk?.composite_index?.risk_level || '') === 'NORMAL' ? '#23c483' : '#ff6a6a', '🛡️') +
      kpiCard('Маржинальность', fmt(fin.indicators?.margin_ratio, 1) || '—', '%',
              Number(fin.indicators?.margin_ratio || 0) > 0.1 ? '#23c483' : '#ff6a6a', '💰');
  }

  /* ─── Balance Chart (Chart.js) ─── */
  function renderBalanceChart(analytics) {
    if (!analytics?.daily) return;

    const daily = analytics.daily;
    const labels = daily.map(d => fmtDate(d.ds));
    const supply = daily.map(d => d.supply_mcm);
    const demand = daily.map(d => d.demand_mcm);
    const balance = daily.map(d => d.net_balance_mcm);

    const ctx = document.getElementById('biBalanceChart');
    if (!ctx) return;

    if (balanceChart) balanceChart.destroy();
    balanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Поступление (тыс. м³)', data: supply, borderColor: '#59a8ff', backgroundColor: '#59a8ff20', fill: true, tension: 0.3, pointRadius: 0 },
          { label: 'Потребление (тыс. м³)', data: demand, borderColor: '#ff6a6a', backgroundColor: '#ff6a6a20', fill: true, tension: 0.3, pointRadius: 0 },
          { label: 'Баланс (тыс. м³)', data: balance, borderColor: '#23c483', borderDash: [5, 5], tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 12, color: '#8ea1c9' }, grid: { color: '#1a2540' } },
          y: { position: 'left', ticks: { color: '#8ea1c9' }, grid: { color: '#1a2540' } },
          y1: { position: 'right', ticks: { color: '#23c483' }, grid: { display: false } },
        }
      }
    });
  }

  /* ─── Risk Panel ─── */
  function renderRiskPanel(risk) {
    const panel = document.getElementById('biRiskPanel');
    if (!panel) return;

    if (!risk || !risk.balance) {
      panel.innerHTML = '<p class="muted">ML Engine недоступен</p>';
      return;
    }

    const b = risk.balance;
    const c = risk.composite_index || {};
    const fin = risk.financial || {};

    panel.innerHTML = `
      <div class="risk-section">
        <h4>Композитный риск</h4>
        <div class="risk-gauge-large" style="color:${c.risk_level === 'NORMAL' || c.risk_level === 'LOW' ? '#23c483' : '#ff6a6a'}">
          ${c.composite_score || 0}
        </div>
        ${riskBadge(c.risk_level, c.composite_score)}
      </div>
      <div class="risk-section">
        <h4>Баланс газа</h4>
        <p>Уровень: ${riskBadge(b.current_risk_level, b.current_risk_score)}</p>
        <p class="muted" style="margin-top:4px">${b.recommendation || ''}</p>
      </div>
      <div class="risk-section">
        <h4>Финансы</h4>
        <p>Маржа: <strong>${fin.indicators?.margin_ratio != null ? (fin.indicators.margin_ratio * 100).toFixed(1) + '%' : '—'}</strong></p>
        <p>Дебиторка: <strong>${fin.indicators?.receivable_days != null ? fin.indicators.receivable_days.toFixed(0) + ' дн.' : '—'}</strong></p>
        ${fin.recommendations ? '<ul class="risk-recs">' + fin.recommendations.map(r => `<li>${r}</li>`).join('') + '</ul>' : ''}
      </div>
    `;
  }

  /* ─── Region Panel ─── */
  function renderRegionPanel(regionData) {
    const panel = document.getElementById('biRegionPanel');
    if (!panel) return;
    const regions = regionData?.regions || [];
    panel.innerHTML = regionChart(regions);
  }

  /* ─── Financial Panel ─── */
  function renderFinancialPanel(risk) {
    const panel = document.getElementById('biFinancialPanel');
    if (!panel) return;

    const fin = risk?.financial || {};
    const ind = fin.indicators || {};

    if (!fin.risk_score) {
      panel.innerHTML = '<p class="muted">Нет финансовых данных</p>';
      return;
    }

    panel.innerHTML = `
      <div class="fin-grid">
        <div class="fin-metric">
          <span class="fin-label">Риск-скор</span>
          <span class="fin-value" style="color:${fin.risk_score > 50 ? '#ff6a6a' : '#23c483'}">${fin.risk_score}/100</span>
          <span class="fin-level">${riskBadge(fin.risk_level, fin.risk_score)}</span>
        </div>
        <div class="fin-metric">
          <span class="fin-label">Маржинальность</span>
          <span class="fin-value">${ind.margin_ratio != null ? (ind.margin_ratio * 100).toFixed(1) + '%' : '—'}</span>
          <span class="fin-trend">${ind.margin_trend != null ? (ind.margin_trend > 0 ? '↑' : '↓') : ''}</span>
        </div>
        <div class="fin-metric">
          <span class="fin-label">Дебитор. задолженность</span>
          <span class="fin-value">${ind.receivable_days != null ? ind.receivable_days.toFixed(0) + ' дней' : '—'}</span>
        </div>
        <div class="fin-metric">
          <span class="fin-label">Стабильность выручки</span>
          <span class="fin-value">${ind.revenue_stability != null ? (ind.revenue_stability * 100).toFixed(1) + '%' : '—'}</span>
        </div>
      </div>
      ${fin.recommendations && fin.recommendations.length > 0
        ? '<div class="fin-recs"><h4>Рекомендации:</h4><ul>' + fin.recommendations.map(r => `<li>${r}</li>`).join('') + '</ul></div>'
        : ''}
    `;
  }

  /* ─── Прогноз ─── */
  async function runForecast() {
    try {
      const info = document.getElementById('biForecastInfo');
      if (info) info.innerHTML = '<p class="muted">⏳ Обучение модели и генерация прогноза...</p>';

      const res = await fetch(`${ML_BASE}/api/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_type: 'ensemble', horizon: 30, train_days: 365, retrain: true }),
      });
      const data = await res.json();

      renderForecastChart(data);

      if (info) {
        const m = data.metrics || {};
        info.innerHTML = `
          <p>Модель: <strong>${data.model}</strong> | Горизонт: ${data.horizon} дней</p>
          ${m.mape ? `<p>MAPE: <strong>${m.mape}%</strong> | RMSE: ${m.rmse}</p>` : '<p>Модель обучена</p>'}
        `;
      }
    } catch (err) {
      const info = document.getElementById('biForecastInfo');
      if (info) info.innerHTML = `<p style="color:#ff6a6a">Ошибка прогноза: ${err.message}</p>`;
    }
  }

  function renderForecastChart(data) {
    if (!data?.forecast) return;
    const ctx = document.getElementById('biForecastChart');
    if (!ctx) return;

    const labels = data.forecast.map(f => fmtDate(f.ds));
    const yhat = data.forecast.map(f => f.yhat);
    const lower = data.forecast.map(f => f.yhat_lower);
    const upper = data.forecast.map(f => f.yhat_upper);

    if (forecastChart) forecastChart.destroy();
    forecastChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Прогноз', data: yhat, borderColor: '#7c5cff', backgroundColor: '#7c5cff30', fill: true, tension: 0.3, pointRadius: 2 },
          { label: 'Верхняя граница', data: upper, borderColor: 'transparent', backgroundColor: '#7c5cff10', fill: '+1', pointRadius: 0 },
          { label: 'Нижняя граница', data: lower, borderColor: '#7c5cff50', borderDash: [3, 3], fill: false, pointRadius: 0 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8ea1c9', filter: item => item.text !== 'Верхняя граница' } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 10, color: '#8ea1c9' }, grid: { color: '#1a2540' } },
          y: { ticks: { color: '#8ea1c9' }, grid: { color: '#1a2540' } },
        }
      }
    });
  }

  /* ─── Cleanup ─── */
  function destroy() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (balanceChart) { balanceChart.destroy(); balanceChart = null; }
    if (forecastChart) { forecastChart.destroy(); forecastChart = null; }
  }

  window.renderBIDashboard = renderBIDashboard;
  window.destroyBIDashboard = destroy;
})();
