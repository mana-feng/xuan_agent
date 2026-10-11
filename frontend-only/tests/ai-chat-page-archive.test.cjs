const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');
const Module = require('node:module');
const { resetPlatform, loadPage } = require('./helpers/load-chart-source.cjs');
const { createPinia, setActivePinia } = require('pinia');

const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(global, 'window');
const handlers = ['handleDownloadArchive', 'handleImportArchive', 'handleSaveArchive'];

beforeEach(() => {
  resetPlatform();
  // This regression must let the original 300ms timeout actually elapse.
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
  setActivePinia(createPinia());
});
afterEach(() => {
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
  if (originalWindowDescriptor) Object.defineProperty(global, 'window', originalWindowDescriptor);
  else delete global.window;
});

function loadChatPage(mounted) {
  const previousLoad = Module._load;
  if (mounted) {
    Module._load = function (request, ...args) {
      const loaded = previousLoad.call(this, request, ...args);
      return request === 'vue' ? { ...loaded, onMounted: callback => mounted.push(callback) } : loaded;
    };
  }
  try {
    return loadPage('pages/chat/index.nvue', ['panelRef', 'archiveBusy', 'sending', 'canChooseArchiveLocation', ...handlers]);
  } finally {
    Module._load = previousLoad;
  }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // Keep a failed pre-fix delegate from becoming an unhandled rejection.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

for (const handler of handlers) {
  test(`page ${handler} stays busy past 300ms and blocks all archive actions until its delegate settles`, async () => {
    const page = loadChatPage(); const operation = deferred(); const calls = [];
    // Only the child boundary is controlled; the parent handlers and refs are real source.
    page.panelRef.value = Object.fromEntries(handlers.map(name => [name, () => {
      calls.push(name);
      return operation.promise;
    }]));
    const pending = page[handler]();
    assert.equal(page.archiveBusy.value, true);
    await sleep(350);
    const busyWhilePending = page.archiveBusy.value;
    const duplicateActions = handlers.map(name => page[name]());
    operation.resolve();
    await Promise.all([pending, ...duplicateActions]);
    assert.deepEqual({ busyWhilePending, calls }, { busyWhilePending: true, calls: [handler] });
    assert.equal(page.archiveBusy.value, false);
  });

  test(`page ${handler} unlocks when its child completes and permits the next operation`, async () => {
    const page = loadChatPage(); let completed = 0;
    page.panelRef.value = { [handler]: async () => { await Promise.resolve(); completed++; } };
    await page[handler]();
    assert.equal(completed, 1);
    assert.equal(page.archiveBusy.value, false);
    await page[handler]();
    assert.equal(completed, 2);
    assert.equal(page.archiveBusy.value, false);
  });

  for (const [outcome, error] of [
    ['cancellation', new DOMException('User cancelled selection', 'AbortError')],
    ['asynchronous failure', new Error('Archive operation failed')],
  ]) {
    test(`page ${handler} unlocks after ${outcome} without losing the rejection`, async () => {
      const page = loadChatPage(); const operation = deferred();
      page.panelRef.value = { [handler]: () => operation.promise };
      const pending = Promise.resolve(page[handler]()).catch(reason => reason);
      assert.equal(page.archiveBusy.value, true);
      operation.reject(error);
      const result = await pending;
      assert.equal(page.archiveBusy.value, false);
      assert.equal(result, error);
    });
  }

  test(`page ${handler} unlocks if invoking the child throws synchronously`, async () => {
    const page = loadChatPage(); const error = new Error('Child invocation failed');
    page.panelRef.value = { [handler]: () => { throw error; } };
    await assert.rejects(async () => page[handler](), reason => reason === error);
    assert.equal(page.archiveBusy.value, false);
  });

  test(`page ${handler} does not leave a busy lock when its panel is unavailable`, async () => {
    const page = loadChatPage();
    await page[handler]();
    assert.equal(page.archiveBusy.value, false);
  });
}

test('page refuses download, import and choose-location save while a chat response is being sent', async () => {
  const page = loadChatPage(); let calls = 0;
  page.panelRef.value = Object.fromEntries(handlers.map(name => [name, () => { calls++; }]));
  page.sending.value = true;
  await Promise.all(handlers.map(name => page[name]()));
  assert.equal(calls, 0);
  assert.equal(page.archiveBusy.value, false);
});

for (const [label, browserWindow, supported] of [
  ['no browser environment', undefined, false],
  ['a browser without location saving', {}, false],
  ['a callable location-saving picker', { showSaveFilePicker() { throw new Error('Detection must not open a picker'); } }, true],
]) {
  test(`page shows choose-location save only after mounting with ${label}`, () => {
    if (browserWindow) global.window = browserWindow;
    else delete global.window;
    const mounted = [];
    const page = loadChatPage(mounted);
    assert.equal(page.canChooseArchiveLocation.value, false);
    // The unrelated greeting timer is not part of capability detection.
    global.setTimeout = () => 0;
    mounted.forEach(callback => callback());
    assert.equal(page.canChooseArchiveLocation.value, supported);
  });
}
