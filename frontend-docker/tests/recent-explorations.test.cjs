const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
let platform;
beforeEach(() => {
  platform = resetPlatform();
  setActivePinia(createPinia());
  useUserStore()._hasAccessToken = true;
  platform.storage.set('access_token', 'test-token');
});
const loadRecent = () => loadPage('components/history/RecentExplorations.vue', ['refreshRecords', 'records', 'loading', 'error', 'openRecord']);

test('recent explorations merges all four typed endpoints and shows only the latest three', async () => {
  platform.respond = async url => {
    const type = new URL(url, 'http://test.local').searchParams.get('type');
    const date = { bazi: 1, ziwei: 3, liuyao: 5, qimen: 7 }[type];
    return { success: true, data: { list: [
      { id: 1, title: type, createdAt: `2026-01-0${date}T00:00:00Z` },
      { id: 2, title: type, createdAt: `2026-01-0${date + 1}T00:00:00Z` },
    ], hasMore: false } };
  };
  const recent = loadRecent();
  await recent.refreshRecords();
  assert.deepEqual(recent.records.value.map(item => `${item.type}:${item.id}`), ['qimen:2', 'qimen:1', 'liuyao:2']);
  assert.equal(platform.requests.length, 4);
  assert.equal(recent.loading.value, false);
});

test('recent explorations does not fetch account records when signed out', async () => {
  useUserStore()._hasAccessToken = false;
  const recent = loadRecent();
  await recent.refreshRecords();
  assert.equal(platform.requests.length, 0);
  assert.deepEqual(recent.records.value, []);
});

test('recent explorations exposes a failed request and clears stale records', async () => {
  platform.respond = async () => ({ success: false, error: '模拟加载失败' });
  const recent = loadRecent();
  recent.records.value = [{ id: 1, type: 'bazi' }];
  await recent.refreshRecords();
  assert.equal(recent.error.value, '模拟加载失败');
  assert.deepEqual(recent.records.value, []);
  assert.equal(recent.loading.value, false);
});

test('recent exploration uses the same Ziwei restore identity as the history page', () => {
  const recent = loadRecent();
  const timestamp = new Date(1993, 8, 20, 11, 30).getTime();
  recent.openRecord({ id: 8, type: 'ziwei', title: '最近紫微', gender: '1', birthDatetime: new Date(timestamp).toISOString() });
  assert.equal(platform.routes.at(-1), '/pages/ziwei/result');
  assert.equal(useZiweiStore().input.realname, '最近紫微');
  assert.equal(useZiweiStore().input.recordId, 8);
  assert.equal(useZiweiStore().input.timestamp, timestamp);
});
