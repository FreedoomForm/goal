/**
 * AegisOps — Generic REST / GraphQL Connector
 * Universal connector for ANY REST API: CRM, ERP, billing, custom systems.
 */
const { BaseConnector } = require('./base');

class RestConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.defaultHeaders = this.config.headers || {};
    this.responseFormat = this.config.response_format || 'json'; // json, xml, text
    this.paginationType = this.config.pagination || 'none'; // none, offset, cursor, link
    this.pageSize = this.config.page_size || 100;
  }

  /** Test connection — GET the base URL */
  async testConnection() {
    try {
      const headers = { ...this.defaultHeaders, ...this.getAuthHeaders() };
      const res = await this.safeFetch(this.baseUrl, { headers });
      const contentType = res.headers.get('content-type') || '';
      let sample;
      if (contentType.includes('json')) {
        sample = await res.json().catch(() => null);
      } else {
        const text = await res.text();
        sample = text.slice(0, 500);
      }
      return {
        status: res.ok ? 'online' : 'error',
        httpStatus: res.status,
        contentType,
        endpoint: this.baseUrl,
        sample: typeof sample === 'object' ? sample : { raw: sample },
      };
    } catch (err) {
      return { status: 'offline', endpoint: this.baseUrl, error: err.message };
    }
  }

  /** Fetch data — configurable GET/POST with URL and params */
  async fetchData(query = {}) {
    const method = (query.method || 'GET').toUpperCase();
    let url = query.url ? `${this.baseUrl}/${query.url}`.replace(/\/+/g, '/').replace(':/', '://') : this.baseUrl;
    const headers = {
      ...this.defaultHeaders,
      ...this.getAuthHeaders(),
      ...(query.headers || {}),
    };

    // Add query parameters
    if (query.params && Object.keys(query.params).length) {
      const params = new URLSearchParams(query.params);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    const fetchOptions = { method, headers };
    if (method !== 'GET' && method !== 'HEAD' && query.body) {
      fetchOptions.body = typeof query.body === 'string' ? query.body : JSON.stringify(query.body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    const res = await this.safeFetch(url, fetchOptions);
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('json')) {
      data = await res.json();
    } else if (contentType.includes('xml')) {
      data = { xml: await res.text() };
    } else {
      data = { text: await res.text() };
    }

    // Extract using jsonpath if specified
    if (query.jsonPath && typeof data === 'object') {
      data = extractJsonPath(data, query.jsonPath);
    }

    return {
      connector: this.name,
      httpStatus: res.status,
      data,
    };
  }

  /** Push data — POST/PUT/PATCH */
  async pushData(payload) {
    const method = (payload._method || 'POST').toUpperCase();
    const urlPath = payload._url || '';
    const url = urlPath ? `${this.baseUrl}/${urlPath}` : this.baseUrl;
    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...this.getAuthHeaders(),
      ...(payload._headers || {}),
    };

    const body = { ...payload };
    delete body._method;
    delete body._url;
    delete body._headers;

    const res = await this.safeFetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    });
    const contentType = res.headers.get('content-type') || '';
    let response;
    if (contentType.includes('json')) {
      response = await res.json().catch(() => ({}));
    } else {
      response = { text: await res.text() };
    }
    return { success: res.ok, httpStatus: res.status, response };
  }

  /** GraphQL query */
  async graphql(query, variables = {}) {
    const url = this.config.graphql_endpoint || `${this.baseUrl}/graphql`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...this.getAuthHeaders(),
    };
    const res = await this.safeFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    const data = await res.json();
    return { data: data.data, errors: data.errors };
  }

  /** Paginated fetch — automatically follows pages */
  async fetchAllPages(query = {}) {
    const allData = [];
    let page = 0;
    let hasMore = true;

    while (hasMore && page < 100) { // Safety limit
      const params = { ...(query.params || {}) };
      if (this.paginationType === 'offset') {
        params.limit = this.pageSize;
        params.offset = page * this.pageSize;
      } else if (this.paginationType === 'cursor' && page > 0) {
        params.cursor = this._lastCursor;
      }

      const result = await this.fetchData({ ...query, params });
      const items = Array.isArray(result.data) ? result.data : (result.data?.results || result.data?.items || []);
      allData.push(...items);

      if (this.paginationType === 'offset') {
        hasMore = items.length === this.pageSize;
      } else if (this.paginationType === 'cursor') {
        this._lastCursor = result.data?.next_cursor;
        hasMore = !!this._lastCursor;
      } else {
        hasMore = false;
      }
      page++;
    }

    return { connector: this.name, totalItems: allData.length, data: allData };
  }
}

/** Simple JSON path extractor (supports dot notation) */
function extractJsonPath(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return null;
    if (part.includes('[')) {
      const [key, idx] = part.split('[');
      current = current[key];
      if (Array.isArray(current)) {
        const index = parseInt(idx.replace(']', ''));
        current = current[index];
      }
    } else {
      current = current[part];
    }
  }
  return current;
}

module.exports = { RestConnector };
