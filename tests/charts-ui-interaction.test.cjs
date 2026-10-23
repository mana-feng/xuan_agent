const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.__UNI_FEATURE_WXS__ = false;
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'CustomEvent', 'KeyboardEvent']) {
	global[name] = dom.window[name];
}
const sourceRoot = path.resolve(__dirname, '../src');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === 'vue') request = '@dcloudio/uni-h5-vue';
	return originalResolve.call(this, request === 'qimen-engine' ? path.join(sourceRoot, '../vendor/qfdk-qimen/lib/qimen.js') : request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, ...args);
};
const { createApp, nextTick, reactive } = require('vue');
const { createPinia } = require('pinia');

// Each user interaction starts after the previous render. JSDOM dispatches
// synchronously, so wall-clock milliseconds can otherwise make Vue mistake a
// new bubbling event for one already in progress when its listener was attached.
let userEventTime = Date.now();
test.beforeEach(context => {
	context.mock.method(Date, 'now', () => userEventTime);
});

// Run the installed uni runtime's real event normalizer without booting its router/platform APIs.
const uniSource = fs.readFileSync(require.resolve('@dcloudio/uni-h5/dist/uni-h5.es.js'), 'utf8');
const uniAst = ts.createSourceFile('uni-h5.js', uniSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const eventNames = new Set(['isBuiltInElement', 'isKeyboardEvent', 'isClickEvent', 'isMouseEvent', 'isTouchEvent', '$nne', 'findUniTarget', 'createNativeEvent', 'wrapperEvent', 'normalizeClickEvent', 'normalizeMouseEvent', 'createTouchEvent']);
const eventSource = uniAst.statements.filter(node => {
	const name = ts.isFunctionDeclaration(node) ? node.name?.text : ts.isVariableStatement(node) ? node.declarationList.declarations[0]?.name.getText(uniAst) : '';
	return eventNames.has(name);
}).map(node => node.getText(uniAst)).join('\n');
const shared = require('@vue/shared');
const normalizeNativeEvent = new Function('normalizeTarget', 'extend', 'isPlainObject', 'wrapperH5WxsEvent', 'getWindowTop', `${eventSource}\nreturn $nne;`)(
	require('@dcloudio/uni-shared').normalizeTarget, shared.extend, shared.isPlainObject,
	() => undefined, // No WXS or renderjs handlers are used by the tested components.
	() => 0,
);
require.extensions['.ts'] = (module, filename) => {
	module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
	}).outputText, filename);
};
require.extensions['.vue'] = (module, filename) => {
	const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
	// Model the custom H5 elements uni-app renders; these have no native button keyboard behavior.
	descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button|scroll-view)(?=[\s>])/g, '$1uni-$2');
	descriptor.template.ast = undefined;
	const compiled = compileScript(descriptor, {
		id: path.basename(filename).replace(/\W/g, '-'),
		inlineTemplate: true,
		templateOptions: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('uni-') || tag.startsWith('tm-') } },
	});
	module._compile(ts.transpileModule(compiled.content, {
		compilerOptions: { module: ts.ModuleKind.CommonJS },
	}).outputText, filename);
};
require.extensions['.nvue'] = require.extensions['.vue'];

function mount(relativePath, props, initialize = () => {}) {
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp(require(path.join(sourceRoot, relativePath)).default, props);
	app.use(createPinia());
	initialize();
	app.config.globalProperties.$nne = normalizeNativeEvent;
	const vm = app.mount(host);
	return { host, app, vm, dispose() { app.unmount(); host.remove(); } };
}

function dispatchUserEvent(element, event) {
	userEventTime++;
	element.dispatchEvent(event);
	return event;
}

function keydown(element, key, repeat = false) {
	return dispatchUserEvent(element, new dom.window.KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }));
}

function keyup(element, key) {
	return dispatchUserEvent(element, new dom.window.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
}

function press(element, key) {
	keydown(element, key);
	return keyup(element, key);
}


function platform(route) {
  const storage = new Map();
  global.getCurrentPages = () => [{ route }];
  global.uni = { getSystemInfoSync: () => ({ windowWidth: 390 }), $on() {}, $off() {},
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    showToast() {}, hideKeyboard() {}, showLoading() {}, hideLoading() {} };
}
async function settle() { for (let i = 0; i < 4; i++) await nextTick(); }

test('Liuyao editing a rejected DST time removes its stale dialog error', async () => {
  platform('pages/liuyao/index');
  const mounted = mount('pages/liuyao/index.nvue');
  try {
    const settings = mounted.host.querySelector('.calendar-toggle');
    dispatchUserEvent(settings, new Event('tap')); await settle();
    const zone = Array.from(mounted.host.querySelectorAll('.calendar-choices uni-button')).find(node => node.textContent === '纽约');
    dispatchUserEvent(zone, new Event('tap')); await settle();
    dispatchUserEvent(mounted.host.querySelector('.time-card-edit'), new Event('tap')); await settle();
    function input(part, value) {
      const field = mounted.host.querySelector('[data-time-part="' + part + '"]');
      field.value = value; dispatchUserEvent(field, new Event('input', { bubbles: true }));
    }
    input('year', '2026'); input('month', '03'); input('day', '08'); input('hour', '02'); input('minute', '30'); await settle();
    press(mounted.host.querySelector('.datetime-confirm'), 'Enter'); await settle();
    assert.match(mounted.host.querySelector('.datetime-error')?.textContent || '', /不存在|夏令/);
    input('hour', '03'); await settle();
    assert.match(mounted.host.querySelector('.datetime-preview').textContent, /03:30/);
    assert.equal(mounted.host.querySelector('.datetime-error'), null, 'valid correction must remove the rejected time error before another confirmation');

  } finally { mounted.dispose(); }
});

test('Ziwei page hide removes its teleported palace dialog before returning', async () => {
  platform('pages/ziwei/result');
  const mounted = mount('pages/ziwei/result.nvue', undefined, () => {
    require('../src/store/ziwei.ts').useZiweiStore().pull({ timestamp: new Date(1990,0,1,9).getTime(), gender: 0 });
  });
  try {
    dispatchUserEvent(mounted.host.querySelector('.palace-expand'), new Event('tap')); await settle();
    assert.ok(document.querySelector('.overview-dialog-mask'));
    const hidden = mounted.vm.$.onHide || [];
    hidden.forEach(callback => callback()); await settle();
    assert.equal(document.querySelector('.overview-dialog-mask'), null, 'a hidden cached page must not retain an overlay teleported to body');
    (mounted.vm.$.onShow || []).forEach(callback => callback()); await settle();
    assert.equal(document.querySelector('.overview-dialog-mask'), null);
    assert.equal(document.body.style.position, '');
  } finally { mounted.dispose(); }
});

test('Ziwei cached result returns with its palace dialog closed', async () => {
  platform('pages/ziwei/result');
  const { h, ref, KeepAlive } = require('vue');
  const visible = ref(true), Result = require('../src/pages/ziwei/result.nvue').default;
  const Other = { render: () => h('div', 'other page') };
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp({ render: () => h(KeepAlive, null, { default: () => h(visible.value ? Result : Other) }) });
  app.use(createPinia());
  require('../src/store/ziwei.ts').useZiweiStore().pull({ timestamp: new Date(1990,0,1,9).getTime(), gender: 0 });
  app.mount(host);
  try {
    dispatchUserEvent(host.querySelector('.palace-expand'), new Event('tap')); await settle();
    assert.ok(document.querySelector('.overview-dialog-mask'));
    visible.value = false; await settle();
    assert.equal(document.body.style.position, '');
    visible.value = true; await settle();
    assert.equal(document.querySelector('.overview-dialog-mask'), null, 'reactivation must not reopen the previous palace dialog');
    assert.equal(document.body.style.position, '');
  } finally { app.unmount(); host.remove(); }
});
