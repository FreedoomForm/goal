jest.mock('../server/db/pg', () => {
  const store = { settings: new Map(), api_keys: [] };
  return {
    queryOne: jest.fn(sql => {
      if (String(sql).includes("settings WHERE key='server_secret'")) {
        return Promise.resolve(store.settings.has('server_secret') ? { value: store.settings.get('server_secret') } : null);
      }
      if (String(sql).includes('api_keys')) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    }),
    queryAll: jest.fn(() => Promise.resolve([])),
    runSQL: jest.fn((sql, params) => {
      if (String(sql).includes('settings')) {
        store.settings.set(params[0], params[1]);
      }
      return Promise.resolve({ lastInsertRowid: 1 });
    }),
    nowISO: () => '2026-01-01 00:00:00',
  };
});

const { signToken, verifyToken } = require('../server/auth');
const { stopCleanup } = require('../server/middleware/security');

afterAll(() => {
  stopCleanup();
});

test('signs and verifies a token', async () => {
  const t = await signToken({ sub: 'u1', scopes: ['read'] }, 60);
  const p = await verifyToken(t);
  expect(p).not.toBeNull();
  expect(p.sub).toBe('u1');
  expect(p.scopes).toEqual(['read']);
});

test('rejects tampered token', async () => {
  const t = await signToken({ sub: 'u1' }, 60);
  const parts = t.split('.');
  parts[1] = parts[1].slice(0, -1) + (parts[1].slice(-1) === 'A' ? 'B' : 'A');
  expect(await verifyToken(parts.join('.'))).toBeNull();
});

test('rejects expired token', async () => {
  const t = await signToken({ sub: 'u1' }, -10);
  expect(await verifyToken(t)).toBeNull();
});

test('rejects malformed tokens', async () => {
  expect(await verifyToken('nope')).toBeNull();
  expect(await verifyToken('v1.x')).toBeNull();
  expect(await verifyToken(null)).toBeNull();
});
