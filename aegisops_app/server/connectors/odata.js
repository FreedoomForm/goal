/**
 * AegisOps — Real OData Connector (1C + SAP S/4HANA)
 * Universal OData v2/v3/v4 client with real HTTP calls.
 * Handles:
 *  - 1C: Basic auth, OData v3, GUID keys (guid'xxx')
 *  - SAP: Bearer/Basic auth, CSRF token fetch-and-set, OData v2/v4
 *  - Any OData-compliant API
 */
const { BaseConnector } = require('./base');

class ODataConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.entity = this.config.entity || '';
    this.odataVersion = this.config.odata_version || 'v3'; // v2, v3, v4
    this.flavor = this.config.flavor || 'generic'; // '1c', 'sap', 'generic'
    // Auto-detect flavor from type
    if (this.type === 'one_c_odata') this.flavor = '1c';
    if (this.type === 'sap_odata') this.flavor = 'sap';
  }

  /** Build request headers with auth + OData format */
  _buildHeaders(extra = {}) {
    const headers = {
      'Accept': 'application/json',
      ...this.getAuthHeaders(),
      ...extra,
    };
    if (this.flavor === 'sap') {
      headers['sap-client'] = this.config.sap_client || '100';
    }
    return headers;
  }

  /** SAP-specific: Fetch CSRF token for write operations */
  async _fetchCsrfToken() {
    if (this.flavor !== 'sap') return null;
    try {
      const res = await this.safeFetch(this.baseUrl, {
        method: 'HEAD',
        headers: {
          ...this._buildHeaders(),
          'x-csrf-token': 'Fetch',
        },
      });
      return res.headers.get('x-csrf-token') || null;
    } catch {
      return null;
    }
  }

  /** Test connection by fetching $metadata */
  async testConnection() {
    try {
      const metadataUrl = this.baseUrl.endsWith('/')
        ? `${this.baseUrl}$metadata`
        : `${this.baseUrl}/$metadata`;
      const res = await this.safeFetch(metadataUrl, {
        headers: this._buildHeaders({ 'Accept': 'application/xml' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const xml = await res.text();
      // Extract entity type names from metadata XML
      const entityTypes = [];
      const regex = /EntityType\s+Name="([^"]+)"/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        entityTypes.push(match[1]);
      }
      return {
        status: 'online',
        flavor: this.flavor,
        endpoint: this.baseUrl,
        entityTypes: entityTypes.slice(0, 50),
        entityCount: entityTypes.length,
        metadataSize: xml.length,
      };
    } catch (err) {
      return {
        status: 'offline',
        flavor: this.flavor,
        endpoint: this.baseUrl,
        error: err.message,
        suggestion: this.flavor === '1c'
          ? 'Убедитесь что 1C веб-сервис опубликован и доступен по URL'
          : 'Проверьте URL, credentials и доступность SAP-сервера',
      };
    }
  }

  /** Discover schema — list all entity sets with their properties */
  async discoverSchema() {
    const metadataUrl = this.baseUrl.endsWith('/')
      ? `${this.baseUrl}$metadata`
      : `${this.baseUrl}/$metadata`;
    const res = await this.safeFetch(metadataUrl, {
      headers: this._buildHeaders({ 'Accept': 'application/xml' }),
    });
    if (!res.ok) throw new Error(`Metadata fetch failed: HTTP ${res.status}`);
    const xml = await res.text();

    // Parse entity types and their properties from XML
    const entities = [];
    const entityRegex = /<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
    const propRegex = /<Property\s+Name="([^"]+)"\s+Type="([^"]+)"/g;
    let entityMatch;
    while ((entityMatch = entityRegex.exec(xml)) !== null) {
      const name = entityMatch[1];
      const body = entityMatch[2];
      const properties = [];
      let propMatch;
      while ((propMatch = propRegex.exec(body)) !== null) {
        properties.push({ name: propMatch[1], type: propMatch[2] });
      }
      entities.push({ name, properties });
    }
    return { entities, flavor: this.flavor, endpoint: this.baseUrl };
  }

  /** Fetch data — real OData GET with query parameters */
  async fetchData(query = {}) {
    const entity = query.entity || this.entity;
    if (!entity) throw new Error('No entity specified. Set entity in connector config or pass in query.');

    let url = `${this.baseUrl}/${entity}`;
    const params = new URLSearchParams();
    params.set('$format', 'json');
    if (query.$filter) params.set('$filter', query.$filter);
    if (query.$select) params.set('$select', query.$select);
    if (query.$orderby) params.set('$orderby', query.$orderby);
    if (query.$top) params.set('$top', String(query.$top));
    if (query.$skip) params.set('$skip', String(query.$skip));
    if (query.$expand) params.set('$expand', query.$expand);
    url += '?' + params.toString();

    const res = await this.safeFetch(url, { headers: this._buildHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OData GET failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    // OData v2/v3 wraps in d.results, v4 uses value
    const results = data.d?.results || data.d || data.value || data;
    return {
      connector: this.name,
      entity,
      count: Array.isArray(results) ? results.length : 1,
      data: results,
    };
  }

  /** Push data — real OData POST (create) */
  async pushData(payload) {
    const entity = payload._entity || this.entity;
    if (!entity) throw new Error('No entity specified');

    const url = `${this.baseUrl}/${entity}`;
    const headers = this._buildHeaders({ 'Content-Type': 'application/json' });

    // SAP: fetch CSRF token first
    const csrfToken = await this._fetchCsrfToken();
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    const body = { ...payload };
    delete body._entity;

    const res = await this.safeFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OData POST failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    return { success: true, response: await res.json().catch(() => ({})) };
  }

  /** Update record — OData PATCH */
  async updateRecord(entity, key, data) {
    // 1C uses guid format: Entity(guid'xxxx')
    const keyStr = this.flavor === '1c' ? `(guid'${key}')` : `('${key}')`;
    const url = `${this.baseUrl}/${entity}${keyStr}`;
    const headers = this._buildHeaders({ 'Content-Type': 'application/json' });
    const csrfToken = await this._fetchCsrfToken();
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    const res = await this.safeFetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OData PATCH failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    return { success: true };
  }

  /** Delete record — OData DELETE */
  async deleteRecord(entity, key) {
    const keyStr = this.flavor === '1c' ? `(guid'${key}')` : `('${key}')`;
    const url = `${this.baseUrl}/${entity}${keyStr}`;
    const headers = this._buildHeaders();
    const csrfToken = await this._fetchCsrfToken();
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    const res = await this.safeFetch(url, { method: 'DELETE', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OData DELETE failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    return { success: true };
  }
}

module.exports = { ODataConnector };
