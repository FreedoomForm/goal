/**
 * AegisOps — Database Layer (Compatibility Wrapper)
 * 
 * This module re-exports the async PostgreSQL/TimescaleDB layer from db/pg.js.
 * It maintains backward compatibility with modules that imported from './db'.
 * 
 * All functions are now ASYNC — callers must use await.
 * If PostgreSQL is unavailable, falls back to SQLite automatically.
 */
module.exports = require('./db/pg');
