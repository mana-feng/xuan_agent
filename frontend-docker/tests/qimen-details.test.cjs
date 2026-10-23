const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement']) global[name] = dom.window[name];
const { createApp, h, nextTick } = require('vue');
const { createPinia, setActivePinia } = require('pinia');
const sourceRoot = path.resolve(__dirname, '../src');
const resolve = Module._resolveFilename, load = Module._load;
let hide = [];
Module._resolveFilename = function (request, ...args) {
  const target = request === 'qimen-engine' ? path.join(sourceRoot, '../vendor/qfdk-qimen/lib/qimen.js') : request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request;
  return resolve.call(this, target, ...args);
};
Module._load = function (request, ...args) {
  if (request === '@dcloudio/uni-app') return { onShow() {}, onHide(callback) { hide.push(callback); } };
  if (request === '@/services/api/index') return { request() { throw new Error('No network expected'); } };
  if (request.endsWith('PageScaffold.vue')) return { __esModule: true, default: { setup(_, { slots }) { return () => h('main', slots.default?.()); } } };
  return load.call(this, request, ...args);
};
const compile = (source) => ts.transpileModule(source.replace(/import\.meta/g, '({ env: {} })'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8')), filename);
require.extensions['.nvue'] = (module, filename) => {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button)(?=[\s>])/g, '$1uni-$2');
  descriptor.template.ast = undefined;
  const output = compileScript(descriptor, { id: 'qimen-details', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') } } });
  module._compile(compile(output.content), filename);
};

async function mount(width) {
  let listener;
  const media = { matches: width <= 600, addEventListener(_, callback) { listener = callback; }, removeEventListener() { listener = undefined; } };
  window.matchMedia = () => media;
  global.uni = { getStorageSync() {}, setStorageSync() {}, removeStorageSync() {}, navigateTo() {}, showToast() {} };
  hide = [];
  const pinia = createPinia();
  setActivePinia(pinia);
  require('../src/store/qimen.ts').useQimenStore().pull({ question: '详情测试', timestamp: Date.parse('2025-12-31T16:00:00Z'), timeZone: 'Asia/Shanghai' });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(require('../src/pages/qimen/result.nvue').default);
  app.use(pinia).mount(host);
  await flush();
  return { host, resize(value) { media.matches = value <= 600; listener?.(media); }, hide() { hide.forEach(callback => callback()); }, dispose() { app.unmount(); host.remove(); assert.equal(listener, undefined); } };
}
async function flush() { await nextTick(); await nextTick(); }
function press(element, key, shiftKey = false) {
  for (const type of ['keydown', 'keyup']) element.dispatchEvent(new dom.window.KeyboardEvent(type, { key, shiftKey, bubbles: true, cancelable: true }));
}
function tap(element, normalized = false) {
  const event = new dom.window.Event('tap', { bubbles: true });
  // uni-h5 normalizes currentTarget to metadata; it is not the DOM button.
  if (normalized) {
    Object.defineProperty(event, 'currentTarget', { value: { id: '', dataset: {}, offsetLeft: 0, offsetTop: 0 } });
    Object.defineProperty(event, 'target', { value: { id: '', dataset: {}, offsetLeft: 0, offsetTop: 0 } });
  }
  element.dispatchEvent(event);
}

test('phone palace opens an accessible sheet and Escape restores focus and scrolling', async () => {
  const page = await mount(390);
  try {
    assert.equal(page.host.querySelector('[role="dialog"]'), null);
    assert.equal(page.host.querySelector('.qm-palace-detail'), null, 'phone detail starts closed');
    const palace = page.host.querySelector('[aria-label="巽4宫，查看详情"]');
    palace.focus(); press(palace, 'Enter'); await flush();
    const dialog = page.host.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.match(dialog.querySelector('h3').textContent, /巽4宫/);
    assert.equal(dialog.querySelectorAll('.qm-detail-grid > uni-view').length, 6);
    const close = dialog.querySelector('[aria-label="关闭宫位详情"]');
    assert.equal(document.activeElement, close);
    assert.equal(document.body.style.overflow, 'hidden');
    press(close, 'Tab'); assert.equal(document.activeElement, close);
    press(close, 'Tab', true); assert.equal(document.activeElement, close);
    press(close, 'Escape'); await flush();
    assert.equal(page.host.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, palace);
    assert.equal(document.body.style.overflow, '');
    press(palace, ' '); await flush();
    press(page.host.querySelector('[aria-label="关闭宫位详情"]'), 'Enter'); await flush();
    assert.equal(page.host.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, palace);
  } finally { page.dispose(); }
});

test('touch selection and backdrop dismissal restore focus to the selected palace', async () => {
  const page = await mount(390);
  try {
    const palace = page.host.querySelector('[aria-label="中5宫，查看详情"]');
    tap(palace, true); await flush();
    const dialog = page.host.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.match(dialog.textContent, /中宫不单独排门/);
    tap(dialog, true); await flush();
    assert.ok(page.host.querySelector('[role="dialog"]'), 'sheet content does not dismiss itself');
    tap(page.host.querySelector('.qm-detail-overlay'), true); await flush();
    assert.equal(page.host.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, palace);
  } finally { page.dispose(); }
});

test('tablet keeps inline detail and changing width releases a phone sheet', async () => {
  const page = await mount(834);
  try {
    const palace = page.host.querySelector('[aria-label="兑7宫，查看详情"]');
    palace.focus(); press(palace, 'Enter'); await flush();
    assert.equal(page.host.querySelector('[role="dialog"]'), null);
    assert.match(page.host.querySelector('.qm-palace-detail').textContent, /兑7宫/);
    assert.equal(document.activeElement, palace);
    assert.equal(document.body.style.overflow, '');
    page.resize(390); await flush();
    press(palace, 'Enter'); await flush();
    assert.ok(page.host.querySelector('[role="dialog"]'));
    page.resize(834); await flush();
    assert.equal(page.host.querySelector('[role="dialog"]'), null);
    assert.ok(page.host.querySelector('.qm-palace-detail'));
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.activeElement, palace);
  } finally { page.dispose(); }
});

test('leaving a phone result closes the sheet and releases the scroll lock', async () => {
  const page = await mount(390);
  try {
    tap(page.host.querySelector('.qm-palace')); await flush();
    assert.ok(page.host.querySelector('[role="dialog"]'));
    page.hide(); await flush();
    assert.equal(page.host.querySelector('[role="dialog"]'), null);
    assert.equal(document.body.style.overflow, '');
  } finally { page.dispose(); }
});
