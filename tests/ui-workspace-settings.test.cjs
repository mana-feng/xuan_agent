const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Document', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'KeyboardEvent']) global[name] = dom.window[name];
const sourceRoot = path.resolve(__dirname, '../src');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function(request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, ...args);
};
Module._load = function(request, ...args) {
  if (request.endsWith('PageScaffold.vue')) return { default: { template: '<div><slot /></div>' } };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename);
require.extensions['.vue'] = (module, filename) => {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button)(?=[\s>])/g, '$1uni-$2');
  descriptor.template.ast = undefined;
  const compiled = compileScript(descriptor, { id: 'workspace-settings', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') || tag === 'tm-app' || tag === 'picker' } },
  });
  module._compile(ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
};
const { createApp, nextTick } = require('vue');
let time = Date.now();
function press(element, key) {
  for (const type of ['keydown', 'keyup']) {
    time++;
    element.dispatchEvent(new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  }
}
function mountSettings(t) {
  t.mock.method(Date, 'now', () => time);
  const storage = new Map([['xuanxue_ai_config', JSON.stringify({ provider: 'custom', apiUrl: 'http://127.0.0.1:11434/v1/chat/completions', apiKey: 'fixture-only', model: 'fixture-model' })]]);
  global.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key) };
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp(require('../src/pages/settings/index.vue').default);
  app.mount(host);
  t.after(() => { app.unmount(); host.remove(); });
  return { host, storage };
}
test('settings key visibility accepts keyboard focus and Space toggles the actual input type', async t => {
  const { host } = mountSettings(t);
  await nextTick();
  const toggle = host.querySelector('.toggle-btn');
  toggle.focus();
  assert.equal(document.activeElement, toggle, 'show/hide must be a keyboard tab stop');
  assert.equal(host.querySelector('input[type=password]')?.value, 'fixture-only');
  press(toggle, ' '); await nextTick();
  assert.equal(host.querySelectorAll('input[type=password]').length, 0);
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  press(toggle, 'Enter'); await nextTick();
  assert.ok(host.querySelector('input[type=password]'));
});
test('settings save and clear activate from keyboard using isolated storage', async t => {
  const { host, storage } = mountSettings(t);
  await nextTick();
  const model = [...host.querySelectorAll('input')].at(-1);
  model.value = 'changed-model'; model.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  const save = host.querySelector('.btn-save'); save.focus(); press(save, 'Enter'); await nextTick();
  assert.equal(JSON.parse(storage.get('xuanxue_ai_config')).model, 'changed-model');
  assert.match(host.querySelector('.status')?.textContent || '', /已保存/);
  const clear = host.querySelector('.btn-clear'); clear.focus(); press(clear, ' '); await nextTick();
  assert.equal(storage.has('xuanxue_ai_config'), false);
  assert.ok([...host.querySelectorAll('input')].every(input => input.value === ''));
});
