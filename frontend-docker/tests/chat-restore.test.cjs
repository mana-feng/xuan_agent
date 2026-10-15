const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');

const baziInput = { timeZone: 'Asia/Shanghai', realname: '八字缓存甲', gender: 0, timestamp: new Date(2026, 9, 10, 12, 30).getTime(), recordId: 11 };
const ziweiInput = { realname: '紫微缓存乙', gender: 1, timestamp: new Date(2022, 2, 3, 8).getTime(), recordId: 22 };
let platform;
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });

function openChat(from) {
  const page = loadPage('pages/chat/index.nvue', ['buildMessages']);
  platform.hooks.load.at(-1)({ from });
  return page;
}

for (const [from, input, useStore, otherStore] of [
  ['bazi', baziInput, useBaziStore, useZiweiStore],
  ['ziwei', ziweiInput, useZiweiStore, useBaziStore],
]) {
  test(`direct ${from} chat restores its cached chart before building the first request`, () => {
    platform.storage.set('bazi_last_context', JSON.stringify(baziInput));
    platform.storage.set('ziwei_last_context', JSON.stringify(ziweiInput));
    const messages = openChat(from).buildMessages('当前盘主是谁？');
    assert.equal(messages[0].role, 'system', 'cold chat must send chart context on its first request');
    assert.ok(messages[0].content.includes(input.realname));
    assert.equal(useStore().input.recordId, input.recordId);
    assert.equal(otherStore().input.timestamp, null, 'only the requested chart should be restored');
  });

  test(`${from} chat preserves the active chart without recalculating or replacing it from cache`, t => {
    const activeInput = { ...input, realname: '当前激活盘', recordId: 99 };
    const store = useStore();
    store.pull(activeInput);
    const calculatedChart = from === 'bazi' ? store.table : store.astrolabe;
    platform.storage.set(`${from}_last_context`, JSON.stringify(input));
    const pull = t.mock.method(store, 'pull');
    const messages = openChat(from).buildMessages('当前盘主是谁？');
    assert.ok(messages[0].content.includes('当前激活盘'));
    assert.equal(store.input.recordId, 99);
    assert.equal(pull.mock.callCount(), 0);
    assert.equal(from === 'bazi' ? store.table : store.astrolabe, calculatedChart);
  });
}

function createLiuyao(title) {
  executeLiuyaoChart({ title, gender: '男', date: new Date(2022, 2, 3, 8), params: [1, 0, 3, 0, 1, 4], methodLabel: '手工起卦' });
}

test('direct Liuyao chat restores the saved result after a cold start', () => {
  createLiuyao('缓存起卦');
  useLiuyaoStore().setRecordId(31);
  setActivePinia(createPinia());
  const messages = openChat('liuyao').buildMessages('当前卦题是什么？');
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('缓存起卦'));
  assert.equal(useLiuyaoStore().recordId, 31);
});

test('Liuyao chat preserves the current result when its local cache differs', () => {
  createLiuyao('旧缓存');
  const cached = platform.storage.get('liuyao_last_result');
  createLiuyao('当前起卦');
  const current = useLiuyaoStore().compiled;
  platform.storage.set('liuyao_last_result', cached);
  const messages = openChat('liuyao').buildMessages('当前卦题是什么？');
  assert.ok(messages[0].content.includes('当前起卦'));
  assert.equal(useLiuyaoStore().compiled, current);
});

test('a direct chat with no valid cache stays usable without inventing chart context', () => {
  platform.storage.set('bazi_last_context', '{invalid');
  assert.deepEqual(openChat('bazi').buildMessages('你好'), [{ role: 'user', content: '你好' }]);
});
