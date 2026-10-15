const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { effectScope, reactive, ref } = require('vue');
const { useChatSession } = require('../src/chat/useChatSession.ts');
const { createScope, readSnapshot } = require('../src/chat/sessionSnapshot.ts');
const alice = { account: 'alice@example.test', chartType: 'bazi', chart: { timestamp: 1000 }, recordId: null };
function fixture() {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  const platform = resetPlatform(); const identity = ref(alice); const data = reactive({ messages: [], draft: '' });
  let resets = 0; const scope = effectScope();
  const session = scope.run(() => useChatSession(() => identity.value,
    () => ({ messages: data.messages, draft: data.draft }),
    next => { data.messages.splice(0, data.messages.length, ...next.messages); data.draft = next.draft; },
    () => { data.messages.splice(0); data.draft = ''; resets++; }));
  return { platform, identity, data, session, get resets() { return resets; }, dispose: () => scope.stop() };
}

test('hard reload restores the current conversation and draft without submitting a request', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.messages.push({ role: 'user', text: '我的问题', time: '01:00' }); f.data.draft = '下一问';
    await f.session.flush();
    assert.match(f.session.notice.value, /已保存/);
    f.identity.value = null; assert.equal(f.data.messages.length, 0); assert.equal(f.data.draft, '');
    f.identity.value = alice; await f.session.ready();
    assert.equal(f.data.messages[0].text, '我的问题'); assert.equal(f.data.draft, '下一问');
    assert.equal(f.platform.requests.length, 0);
  } finally { f.dispose(); }
});

test('switching account during a pending save neither leaks memory nor writes stale messages', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = 'alice 私密草稿'; const save = f.session.flush();
    f.identity.value = { ...alice, account: 'bob@example.test' }; await f.session.ready(); await save;
    assert.equal(f.data.draft, ''); assert.equal(f.data.messages.length, 0);
    assert.equal(await readSnapshot(await createScope(f.identity.value)), null);
  } finally { f.dispose(); }
});

test('saving an unsaved chart migrates its active conversation and retires the draft key', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = '保存前输入'; await f.session.flush();
    f.identity.value = { ...alice, recordId: 17 }; await f.session.ready();
    assert.equal(f.data.draft, '保存前输入');
    assert.equal((await readSnapshot(await createScope(f.identity.value))).draft, '保存前输入');
    assert.equal(await readSnapshot(await createScope(alice)), null);
    f.identity.value = { ...alice, recordId: 18 }; await f.session.ready();
    assert.equal(f.data.draft, '');
  } finally { f.dispose(); }
});

test('clear invalidates pending writes, cancels the active session and survives a reload', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = 'clear me'; const pending = f.session.flush();
    await f.session.clear(); await pending;
    assert.equal(f.data.draft, ''); assert.equal(await readSnapshot(await createScope(alice)), null);
    assert.ok(f.resets >= 2); assert.match(f.session.notice.value, /已清空/);
  } finally { f.dispose(); }
});

test('a storage failure stays visible until an explicit retry confirms the write', async () => {
  const f = fixture();
  try {
    await f.session.ready(); const write = uni.setStorageSync;
    uni.setStorageSync = () => { throw new Error('full'); }; f.data.draft = '保留此内容'; await f.session.flush();
    assert.equal(f.data.draft, '保留此内容'); assert.match(f.session.notice.value, /未保存/); assert.equal(f.session.failed.value, true);
    uni.setStorageSync = write; await f.session.flush();
    assert.equal(f.session.failed.value, false); assert.match(f.session.notice.value, /已保存/);
  } finally { f.dispose(); }
});

test('import never reports success when restored content could not be persisted', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = '归档内草稿';
    const archive = await f.session.exportArchive();
    await f.session.clear();
    const write = uni.setStorageSync;
    uni.setStorageSync = () => { throw new Error('storage full'); };
    await assert.rejects(f.session.importArchive(archive), /未保存/);
    assert.equal(f.data.draft, '归档内草稿');
    assert.equal(f.session.failed.value, true);
    uni.setStorageSync = write; await f.session.flush();
    assert.equal((await readSnapshot(await createScope(alice))).draft, '归档内草稿');
  } finally { f.dispose(); }
});

test('switching account during archive decryption cancels restoration without writing into the new account', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = '仅属于 alice 的归档';
    const archive = await f.session.exportArchive();
    await f.session.clear();
    const importing = f.session.importArchive(archive);
    // Activation finishes first, then WebCrypto decrypts asynchronously.
    await Promise.resolve();
    f.identity.value = { ...alice, account: 'bob@example.test' };
    await assert.rejects(importing, { name: 'AbortError' });
    await f.session.ready();
    assert.equal(f.data.draft, ''); assert.equal(f.data.messages.length, 0);
    assert.equal(await readSnapshot(await createScope(f.identity.value)), null);
  } finally { f.dispose(); }
});

test('corrupt data is reported and is not silently overwritten on opening', async () => {
  const f = fixture();
  try {
    await f.session.ready(); const scope = await createScope(alice); f.platform.storage.set(scope.key, '{bad');
    f.identity.value = null; f.identity.value = alice; await f.session.ready();
    assert.equal(f.data.messages.length, 0); assert.match(f.session.notice.value, /恢复失败/);
    assert.equal(f.platform.storage.get(scope.key), '{bad');
  } finally { f.dispose(); }
});

test('retry after crypto initialization becomes available saves the current draft', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.identity.value = null;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    f.identity.value = alice; await f.session.ready(); f.data.draft = '初始化失败后的草稿';
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    await f.session.flush();
    assert.equal((await readSnapshot(await createScope(alice)))?.draft, '初始化失败后的草稿');
  } finally { f.dispose(); }
});

test('only the newest overlapping save can become the restored draft', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = '旧草稿'; const first = f.session.flush();
    f.data.draft = '新草稿'; const second = f.session.flush();
    await Promise.all([first, second]);
    assert.equal((await readSnapshot(await createScope(alice))).draft, '新草稿');
  } finally { f.dispose(); }
});

test('switching charts before debounce completes retains the final draft on return', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = 'baseline'; await f.session.flush();
    f.data.draft = '最后输入的草稿'; f.identity.value = { ...alice, chart: { timestamp: 2000 } };
    await f.session.ready(); f.identity.value = alice; await f.session.ready();
    assert.equal(f.data.draft, '最后输入的草稿');
  } finally { f.dispose(); }
});

test('stream completion during chart-save migration is persisted before reporting saved', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.messages.push({ role: 'assistant', text: 'partial', status: 'stream', time: '01:00' });
    await f.session.flush(); f.identity.value = { ...alice, recordId: 22 };
    f.data.messages[0].text = 'completed'; f.data.messages[0].status = 'ready';
    await f.session.ready();
    const stored = await readSnapshot(await createScope(f.identity.value));
    assert.equal(stored.messages[0].text, 'completed'); assert.equal(stored.messages[0].status, 'ready');
    assert.equal(f.session.dirty.value, false);
  } finally { f.dispose(); }
});

test('auth expiry during restore cannot overwrite saved content with the mount hint', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = 'already saved private draft'; await f.session.flush();
    f.identity.value = null; f.identity.value = alice;
    assert.equal(f.session.restoring.value, true);
    f.data.messages.push({ role: 'assistant', text: 'chart loaded', status: 'ready', time: '01:00' });
    f.identity.value = null; f.identity.value = alice; await f.session.ready();
    assert.equal(f.data.draft, 'already saved private draft');
    assert.equal(f.data.messages.length, 0);
  } finally { f.dispose(); }
});

test('a chart gaining its record ID during restore migrates the unread saved snapshot', async () => {
  const f = fixture();
  try {
    await f.session.ready(); f.data.draft = 'saved before reload'; await f.session.flush();
    f.identity.value = null; f.identity.value = alice;
    f.data.messages.push({ role: 'assistant', text: 'mount hint', status: 'ready', time: '01:00' });
    f.identity.value = { ...alice, recordId: 17 }; await f.session.ready();
    assert.equal(f.data.draft, 'saved before reload');
    assert.equal((await readSnapshot(await createScope(f.identity.value))).draft, 'saved before reload');
    assert.equal(await readSnapshot(await createScope(alice)), null);
  } finally { f.dispose(); }
});
