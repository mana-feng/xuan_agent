const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { JSDOM } = require('jsdom');
require('./helpers/load-source.cjs');
let dom;
beforeEach(() => { dom = new JSDOM('<!doctype html><body></body>'); global.window = dom.window; global.document = dom.window.document; });
afterEach(() => { dom.window.close(); delete global.window; delete global.document; });

test('download link is attached and its file URL stays valid while the browser starts saving', () => {
  const { downloadChatArchive } = require('../src/chat/archiveFile.ts');
  const timers = [], revoked = []; let clicked = false;
  dom.window.URL.createObjectURL = () => 'blob:local-chat';
  dom.window.URL.revokeObjectURL = value => revoked.push(value);
  dom.window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return 1; };
  dom.window.HTMLAnchorElement.prototype.click = function () {
    assert.equal(this.isConnected, true); assert.equal(this.download, 'chat.json');
    assert.equal(this.href, 'blob:local-chat'); clicked = true;
  };
  downloadChatArchive('{"ct":"encrypted"}', 'chat.json');
  assert.equal(clicked, true); assert.deepEqual(revoked, []);
  assert.equal(timers[0].delay, 30_000);
  timers[0].callback(); assert.deepEqual(revoked, ['blob:local-chat']); assert.equal(document.querySelector('a'), null);
});

test('standard file chooser reads one encrypted archive and removes its DOM input', async () => {
  const { pickChatArchive } = require('../src/chat/archiveFile.ts');
  dom.window.HTMLInputElement.prototype.click = function () { assert.equal(this.isConnected, true); };
  const pending = pickChatArchive(); const input = document.querySelector('input[type=file]');
  assert.ok(input); assert.equal(input.accept, '.json,application/json');
  Object.defineProperty(input, 'files', { value: [{ size: 15, text: async () => '{"ct":"cipher"}' }] });
  input.dispatchEvent(new dom.window.Event('change'));
  assert.equal(await pending, '{"ct":"cipher"}'); assert.equal(document.querySelector('input'), null);
});

test('cancelled or oversized files leave no chooser behind and reject without reading content', async () => {
  const { pickChatArchive } = require('../src/chat/archiveFile.ts');
  dom.window.HTMLInputElement.prototype.click = function () {};
  let pending = pickChatArchive(); document.querySelector('input').dispatchEvent(new dom.window.Event('cancel'));
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(document.querySelector('input'), null);
  let read = false; pending = pickChatArchive(); const input = document.querySelector('input');
  Object.defineProperty(input, 'files', { value: [{ size: 5 * 1024 * 1024, text: async () => { read = true; return ''; } }] });
  input.dispatchEvent(new dom.window.Event('change'));
  await assert.rejects(pending, /文件过大/); assert.equal(read, false); assert.equal(document.querySelector('input'), null);
});

test('a picker focus return without selection releases the cancelled picker', async () => {
  const { pickChatArchive } = require('../src/chat/archiveFile.ts');
  const timers = [];
  dom.window.setTimeout = callback => { timers.push(callback); return 1; };
  dom.window.HTMLInputElement.prototype.click = function () {};
  const pending = pickChatArchive(); dom.window.dispatchEvent(new dom.window.Event('focus'));
  timers[0](); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(document.querySelector('input'), null);
});

test('file-read and input-click errors clean up without swallowing the error', async () => {
  const { pickChatArchive } = require('../src/chat/archiveFile.ts');
  dom.window.HTMLInputElement.prototype.click = function () { throw new Error('picker unavailable'); };
  await assert.rejects(pickChatArchive(), /picker unavailable/); assert.equal(document.querySelector('input'), null);
  dom.window.HTMLInputElement.prototype.click = function () {};
  const pending = pickChatArchive(), input = document.querySelector('input');
  Object.defineProperty(input, 'files', { value: [{ size: 10, text: async () => { throw new Error('read failed'); } }] });
  input.dispatchEvent(new dom.window.Event('change'));
  await assert.rejects(pending, /read failed/); assert.equal(document.querySelector('input'), null);
});

test('a refused download click releases its link and object URL immediately', () => {
  const { downloadChatArchive } = require('../src/chat/archiveFile.ts');
  const revoked = [];
  dom.window.URL.createObjectURL = () => 'blob:failed';
  dom.window.URL.revokeObjectURL = url => revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click = function () { throw new Error('download blocked'); };
  assert.throws(() => downloadChatArchive('{}', 'chat.json'), /download blocked/);
  assert.deepEqual(revoked, ['blob:failed']); assert.equal(document.querySelector('a'), null);
});
