// Test the pure graph-execution logic (no DB/HTTP).
// We temporarily stub DB/connectors via jest.mock.

jest.mock('../server/db', () => ({
  queryOne: jest.fn(),
  queryAll: jest.fn(() => []),
  runSQL: jest.fn(() => ({ lastInsertRowid: 1 })),
  nowISO: () => '2026-01-01T00:00:00Z',
}));

jest.mock('../server/connectors', () => ({
  createConnector: () => ({
    testConnection: async () => ({ status: 'online' }),
    fetchData: async () => ({ rows: [{ a: 1 }] }),
    chat: async () => ({ provider: 'mock', model: 'm', content: 'hello' }),
  }),
}));

jest.mock('../server/mcp/client', () => ({
  registry: { get: () => null, list: () => [] },
}));

const engine = require('../server/workflow/engine');
const db = require('../server/db');

beforeEach(() => jest.clearAllMocks());

test('catalog returns groups with items', () => {
  const cat = engine.nodeCatalog();
  expect(Array.isArray(cat)).toBe(true);
  expect(cat.length).toBeGreaterThan(0);
  const types = cat.flatMap(g => g.items.map(i => i.type));
  expect(types).toEqual(expect.arrayContaining(['trigger.manual', 'ai.ask', 'mcp.call', 'data.transform']));
});

test('executeGraph runs topological order', async () => {
  db.queryOne.mockImplementation(sql => {
    if (String(sql).includes("type='ollama'")) return { id: 1, type: 'ollama', base_url: '', auth_payload: '{}', config: '{}' };
    return { id: 1, name: 'test', type: 'ollama' };
  });
  const graph = {
    nodes: [
      { id: 'a', type: 'trigger.manual', params: {} },
      { id: 'b', type: 'data.transform', params: { expression: '42' } },
      { id: 'c', type: 'data.transform', params: { expression: '$input + 1' } },
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  };
  const { trace, results } = await engine.executeGraph(graph);
  expect(trace).toHaveLength(3);
  expect(trace[0].id).toBe('a');
  expect(trace[2].id).toBe('c');
  expect(results.c).toBe(43);
});

test('filter node skips downstream', async () => {
  const graph = {
    nodes: [
      { id: 'a', type: 'trigger.manual', params: {} },
      { id: 'f', type: 'data.filter', params: { expression: 'false' } },
      { id: 'b', type: 'data.transform', params: { expression: '1' } },
    ],
    edges: [{ from: 'a', to: 'f' }, { from: 'f', to: 'b' }],
  };
  const { trace } = await engine.executeGraph(graph);
  const bTrace = trace.find(t => t.id === 'b');
  expect(bTrace.status).toBe('skipped');
});

test('ai.ask uses injected connector', async () => {
  db.queryOne.mockReturnValue({ id: 1, type: 'ollama', base_url: '', auth_payload: '{}', config: '{}' });
  const graph = {
    nodes: [
      { id: 'a', type: 'trigger.manual', params: {} },
      { id: 'ai', type: 'ai.ask', params: { prompt_template: 'hi', system: 's' } },
    ],
    edges: [{ from: 'a', to: 'ai' }],
  };
  const { results } = await engine.executeGraph(graph);
  expect(results.ai.content).toBe('hello');
});
