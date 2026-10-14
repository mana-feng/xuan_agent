const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useQimenStore } = require('../src/store/qimen.ts');
const { useUserStore } = require('../src/store/user.ts');
const { openSavedChart } = require('../src/features/history/savedCharts.ts');
const { sanitizeRequestData } = require('../src/utils/api-signature.ts');

// Run the actual backend route without a server, database, or model connection.
function backend() {
  const routes = [], rows = [], queries = [];
  const router = Object.fromEntries(['post', 'get', 'put', 'delete'].map(method => [method, (route, ...handlers) => routes.push({ method, route, handle: handlers.at(-1) })]));
  const db = {
    async run(sql, args) {
      queries.push({ sql, args });
      if (sql.startsWith('INSERT')) {
        const [user_id, name, gender, birthDatetime, calendarType, rawPayload] = args;
        rows.push({ id: rows.length + 1, user_id, name, gender, birthDatetime, calendarType, rawPayload });
        return { lastID: rows.length, changes: 1 };
      }
      throw new Error(`Unexpected write: ${sql}`);
    },
    async get(sql, args) { queries.push({ sql, args }); return rows.find(row => row.id === Number(args[0]) && row.user_id === args[1]); },
  };
  const root = path.resolve(__dirname, '../../backend-docker');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(root, 'routes/qimen.js'), 'utf8'))(request => {
    if (request === 'express') return { Router: () => router };
    if (request === '../db') return { getDatabase: () => db };
    if (request === '../middleware/auth') return { authMiddleware() {} };
    if (request === '../middleware/api-signature') return { apiSignatureMiddleware: () => () => {} };
    return require(path.resolve(root, 'routes', request));
  }, module, module.exports);
  return {
    rows, queries,
    async invoke(method, route, body = {}, params = {}) {
      let status = 200, result;
      await routes.find(item => item.method === method && item.route === route).handle({ user: { id: 41 }, body, params, query: {} }, { status(code) { status = code; return this; }, json(value) { result = JSON.parse(JSON.stringify(value)); return this; } });
      return { status, result };
    },
  };
}

for (const [choice, expectedInstant] of [['earlier', '2026-11-01T05:30:00Z'], ['later', '2026-11-01T06:30:00Z']]) {
  test(`Qimen ${choice} DST occurrence survives real form → API route → history restoration`, async () => {
    const platform = resetPlatform(); setActivePinia(createPinia());
    useUserStore()._hasAccessToken = true; platform.storage.set('access_token', 'isolated-test');
    const form = loadPage('pages/qimen/index.nvue', ['submit', 'civil', 'question', 'timeZone', 'timeMode', 'disambiguation']);
    form.civil.value = '2026-11-01T01:30'; form.question.value = '重复时刻存档'; form.timeZone.value = 'America/New_York'; form.timeMode.value = 'custom'; form.disambiguation.value = choice; form.submit();
    const qimen = useQimenStore();
    assert.equal(qimen.input.timestamp, Date.parse(expectedInstant));
    const palaces = JSON.parse(JSON.stringify(qimen.chart.tianPan));
    const api = backend();
    platform.respond = async (url, options) => {
      assert.equal(url, '/api/qimen');
      const response = await api.invoke('post', '/', sanitizeRequestData(options.data));
      assert.equal(response.status, 200);
      return response.result;
    };
    await loadPage('pages/qimen/result.nvue', ['saveToAccount']).saveToAccount();
    assert.equal(qimen.input.recordId, 1);
    assert.equal(api.rows.length, 1);
    assert.equal(api.rows[0].user_id, 41);
    assert.equal(api.rows[0].birthDatetime, new Date(expectedInstant).toISOString());
    const detail = await api.invoke('get', '/:id', {}, { id: '1' });
    assert.equal(detail.status, 200);
    setActivePinia(createPinia());
    openSavedChart(detail.result);
    const restored = useQimenStore();
    assert.equal(restored.input.timestamp, Date.parse(expectedInstant));
    assert.equal(restored.input.timeZone, 'America/New_York');
    assert.equal(restored.input.recordId, 1);
    assert.equal(restored.chart.metadata.inputCivil, '2026-11-01 01:30:00');
    assert.equal(restored.chart.metadata.calculationCivil, choice === 'earlier' ? '2026-11-01 13:30:00' : '2026-11-01 14:30:00');
    assert.deepEqual(JSON.parse(JSON.stringify(restored.chart.tianPan)), palaces);
    assert.equal(platform.routes.at(-1), '/pages/qimen/result');
  });
}

test('quarter-hour zone crosses UTC year boundary and backend rejects a mismatched instant', async () => {
  resetPlatform(); setActivePinia(createPinia());
  const form = loadPage('pages/qimen/index.nvue', ['submit', 'civil', 'question', 'timeZone', 'timeMode']);
  form.civil.value = '2026-01-01T00:15'; form.question.value = '时区边界'; form.timeZone.value = 'Asia/Kathmandu'; form.timeMode.value = 'custom'; form.submit();
  const qimen = useQimenStore();
  assert.equal(qimen.input.timestamp, Date.parse('2025-12-31T18:30:00Z'));
  assert.equal(qimen.chart.metadata.inputCivil, '2026-01-01 00:15:00');
  assert.equal(qimen.chart.metadata.calculationCivil, '2026-01-01 02:30:00');
  const payload = require('../src/utils/qimenExport.ts').buildQimenExportPayload(qimen);
  const body = { name: qimen.input.question, gender: null, birthDatetime: qimen.input.timestamp, calendarType: 'solar', rawPayload: { module: 'qimen', version: 1, input: payload.input, snapshot: payload.chart } };
  const api = backend();
  assert.equal((await api.invoke('post', '/', sanitizeRequestData({ ...body, birthDatetime: body.birthDatetime + 3600000 }))).status, 400);
  assert.equal(api.queries.length, 0, 'inconsistent input never reaches storage');
  assert.equal((await api.invoke('post', '/', sanitizeRequestData(body))).status, 200);
  assert.equal(JSON.parse(api.rows[0].rawPayload).input.timeZone, 'Asia/Kathmandu');
});
