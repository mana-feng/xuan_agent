const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { resetPlatform } = require('./helpers/load-source.cjs');
const snapshots = require('../src/chat/sessionSnapshot.ts');

const identity = (overrides = {}) => ({ account: 'alice@example.test', chartType: 'bazi', chart: { timestamp: 1000, gender: '女', realname: '测试' }, recordId: null, ...overrides });
const data = () => ({ draft: '下一问', messages: [{ role: 'user', text: '测试问题', time: '12:00', status: 'ready' }, { role: 'assistant', text: '部分回复', time: '12:01', status: 'stream' }] });
function setup() { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); return resetPlatform(); }

test('encrypted snapshots round trip drafts and preserve interrupted responses without completing them', async () => {
  const platform = setup();
  const scope = await snapshots.createScope(identity());
  await snapshots.writeSnapshot(scope, data());
  const serialized = [...platform.storage.values()].join('');
  for (const secret of ['测试问题', '下一问', 'alice@example.test', '部分回复']) assert.ok(!serialized.includes(secret));
  const restored = await snapshots.readSnapshot(scope);
  assert.equal(restored.draft, '下一问');
  assert.equal(restored.messages[1].status, 'error');
  assert.match(restored.messages[1].text, /部分回复/);
  assert.match(restored.messages[1].text, /中断/);
});

test('account, module, chart input and saved record identities isolate conversations', async () => {
  setup();
  const scope = await snapshots.createScope(identity());
  await snapshots.writeSnapshot(scope, data());
  for (const other of [identity({ account: 'bob@example.test' }), identity({ chartType: 'ziwei' }), identity({ chart: { timestamp: 2000 } }), identity({ recordId: 17 })]) {
    assert.equal(await snapshots.readSnapshot(await snapshots.createScope(other)), null);
  }
  const reordered = identity({ account: ' ALICE@example.test ', chart: { realname: '测试', gender: '女', timestamp: 1000 } });
  assert.equal((await snapshots.createScope(reordered)).key, scope.key);
});

test('rejects plaintext, legacy, corrupt, mismatched and expired snapshots instead of restoring global history', async () => {
  const platform = setup();
  const scope = await snapshots.createScope(identity());
  for (const value of ['{bad', JSON.stringify({ v: 0, alg: 'none', data: data() }), JSON.stringify({ v: 1, kind: 'chat', messages: data().messages })]) {
    platform.storage.set(scope.key, value);
    await assert.rejects(() => snapshots.readSnapshot(scope));
  }
  await snapshots.writeSnapshot(scope, data());
  const other = await snapshots.createScope(identity({ account: 'bob@example.test' }));
  platform.storage.set(other.key, platform.storage.get(scope.key));
  await assert.rejects(() => snapshots.readSnapshot(other));
  const clock = Date.now;
  try { Date.now = () => clock() + 31 * 86400000; assert.equal(await snapshots.readSnapshot(scope), null); }
  finally { Date.now = clock; }
});

test('no crypto or unavailable storage fails explicitly and never writes plaintext', async () => {
  const platform = setup();
  const scope = await snapshots.createScope(identity());
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  await assert.rejects(() => snapshots.writeSnapshot(scope, data()), /加密/);
  assert.equal(platform.storage.has(scope.key), false);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  uni.setStorageSync = () => { throw new Error('storage unavailable'); };
  await assert.rejects(() => snapshots.writeSnapshot(scope, data()), /storage unavailable/);
});

test('invalidation before encryption finishes prevents a cleared or switched session from being written again', async () => {
  const platform = setup();
  const scope = await snapshots.createScope(identity());
  let current = true;
  const write = snapshots.writeSnapshot(scope, data(), () => current);
  current = false;
  assert.equal(await write, false);
  assert.equal(platform.storage.has(scope.key), false);
});

test('clear removes only the selected session and import requires its exact identity', async () => {
  const platform = setup();
  const first = await snapshots.createScope(identity());
  const second = await snapshots.createScope(identity({ recordId: 5 }));
  await snapshots.writeSnapshot(first, data()); await snapshots.writeSnapshot(second, data());
  const exported = await snapshots.encodeSnapshot(first, data());
  assert.equal((await snapshots.decodeSnapshot(first, exported)).draft, '下一问');
  await assert.rejects(() => snapshots.decodeSnapshot(second, exported), /账号或命盘/);
  snapshots.removeSnapshot(first);
  assert.equal(await snapshots.readSnapshot(first), null);
  assert.ok(platform.storage.has(second.key));
});

test('an actual JSON file round trip preserves UTF-8 messages and rejects another account or tampered bytes', async () => {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
  setup();
  const scope = await snapshots.createScope(identity());
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'xuan-chat-file-'));
  const file = path.join(folder, 'chat.json');
  try {
    const plain = data(); plain.messages[1].status = 'ready';
    const encrypted = await snapshots.encodeSnapshot(scope, plain);
    await fs.writeFile(file, encrypted, 'utf8');
    const fromDisk = await fs.readFile(file, 'utf8');
    assert.equal(JSON.parse(fromDisk).alg, 'AES-GCM');
    assert.ok(!fromDisk.includes('测试问题')); assert.ok(!fromDisk.includes('下一问'));
    assert.deepEqual(await snapshots.decodeSnapshot(scope, fromDisk), plain);
    await assert.rejects(snapshots.decodeSnapshot(await snapshots.createScope(identity({ account: 'bob@example.test' })), fromDisk));
    const changed = JSON.parse(fromDisk); changed.ct = (changed.ct[0] === 'A' ? 'B' : 'A') + changed.ct.slice(1);
    await assert.rejects(snapshots.decodeSnapshot(scope, JSON.stringify(changed)));
  } finally { await fs.unlink(file).catch(() => {}); await fs.rmdir(folder); }
});
