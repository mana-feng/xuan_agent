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
const sourceRoot = path.resolve(__dirname, '../src');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let opened = [];
const fixtures = Array.from({ length: 14 }, (_, index) => ({
  id: index + 1, type: 'bazi', title: `记录 ${index + 1}`, gender: '0',
  birthDatetime: '1993-09-20T03:00:00Z', createdAt: new Date(2026, 0, index + 1).toISOString(),
}));
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, ...args);
};
Module._load = function (request, parent, main) {
  if (request === '@/components/layout/PageScaffold.vue') return { default: { setup(_, { slots }) { return () => h('div', [...(slots['header-extra']?.() || []), ...(slots.default?.() || [])]); } } };
  if (request === '@dcloudio/uni-app') return { onLoad() {}, onShow() {} };
  if (request === '@/store/user') return { useUserStore: () => ({ isLoggedIn: true, restoreAuth() {} }) };
  if (request === '@/utils/tokenStore') return { getAccessToken: () => 'test-token' };
  if (request === '@/libs/utils/utils') return { default: { HideSecond: value => new Date(value).toISOString().slice(0, 16) } };
  if (request === '@/features/history/savedCharts') return {
    chartTypes: ['bazi', 'ziwei', 'liuyao', 'qimen'], chartTypeLabels: { bazi: '八字', ziwei: '紫微斗数', liuyao: '六爻', qimen: '奇门遁甲' },
    openSavedChart: record => opened.push(record),
  };
  if (request === '@/services/api/index') return { request: async url => ({ success: true, data: { list: new URL(url, 'http://test.local').searchParams.get('type') === 'bazi' ? fixtures : [] } }) };
  return originalLoad.call(this, request, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
require.extensions['.vue'] = (module, filename) => {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button|scroll-view)(?=[\s>])/g, '$1uni-$2');
  descriptor.template.ast = undefined;
  const compiled = compileScript(descriptor, {
    id: path.basename(filename).replace(/\W/g, '-'), inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') || tag.startsWith('tm-') } },
  });
  module._compile(ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
};
require.extensions['.nvue'] = require.extensions['.vue'];

function mount(relativePath) {
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp(require(path.join(sourceRoot, relativePath)).default); app.mount(host);
  return { host, dispose() { app.unmount(); host.remove(); } };
}
function press(element, key) {
  for (const type of ['keydown', 'keyup']) element.dispatchEvent(new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
}
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await nextTick(); };

test('recent record accepts Tab focus and Enter or Space opens that record once', async () => {
  opened = [];
  const mounted = mount('components/history/RecentExplorations.vue');
  try {
    await flush();
    const row = mounted.host.querySelector('.recent-row');
    assert.ok(row);
    row.focus();
    assert.equal(document.activeElement, row);
    assert.equal(row.getAttribute('role'), 'button');
    press(row, 'Enter');
    press(row, ' ');
    assert.deepEqual(opened.map(record => record.id), [14, 14]);
  } finally { mounted.dispose(); }
});

test('history pagination changes the actual rows by keyboard and excludes disabled pages from Tab order', async () => {
  const mounted = mount('pages/history/list.nvue');
  try {
    await new Promise(resolve => setTimeout(resolve, 130)); await flush();
    assert.equal(mounted.host.querySelectorAll('.record-row').length, 12);
    const [previous, next] = mounted.host.querySelectorAll('.pagination uni-button');
    assert.equal(previous.getAttribute('tabindex'), '-1');
    next.focus();
    assert.equal(document.activeElement, next);
    press(next, 'Enter'); await nextTick();
    assert.equal(mounted.host.querySelectorAll('.record-row').length, 2);
    assert.match(mounted.host.querySelector('.record-name').textContent, /记录 2/);
    assert.equal(next.getAttribute('tabindex'), '-1');
    assert.equal(next.getAttribute('aria-disabled'), 'true');
    press(next, ' '); await nextTick();
    assert.equal(mounted.host.querySelectorAll('.record-row').length, 2);
    press(previous, ' '); await nextTick();
    assert.equal(mounted.host.querySelectorAll('.record-row').length, 12);
  } finally { mounted.dispose(); }
});

test('Qimen type selection hides the gender controls and returning to all records shows cleared controls', async () => {
  const mounted = mount('pages/history/list.nvue');
  try {
    await new Promise(resolve => setTimeout(resolve, 130)); await flush();
    const female = [...mounted.host.querySelectorAll('.gender-filters uni-button')].find(button => button.textContent.trim() === '女');
    press(female, 'Enter'); await flush();
    assert.equal(female.getAttribute('aria-pressed'), 'true');
    const qimen = [...mounted.host.querySelectorAll('.history-filters uni-button')].find(button => button.textContent.includes('奇门'));
    press(qimen, 'Enter'); await flush();
    assert.equal(mounted.host.querySelector('.gender-filters'), null);
    press(mounted.host.querySelector('.history-filters uni-button'), 'Enter'); await flush();
    const allGenders = mounted.host.querySelector('.gender-filters uni-button');
    assert.ok(allGenders);
    assert.equal(allGenders.getAttribute('aria-pressed'), 'true');
  } finally { mounted.dispose(); }
});
