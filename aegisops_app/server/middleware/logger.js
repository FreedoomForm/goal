/**
 * AegisOps — Structured Logger
 * JSON-line logs with level, request id, latency, and secret redaction.
 */
const crypto = require('crypto');
const { redactSecrets } = require('./security');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.AEGISOPS_LOG_LEVEL || 'info').toLowerCase()] || 20;

function writeLog(level, msg, meta = {}) {
  if ((LEVELS[level] || 0) < MIN_LEVEL) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...redactSecrets(meta),
  };
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(line) + '\n');
}

const log = {
  debug: (m, meta) => writeLog('debug', m, meta),
  info:  (m, meta) => writeLog('info', m, meta),
  warn:  (m, meta) => writeLog('warn', m, meta),
  error: (m, meta) => writeLog('error', m, meta),
};

function requestLogger(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - start) / 1e6;
    log.info('http', {
      id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(dur * 100) / 100,
      ua: req.headers['user-agent'],
      principal: req.auth?.type || (req.auth?.local ? 'local' : 'anon'),
    });
  });
  next();
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  log.error('unhandled', { id: req.requestId, err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', request_id: req.requestId });
}

module.exports = { log, requestLogger, errorHandler };
