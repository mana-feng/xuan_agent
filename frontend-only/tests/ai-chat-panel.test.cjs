const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-ai-source.cjs');
const storage = require('../src/utils/persistentStorage.ts');
const { JSDOM } = require('jsdom');
let platform;
beforeEach(() => { platform = resetPlatform(); });
function loadPanel() { return loadPage('chat/ChatPanel.vue', ['messages', 'draft', 'sending', 'handleSend', 'buildArchivePayload', 'tryAutoRestoreOnOpen', 'handleRestoreArchive', 'handleSaveArchive', 'archiveBusy']); }
const archive = { v: 1, kind: 'chat', savedAt: '2026-10-10', messages: [{ role: 'user', text: '旧归档', time: '12:00' }] };
test('partial stream becomes an error with no dangling generating bubble', () => {
  const panel = loadPanel();
  platform.exposed.createWaitingMessage(); platform.exposed.appendAssistant('尚未完成', 'stream');
  platform.exposed.appendAssistant('调用失败：连接中断', 'error');
  assert.ok(panel.messages.every(message => message.status !== 'stream' && message.status !== 'waiting'));
  assert.ok(panel.messages.at(-1).text.includes('连接中断'));
  assert.equal(panel.sending.value, false);
});
test('archive does not promote failed assistant output into successful conversation history', () => {
  const panel = loadPanel();
  panel.messages.push({ id: 'u', role: 'user', text: '问题', status: 'ready' });
  panel.messages.push({ id: 'e', role: 'assistant', text: '调用失败', status: 'error' });
  panel.messages.push({ id: 's', role: 'assistant', text: '部分输出', status: 'stream' });
  assert.deepEqual(panel.buildArchivePayload().messages.map(message => message.text), ['问题']);
});
test('slow auto-restore cannot overwrite a conversation started while storage was loading', async t => {
  const panel = loadPanel(); let finish;
  t.mock.method(storage, 'idbGetItem', () => new Promise(resolve => { finish = resolve; }));
  storage.setPersistentItem('chat_archive_last_v1', JSON.stringify(archive));
  const restore = panel.tryAutoRestoreOnOpen();
  panel.draft.value = '新问题'; await panel.handleSend();
  platform.exposed.appendAssistant('新回答', 'ready');
  finish(null); await restore;
  assert.deepEqual(panel.messages.slice(1).map(message => message.text), ['新问题', '新回答']);
});
test('auto-restore rechecks direct-chart restore disablement after asynchronous storage access', async t => {
  platform.props = { disableAutoRestore: false }; const panel = loadPanel(); let finish;
  t.mock.method(storage, 'idbGetItem', () => new Promise(resolve => { finish = resolve; }));
  storage.setPersistentItem('chat_archive_last_v1', JSON.stringify(archive));
  const restore = panel.tryAutoRestoreOnOpen(); platform.props.disableAutoRestore = true;
  finish(null); await restore; assert.equal(panel.messages.length, 1);
});
test('archive restore is ignored during generation', async t => {
  const panel = loadPanel(); let reads = 0;
  t.mock.method(storage, 'idbGetItem', async () => { reads++; return null; });
  storage.setPersistentItem('chat_archive_last_v1', JSON.stringify(archive));
  panel.sending.value = true; await panel.handleRestoreArchive(); assert.equal(reads, 0);
});
test('sending is ignored while a manual archive operation is active', async () => {
  const panel = loadPanel(); panel.archiveBusy.value = true; panel.draft.value = '新消息';
  await panel.handleSend(); assert.equal(panel.messages.length, 1); assert.equal(platform.emits?.length || 0, 0);
});

function fallbackPicker(t) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const oldWindow = global.window; const oldDocument = global.document;
  global.window = dom.window; global.document = dom.window.document;
  t.after(() => { global.window = oldWindow; global.document = oldDocument; dom.window.close(); });
  let input; const downloads = []; const toasts = [];
  // Replace only the OS file dialog; dispatch its actual DOM cancel/change events below.
  t.mock.method(dom.window.HTMLInputElement.prototype, 'click', function () { input = this; });
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () { downloads.push(this.download); });
  t.mock.method(storage, 'idbGetItem', async () => null);
  t.mock.method(global.uni, 'showToast', toast => toasts.push(toast));
  return { dom, get input() { return input; }, downloads, toasts };
}

for (const eventType of ['cancel', 'change']) {
  test(`fallback file ${eventType} without a file preserves conversation and unlocks save/send`, async t => {
    const picker = fallbackPicker(t); const panel = loadPanel();
    panel.messages.push({ id: 'keep', role: 'user', text: '当前对话', time: '13:00', status: 'ready' });
    storage.setPersistentItem('chat_archive_last_v1', JSON.stringify(archive));
    const restore = panel.handleRestoreArchive();
    await Promise.resolve();
    assert.ok(picker.input, 'fallback opens a real input element');
    picker.input.dispatchEvent(new picker.dom.window.Event(eventType));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(panel.archiveBusy.value, false, 'cancel must settle restore and release its busy lock');
    await restore;
    assert.deepEqual(panel.messages.slice(1).map(message => message.text), ['当前对话']);
    assert.deepEqual(picker.toasts, [], 'cancellation is neither a failed nor successful restore');
    await panel.handleSaveArchive();
    assert.equal(picker.downloads.length, 1, 'saving is available after cancellation');
    panel.draft.value = '取消后继续提问'; await panel.handleSend();
    assert.deepEqual(platform.emits, [['send', '取消后继续提问']]);
  });
}

test('fallback file selection still restores a valid archive and releases its busy lock', async t => {
  const picker = fallbackPicker(t); const panel = loadPanel();
  const restore = panel.handleRestoreArchive(); await Promise.resolve();
  Object.defineProperty(picker.input, 'files', { value: [{ text: async () => JSON.stringify(archive) }] });
  picker.input.dispatchEvent(new picker.dom.window.Event('change'));
  await restore;
  assert.deepEqual(panel.messages.slice(1).map(message => message.text), ['旧归档']);
  assert.equal(panel.archiveBusy.value, false);
  assert.deepEqual(picker.toasts.map(toast => toast.title), ['已恢复']);
});
