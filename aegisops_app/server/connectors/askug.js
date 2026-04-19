/**
 * AegisOps — ASKUG / UGaz / E-GAZ Connector
 * Gas metering system integration for АСКУГ (Automated System for Gas Control and Accounting).
 * Provides access to hourly archives, current readings, refuel data, and billing.
 */
const { BaseConnector } = require('./base');

class AskugConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.apiPath = this.config.api_path || '/api/v1';
    this.stationId = this.config.station_id || '';
    this.pipelineId = this.config.pipeline_id || '';
  }

  /** Build full API URL */
  _url(endpoint) {
    const base = `${this.baseUrl}${this.apiPath}/${endpoint}`.replace(/\/+/g, '/').replace(':/', '://');
    return base;
  }

  /** Test connection to ASKUG API */
  async testConnection() {
    try {
      const res = await this.safeFetch(this._url('status'), {
        headers: this.getAuthHeaders(),
      });
      const data = await res.json().catch(() => null);
      return {
        status: res.ok ? 'online' : 'error',
        httpStatus: res.status,
        endpoint: this.baseUrl,
        stationId: this.stationId,
        sample: data,
      };
    } catch (err) {
      return {
        status: 'offline',
        error: err.message,
        suggestion: 'Проверьте URL и доступность сервера АСКУГ',
        endpoint: this.baseUrl,
      };
    }
  }

  /** Fetch data — dispatches to specific methods based on query.type */
  async fetchData(query = {}) {
    const type = query.type || 'current';
    switch (type) {
      case 'hourly': return this.getHourlyArchive(query);
      case 'current': return this.getCurrentReadings(query);
      case 'refuel': return this.getUgazRefuelData(query);
      case 'billing': return this.getEgazBilling(query);
      default: return this.getCurrentReadings(query);
    }
  }

  /** Get hourly archive data from ASKUG */
  async getHourlyArchive(params = {}) {
    const date = params.date || new Date().toISOString().slice(0, 10);
    const stationId = params.station_id || this.stationId;
    const res = await this.safeFetch(this._url(`archive/hourly?date=${date}&station=${stationId}`), {
      headers: this.getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ raw: 'Non-JSON response' }));
    return { connector: this.name, type: 'hourly_archive', date, stationId, data };
  }

  /** Get current metering readings */
  async getCurrentReadings(params = {}) {
    const stationId = params.station_id || this.stationId;
    const pipelineId = params.pipeline_id || this.pipelineId;
    const res = await this.safeFetch(this._url(`readings/current?station=${stationId}&pipeline=${pipelineId}`), {
      headers: this.getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ raw: 'Non-JSON response' }));
    return { connector: this.name, type: 'current_readings', stationId, pipelineId, data };
  }

  /** Get UGaz refuel data */
  async getUgazRefuelData(params = {}) {
    const dateFrom = params.date_from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const dateTo = params.date_to || new Date().toISOString().slice(0, 10);
    const res = await this.safeFetch(this._url(`ugaz/refuel?from=${dateFrom}&to=${dateTo}`), {
      headers: this.getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ raw: 'Non-JSON response' }));
    return { connector: this.name, type: 'ugaz_refuel', dateFrom, dateTo, data };
  }

  /** Get E-GAZ billing data */
  async getEgazBilling(params = {}) {
    const period = params.period || new Date().toISOString().slice(0, 7); // YYYY-MM
    const res = await this.safeFetch(this._url(`egaz/billing?period=${period}`), {
      headers: this.getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ raw: 'Non-JSON response' }));
    return { connector: this.name, type: 'egaz_billing', period, data };
  }

  /** Discover available ASKUG endpoints */
  async discoverSchema() {
    return {
      entities: [
        { name: 'hourly_archive', description: 'Часовой архив показаний', path: '/archive/hourly' },
        { name: 'current_readings', description: 'Текущие показания приборов учета', path: '/readings/current' },
        { name: 'ugaz_refuel', description: 'Данные заправок УГаз', path: '/ugaz/refuel' },
        { name: 'egaz_billing', description: 'Биллинг Е-ГАЗ', path: '/egaz/billing' },
      ],
      configFields: [
        { key: 'api_path', label: 'API Path', default: '/api/v1' },
        { key: 'station_id', label: 'ID станции', default: '' },
        { key: 'pipeline_id', label: 'ID нитки газопровода', default: '' },
      ],
    };
  }
}

module.exports = { AskugConnector };
