const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
const { openSavedChart } = require('../src/features/history/savedCharts.ts');

const timestamp = Date.parse('2026-10-13T10:25:00+08:00');
const input = { question: '这次合作如何推进？', timestamp, timeZone: 'Asia/Shanghai', ruleVersion: 'qimen-chai-bu-v1', recordId: null };
const row = () => ({
  id: 17, type: 'qimen', title: '新的合作标题', birthDatetime: new Date(timestamp).toISOString(),
  createdAt: '2026-10-13T02:30:00Z',
  rawPayload: { module: 'qimen', version: 1, input: { ...input, question: '旧问题', timestamp: timestamp - 3600000 }, snapshot: { invalid: 'must recompute' } },
});
let platform;
beforeEach(() => {
  platform = resetPlatform();
  setActivePinia(createPinia());
  useUserStore()._hasAccessToken = true;
  platform.storage.set('access_token', 'test-token');
});

test('all-history and recent explorations request Qimen and retain same-ID records across types', async () => {
  platform.respond = async url => {
    const type = new URL(url, 'http://test.local').searchParams.get('type');
    return { success: true, data: { list: [type === 'qimen' ? row() : { ...row(), type, createdAt: '2026-10-12T00:00:00Z' }] } };
  };
  const history = loadPage('pages/history/list.nvue', ['fetchCharts', 'charts', 'formatBirth', 'doRemove']);
  await history.fetchCharts();
  assert.deepEqual(platform.requests.map(request => new URL(request.url, 'http://test.local').searchParams.get('type')), ['bazi', 'ziwei', 'liuyao', 'qimen']);
  assert.equal(history.charts.value.length, 4);
  assert.equal(history.charts.value[0].type, 'qimen');
  assert.equal(history.formatBirth(row()), '北京时间：2026-10-13 10:25');
  await history.doRemove(row());
  assert.equal(platform.requests.at(-1).url, '/api/charts/17?type=qimen');
  assert.deepEqual(history.charts.value.map(item => item.type).sort(), ['bazi', 'liuyao', 'ziwei']);
  const recent = loadPage('components/history/RecentExplorations.vue', ['refreshRecords', 'records']);
  await recent.refreshRecords();
  assert.equal(recent.records.value[0].type, 'qimen');
  assert.equal(recent.records.value.length, 3);
});

test('selecting Qimen clears a previous gender constraint before fetching its records', async () => {
  platform.respond = async () => ({ success: true, data: { list: [row()] } });
  const page = loadPage('pages/history/list.nvue', ['selectType', 'genderFilter', 'charts']);
  page.genderFilter.value = '1';
  await page.selectType('qimen');
  assert.equal(page.genderFilter.value, '');
  const request = new URL(platform.requests.at(-1).url, 'http://test.local');
  assert.equal(request.searchParams.get('type'), 'qimen');
  assert.equal(request.searchParams.has('gender'), false);
  assert.equal(page.charts.value[0].type, 'qimen');
  page.genderFilter.value = '0';
  await page.selectType('all');
  assert.equal(page.genderFilter.value, '0', 'mixed-type history keeps its existing gender filter');
});

test('Qimen history and recent summaries use fixed Beijing time across device zones and Shanghai DST', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const { resetPlatform, loadPage } = require('./tests/helpers/load-source.cjs');
    const { createPinia, setActivePinia } = require('pinia');
    resetPlatform(); setActivePinia(createPinia());
    const history = loadPage('pages/history/list.nvue', ['formatBirth']);
    const recent = loadPage('components/history/RecentExplorations.vue', ['birthLabel']);
    const records = ['1991-06-15T16:05:00Z', '2026-10-12T16:05:00Z'].map(birthDatetime => ({ type: 'qimen', birthDatetime }));
    process.stdout.write(JSON.stringify(records.map(record => [history.formatBirth(record), recent.birthLabel(record)])));
  `;
  for (const TZ of ['UTC', 'America/New_York', 'Asia/Shanghai']) {
    const output = spawnSync(process.execPath, ['-e', script], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(output.status, 0, output.stderr);
    assert.deepEqual(JSON.parse(output.stdout), [
      ['北京时间：1991-06-16 00:05', '北京时间：1991-06-16 00:05'],
      ['北京时间：2026-10-13 00:05', '北京时间：2026-10-13 00:05'],
    ], TZ);
  }
});

test('Qimen history recomputes the recorded input and keeps other chart stores untouched', () => {
  useBaziStore().pull({ realname: '当前八字', timestamp, gender: 0, recordId: 4 });
  openSavedChart(row());
  assert.equal(platform.routes.at(-1), '/pages/qimen/result');
  const { useQimenStore } = require('../src/store/qimen.ts');
  const store = useQimenStore();
  assert.equal(store.input.question, '新的合作标题');
  assert.equal(store.input.timestamp, timestamp);
  assert.equal(store.input.timeZone, 'Asia/Shanghai');
  assert.equal(store.input.ruleVersion, 'qimen-chai-bu-v1');
  assert.equal(store.input.recordId, 17);
  assert.equal(store.chart.metadata.timestamp, timestamp);
  assert.ok(store.chart.diPan[1]);
  assert.equal(store.chart.invalid, undefined, 'the saved snapshot is never treated as a fresh calculation');
  assert.equal(useBaziStore().input.realname, '当前八字');
  assert.equal(useZiweiStore().input.timestamp, null);
});

test('invalid Qimen history is rejected without navigating or replacing an active chart', () => {
  const { useQimenStore } = require('../src/store/qimen.ts');
  const store = useQimenStore();
  store.pull(input);
  const previousChart = store.chart;
  const invalid = row();
  invalid.birthDatetime = 'invalid';
  openSavedChart(invalid);
  assert.equal(platform.routes.length, 0);
  assert.match(platform.toasts.at(-1).title, /起局时间/);
  assert.equal(store.chart, previousChart);
  assert.equal(store.input.question, input.question);
});

test('Qimen account save, history reopen and update retain the chart, time zone and record identity', async () => {
  const { useQimenStore } = require('../src/store/qimen.ts');
  useQimenStore().pull({ ...input, timeZone: 'America/New_York' });
  const page = loadPage('pages/qimen/result.nvue', ['saveToAccount']);
  await page.saveToAccount();
  const saved = platform.requests.at(-1);
  assert.equal(saved.url, '/api/qimen');
  assert.equal(saved.method, 'POST');
  assert.equal(new Date(saved.data.birthDatetime).getTime(), timestamp);
  const raw = JSON.parse(JSON.stringify(saved.data.rawPayload));
  assert.equal(raw.input.timeZone, 'America/New_York');
  assert.equal(raw.module, 'qimen');
  assert.equal(raw.version, 1);
  setActivePinia(createPinia());
  useUserStore()._hasAccessToken = true;
  const history = loadPage('pages/history/list.nvue', ['openChart']);
  history.openChart({ ...row(), id: 91, title: saved.data.name, birthDatetime: new Date(saved.data.birthDatetime).toISOString(), rawPayload: raw });
  assert.equal(platform.routes.at(-1), '/pages/qimen/result');
  const restored = useQimenStore();
  assert.equal(restored.input.question, input.question);
  assert.equal(restored.input.timeZone, 'America/New_York');
  assert.equal(restored.input.recordId, 91);
  assert.equal(restored.input.timestamp, timestamp);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.chart)), raw.snapshot);
  const reopened = loadPage('pages/qimen/result.nvue', ['saveToAccount']);
  await reopened.saveToAccount();
  assert.equal(platform.requests.at(-1).method, 'PUT');
  assert.equal(platform.requests.at(-1).url, '/api/qimen/91');
  assert.equal(platform.requests.at(-1).data.rawPayload.input.recordId, 91);
});

test('direct Qimen chat restores its cache and puts real chart data in every request', () => {
  platform.storage.set('qimen_last_context', JSON.stringify({ ...input, recordId: 17 }));
  const page = loadPage('pages/chat/index.nvue', ['buildMessages', 'contextCaption', 'shouldDisableRestore']);
  platform.hooks.load.at(-1)({ from: 'qimen' });
  const first = page.buildMessages('请分析这次合作');
  assert.equal(first[0].role, 'system');
  assert.match(first[0].content, /User Qimen/);
  assert.match(first[0].content, /这次合作如何推进/);
  assert.match(first[0].content, /qimen-chai-bu-v1/);
  assert.match(first[0].content, /diPan/);
  assert.match(first[0].content, /tianPan/);
  assert.match(first[0].content, /baMen/);
  assert.match(first[0].content, /jiuXing/);
  assert.match(first[0].content, /baShen/);
  assert.equal(first.filter(message => message.role === 'system').length, 1);
  const next = page.buildMessages('再谈一谈时机');
  assert.equal(next[0].content, first[0].content);
  assert.match(page.contextCaption.value, /已关联奇门/);
  assert.equal(page.shouldDisableRestore.value, true);
  assert.equal(useBaziStore().input.timestamp, null);
  assert.equal(useZiweiStore().input.timestamp, null);
});

test('a Qimen chat with no saved input does not invent a context or show an associated chart', () => {
  const page = loadPage('pages/chat/index.nvue', ['buildMessages', 'contextCaption']);
  platform.hooks.load.at(-1)({ from: 'qimen' });
  assert.deepEqual(page.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
  assert.doesNotMatch(page.contextCaption.value, /已关联/);
});

test('Qimen chat keeps the active chart when local cache contains an older input', () => {
  const { useQimenStore } = require('../src/store/qimen.ts');
  const store = useQimenStore();
  store.pull({ ...input, question: '当前正在看的盘', recordId: 28 });
  const activeChart = store.chart;
  platform.storage.set('qimen_last_context', JSON.stringify(input));
  const page = loadPage('pages/chat/index.nvue', ['buildMessages']);
  platform.hooks.load.at(-1)({ from: 'qimen' });
  assert.match(page.buildMessages('当前问题是什么？')[0].content, /当前正在看的盘/);
  assert.equal(store.chart, activeChart);
  assert.equal(store.input.recordId, 28);
});
