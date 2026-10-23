const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetPlatform, loadPage } = require('./helpers/load-chart-source.cjs');
const { request } = require('../src/services/localRecords.ts');
const { readChartRecords, saveChartRecord } = require('../src/utils/localChartRecords.ts');
let platform;
beforeEach(() => { platform = resetPlatform(); });

test('four chart types save, update and delete locally without network requests', async () => {
  for (const type of ['bazi', 'ziwei', 'liuyao', 'qimen']) {
    const timestamp = Date.parse('2026-10-16T08:00:00Z');
    const created = await request(`/records/${type}`, { method: 'POST', data: {
      name: '本地测试盘', birthDatetime: timestamp, gender: type === 'qimen' ? null : '0', rawPayload: { user: { timestamp } },
    } });
    const id = created.data.id;
    assert.ok(id > 0);
    const updated = await request(`/records/${type}/${id}`, { method: 'PUT', data: { name: '更新后的盘', birthDatetime: timestamp } });
    assert.equal(updated.data.id, id);
    assert.equal(readChartRecords(type).length, 1);
    const listed = await request(`/records/charts?type=${type}&keyword=${encodeURIComponent('更新后')}`, { method: 'GET' });
    assert.equal(listed.data.list[0].title, '更新后的盘');
    assert.equal(listed.data.list[0].birthDatetime, new Date(timestamp).toISOString());
    await request(`/records/charts/${id}?type=${type}`, { method: 'DELETE' });
    assert.deepEqual(readChartRecords(type), []);
  }
});

test('old frontend record IDs and payloads remain available and missing updates cannot erase records', async () => {
  saveChartRecord('bazi', { id: 123, title: '旧盘', birthDatetime: '1998-08-12T01:00:00.000Z', rawPayload: { user: { timestamp: 902883600000 } }, createdAt: '2026-10-10T00:00:00Z' });
  const list = await request('/records/charts?type=bazi', { method: 'GET' });
  assert.equal(list.data.list[0].id, 123);
  await assert.rejects(request('/records/bazi/999', { method: 'PUT', data: { name: '不存在' } }), error => error.code === 'NOT_FOUND');
  assert.equal(readChartRecords('bazi')[0].title, '旧盘');
});

test('corrupted persistent records block save instead of overwriting user data', async () => {
  platform.storage.set('local_qimen_records', 'invalid-original-bytes');
  await assert.rejects(request('/records/qimen', { method: 'POST', data: { name: '新盘', birthDatetime: Date.now() } }), /备份/);
  assert.equal(platform.storage.get('local_qimen_records'), 'invalid-original-bytes');
});

test('opening a saved Bazi preserves the exact chart session identity and original rules', async () => {
  const { createPinia, setActivePinia } = require('pinia');
  const { useBaziStore } = require('../src/store/bazi.ts');
  const { openSavedChart } = require('../src/features/history/savedCharts.ts');
  const { identityToken } = require('../src/chat/sessionSnapshot.ts');
  setActivePinia(createPinia());
  const store = useBaziStore();
  store.pull({ realname: '会话身份测试', gender: 0, timestamp: Date.parse('1998-08-12T01:00:00Z'), timeZone: 'Asia/Shanghai', rules: { dayDivide: 'zi', yearDivide: 'lichun', leapMonth: 'add-twelve' } });
  const saved = await request('/records/bazi', { method: 'POST', data: { name: store.input.realname, gender: '0', birthDatetime: store.input.timestamp, rawPayload: { user: { ...store.input } } } });
  store.input.recordId = saved.data.id;
  const page = loadPage('pages/chat/index.nvue', ['sessionIdentity']);
  platform.hooks.load.at(-1)({ from: 'bazi' });
  const before = identityToken(page.sessionIdentity.value);
  openSavedChart(readChartRecords('bazi')[0]);
  assert.equal(identityToken(page.sessionIdentity.value), before);
  assert.equal(store.input.timeZone, 'Asia/Shanghai');
  assert.equal(store.input.calculation.rules.dayDivide, 'zi');
});

test('a frozen Bazi without time zone source keeps its local chat identity after reload', () => {
  const { createPinia, setActivePinia } = require('pinia');
  const { useBaziStore } = require('../src/store/bazi.ts');
  const { readChartInput, snapshotChartInput } = require('../src/utils/chartInput.ts');
  const { identityToken } = require('../src/chat/sessionSnapshot.ts');
  setActivePinia(createPinia());
  const store = useBaziStore();
  store.pull({ realname: '冻结旧盘', gender: 0, timestamp: 0, timeZone: 'Asia/Shanghai' });
  const frozen = JSON.parse(JSON.stringify(store.input));
  delete frozen.timeZoneSource;
  assert.equal(frozen.calculation.timestamp, 0);
  const { recordId, ...chart } = frozen;
  const priorIdentity = identityToken({ account: 'local-device', chartType: 'bazi', recordId, chart });

  assert.equal(Object.hasOwn(snapshotChartInput(frozen), 'timeZoneSource'), false);
  platform.storage.set('bazi_last_context', JSON.stringify(frozen));
  const reloaded = readChartInput('bazi_last_context');
  assert.equal(Object.hasOwn(reloaded, 'timeZoneSource'), false);
  store.pull(reloaded);
  const page = loadPage('pages/chat/index.nvue', ['sessionIdentity']);
  platform.hooks.load.at(-1)({ from: 'bazi' });
  assert.equal(identityToken(page.sessionIdentity.value), priorIdentity);

  assert.equal(snapshotChartInput({ timestamp: 0, gender: 0, timeZone: 'Asia/Shanghai' }).timeZoneSource, 'explicit');
  assert.equal(snapshotChartInput({ ...frozen, timeZoneSource: 'legacy-device' }).timeZoneSource, 'legacy-device');
  assert.equal(Object.hasOwn(snapshotChartInput({ ...frozen, timeZone: undefined }), 'timeZoneSource'), false);
});

for (const type of ['bazi', 'ziwei', 'liuyao', 'qimen']) {
  test(`${type} optional empty name/question survives save and reopen without changing its chat identity`, async () => {
    const { createPinia, setActivePinia } = require('pinia');
    const { openSavedChart } = require('../src/features/history/savedCharts.ts');
    const { identityToken } = require('../src/chat/sessionSnapshot.ts');
    setActivePinia(createPinia());
    const timestamp = Date.parse('1998-08-12T01:00:00Z');
    let path, action;
    if (type === 'liuyao') {
      require('../src/features/liuyao/executor.ts').executeLiuyaoChart({ title: '', date: new Date(timestamp), params: [1, 0, 3, 4, 1, 0], methodLabel: '手工指定' });
      path = 'pages/liuyao/result.nvue'; action = 'saveLiuyao';
    } else if (type === 'qimen') {
      require('../src/store/qimen.ts').useQimenStore().pull({ question: '', timestamp, timeZone: 'Asia/Shanghai' });
      path = 'pages/qimen/result.nvue'; action = 'saveToAccount';
    } else {
      const store = type === 'bazi' ? require('../src/store/bazi.ts').useBaziStore() : require('../src/store/ziwei.ts').useZiweiStore();
      store.pull({ realname: '', gender: 0, timestamp, timeZone: 'Asia/Shanghai' });
      path = type === 'bazi' ? 'pages/index/detail.nvue' : 'pages/ziwei/result.nvue'; action = 'saveToAccount';
    }
    await loadPage(path, [action])[action]();
    const saved = readChartRecords(type)[0];
    assert.ok(saved, 'chart must save without a name/question');
    const page = loadPage('pages/chat/index.nvue', ['sessionIdentity']);
    platform.hooks.load.at(-1)({ from: type });
    const before = identityToken(page.sessionIdentity.value);
    openSavedChart(saved);
    assert.equal(identityToken(page.sessionIdentity.value), before);
  });
}
