/**
 * AegisOps — Module Engine
 * ИИ-модули системы прогнозирования для газовых компаний
 */

const { queryAll, queryOne } = require('../db');

// Module definitions
const modules = {
  gas_balance: {
    code: 'gas_balance',
    name: 'Газовый баланс',
    icon: '⛽',
    description: 'Прогноз баланса газа, ПХГ, импорт/экспорт',
    category: 'core',
  },
  consumption: {
    code: 'consumption',
    name: 'Потребление',
    icon: '📈',
    description: 'Дисциплина потребления, перебор/недобор',
    category: 'core',
  },
  payments: {
    code: 'payments',
    name: 'Платежи',
    icon: '💰',
    description: 'ДЗ/КЗ, платёжеспособность, пени',
    category: 'finance',
  },
  tariffs: {
    code: 'tariffs',
    name: 'Тарифы',
    icon: '📊',
    description: 'Безубыточность, субсидии, расщепление',
    category: 'finance',
  },
  risks: {
    code: 'risks',
    name: 'Риски',
    icon: '🔍',
    description: 'VaR, регрессионный анализ, митигация',
    category: 'risk',
  },
};

/**
 * Run a module by code with given parameters.
 * Uses the AI engine to produce analysis.
 */
async function runModule(code, params = {}) {
  const mod = modules[code];
  if (!mod) {
    throw new Error(`Unknown module: ${code}. Available: ${Object.keys(modules).join(', ')}`);
  }

  // Try to find an Ollama connector for AI-powered analysis
  const ollamaRow = queryOne("SELECT * FROM connectors WHERE type='ollama' LIMIT 1");
  let analysis = null;
  let provider = 'fallback';
  let model = 'built-in';

  if (ollamaRow) {
    try {
      const { createConnector } = require('../connectors');
      const connector = createConnector(ollamaRow);
      const prompt = buildModulePrompt(code, params);
      const result = await connector.chat([
        { role: 'system', content: 'Ты enterprise AI-аналитик для газовых компаний. Отвечай структурированно, с цифрами и таблицами. Русский язык.' },
        { role: 'user', content: prompt },
      ]);
      analysis = result.content;
      provider = result.provider || 'ollama';
      model = result.model || 'unknown';
    } catch (err) {
      // Fall through to fallback
    }
  }

  if (!analysis) {
    analysis = generateFallbackAnalysis(code, params);
  }

  // Build module-specific result structure
  const result = {
    moduleName: mod.name,
    moduleCode: code,
    timestamp: new Date().toISOString(),
    analysis: {
      provider,
      model,
      content: analysis,
    },
    params,
  };

  // Add module-specific data sections
  if (code === 'gas_balance') {
    result.gasBalance = {
      incoming: { total: '—', details: 'Подключите SCADA/1C для реальных данных' },
      outgoing: { total: '—', details: 'Подключите SCADA/1C для реальных данных' },
      balance: '—',
    };
    result.summary = {
      status: 'Требуются данные',
      period: params.days ? `${params.days} дней` : '30 дней',
      region: params.region || 'Ташкент',
    };
  } else if (code === 'consumption') {
    result.summary = {
      status: 'Требуются данные',
      period: params.period || 'месяц',
    };
  } else if (code === 'payments') {
    result.summary = {
      status: 'Требуются данные',
      period: params.period || 'месяц',
    };
  } else if (code === 'tariffs') {
    result.summary = {
      status: 'Требуются данные',
      scenario: params.scenario || 'base',
    };
  } else if (code === 'risks') {
    result.summary = {
      status: 'Требуются данные',
      horizon: params.horizon ? `${params.horizon} дней` : '30 дней',
    };
  }

  return result;
}

function buildModulePrompt(code, params) {
  const region = params.region || 'Ташкент';
  const prompts = {
    gas_balance: `Подготовь детальную аналитическую сводку по газовому балансу для региона ${region}.\nПериод: ${params.days || 30} дней.\nТемпературный сценарий: ${params.temperatureScenario || 'normal'}.\n\nВключи:\n1. Баланс поступления и потребления\n2. Режим ПХГ (подземные хранилища газа)\n3. Импорт/Экспорт\n4. Давление в ГТС\n5. Прогноз на следующий период\n6. Рекомендации`,
    consumption: `Аналитика потребления газа для региона ${region}.\nПериод: ${params.period || 'месяц'}.\n\nВключи:\n1. Заявки vs факт потребления\n2. Дисциплина потребления\n3. Перебор/недобор по компаниям\n4. Прогноз потребления\n5. Рекомендации по оптимизации`,
    payments: `Мониторинг платежей за газ.\nПериод: ${params.period || 'месяц'}.\n\nВключи:\n1. Дебиторская задолженность (ДЗ)\n2. Кредиторская задолженность (КЗ)\n3. Просроченные платежи\n4. Пени и штрафы\n5. Платёжеспособность компаний\n6. Рекомендации по взысканию`,
    tariffs: `Тарифный анализ для газовых компаний.\nСценарий: ${params.scenario || 'base'}.\n\nВключи:\n1. Текущие тарифы\n2. Точка безубыточности\n3. Оптимальный тариф\n4. Субсидии\n5. Расщепление платежей\n6. Финансовое моделирование`,
    risks: `Управление рисками газовых компаний.\nГоризонт: ${params.horizon || 30} дней.\n\nВключи:\n1. Риски недопоставки газа\n2. Финансовые риски (VaR)\n3. Качество газа\n4. Регрессионный анализ факторов\n5. Сценарии митигации\n6. Рекомендации`,
  };
  return prompts[code] || `Анализ модуля ${code}`;
}

function generateFallbackAnalysis(code, params) {
  const d = new Date();
  const dateStr = d.toLocaleDateString('ru-RU');
  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const mod = modules[code];

  return `${mod.icon} ${mod.name.toUpperCase()}\nДата: ${dateStr} | ${timeStr}\n\n` +
    `СТАТУС: Данные не получены из внешних систем\n\n` +
    `Для полноценного AI-анализа необходимо:\n` +
    `→ Подключите Ollama (ollama serve && ollama pull qwen2.5:7b-instruct)\n` +
    `→ Настройте коннекторы к данным (1C, SAP, SCADA)\n\n` +
    `После подключения модуль "${mod.name}" будет автоматически анализировать:\n` +
    mod.description.split(', ').map(s => `• ${s}`).join('\n') +
    `\n\n[AegisOps Local AI | fallback — подключите Ollama для AI-анализа]`;
}

module.exports = { runModule, modules };
