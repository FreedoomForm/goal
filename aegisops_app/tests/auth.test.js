jest.mock('../server/db', () => {
  const store = { settings: new Map(), api_keys: [] };
  return {
    queryOne: jest.fn(sql => {
      if (String(sql).includes("settings WHERE key='server_secret'")) {
        return store.settings.has('server_secret') ? { value: store.settings.get('server_secret') } : null;
      }
      return null;
    }),
    queryAll: jest.fn(() => []),
    runSQL: jest.fn((sql, params) => {
      if (String(sql).includes('settings')) {
        store.settings.set(params[0], params[1]);
      }
      return { lastInsertRowid: 1 };
    }),
    nowISO: () => '2026-01-01T00:00:00Z',
  };
});

const { signToken, verifyToken } = require('../server/auth');

test('signs and verifies a token', () => {
  const t = signToken({ sub: 'u1', scopes: ['read'] }, 60);
  const p = verifyToken(t);
  expect(p).not.toBeNull();
  expect(p.sub).toBe('u1');
  expect(p.scopes).toEqual(['read']);
});

test('rejects tampered token', () => {
  const t = signToken({ sub: 'u1' }, 60);
  const parts = t.split('.');
  parts[1] = parts[1].slice(0, -1) + (parts[1].slice(-1) === 'A' ? 'B' : 'A');
  expect(verifyToken(parts.join('.'))).toBeNull();
});

test('rejects expired token', () => {
  const t = signToken({ sub: 'u1' }, -10);
  expect(verifyToken(t)).toBeNull();
});

test('rejects malformed tokens', () => {
  expect(verifyToken('nope')).toBeNull();
  expect(verifyToken('v1.x')).toBeNull();
  expect(verifyToken(null)).toBeNull();
});
