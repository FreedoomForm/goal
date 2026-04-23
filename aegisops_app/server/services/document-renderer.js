/**
 * AegisOps — Document Renderer Service
 * Генерация HTML и PDF документов для отображения в AI чате
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const DOCS_DIR = path.join(__dirname, '..', '..', 'data', 'documents');

// Убедимся что папка существует
try { fs.mkdirSync(DOCS_DIR, { recursive: true }); } catch {}

/**
 * Рендерит документ и возвращает URL для отображения
 */
async function renderDocument(options) {
  const {
    title = 'Документ',
    content = '',      // HTML контент
    format = 'html',   // 'html' или 'pdf'
    template = 'default',
    data = {},         // Данные для шаблона
  } = options;

  const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Генерируем полный HTML
  const fullHtml = generateFullHtml(title, content, template, data);

  if (format === 'html') {
    const filename = `${docId}.html`;
    const filepath = path.join(DOCS_DIR, filename);
    fs.writeFileSync(filepath, fullHtml, 'utf8');

    return {
      id: docId,
      format: 'html',
      filename,
      url: `/documents/${filename}`,
      path: filepath,
    };
  }

  if (format === 'pdf') {
    // Сначала сохраняем HTML
    const htmlFilename = `${docId}.html`;
    const htmlFilepath = path.join(DOCS_DIR, htmlFilename);
    fs.writeFileSync(htmlFilepath, fullHtml, 'utf8');

    // Пробуем конвертировать в PDF
    const pdfResult = await convertToPdf(htmlFilepath, docId);

    if (pdfResult.success) {
      return {
        id: docId,
        format: 'pdf',
        filename: pdfResult.filename,
        url: `/documents/${pdfResult.filename}`,
        path: pdfResult.path,
        htmlUrl: `/documents/${htmlFilename}`,
      };
    }

    // Если PDF не вышел — возвращаем HTML
    return {
      id: docId,
      format: 'html',
      filename: htmlFilename,
      url: `/documents/${htmlFilename}`,
      path: htmlFilepath,
      pdfError: pdfResult.error,
    };
  }

  throw new Error(`Unknown format: ${format}`);
}

/**
 * Генерирует полный HTML документ
 */
function generateFullHtml(title, content, template, data) {
  const styles = getStyles(template);

  // Подставляем данные в контент
  let processedContent = content;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    const strValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    processedContent = processedContent.split(placeholder).join(strValue);
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="document">
    <header class="doc-header">
      <h1>${escapeHtml(title)}</h1>
      <div class="doc-meta">Сгенерировано: ${new Date().toLocaleString('ru-RU')}</div>
    </header>
    <main class="doc-content">
      ${processedContent}
    </main>
    <footer class="doc-footer">
      <p>AegisOps Local AI</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Стили для документа
 */
function getStyles(template) {
  const baseStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      color: #1a1a2e;
      line-height: 1.6;
      padding: 20px;
    }
    .document {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .doc-header {
      background: linear-gradient(135deg, #ffd93d 0%, #ffb347 100%);
      padding: 24px 32px;
      border-bottom: 3px solid #1a1a2e;
    }
    .doc-header h1 {
      font-size: 24px;
      font-weight: 800;
      color: #1a1a2e;
      margin-bottom: 8px;
    }
    .doc-meta {
      font-size: 12px;
      color: #4a4a5a;
    }
    .doc-content {
      padding: 32px;
    }
    .doc-content h2 {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a2e;
      margin: 24px 0 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #eee;
    }
    .doc-content h3 {
      font-size: 15px;
      font-weight: 600;
      color: #2a2a3e;
      margin: 16px 0 8px;
    }
    .doc-content p {
      margin-bottom: 12px;
    }
    .doc-content ul, .doc-content ol {
      margin: 12px 0 12px 24px;
    }
    .doc-content li {
      margin-bottom: 6px;
    }
    .doc-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .doc-content th, .doc-content td {
      border: 1px solid #ddd;
      padding: 10px 12px;
      text-align: left;
    }
    .doc-content th {
      background: #f5f5f5;
      font-weight: 600;
    }
    .doc-content tr:nth-child(even) {
      background: #fafafa;
    }
    .doc-content pre {
      background: #1a1a2e;
      color: #e8e8f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 13px;
      margin: 16px 0;
    }
    .doc-content code {
      background: #f0f0f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 13px;
    }
    .doc-content .alert {
      padding: 12px 16px;
      border-radius: 8px;
      margin: 16px 0;
      border-left: 4px solid;
    }
    .doc-content .alert-warning {
      background: #fff8e6;
      border-color: #ffb347;
    }
    .doc-content .alert-error {
      background: #ffe6e6;
      border-color: #ff6b6b;
    }
    .doc-content .alert-success {
      background: #e6fff0;
      border-color: #4ade80;
    }
    .doc-content .alert-info {
      background: #e6f4ff;
      border-color: #3b82f6;
    }
    .doc-content .metric-card {
      display: inline-block;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 8px;
      text-align: center;
    }
    .doc-content .metric-value {
      font-size: 28px;
      font-weight: 800;
      color: #3366cc;
    }
    .doc-content .metric-label {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    .doc-footer {
      background: #f5f5f5;
      padding: 16px 32px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e0e0e0;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .document { box-shadow: none; }
    }
  `;

  // Дополнительные стили по шаблону
  const templateStyles = {
    report: `
      .doc-content .section { margin-bottom: 32px; }
      .doc-content .highlight { background: #fff3cd; padding: 2px 4px; }
    `,
    invoice: `
      .doc-header { background: #1a1a2e; color: #fff; }
      .doc-header h1 { color: #ffd93d; }
    `,
    minimal: `
      .doc-header { background: #fff; border-bottom: 2px solid #1a1a2e; }
      body { background: #fff; }
    `,
  };

  return baseStyles + (templateStyles[template] || '');
}

/**
 * Конвертирует HTML в PDF
 */
async function convertToPdf(htmlPath, docId) {
  const pdfFilename = `${docId}.pdf`;
  const pdfPath = path.join(DOCS_DIR, pdfFilename);

  // Метод 1: wkhtmltopdf (если установлен)
  try {
    execSync('wkhtmltopdf --version', { stdio: 'ignore' });
    execSync(`wkhtmltopdf --encoding utf-8 "${htmlPath}" "${pdfPath}"`, {
      stdio: 'ignore',
      timeout: 30000,
    });
    if (fs.existsSync(pdfPath)) {
      return { success: true, filename: pdfFilename, path: pdfPath };
    }
  } catch {}

  // Метод 2: puppeteer (если установлен)
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    await browser.close();
    if (fs.existsSync(pdfPath)) {
      return { success: true, filename: pdfFilename, path: pdfPath };
    }
  } catch {}

  // Метод 3: electron (если есть)
  try {
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({ show: false });
    await win.loadFile(htmlPath);
    const pdfData = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
    });
    fs.writeFileSync(pdfPath, pdfData);
    win.close();
    if (fs.existsSync(pdfPath)) {
      return { success: true, filename: pdfFilename, path: pdfPath };
    }
  } catch {}

  return {
    success: false,
    error: 'PDF generation not available. Install wkhtmltopdf or puppeteer.',
  };
}

/**
 * Быстрое создание документа из AI ответа
 */
function createFromAIResponse(response, options = {}) {
  const {
    title = 'AI Ответ',
    format = 'html',
    wrapInMarkdown = true,
  } = options;

  // Если ответ содержит HTML — используем как есть
  let content = response;

  // Если это markdown — конвертируем
  if (wrapInMarkdown && !response.includes('<')) {
    content = markdownToHtml(response);
  }

  return renderDocument({
    title,
    content,
    format,
    template: 'default',
  });
}

/**
 * Простая конвертация Markdown в HTML
 */
function markdownToHtml(md) {
  return md
    // Заголовки
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Жирный и курсив
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Код
    .replace(/```(\w*)\n([\s\S]+?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Списки
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Параграфы
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[huplo])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
    // Очистка пустых параграфов
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[huplo])/g, '$1')
    .replace(/(<\/[huplo][^>]*>)<\/p>/g, '$1');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Создаёт карточку для отображения в чате
 */
function createChatCard(doc) {
  return {
    type: 'document',
    id: doc.id,
    title: doc.title || 'Документ',
    format: doc.format,
    url: doc.url,
    preview: doc.format === 'html'
      ? `<iframe src="${doc.url}" style="width:100%;height:400px;border:none;border-radius:8px;"></iframe>`
      : `<a href="${doc.url}" target="_blank" class="doc-link">
           <span class="doc-icon">📄</span>
           <span class="doc-info">
             <strong>${doc.title || 'Документ'}</strong>
             <small>PDF • Скачать</small>
           </span>
         </a>`,
  };
}

module.exports = {
  renderDocument,
  createFromAIResponse,
  createChatCard,
  DOCS_DIR,
};
