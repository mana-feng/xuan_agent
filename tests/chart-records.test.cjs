const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-chart-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
const { useYunStore } = require('../src/store/yun.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');
const { buildBaziExportPayload } = require('../src/utils/baziExport.ts');
const { buildZiweiExportPayload } = require('../src/utils/ziweiExport.ts');
const { getPersistentItem, setPersistentItem } = require('../src/utils/persistentStorage.ts');
const first = { timeZone: 'Asia/Shanghai', realname: '甲', gender: 0, timestamp: Date.parse('1990-05-20T12:30:00+08:00'), recordId: 11 };
const second = { timeZone: 'Asia/Shanghai', realname: '乙', gender: 1, timestamp: Date.parse('1985-03-03T08:00:00+08:00'), recordId: 22 };
let platform;
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });
function chart(type, input) { useUserStore().set(input); (type === 'bazi' ? useBaziStore() : useZiweiStore()).pull(input); }
function reload() { platform = resetPlatform(platform.storage); setActivePinia(createPinia()); }
function record(type, input, id = 11) {
  return { id, type, title: input.realname, gender: String(input.gender), birthDatetime: String(input.timestamp), createdAt: '2026-01-01T00:00:00.000Z', rawPayload: { lite: true, user: input } };
}
function liuyao() {
  return executeLiuyaoChart({ title: '旧日起卦', gender: '女', date: new Date('1998-07-12T10:30:00+08:00'), params: [1, 0, 3, 4, 1, 0], methodLabel: '手工指定' });
}
test('Bazi export keeps chart name and gender after Ziwei updates the shared user', () => {
  chart('bazi', first); chart('ziwei', second);
  const result = buildBaziExportPayload(useUserStore(), useBaziStore(), useYunStore());
  assert.equal(result.basic.name, '甲'); assert.equal(result.basic.gender, '男'); assert.equal(result.basic.birthTimestamp, first.timestamp);
});
test('Ziwei export keeps chart name and gender after Bazi updates the shared user', () => {
  chart('ziwei', second); chart('bazi', first);
  const result = buildZiweiExportPayload(useUserStore(), useZiweiStore());
  assert.equal(result.profile.name, '乙'); assert.equal(result.profile.gender, '女'); assert.equal(result.profile.birthTimestamp, second.timestamp);
});
test('Bazi save uses displayed chart, preserves its ID and original save time on update', async () => {
  setPersistentItem('local_chart_records', [record('bazi', first)]);
  chart('bazi', first); const page = loadPage('pages/index/detail.nvue', ['saveToAccount']); chart('ziwei', second);
  await page.saveToAccount();
  const records = getPersistentItem('local_chart_records');
  assert.equal(records.length, 1); assert.equal(records[0].id, 11); assert.equal(records[0].title, '甲');
  assert.equal(records[0].createdAt, '2026-01-01T00:00:00.000Z');
});
test('Ziwei save uses displayed chart and original save time after another chart', async () => {
  setPersistentItem('local_ziwei_records', [record('ziwei', second, 22)]);
  chart('ziwei', second); const page = loadPage('pages/ziwei/result.nvue', ['saveToAccount']); chart('bazi', first);
  await page.saveToAccount(); const records = getPersistentItem('local_ziwei_records');
  assert.equal(records.length, 1); assert.equal(records[0].id, 22); assert.equal(records[0].title, '乙');
  assert.equal(records[0].createdAt, '2026-01-01T00:00:00.000Z');
});
for (const type of ['bazi', 'ziwei']) {
  const pagePath = type === 'bazi' ? 'pages/index/detail.nvue' : 'pages/ziwei/result.nvue';
  test(`${type} result survives reload and saves into the same local record`, async () => {
    chart(type, { ...first, recordId: null }); let page = loadPage(pagePath, ['saveToAccount']); await page.saveToAccount();
    const key = type === 'bazi' ? 'local_chart_records' : 'local_ziwei_records'; const id = getPersistentItem(key)[0].id;
    reload(); page = loadPage(pagePath, ['saveToAccount']); await page.saveToAccount();
    const store = type === 'bazi' ? useBaziStore() : useZiweiStore();
    assert.equal(store.input?.realname, '甲'); assert.equal(store.input?.recordId, id); assert.equal(getPersistentItem(key).length, 1);
  });
  test(`${type} edited form retains ID after repeated onShow and another module's profile`, () => {
    platform.storage.set(`edit_${type}_data`, JSON.stringify({ ...first, isEdit: true }));
    const submit = type === 'bazi' ? 'Sumbit' : 'Submit';
    const form = loadPage(type === 'bazi' ? 'pages/index/index.nvue' : 'pages/ziwei/index.nvue', [submit]);
    platform.hooks.load[0]({}); platform.hooks.show[0](); chart(type === 'bazi' ? 'ziwei' : 'bazi', second); platform.hooks.show[0]();
    form[submit]();
    assert.equal((type === 'bazi' ? useBaziStore() : useZiweiStore()).input?.recordId, 11);
  });
  test(`${type} history replays legacy numeric-string timestamps directly to a computed result`, () => {
    const page = loadPage('pages/history/list.nvue', ['openChart', 'formatBirth']);
    const saved = record(type, first);
    assert.match(page.formatBirth(saved), /1990/); page.openChart(saved); platform.flushTimers();
    assert.equal(platform.routes.at(-1), type === 'bazi' ? '/pages/index/detail' : '/pages/ziwei/result');
    const store = type === 'bazi' ? useBaziStore() : useZiweiStore();
    assert.equal(store.input?.recordId, 11); assert.equal(store.input?.timestamp, first.timestamp);
    assert.equal(store.input?.realname, '甲');
  });
}
test('Bazi edit routes to Bazi form and carries Bazi identity after Ziwei', () => {
  chart('bazi', first); const page = loadPage('pages/index/detail.nvue', ['editBazi']); chart('ziwei', second);
  page.editBazi(); platform.flushTimers(); assert.equal(platform.routes.at(-1), '/pages/index/index');
  assert.equal(JSON.parse(platform.storage.get('edit_bazi_data')).realname, '甲');
});
test('Liuyao save retains casting date, repeated save updates, reload/replay preserves all six lines', async () => {
  const initial = liuyao(); let page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao(); await page.saveLiuyao();
  let records = getPersistentItem('local_liuyao_records'); assert.equal(records.length, 1);
  assert.equal(records[0].rawPayload.options.date, new Date('1998-07-12T10:30:00+08:00').toISOString());
  const id = records[0].id; reload();
  const history = loadPage('pages/history/list.nvue', ['openChart']); history.openChart(records[0]); platform.flushTimers();
  assert.equal(platform.routes.at(-1), '/pages/liuyao/result');
  assert.deepEqual(useLiuyaoStore().compiled.params, [1, 0, 3, 4, 1, 0]); assert.equal(useLiuyaoStore().compiled.dayGz, initial.compiled.dayGz);
  assert.equal(useLiuyaoStore().profile.timeLabel, '1998-07-12 10:30'); assert.equal(useLiuyaoStore().recordId, id);
  page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']); await page.saveLiuyao();
  assert.equal(getPersistentItem('local_liuyao_records').length, 1);
});
test('deleting one chart leaves a different type with the same legacy ID visible and stored', async () => {
  setPersistentItem('local_chart_records', [record('bazi', first)]); setPersistentItem('local_ziwei_records', [record('ziwei', second)]);
  const page = loadPage('pages/history/list.nvue', ['fetchCharts', 'doRemove', 'charts']); await page.fetchCharts(); await page.doRemove(record('bazi', first));
  assert.equal(page.charts.value.length, 1); assert.equal(page.charts.value[0].type, 'ziwei'); assert.equal(getPersistentItem('local_ziwei_records').length, 1);
});
test('saving a new chart does not silently drop the oldest existing local record', async () => {
  setPersistentItem('local_chart_records', Array.from({ length: 200 }, (_, id) => record('bazi', first, id + 1)));
  chart('bazi', { ...second, recordId: null }); await loadPage('pages/index/detail.nvue', ['saveToAccount']).saveToAccount();
  assert.equal(getPersistentItem('local_chart_records').length, 201);
});
test('history reading expired legacy user records preserves and displays them', async () => {
  setPersistentItem('local_chart_records', [record('bazi', first)], -1);
  const original = platform.storage.get('local_chart_records');
  const page = loadPage('pages/history/list.nvue', ['fetchCharts', 'charts']); await page.fetchCharts();
  assert.equal(platform.storage.get('local_chart_records'), original);
  assert.equal(page.charts.value.length, 1);
});
test('a malformed local history cannot be silently erased by reading or a new save', async (t) => {
  t.mock.method(console, 'error', () => {}); // Expected malformed-storage diagnostic; assert the user-visible failure below.
  platform.storage.set('local_chart_records', 'broken storage payload');
  const page = loadPage('pages/history/list.nvue', ['fetchCharts', 'error']); await page.fetchCharts();
  assert.equal(platform.storage.get('local_chart_records'), 'broken storage payload');
  chart('bazi', { ...first, recordId: null });
  await loadPage('pages/index/detail.nvue', ['saveToAccount']).saveToAccount();
  assert.equal(platform.storage.get('local_chart_records'), 'broken storage payload');
  assert.ok(page.error.value);
});
test('Liuyao direct reload preserves its saved record ID and subsequent save updates', async () => {
  liuyao(); let page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']); await page.saveLiuyao();
  const id = getPersistentItem('local_liuyao_records')[0].id;
  reload(); page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']); await page.saveLiuyao();
  assert.equal(useLiuyaoStore().recordId, id); assert.equal(getPersistentItem('local_liuyao_records').length, 1);
});
for (const type of ['bazi', 'ziwei']) test(`${type} restores epoch and pre-1970 input and recalculates gender on show`, () => {
  const input = { ...first, timestamp: 0 };
  platform.storage.set(`${type}_last_context`, JSON.stringify(input));
  const result = type === 'bazi' ? 'pages/index/detail.nvue' : 'pages/ziwei/result.nvue';
  loadPage(result, []);
  const store = type === 'bazi' ? useBaziStore() : useZiweiStore();
  assert.equal(store.input.timestamp, 0);
  store.pull({ ...input, gender: 1, timestamp: Date.parse('1960-02-03T04:05:00+08:00') });
  platform.hooks.show[0]();
  assert.equal(type === 'bazi' ? store.table[0].data.day : store.astrolabe.gender, type === 'bazi' ? '元女' : '女');
  assert.equal(type === 'bazi' ? store.solar.year : Number(store.astrolabe.solarDate.slice(0, 4)), 1960);
});
test('birth with an empty pre-luck period selects a valid initial year instead of rejecting month calculation', async () => {
  chart('bazi', { ...first, gender: 1, timestamp: Date.parse('1960-02-03T04:05:00+08:00') });
  const yun = useYunStore();
  assert.ok(yun.year_list.length > 0);
  assert.ok(yun.month_list.length > 0);
  await assert.doesNotReject(yun.resolveLiuMonth());
});
test('a rejected local save reports failure without assigning a record ID or changing stored records', async () => {
  chart('bazi', { ...first, recordId: null });
  const page = loadPage('pages/index/detail.nvue', ['saveToAccount', 'saveError']);
  const originalSet = uni.setStorageSync;
  uni.setStorageSync = (key, value) => { if (key === 'local_chart_records') throw new Error('quota exceeded'); return originalSet(key, value); };
  await page.saveToAccount();
  assert.equal(useBaziStore().input.recordId, null);
  assert.equal(platform.storage.has('local_chart_records'), false);
  assert.match(page.saveError.value, /quota exceeded/);
  assert.equal(platform.toasts.at(-1).icon, 'none');
});
test('new charts saved in the same millisecond receive distinct IDs and never overwrite a previous chart', async (t) => {
  t.mock.method(Date, 'now', () => 1234567890000);
  const page = loadPage('pages/index/detail.nvue', ['saveToAccount']);
  chart('bazi', { ...first, recordId: null }); await page.saveToAccount();
  chart('bazi', { ...second, recordId: null }); await page.saveToAccount();
  const records = getPersistentItem('local_chart_records');
  assert.equal(records.length, 2); assert.equal(new Set(records.map(item => item.id)).size, 2);
  assert.deepEqual(records.map(item => item.title), ['乙', '甲']);
});
test('history recalculates Bazi and its Yun library objects instead of trusting mismatched serialized data', () => {
  chart('bazi', second);
  const saved = record('bazi', first);
  saved.rawPayload.bazi = { input: second, solar: { year: 1985 }, table: [{}] };
  loadPage('pages/history/list.nvue', ['openChart']).openChart(saved);
  assert.equal(useBaziStore().solar.year, 1990); assert.equal(useBaziStore().input.realname, '甲');
  assert.equal(useYunStore().original[0].getLunar().getSolar().getYear(), 1990);
});
