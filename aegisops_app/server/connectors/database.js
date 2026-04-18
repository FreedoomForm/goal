/**
 * AegisOps — Database Connector (SQL)
 * Direct SQL queries against remote databases.
 * Supports MSSQL, PostgreSQL, MySQL via optional npm packages.
 * If drivers not installed, provides clear instructions.
 */
const { BaseConnector } = require('./base');

class DatabaseConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.dbType = this.config.db_type || 'postgresql'; // mssql, postgresql, mysql
    this.host = this.config.host || 'localhost';
    this.port = this.config.port || this._defaultPort();
    this.database = this.config.database || '';
    this.username = this.authPayload.username || '';
    this.password = this.authPayload.password || '';
  }

  _defaultPort() {
    return { mssql: 1433, postgresql: 5432, mysql: 3306 }[this.dbType] || 5432;
  }

  _getDriver() {
    const drivers = {
      mssql: () => { try { return require('tedious'); } catch { return null; } },
      postgresql: () => { try { return require('pg'); } catch { return null; } },
      mysql: () => { try { return require('mysql2/promise'); } catch { return null; } },
    };
    const getter = drivers[this.dbType];
    return getter ? getter() : null;
  }

  async testConnection() {
    const driver = this._getDriver();
    if (!driver) {
      const pkgMap = { mssql: 'tedious', postgresql: 'pg', mysql: 'mysql2' };
      return {
        status: 'unavailable',
        error: `Драйвер для ${this.dbType} не установлен`,
        suggestion: `Выполните: npm install ${pkgMap[this.dbType] || this.dbType}`,
        dbType: this.dbType,
      };
    }

    try {
      if (this.dbType === 'postgresql') {
        const { Client } = driver;
        const client = new Client({
          host: this.host, port: this.port,
          database: this.database,
          user: this.username, password: this.password,
          connectionTimeoutMillis: this.timeout,
        });
        await client.connect();
        const res = await client.query('SELECT version()');
        await client.end();
        return {
          status: 'online',
          dbType: this.dbType,
          host: this.host,
          database: this.database,
          version: res.rows[0]?.version,
        };
      }

      if (this.dbType === 'mysql') {
        const conn = await driver.createConnection({
          host: this.host, port: this.port,
          database: this.database,
          user: this.username, password: this.password,
          connectTimeout: this.timeout,
        });
        const [rows] = await conn.execute('SELECT VERSION() as version');
        await conn.end();
        return {
          status: 'online',
          dbType: this.dbType,
          host: this.host,
          database: this.database,
          version: rows[0]?.version,
        };
      }

      // MSSQL via tedious
      if (this.dbType === 'mssql') {
        return await this._testMssql(driver);
      }

      return { status: 'error', error: `Unsupported DB type: ${this.dbType}` };
    } catch (err) {
      return {
        status: 'offline',
        dbType: this.dbType,
        host: this.host,
        error: err.message,
      };
    }
  }

  async _testMssql(tedious) {
    return new Promise((resolve) => {
      const { Connection, Request } = tedious;
      const config = {
        server: this.host,
        authentication: {
          type: 'default',
          options: { userName: this.username, password: this.password },
        },
        options: {
          database: this.database,
          port: this.port,
          encrypt: this.config.encrypt !== false,
          trustServerCertificate: true,
          connectTimeout: this.timeout,
        },
      };
      const connection = new Connection(config);
      connection.on('connect', (err) => {
        if (err) {
          resolve({ status: 'offline', dbType: 'mssql', host: this.host, error: err.message });
          return;
        }
        const request = new Request('SELECT @@VERSION AS version', (err, rowCount, rows) => {
          connection.close();
          if (err) {
            resolve({ status: 'online', dbType: 'mssql', host: this.host, note: 'Connected but query failed' });
          } else {
            resolve({ status: 'online', dbType: 'mssql', host: this.host, database: this.database });
          }
        });
        connection.execSql(request);
      });
      connection.connect();
    });
  }

  /** Execute SQL query */
  async fetchData(query = {}) {
    const sql = query.sql || query.query;
    if (!sql) throw new Error('SQL query is required');

    const driver = this._getDriver();
    if (!driver) throw new Error(`${this.dbType} driver not installed`);

    if (this.dbType === 'postgresql') {
      const { Client } = driver;
      const client = new Client({
        host: this.host, port: this.port,
        database: this.database,
        user: this.username, password: this.password,
      });
      await client.connect();
      const res = await client.query(sql, query.params || []);
      await client.end();
      return { connector: this.name, rows: res.rows, rowCount: res.rowCount };
    }

    if (this.dbType === 'mysql') {
      const conn = await driver.createConnection({
        host: this.host, port: this.port,
        database: this.database,
        user: this.username, password: this.password,
      });
      const [rows] = await conn.execute(sql, query.params || []);
      await conn.end();
      return { connector: this.name, rows, rowCount: rows.length };
    }

    throw new Error(`Query execution not implemented for ${this.dbType}`);
  }

  /** Discover schema — list tables and columns */
  async discoverSchema() {
    const schemaSql = {
      postgresql: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
      mysql: `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name, DATA_TYPE as data_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    };
    const sql = schemaSql[this.dbType];
    if (!sql) return { entities: [], note: `Schema discovery not supported for ${this.dbType}` };

    const result = await this.fetchData({ sql });
    const tables = {};
    for (const row of result.rows) {
      const tbl = row.table_name;
      if (!tables[tbl]) tables[tbl] = { name: tbl, properties: [] };
      tables[tbl].properties.push({ name: row.column_name, type: row.data_type });
    }
    return { entities: Object.values(tables) };
  }

  async pushData(payload) {
    return this.fetchData({ sql: payload.sql, params: payload.params });
  }
}

module.exports = { DatabaseConnector };
