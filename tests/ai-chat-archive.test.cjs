const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveObjectURL } = require('node:buffer');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-ai-source.cjs');
const storage = require('../src/utils/persistentStorage.ts');
const { JSDOM } = require('jsdom');

const FALLBACK_KEY = 'chat_archive_last_v1';
const HANDLE_KEY = 'chat_archive_handle_v1';
const oldArchive = { v: 1, kind: 'chat', savedAt: '2026-10-10T00:00:00.000Z', messages: [{ role: 'user', text: '旧归档', time: '12:00' }] };
const roundtripMessages = [
  { role: 'user', text: '八字问题：甲子\n保留空格  和引号 "原文" 😀', time: '01:02' },
  { role: 'assistant', text: '第一行\n第二行 <script>仅文本</script> \\ 路径', time: '23:59' },
];
let platform;
beforeEach(() => { platform = resetPlatform(); });

function loadPanel() {
  const panel = loadPage('chat/ChatPanel.vue', ['messages', 'draft', 'handleSend', 'tryAutoRestoreOnOpen', 'handleRestoreArchive', 'handleSaveArchive', 'archiveBusy']);
  return { ...panel, ...platform.exposed };
}

function environment(t) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const oldWindow = global.window; const oldDocument = global.document;
  global.window = dom.window; global.document = dom.window.document;
  t.after(() => { global.window = oldWindow; global.document = oldDocument; dom.window.close(); });
  const cache = new Map(); const toasts = []; let input;
  // Only browser/OS boundaries are replaced; payload, parse, restore and persistent encoding use real source.
  t.mock.method(storage, 'idbGetItem', async key => cache.get(key) || null);
  t.mock.method(storage, 'idbSetItem', async (key, value) => { cache.set(key, value); });
  t.mock.method(global.uni, 'showToast', toast => toasts.push(toast));
  t.mock.method(dom.window.HTMLInputElement.prototype, 'click', function () { input = this; });
  return { dom, cache, toasts, get input() { return input; } };
}

function fileHandle(t, initialText) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'only-chat-archive-'));
  const filename = path.join(directory, 'archive.json');
  if (initialText !== undefined) fs.writeFileSync(filename, initialText, 'utf8');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    filename,
    queryPermission: async () => 'granted',
    createWritable: async () => ({
      write: async text => fs.writeFileSync(filename, text, 'utf8'), close: async () => {},
    }),
    getFile: async () => new Blob([fs.readFileSync(filename)], { type: 'application/json' }),
  };
}

function keepConversation(panel) {
  panel.messages.push({ id: 'keep', role: 'user', text: '保留当前对话', time: '13:14', status: 'ready' });
}

function content(panel) {
  return panel.messages.slice(1).map(({ role, text, time }) => ({ role, text, time }));
}

async function chooseInput(env, panel, file, handler = 'handleRestoreArchive') {
  const restore = panel[handler]();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(env.input, 'restore opens the input fallback');
  Object.defineProperty(env.input, 'files', { value: [file] });
  env.input.dispatchEvent(new env.dom.window.Event('change'));
  await restore;
}

test('primary download uses downloadable UTF-8 bytes even when the native save picker exists', async t => {
  const env = environment(t); const panel = loadPanel(); let downloaded;
  panel.messages.push(...roundtripMessages.map((message, index) => ({ ...message, id: `portable-${index}`, status: 'ready' })));
  panel.draft.value = '尚未发送的草稿';
  env.cache.set(HANDLE_KEY, fileHandle(t, JSON.stringify(oldArchive)));
  env.dom.window.showSaveFilePicker = async () => { assert.fail('primary download must not use the native save picker'); };
  const create = URL.createObjectURL.bind(URL);
  t.mock.method(URL, 'createObjectURL', blob => { downloaded = blob; return create(blob); });
  t.mock.method(env.dom.window.HTMLAnchorElement.prototype, 'click', function () { assert.match(this.download, /^ai-chat-.*\.json$/); });
  await panel.handleDownloadArchive();
  assert.equal(downloaded.type, 'application/json;charset=utf-8');
  assert.deepEqual(JSON.parse(await downloaded.text()).messages, roundtripMessages);
  assert.equal(panel.draft.value, '尚未发送的草稿');
  assert.equal(env.cache.get(HANDLE_KEY), null);
  assert.deepEqual(JSON.parse(storage.getPersistentItem(FALLBACK_KEY)).messages, roundtripMessages);
  assert.deepEqual(env.toasts.map(({ title, icon }) => ({ title, icon })), [{ title: '已发起聊天档案下载', icon: 'none' }]);
  assert.equal(panel.archiveBusy.value, false);
});

test('primary import uses input selection even when the native open picker exists and blocks changes while reading', async t => {
  const env = environment(t); const panel = loadPanel(); keepConversation(panel);
  panel.draft.value = '保留草稿';
  env.cache.set(HANDLE_KEY, fileHandle(t, JSON.stringify(oldArchive)));
  env.dom.window.showOpenFilePicker = async () => { assert.fail('primary import must not use the native open picker'); };
  const selectedArchive = { ...oldArchive, messages: roundtripMessages };
  const selectedFile = await fileHandle(t, JSON.stringify(selectedArchive)).getFile();
  const pending = panel.handleImportArchive();
  assert.equal(panel.archiveBusy.value, true);
  assert.ok(env.input, 'the explicit input picker opens synchronously');
  const selectedInput = env.input;
  await panel.handleImportArchive();
  await panel.handleDownloadArchive();
  await panel.handleRestoreArchive();
  await panel.handleSaveArchive();
  await panel.handleSend();
  assert.equal(env.input, selectedInput);
  assert.equal(panel.messages.at(-1).text, '保留当前对话');
  assert.equal(panel.draft.value, '保留草稿');
  Object.defineProperty(selectedInput, 'files', { value: [selectedFile] });
  selectedInput.dispatchEvent(new env.dom.window.Event('change'));
  await pending;
  assert.deepEqual(content(panel), roundtripMessages);
  assert.equal(panel.draft.value, '保留草稿');
  assert.equal(env.cache.get(HANDLE_KEY), null);
  assert.deepEqual(JSON.parse(storage.getPersistentItem(FALLBACK_KEY)), selectedArchive);
  const reopened = loadPanel(); await reopened.tryAutoRestoreOnOpen();
  assert.deepEqual(content(reopened), roundtripMessages);
  assert.equal(panel.archiveBusy.value, false);
});

for (const failure of ['cancel', 'invalid JSON', 'invalid schema', 'read error']) {
  test(`primary import ${failure} preserves conversation, draft and cached archive with native picker support`, async t => {
    const env = environment(t); const panel = loadPanel(); keepConversation(panel);
    panel.draft.value = '尚未发送的草稿';
    const before = content(panel); const oldText = JSON.stringify(oldArchive);
    const oldHandle = fileHandle(t, oldText);
    env.cache.set(HANDLE_KEY, oldHandle);
    storage.setPersistentItem(FALLBACK_KEY, oldText);
    env.dom.window.showOpenFilePicker = async () => { assert.fail('primary import must not use the native open picker'); };
    if (failure === 'cancel') {
      const pending = panel.handleImportArchive();
      assert.ok(env.input);
      env.input.dispatchEvent(new env.dom.window.Event('cancel'));
      await pending;
    } else {
      const file = failure === 'read error' ? { text: async () => { throw new Error('读取失败'); } }
        : new Blob([failure === 'invalid JSON' ? '{invalid' : JSON.stringify({ ...oldArchive, v: 2 })]);
      await chooseInput(env, panel, file, 'handleImportArchive');
    }
    assert.deepEqual(content(panel), before);
    assert.equal(panel.draft.value, '尚未发送的草稿');
    assert.equal(env.cache.get(HANDLE_KEY), oldHandle);
    assert.equal(storage.getPersistentItem(FALLBACK_KEY), oldText);
    assert.equal(fs.readFileSync(oldHandle.filename, 'utf8'), oldText);
    assert.equal(panel.archiveBusy.value, false);
    assert.equal(env.toasts.length, failure === 'cancel' ? 0 : 1);
    assert.equal(env.toasts.some(toast => toast.icon === 'success'), false);
  });
}

for (const [label, fileText, expectedTitle] of [
  ['empty file', '', '档案文件为空'],
  ['malformed JSON', '{invalid json', '档案内容无法解析，请选择有效的 JSON 文件'],
]) {
  test(`primary import reports a Chinese error for ${label} while preserving unsaved and cached data`, async t => {
    const env = environment(t); const panel = loadPanel(); keepConversation(panel);
    panel.draft.value = '尚未发送的草稿';
    const before = content(panel); const oldText = JSON.stringify(oldArchive);
    const oldHandle = fileHandle(t, oldText);
    env.cache.set(HANDLE_KEY, oldHandle);
    storage.setPersistentItem(FALLBACK_KEY, oldText);
    await chooseInput(env, panel, new Blob([fileText], { type: 'application/json' }), 'handleImportArchive');
    assert.deepEqual(content(panel), before);
    assert.equal(panel.draft.value, '尚未发送的草稿');
    assert.equal(env.cache.get(HANDLE_KEY), oldHandle);
    assert.equal(storage.getPersistentItem(FALLBACK_KEY), oldText);
    assert.equal(panel.archiveBusy.value, false);
    assert.deepEqual(env.toasts.map(({ title, icon }) => ({ title, icon })), [{ title: expectedTitle, icon: 'none' }]);
  });
}

for (const outcome of ['success', 'cancel', 'read failure', 'click failure']) {
  test(`input archive picker stays in the document while choosing and cleans up after ${outcome}`, async t => {
    const env = environment(t); const panel = loadPanel(); keepConversation(panel);
    let input, connectedAtClick, hiddenAtClick;
    t.mock.method(env.dom.window.HTMLInputElement.prototype, 'click', function () {
      input = this;
      connectedAtClick = this.isConnected;
      hiddenAtClick = this.hidden;
      if (outcome === 'click failure') throw new Error('file picker unavailable');
    });
    const pending = panel.handleImportArchive();
    assert.ok(input, 'the file picker was invoked');
    if (outcome !== 'click failure') {
      assert.equal(panel.archiveBusy.value, true);
      if (outcome === 'cancel') input.dispatchEvent(new env.dom.window.Event('cancel'));
      else {
        const file = outcome === 'read failure'
          ? { text: async () => { throw new Error('file read failed'); } }
          : new Blob([JSON.stringify(oldArchive)], { type: 'application/json' });
        Object.defineProperty(input, 'files', { value: [file] });
        input.dispatchEvent(new env.dom.window.Event('change'));
      }
    }
    await pending;
    assert.equal(connectedAtClick, true, 'the browser filechooser needs a live DOM node while choosing a file');
    assert.equal(hiddenAtClick, true, 'the temporary input must not add visible controls');
    assert.equal(input.isConnected, false);
    assert.equal(env.dom.window.document.querySelector('input[type="file"]'), null);
    assert.equal(input.onchange, null);
    assert.equal(input.oncancel, null);
    assert.equal(panel.archiveBusy.value, false);
    assert.equal(panel.messages.at(-1).text, outcome === 'success' ? '旧归档' : '保留当前对话');
    assert.equal(env.toasts.length, outcome === 'cancel' ? 0 : 1);
    assert.equal(env.toasts.some(toast => toast.icon === 'success'), outcome === 'success');
  });
}

test('native archive save writes UTF-8 file bytes that restore exact roles, text and times with unique IDs', async t => {
  const env = environment(t); const source = loadPanel(); const handle = fileHandle(t);
  source.messages.push(...roundtripMessages.map((message, index) => ({ ...message, id: `original-${index}`, status: 'ready' })));
  source.messages.push({ id: 'failed', role: 'assistant', text: '失败回答', time: '23:59', status: 'error' });
  env.dom.window.showSaveFilePicker = async () => handle;
  await source.handleSaveArchive();
  const exported = JSON.parse(fs.readFileSync(handle.filename, 'utf8'));
  assert.equal(exported.v, 1); assert.equal(exported.kind, 'chat');
  assert.deepEqual(exported.messages, roundtripMessages);
  env.dom.window.showOpenFilePicker = async () => [handle];
  const restored = loadPanel(); await restored.handleRestoreArchive();
  assert.deepEqual(content(restored), roundtripMessages);
  restored.draft.value = '继续'; await restored.handleSend();
  assert.equal(new Set(restored.messages.map(message => message.id)).size, restored.messages.length);
  assert.equal(restored.archiveBusy.value, false);
});

for (const picker of ['native', 'input']) {
  for (const remembered of ['valid archive A', 'malformed archive A']) {
    test(`manual ${picker} import selects archive B after remembering ${remembered}`, async t => {
      const env = environment(t); const panel = loadPanel(); keepConversation(panel);
      const oldHandle = fileHandle(t, remembered.startsWith('valid') ? JSON.stringify(oldArchive) : '{invalid json');
      env.cache.set(HANDLE_KEY, oldHandle);
      storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
      const selectedArchive = { ...oldArchive, messages: roundtripMessages };
      const selectedHandle = fileHandle(t, JSON.stringify(selectedArchive));
      if (picker === 'native') {
        env.dom.window.showOpenFilePicker = async () => [selectedHandle];
        await panel.handleRestoreArchive();
      } else {
        await chooseInput(env, panel, await selectedHandle.getFile());
      }
      assert.deepEqual(content(panel), roundtripMessages, 'the explicitly selected B must replace the conversation');
      assert.deepEqual(JSON.parse(storage.getPersistentItem(FALLBACK_KEY)), selectedArchive);
      assert.equal(env.cache.get(HANDLE_KEY), picker === 'native' ? selectedHandle : null);
      assert.equal(panel.archiveBusy.value, false);
      const reopened = loadPanel(); await reopened.tryAutoRestoreOnOpen();
      assert.deepEqual(content(reopened), roundtripMessages, 'a later open must restore the selected B');
    });
  }

  test(`cancelled manual ${picker} import preserves remembered A, its backup and current conversation`, async t => {
    const env = environment(t); const panel = loadPanel(); keepConversation(panel);
    const before = content(panel); const oldText = JSON.stringify(oldArchive);
    const oldHandle = fileHandle(t, oldText);
    env.cache.set(HANDLE_KEY, oldHandle);
    storage.setPersistentItem(FALLBACK_KEY, oldText);
    if (picker === 'native') {
      env.dom.window.showOpenFilePicker = async () => { throw new DOMException('用户取消', 'AbortError'); };
      await panel.handleRestoreArchive();
    } else {
      const restore = panel.handleRestoreArchive();
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(env.input, 'manual restore must offer a file choice even with remembered A');
      env.input.dispatchEvent(new env.dom.window.Event('cancel'));
      await restore;
    }
    assert.deepEqual(content(panel), before);
    assert.equal(env.cache.get(HANDLE_KEY), oldHandle);
    assert.equal(storage.getPersistentItem(FALLBACK_KEY), oldText);
    assert.equal(fs.readFileSync(oldHandle.filename, 'utf8'), oldText);
    assert.equal(panel.archiveBusy.value, false);
    assert.deepEqual(env.toasts, []);
  });
}

test('automatic restore still prefers its readable remembered file over the older backup', async t => {
  const env = environment(t); const panel = loadPanel();
  const latestArchive = { ...oldArchive, messages: roundtripMessages };
  env.cache.set(HANDLE_KEY, fileHandle(t, JSON.stringify(latestArchive)));
  storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
  await panel.tryAutoRestoreOnOpen();
  assert.deepEqual(content(panel), roundtripMessages);
  assert.deepEqual(env.toasts, []);
});

for (const operation of ['native import', 'input import', 'native save', 'download save']) {
  test(`${operation} remains the latest archive after its handle cache update fails`, async t => {
    const env = environment(t); const panel = loadPanel();
    env.cache.set(HANDLE_KEY, fileHandle(t, JSON.stringify(oldArchive)));
    storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
    t.mock.method(storage, 'idbSetItem', async () => { throw new Error('IndexedDB write failed'); });
    const selectedArchive = { ...oldArchive, messages: roundtripMessages };
    const selectedHandle = fileHandle(t, JSON.stringify(selectedArchive));
    if (operation === 'native import') {
      env.dom.window.showOpenFilePicker = async () => [selectedHandle];
      await panel.handleRestoreArchive();
    } else if (operation === 'input import') {
      await chooseInput(env, panel, await selectedHandle.getFile());
    } else {
      panel.messages.push(...roundtripMessages.map((message, index) => ({ ...message, id: `original-${index}`, status: 'ready' })));
      if (operation === 'native save') env.dom.window.showSaveFilePicker = async () => selectedHandle;
      else t.mock.method(env.dom.window.HTMLAnchorElement.prototype, 'click', () => {});
      await panel.handleSaveArchive();
    }
    assert.deepEqual(JSON.parse(storage.getPersistentItem(FALLBACK_KEY)).messages, roundtripMessages);
    const reopened = loadPanel(); await reopened.tryAutoRestoreOnOpen();
    assert.deepEqual(content(reopened), roundtripMessages, 'a stale handle must not override the latest backup');
    assert.equal(panel.archiveBusy.value, false);
  });
}

for (const operation of ['empty import', 'cancelled import', 'empty save']) {
  test(`pending auto-restore cannot replace the conversation after a manual ${operation}`, async t => {
    const env = environment(t); const panel = loadPanel();
    let finishRead, startRead;
    const started = new Promise(resolve => { startRead = resolve; });
    const pendingText = new Promise(resolve => { finishRead = resolve; });
    env.cache.set(HANDLE_KEY, {
      queryPermission: async () => 'granted',
      getFile: async () => ({ text: () => { startRead(); return pendingText; } }),
    });
    const autoRestore = panel.tryAutoRestoreOnOpen();
    await started;
    if (operation === 'empty save') {
      env.dom.window.showSaveFilePicker = async () => fileHandle(t);
      await panel.handleSaveArchive();
    } else {
      env.dom.window.showOpenFilePicker = async () => {
        if (operation === 'cancelled import') throw new DOMException('用户取消', 'AbortError');
        return [fileHandle(t, JSON.stringify({ ...oldArchive, messages: [] }))];
      };
      await panel.handleRestoreArchive();
    }
    const afterManual = content(panel);
    finishRead(JSON.stringify(oldArchive));
    await autoRestore;
    assert.deepEqual(content(panel), afterManual, 'an older pending read must not override the later manual action');
    assert.equal(panel.archiveBusy.value, false);
  });
}

test('successfully remembered native archive still follows later changes to its file', async t => {
  const env = environment(t); const panel = loadPanel();
  const handle = fileHandle(t, JSON.stringify(oldArchive));
  env.dom.window.showOpenFilePicker = async () => [handle];
  await panel.handleRestoreArchive();
  fs.writeFileSync(handle.filename, JSON.stringify({ ...oldArchive, messages: roundtripMessages }), 'utf8');
  const reopened = loadPanel(); await reopened.tryAutoRestoreOnOpen();
  assert.deepEqual(content(reopened), roundtripMessages, 'a current handle must remain preferred over its older backup');
});

test('downloaded Blob bytes roundtrip through input selection and become the latest local archive', async t => {
  const env = environment(t); const source = loadPanel(); let downloaded;
  const originalCreate = URL.createObjectURL;
  t.mock.method(URL, 'createObjectURL', blob => { downloaded = blob; return originalCreate(blob); });
  t.mock.method(env.dom.window.HTMLAnchorElement.prototype, 'click', function () { assert.match(this.download, /^ai-chat-.*\.json$/); });
  source.messages.push(...roundtripMessages.map((message, index) => ({ ...message, id: `original-${index}`, status: 'ready' })));
  await source.handleSaveArchive();
  assert.equal(downloaded.type, 'application/json;charset=utf-8');
  assert.deepEqual(JSON.parse(await downloaded.text()).messages, roundtripMessages);
  storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
  const restored = loadPanel(); await chooseInput(env, restored, downloaded);
  assert.deepEqual(content(restored), roundtripMessages);
  const reopened = loadPanel(); await reopened.tryAutoRestoreOnOpen();
  assert.deepEqual(content(reopened), roundtripMessages, 'a later open must restore the imported archive, not the stale local backup');
});

const invalidArchives = [
  ['unsupported version', { ...oldArchive, v: 2 }],
  ['wrong kind', { ...oldArchive, kind: 'chart' }],
  ['non-array messages', { ...oldArchive, messages: {} }],
  ['null message', { ...oldArchive, messages: [null] }],
  ['unknown role', { ...oldArchive, messages: [{ role: 'system', text: '不可伪装成 AI 回复', time: '12:00' }] }],
  ['object text', { ...oldArchive, messages: [{ role: 'user', text: { bad: 'value' }, time: '12:00' }] }],
  ['missing time', { ...oldArchive, messages: [{ role: 'user', text: '字段缺失' }] }],
  ['object time', { ...oldArchive, messages: [{ role: 'user', text: '错误时间', time: {} }] }],
];
for (const [label, payload] of invalidArchives) {
  test(`invalid archive ${label} preserves current conversation and never remembers its file`, async t => {
    const env = environment(t); const panel = loadPanel(); keepConversation(panel);
    const before = content(panel); const handle = fileHandle(t, JSON.stringify(payload));
    env.dom.window.showOpenFilePicker = async () => [handle];
    await panel.handleRestoreArchive();
    assert.deepEqual(content(panel), before);
    assert.equal(env.cache.has(HANDLE_KEY), false, 'invalid file must not replace the reusable archive handle');
    assert.equal(panel.archiveBusy.value, false);
    assert.equal(env.toasts.some(toast => toast.icon === 'success'), false);
  });
}

for (const [label, file] of [
  ['read error', { text: async () => { throw new Error('文件读取失败'); } }],
  ['empty file', { text: async () => '' }],
]) {
  test(`selected input ${label} preserves current conversation instead of restoring unrelated backup`, async t => {
    const env = environment(t); const panel = loadPanel(); keepConversation(panel);
    storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
    await chooseInput(env, panel, file);
    assert.equal(panel.messages.at(-1).text, '保留当前对话');
    assert.equal(panel.archiveBusy.value, false);
    assert.equal(env.toasts.some(toast => toast.icon === 'success'), false);
    assert.equal(env.toasts.length, 1);
  });
}

test('unavailable IndexedDB does not block an explicit valid file import', async t => {
  const env = environment(t); const panel = loadPanel(); const handle = fileHandle(t, JSON.stringify(oldArchive));
  t.mock.method(storage, 'idbGetItem', async () => { throw new Error('IndexedDB unavailable'); });
  t.mock.method(storage, 'idbSetItem', async () => { throw new Error('IndexedDB unavailable'); });
  env.dom.window.showOpenFilePicker = async () => [handle];
  await panel.handleRestoreArchive();
  assert.deepEqual(content(panel), oldArchive.messages);
  assert.equal(panel.archiveBusy.value, false);
  assert.deepEqual(env.toasts.map(toast => toast.title), ['已恢复']);
});

for (const source of ['unavailable IndexedDB', 'unreadable remembered file', 'invalid remembered file']) {
  test(`auto-restore still reads its valid local backup with ${source}`, async t => {
    const env = environment(t); const panel = loadPanel();
    storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
    if (source === 'unavailable IndexedDB') t.mock.method(storage, 'idbGetItem', async () => { throw new Error('IndexedDB unavailable'); });
    else env.cache.set(HANDLE_KEY, source === 'unreadable remembered file'
      ? { queryPermission: async () => 'granted', getFile: async () => { throw new Error('file removed'); } }
      : fileHandle(t, '{invalid json'));
    await panel.tryAutoRestoreOnOpen();
    assert.deepEqual(content(panel), oldArchive.messages);
    assert.deepEqual(env.toasts, []);
  });
}

for (const failure of ['cancel', 'write']) {
  test(`native save ${failure} preserves the last saved backup and unlocks the panel`, async t => {
    const env = environment(t); const panel = loadPanel(); keepConversation(panel);
    storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
    env.dom.window.showSaveFilePicker = async () => {
      if (failure === 'cancel') throw new DOMException('用户取消', 'AbortError');
      return { createWritable: async () => ({ write: async () => { throw new Error('write failed'); }, close: async () => {} }) };
    };
    await panel.handleSaveArchive();
    assert.deepEqual(JSON.parse(storage.getPersistentItem(FALLBACK_KEY)), oldArchive);
    assert.equal(panel.messages.at(-1).text, '保留当前对话');
    assert.equal(panel.archiveBusy.value, false);
    assert.equal(env.toasts.length, failure === 'cancel' ? 0 : 1);
  });
}

test('successful native file save remains successful when remembering its handle fails', async t => {
  const env = environment(t); const panel = loadPanel(); const handle = fileHandle(t); keepConversation(panel);
  t.mock.method(storage, 'idbSetItem', async () => { throw new Error('IndexedDB unavailable'); });
  env.dom.window.showSaveFilePicker = async () => handle;
  await panel.handleSaveArchive();
  assert.equal(JSON.parse(fs.readFileSync(handle.filename, 'utf8')).messages[0].text, '保留当前对话');
  assert.deepEqual(env.toasts.map(toast => toast.title), ['已保存']);
  assert.equal(panel.archiveBusy.value, false);
});

test('chat download reports browser handoff without claiming a completed file save', async t => {
  const env = environment(t); const panel = loadPanel(); keepConversation(panel);
  t.mock.method(env.dom.window.HTMLAnchorElement.prototype, 'click', () => {});
  await panel.handleSaveArchive();
  assert.equal(env.toasts.length, 1);
  assert.match(env.toasts[0].title, /下载/);
  assert.doesNotMatch(env.toasts[0].title, /已保存|下载完成|下载成功|已下载/);
  assert.equal(panel.archiveBusy.value, false);
});

test('chat download handoff failure releases its Blob and preserves the last archive', async t => {
  const env = environment(t); const panel = loadPanel(); keepConversation(panel); let url;
  storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
  const create = URL.createObjectURL.bind(URL);
  t.mock.method(URL, 'createObjectURL', blob => { url = create(blob); return url; });
  t.after(() => { if (url) URL.revokeObjectURL(url); });
  t.mock.method(env.dom.window.HTMLAnchorElement.prototype, 'click', () => { throw new Error('download blocked'); });
  await panel.handleSaveArchive();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(resolveObjectURL(url), undefined, 'a failed download handoff must release its object URL');
  assert.deepEqual(JSON.parse(storage.getPersistentItem(FALLBACK_KEY)), oldArchive);
  assert.equal(env.toasts.some(toast => toast.icon === 'success'), false);
  assert.equal(panel.archiveBusy.value, false);
});

test('chat save without a browser reports unsupported export and preserves the last archive', async t => {
  const env = environment(t); const panel = loadPanel(); keepConversation(panel);
  storage.setPersistentItem(FALLBACK_KEY, JSON.stringify(oldArchive));
  global.window = undefined; global.document = undefined;
  await panel.handleSaveArchive();
  assert.deepEqual(JSON.parse(storage.getPersistentItem(FALLBACK_KEY)), oldArchive);
  assert.equal(env.toasts.length, 1);
  assert.equal(env.toasts[0].icon, 'none');
  assert.doesNotMatch(env.toasts[0].title, /已保存|已发起|下载成功/);
  assert.equal(panel.archiveBusy.value, false);
});
