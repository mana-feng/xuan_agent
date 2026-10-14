const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');

const chosenDate = new Date(2022, 2, 3, 8, 0);
const chosenISO = chosenDate.toISOString();
const params = [1, 0, 3, 0, 1, 4];
const first = { realname: '甲', gender: 0, timestamp: new Date(2026, 9, 10, 12, 30).getTime(), recordId: 11 };
let platform;
beforeEach(() => {
  platform = resetPlatform(); setActivePinia(createPinia());
  useUserStore()._hasAccessToken = true;
  platform.storage.set('access_token', 'test-token');
});

function makeLiuyao(title = '测试起卦') {
  return executeLiuyaoChart({ title, gender: '男', date: chosenDate, params, methodLabel: '手工起卦' });
}
function runTimersNow(action) {
  const originalTimer = global.setTimeout;
  global.setTimeout = callback => { callback(); return 0; };
  try { return action(); } finally { global.setTimeout = originalTimer; }
}
function historyRows() {
  return {
    bazi: [{ id: 7, type: 'bazi', title: '甲', gender: '0', birthDatetime: new Date(first.timestamp).toISOString(), createdAt: '2026-10-10T01:00:00Z', rawPayload: { lite: true, user: first } }],
    ziwei: [{ id: 7, type: 'ziwei', title: '乙', gender: '1', birthDatetime: chosenISO, createdAt: '2026-10-10T02:00:00Z', rawPayload: { lite: true, module: 'ziwei', user: { realname: '乙', gender: 1, timestamp: chosenDate.getTime() } } }],
    liuyao: [{ id: 7, type: 'liuyao', title: '测试起卦', gender: '0', birthDatetime: chosenISO, createdAt: '2026-10-10T03:00:00Z', rawPayload: { lite: true, params, options: { title: '测试起卦', gender: '男', date: chosenISO }, profile: { title: '测试起卦', method: '手工起卦', gender: '男', timeLabel: '2022-03-03 08:00' }, ts: chosenDate.getTime() } }],
  };
}

test('saving a Liuyao result twice creates once then updates its own returned ID', async () => {
  makeLiuyao(); const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao(); await page.saveLiuyao();
  assert.deepEqual(platform.requests.map(request => request.method), ['POST', 'PUT']);
  assert.equal(platform.requests[1].url, '/api/liuyao/91');
  assert.equal(useLiuyaoStore().recordId, 91);
  assert.equal(platform.storage.get('liuyao_last_result').recordId, 91);
});

test('saving Liuyao preserves the chosen casting time instead of when the page was generated', async () => {
  makeLiuyao(); const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao();
  const request = platform.requests[0];
  assert.equal(request.data.birthDatetime, chosenISO);
  assert.equal(request.data.rawPayload.options.date, chosenISO);
  assert.equal(request.data.rawPayload.ts, chosenDate.getTime());
});

test('a cached Liuyao result retains its casting time and saved identity after reload', async () => {
  makeLiuyao(); const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao();
  platform.storage.set('liuyao_last_result', JSON.parse(JSON.stringify(platform.storage.get('liuyao_last_result'))));
  setActivePinia(createPinia());
  useUserStore()._hasAccessToken = true;
  useLiuyaoStore().restoreLastResult();
  const restoredPage = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await restoredPage.saveLiuyao();
  assert.equal(platform.requests[1].url, '/api/liuyao/91');
  assert.equal(platform.requests[1].method, 'PUT');
  assert.equal(platform.requests[1].data.birthDatetime, chosenISO);
});

test('concurrent Liuyao save clicks create only one record', async () => {
  makeLiuyao(); const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await Promise.all([page.saveLiuyao(), page.saveLiuyao()]);
  assert.equal(platform.requests.length, 1);
  assert.equal(useLiuyaoStore().recordId, 91);
});

test('a rejected Liuyao save is not reported as successful or assigned a record ID', async t => {
  t.mock.method(console, 'error', () => {});
  makeLiuyao();
  platform.respond = async () => ({ success: false, error: '保存失败' });
  const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao();
  assert.equal(useLiuyaoStore().recordId ?? null, null);
  assert.equal(platform.toasts.some(item => item.icon === 'success'), false);
});

test('legacy Liuyao local cache restores the chosen profile time without inventing a saved ID', async () => {
  makeLiuyao();
  const cached = JSON.parse(JSON.stringify(platform.storage.get('liuyao_last_result')));
  delete cached.castingAt;
  delete cached.recordId;
  platform.storage.set('liuyao_last_result', cached);
  setActivePinia(createPinia());
  useUserStore()._hasAccessToken = true;
  useLiuyaoStore().restoreLastResult();
  const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao();
  assert.equal(platform.requests[0].method, 'POST');
  assert.equal(platform.requests[0].data.birthDatetime, chosenISO);
});

test('generating a new Liuyao chart after a saved chart creates a fresh record', async () => {
  makeLiuyao('已保存');
  const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao();
  makeLiuyao('新起卦');
  assert.equal(useLiuyaoStore().recordId, null);
  assert.equal(platform.storage.get('liuyao_last_result').recordId, null);
  await page.saveLiuyao();
  assert.equal(platform.requests[1].method, 'POST');
  assert.equal(platform.requests[1].data.name, '新起卦');
});

test('a late Liuyao save response cannot give its record ID to a newly generated result', async () => {
  makeLiuyao('旧盘'); const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  const pending = page.saveLiuyao();
  makeLiuyao('新盘'); await pending;
  assert.equal(useLiuyaoStore().recordId ?? null, null);
  await page.saveLiuyao();
  assert.equal(platform.requests[1].method, 'POST');
  assert.equal(platform.requests[1].data.name, '新盘');
});

test('history loads all three types with equal numeric IDs and sorts across types', async () => {
  const rows = historyRows();
  platform.respond = async url => {
    const type = new URL(url, 'http://test.local').searchParams.get('type') || 'bazi';
    return { success: true, data: { list: rows[type], total: 1, hasMore: false } };
  };
  const page = loadPage('pages/history/list.nvue', ['fetchCharts', 'charts', 'totalCount']);
  await page.fetchCharts();
  assert.equal(page.charts.value.length, 3);
  assert.equal(page.totalCount.value, 3);
  assert.deepEqual(page.charts.value.map(item => item.type), ['liuyao', 'ziwei', 'bazi']);
  assert.deepEqual(page.charts.value.map(item => item.id), [7, 7, 7]);
});

test('history type selection fetches the selected existing endpoint and starts at page one', async () => {
  const rows = historyRows();
  platform.respond = async url => {
    const type = new URL(url, 'http://test.local').searchParams.get('type');
    return { success: true, data: { list: rows[type], total: 1, hasMore: false } };
  };
  const page = loadPage('pages/history/list.nvue', ['selectType', 'typeFilter', 'currentPage', 'charts']);
  page.currentPage.value = 4;
  await page.selectType('ziwei');
  assert.equal(page.typeFilter.value, 'ziwei');
  assert.equal(page.currentPage.value, 1);
  assert.equal(platform.requests.length, 1);
  assert.equal(new URL(platform.requests[0].url, 'http://test.local').searchParams.get('type'), 'ziwei');
  assert.deepEqual(page.charts.value.map(item => item.type), ['ziwei']);
});

test('history paginates the full sorted response without losing records or requesting unsupported pagination', async () => {
  platform.respond = async url => {
    const type = new URL(url, 'http://test.local').searchParams.get('type');
    const list = type === 'bazi' ? Array.from({ length: 14 }, (_, index) => ({ ...historyRows().bazi[0], id: index + 1, createdAt: new Date(2026, 0, index + 1).toISOString() })) : [];
    return { success: true, data: { list, total: list.length, hasMore: false } };
  };
  const page = loadPage('pages/history/list.nvue', ['fetchCharts', 'visibleCharts', 'currentPage', 'totalPages', 'totalCount', 'changePage']);
  await page.fetchCharts();
  assert.equal(page.totalCount.value, 14);
  assert.equal(page.totalPages.value, 2);
  assert.equal(page.visibleCharts.value.length, 12);
  page.changePage(2);
  assert.deepEqual(page.visibleCharts.value.map(item => item.id), [2, 1]);
  page.changePage(99);
  assert.equal(page.currentPage.value, 2);
  assert.equal(platform.requests.some(item => /[?&](page|pageSize|offset)=/.test(item.url)), false);
});

test('history ignores an older request that finishes after a changed type filter', async () => {
  let releaseFirst;
  const pendingFirst = new Promise(resolve => { releaseFirst = resolve; });
  platform.respond = async url => {
    const type = new URL(url, 'http://test.local').searchParams.get('type');
    if (type === 'bazi') await pendingFirst;
    return { success: true, data: { list: historyRows()[type], hasMore: false } };
  };
  const page = loadPage('pages/history/list.nvue', ['fetchCharts', 'selectType', 'charts']);
  const firstRequest = page.fetchCharts();
  await page.selectType('ziwei');
  releaseFirst();
  await firstRequest;
  assert.deepEqual(page.charts.value.map(item => item.type), ['ziwei']);
});

test('opening a saved Ziwei record restores Ziwei and leaves the current Bazi input unchanged', () => {
  useBaziStore().pull(first);
  const page = loadPage('pages/history/list.nvue', ['openChart']);
  runTimersNow(() => page.openChart(historyRows().ziwei[0]));
  assert.equal(platform.routes.at(-1), '/pages/ziwei/result');
  assert.equal(useZiweiStore().input.realname, '乙');
  assert.equal(useZiweiStore().input.recordId, 7);
  assert.equal(useZiweiStore().input.timestamp, chosenDate.getTime());
  assert.equal(useBaziStore().input.realname, '甲');
  assert.equal(useBaziStore().input.recordId, 11);
});

test('opening a saved Liuyao record recomputes the saved parameters and keeps its record identity', () => {
  useBaziStore().pull(first);
  const page = loadPage('pages/history/list.nvue', ['openChart']);
  runTimersNow(() => page.openChart(historyRows().liuyao[0]));
  assert.equal(platform.routes.at(-1), '/pages/liuyao/result');
  assert.deepEqual(useLiuyaoStore().compiled.params, [1, 0, 3, 0, 1, 4]);
  assert.equal(useLiuyaoStore().profile.title, '测试起卦');
  assert.equal(useLiuyaoStore().profile.timeLabel, '2022-03-03 08:00');
  assert.equal(useLiuyaoStore().recordId, 7);
  assert.equal(useBaziStore().input.realname, '甲');
});

test('a saved Liuyao record saves back to the same typed record after being reopened', async () => {
  const history = loadPage('pages/history/list.nvue', ['openChart']);
  runTimersNow(() => history.openChart(historyRows().liuyao[0]));
  const page = loadPage('pages/liuyao/result.nvue', ['saveLiuyao']);
  await page.saveLiuyao();
  assert.equal(platform.requests[0].url, '/api/liuyao/7');
  assert.equal(platform.requests[0].method, 'PUT');
  assert.equal(platform.requests[0].data.birthDatetime, chosenISO);
});

test('opening Bazi lite history recomputes it without changing the current Ziwei input', () => {
  useZiweiStore().pull({ ...first, realname: '当前紫微' });
  const page = loadPage('pages/history/list.nvue', ['openChart']);
  runTimersNow(() => page.openChart(historyRows().bazi[0]));
  assert.equal(platform.routes.at(-1), '/pages/index/detail');
  assert.equal(useBaziStore().input.recordId, 7);
  assert.equal(useBaziStore().input.timestamp, first.timestamp);
  assert.equal(useZiweiStore().input.realname, '当前紫微');
});

test('malformed Liuyao history is rejected without overwriting the current result', () => {
  makeLiuyao('当前盘');
  const page = loadPage('pages/history/list.nvue', ['openChart']);
  const row = historyRows().liuyao[0];
  row.rawPayload.params = [1, 0];
  runTimersNow(() => page.openChart(row));
  assert.equal(platform.routes.length, 0);
  assert.equal(useLiuyaoStore().profile.title, '当前盘');
  assert.equal(platform.toasts.at(-1).icon, 'none');
});

test('deleting a Ziwei record sends its type and preserves same-ID records of other types', async () => {
  const rows = historyRows();
  const page = loadPage('pages/history/list.nvue', ['doRemove', 'charts']);
  page.charts.value = [...rows.bazi, ...rows.ziwei, ...rows.liuyao];
  await page.doRemove(rows.ziwei[0]);
  assert.equal(platform.requests[0].url, '/api/charts/7?type=ziwei');
  assert.deepEqual(page.charts.value.map(item => item.type), ['bazi', 'liuyao']);
});

for (const [type, useStore, pagePath] of [
  ['bazi', useBaziStore, 'pages/index/detail.nvue'],
  ['ziwei', useZiweiStore, 'pages/ziwei/result.nvue'],
]) {
  for (const [failure, error] of [
    ['network error', { success: false, error: 'request:fail timeout' }],
    ['HTTP 500', { success: false, error: '服务器错误', code: 'SERVER_ERROR' }],
  ]) {
    test(`${type}: retrying a failed PUT after ${failure} keeps the saved ID and updates again`, async () => {
      const store = useStore();
      store.pull(first);
      const page = loadPage(pagePath, ['saveToAccount']);
      platform.respond = async () => { throw error; };
      await page.saveToAccount();
      await new Promise(setImmediate);
      // Async computed work from older unmounted page fixtures can switch Pinia's
      // global active instance; inspect the store actually captured by this page.
      assert.equal(store.input.recordId, 11);
      assert.equal(JSON.parse(platform.storage.get(`${type}_last_context`)).recordId, 11);
      platform.respond = async () => ({ success: true, data: { id: 11, updated: true } });
      await page.saveToAccount();
      await new Promise(setImmediate);
      assert.deepEqual(platform.requests.map(request => request.method), ['PUT', 'PUT']);
      assert.equal(platform.requests[1].url, `/api/${type}/11`);
    });
  }

  test(`${type}: HTTP 404 clears only the missing record ID so the next save can create it`, async () => {
    const store = useStore();
    store.pull(first);
    const page = loadPage(pagePath, ['saveToAccount']);
    platform.respond = async () => { throw { success: false, error: '记录不存在或无权访问', code: 'NOT_FOUND' }; };
    await page.saveToAccount();
    await new Promise(setImmediate);
    assert.equal(store.input.recordId, null);
    assert.equal(JSON.parse(platform.storage.get(`${type}_last_context`)).recordId, null);
    platform.respond = async () => ({ success: true, data: { id: 91, updated: false } });
    await page.saveToAccount();
    await new Promise(setImmediate);
    assert.deepEqual(platform.requests.map(request => request.method), ['PUT', 'POST']);
    assert.equal(store.input.recordId, 91);
  });

  test(`${type}: a late HTTP 404 cannot clear a new chart's record ID`, async () => {
    const store = useStore();
    store.pull(first);
    const page = loadPage(pagePath, ['saveToAccount']);
    platform.respond = async () => { throw { success: false, error: '记录不存在或无权访问', code: 'NOT_FOUND' }; };
    const pendingSave = page.saveToAccount();
    store.pull({ ...first, realname: '新盘', recordId: 22 });
    await pendingSave;
    await new Promise(setImmediate);
    assert.equal(store.input.recordId, 22);
    assert.equal(JSON.parse(platform.storage.get(`${type}_last_context`)).recordId, 22);
  });
}
