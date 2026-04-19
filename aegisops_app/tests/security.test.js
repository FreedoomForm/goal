const {
  rateLimiter, securityHeaders, inputSanitizer,
  redactSecrets, sanitize, safeEqual, stopCleanup,
} = require('../server/middleware/security');

afterAll(() => {
  // Stop the background setInterval in security.js so Jest can exit cleanly
  stopCleanup();
});

describe('security middleware', () => {
  describe('sanitize', () => {
    test('strips control characters', () => {
      expect(sanitize('hello\x00\x01world')).toBe('helloworld');
    });
    test('preserves newlines and tabs', () => {
      expect(sanitize('a\nb\tc')).toBe('a\nb\tc');
    });
    test('blocks prototype pollution keys', () => {
      const r = sanitize({ __proto__: { admin: true }, name: 'x' });
      expect(r.admin).toBeUndefined();
      expect(r.name).toBe('x');
    });
    test('deep sanitizes arrays', () => {
      expect(sanitize(['a\x00', { b: '\x01c' }])).toEqual(['a', { b: 'c' }]);
    });
  });

  describe('redactSecrets', () => {
    test('redacts token/password/secret', () => {
      const r = redactSecrets({ name: 'x', password: 'pwd', api_key: 'k', nested: { token: 't' } });
      expect(r.password).toBe('***REDACTED***');
      expect(r.api_key).toBe('***REDACTED***');
      expect(r.nested.token).toBe('***REDACTED***');
      expect(r.name).toBe('x');
    });
  });

  describe('safeEqual', () => {
    test('returns true for equal strings', () => {
      expect(safeEqual('abc', 'abc')).toBe(true);
    });
    test('returns false for different strings', () => {
      expect(safeEqual('abc', 'abd')).toBe(false);
    });
    test('returns false for different lengths', () => {
      expect(safeEqual('abc', 'abcd')).toBe(false);
    });
  });

  describe('securityHeaders', () => {
    test('sets strict headers', () => {
      const headers = {};
      const res = { setHeader: (k, v) => { headers[k] = v; } };
      securityHeaders({}, res, () => {});
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    });
  });

  describe('rateLimiter', () => {
    test('allows requests under the limit', () => {
      const mw = rateLimiter({ max: 3, windowMs: 1000 });
      let status = 200; const headers = {};
      const res = {
        setHeader: (k, v) => { headers[k] = v; },
        status: (c) => { status = c; return { json: () => {} }; },
      };
      const req = { ip: '1.2.3.4', path: '/api/test', baseUrl: '' };
      mw(req, res, () => {});
      mw(req, res, () => {});
      mw(req, res, () => {});
      expect(status).toBe(200);
      expect(Number(headers['X-RateLimit-Remaining'])).toBe(0);
    });
    test('blocks over-limit', () => {
      const mw = rateLimiter({ max: 1, windowMs: 1000 });
      let blocked = false;
      const res = {
        setHeader: () => {},
        status: (c) => { if (c === 429) blocked = true; return { json: () => {} }; },
      };
      const req = { ip: '9.9.9.9', path: '/api/x', baseUrl: '' };
      mw(req, res, () => {});
      mw(req, res, () => {});
      expect(blocked).toBe(true);
    });
  });

  describe('inputSanitizer', () => {
    test('cleans body and query', () => {
      const req = { body: { name: 'a\x00b' }, query: { q: '\x01c' } };
      inputSanitizer(req, {}, () => {});
      expect(req.body.name).toBe('ab');
      expect(req.query.q).toBe('c');
    });
  });
});
