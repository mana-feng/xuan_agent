const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { useQimenStore } = require('../src/store/qimen.ts');
const { useYunStore } = require('../src/store/yun.ts');
const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');
const { buildBaziExportPayload } = require('../src/utils/baziExport.ts');
const { buildZiweiExportPayload } = require('../src/utils/ziweiExport.ts');
const { buildLiuyaoExportPayload } = require('../src/utils/liuyaoExport.ts');
const { buildQimenExportPayload } = require('../src/utils/qimenExport.ts');

let platform;
const timestamp = Date.parse('1991-06-15T16:05:00Z');
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });

function openChat(from, extraExports = []) {
  const page = loadPage('pages/chat/index.nvue', ['contextCaption', 'buildMessages', ...extraExports]);
  platform.hooks.load.at(-1)({ from });
  return page;
}

test('ordinary chat exposes account changes even when no chart identity exists', async () => {
  const user = useUserStore();
  user.setAuth({ email: 'alice@example.test', access_token: 'simulation-token' });
  const page = openChat('invalid', ['sessionIdentity', 'sessionAccount']);
  assert.equal(page.sessionIdentity.value, null);
  assert.equal(page.sessionAccount.value, 'alice@example.test');
  await user.logout();
  assert.equal(page.sessionAccount.value, '');
  user.setAuth({ email: 'bob@example.test', access_token: 'simulation-token' });
  assert.equal(page.sessionAccount.value, 'bob@example.test');
  assert.equal(page.sessionIdentity.value, null);
});

test('Bazi summary identifies the actual exported chart even after the shared profile changes', () => {
  const store = useBaziStore();
  store.pull({ realname: '八字原盘甲', gender: 0, timestamp, recordId: 41 });
  useUserStore().set({ realname: '另一个人', gender: 1, timestamp: Date.now() });
  const payload = buildBaziExportPayload(store.input, store, useYunStore());
  const page = openChat('bazi');
  assert.match(page.contextCaption.value, /已关联八字/);
  assert.ok(page.contextCaption.value.includes(payload.basic.name));
  assert.ok(page.contextCaption.value.includes(payload.basic.solarString));
  assert.match(page.contextCaption.value, /时区未记录/);
  assert.doesNotMatch(page.contextCaption.value, /另一个人/);
  assert.ok(page.buildMessages('请分析')[0].content.includes(payload.basic.name));
});

test('Ziwei summary uses the exported birth zone and civil clock instead of the device clock', () => {
  const store = useZiweiStore();
  store.pull({ realname: '紫微原盘乙', gender: 1, timestamp, recordId: 42, timeZone: 'America/New_York' });
  useUserStore().set({ realname: '另一个人', gender: 0, timestamp: Date.now() });
  const payload = buildZiweiExportPayload(store.input, store);
  const page = openChat('ziwei');
  assert.match(page.contextCaption.value, /已关联紫微/);
  assert.ok(page.contextCaption.value.includes(payload.profile.name));
  assert.match(page.contextCaption.value, /1991-06-15 12:05/);
  assert.ok(page.contextCaption.value.includes(payload.profile.timeZone));
  assert.ok(page.buildMessages('请分析')[0].content.includes(payload.profile.timeZone));
});

test('Liuyao summary retains the question and the exported casting clock without inventing a zone', () => {
  executeLiuyaoChart({ title: '六爻原卦：新项目', gender: '女', date: new Date(2022, 2, 3, 8), params: [1, 0, 3, 0, 1, 4], methodLabel: '手工起卦' });
  const payload = buildLiuyaoExportPayload(useLiuyaoStore());
  const page = openChat('liuyao');
  assert.match(page.contextCaption.value, /已关联六爻/);
  assert.match(page.contextCaption.value, /六爻原卦：新项目/);
  assert.ok(page.contextCaption.value.includes(payload.split('\n')[0]));
  assert.match(page.contextCaption.value, /时区未记录/);
  assert.equal(page.buildMessages('请分析')[0].content, `User Liuyao result:\n${payload}`);
});

test('Qimen summary shows the original entered time and zone from the exact exported chart', () => {
  const store = useQimenStore();
  store.pull({ question: '奇门原盘：合作时机', timestamp, timeZone: 'America/New_York', recordId: 44 });
  const payload = buildQimenExportPayload(store);
  const page = openChat('qimen');
  assert.match(page.contextCaption.value, /已关联奇门/);
  assert.ok(page.contextCaption.value.includes(payload.input.question));
  assert.ok(page.contextCaption.value.includes(payload.chart.metadata.inputCivil));
  assert.ok(page.contextCaption.value.includes(payload.input.timeZone));
  assert.doesNotMatch(page.contextCaption.value, /1991-06-16 00:05/);
});

test('an invalid chart source cannot accidentally associate a different active Bazi chart', () => {
  useBaziStore().pull({ realname: '其他命盘', gender: 0, timestamp });
  const page = openChat('invalid');
  assert.doesNotMatch(page.contextCaption.value, /已关联|其他命盘/);
  assert.deepEqual(page.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
});

for (const type of ['bazi', 'ziwei', 'liuyao', 'qimen']) {
  test(`${type} opens the original result without replacing its input or the conversation`, () => {
    let store;
    if (type === 'liuyao') {
      executeLiuyaoChart({ title: '保留原卦', gender: '女', date: new Date(2022, 2, 3, 8), params: [1, 0, 3, 0, 1, 4], methodLabel: '手工起卦' });
      store = useLiuyaoStore(); store.setRecordId(43);
    } else if (type === 'qimen') {
      store = useQimenStore();
      store.pull({ question: '保留原局', timestamp, timeZone: 'America/New_York', recordId: 44 });
    } else {
      store = type === 'bazi' ? useBaziStore() : useZiweiStore();
      store.pull({ realname: '保留原命盘', gender: 1, timestamp, recordId: 42, ...(type === 'ziwei' ? { timeZone: 'America/New_York' } : {}) });
    }
    const originalInput = JSON.stringify(type === 'liuyao' ? { profile: store.profile, castingAt: store.castingAt, recordId: store.recordId } : store.input);
    const page = openChat(type, ['openOriginalChart', 'panelRef']);
    assert.equal(typeof page.openOriginalChart, 'function', 'the summary must provide an original-chart action');
    page.panelRef.value = { getMessages: () => [
      { id: 'm-1', role: 'assistant', text: '欢迎' },
      { id: 'user-1', role: 'user', text: '之前的问题', status: 'ready' },
      { id: 'reply-1', role: 'assistant', text: '已有解读', status: 'ready' },
    ] };
    const before = page.buildMessages('继续分析');
    uni.redirectTo = uni.reLaunch = uni.navigateBack = () => assert.fail('viewing a chart must keep this conversation page in the stack');
    page.openOriginalChart();
    assert.equal(platform.routes.at(-1), type === 'bazi' ? '/pages/index/detail' : `/pages/${type}/result`);
    loadPage(`${platform.routes.at(-1).slice(1)}.nvue`, []);
    assert.equal(JSON.stringify(type === 'liuyao' ? { profile: store.profile, castingAt: store.castingAt, recordId: store.recordId } : store.input), originalInput);
    assert.deepEqual(page.buildMessages('继续分析'), before);
    assert.equal(platform.requests.length, 0, 'viewing the chart must not generate an AI response');
  });
}

test('missing chart data has neither a summary nor a navigable original chart', () => {
  const page = openChat('qimen', ['contextSummary', 'openOriginalChart']);
  assert.equal(typeof page.openOriginalChart, 'function');
  assert.equal(page.contextSummary.value, null);
  page.openOriginalChart();
  assert.equal(platform.routes.length, 0);
  assert.deepEqual(page.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
});

test('an input without a calculated Bazi chart cannot fabricate an associated summary or prompt', () => {
  const page = openChat('bazi', ['contextSummary']);
  useBaziStore().input = { realname: '未排盘输入', gender: 0, timestamp, recordId: null };
  assert.equal(page.contextSummary.value, null);
  assert.deepEqual(page.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
});

test('summary and subsequent requests both follow a real chart change', () => {
  const store = useQimenStore();
  store.pull({ question: '上一个问题', timestamp, timeZone: 'Asia/Shanghai' });
  const page = openChat('qimen', ['contextSummary']);
  assert.equal(page.contextSummary.value.title, '上一个问题');
  store.pull({ question: '当前问题', timestamp: timestamp + 3600000, timeZone: 'America/New_York', recordId: 88 });
  assert.equal(page.contextSummary.value.title, '当前问题');
  assert.equal(page.contextSummary.value.time, '1991-06-15 13:05:00');
  assert.match(page.buildMessages('请分析')[0].content, /当前问题/);
  assert.doesNotMatch(page.buildMessages('请分析')[0].content, /上一个问题/);
});

test('a Ziwei export without a saved zone shows its recorded ISO instant and leaves the zone unknown', () => {
  const store = useZiweiStore();
  store.pull({ realname: '旧记录', gender: 0, timestamp, timeZone: 'America/New_York' });
  const page = openChat('ziwei', ['contextSummary']);
  delete store.input.timeZone;
  const payload = buildZiweiExportPayload(store.input, store);
  assert.ok(page.contextSummary.value, 'missing zone metadata must not discard an otherwise real chart');
  assert.equal(page.contextSummary.value.time, payload.profile.birthSolarISO);
  assert.equal(page.contextSummary.value.zone, '时区未记录');
  assert.ok(page.buildMessages('请分析')[0].content.includes(payload.profile.birthSolarISO));
});

test('a malformed Liuyao result has no associated chart even if its export can produce placeholder text', () => {
  useLiuyaoStore().setResult({ compiled: {}, display: {}, profile: { title: '损坏的缓存', timeLabel: '' }, createdAt: timestamp });
  const page = openChat('liuyao', ['contextSummary']);
  assert.equal(page.contextSummary.value, null);
  assert.deepEqual(page.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
});

test('an invalid timestamp suppresses the chart without a misleading summary or export error', t => {
  const store = useBaziStore();
  store.pull({ realname: '原盘', gender: 0, timestamp });
  const page = openChat('bazi', ['contextSummary']);
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  store.input.timestamp = NaN;
  assert.equal(page.contextSummary.value, null);
  assert.deepEqual(page.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
  assert.deepEqual(errors, [], 'invalid input should be rejected before running its exporter');
});
