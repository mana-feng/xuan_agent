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
const { createApp, nextTick, reactive, h } = require('vue');
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
	module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8').replace(/import\.meta/g, '({ env: {} })'), {
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
	const child = require(path.join(sourceRoot, relativePath)).default;
	const app = createApp({ render: () => h(child, { ...props }) });
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

const component = 'components/ganzhi-relationship/ganzhi-relationship.vue';
const sample = ['庚午', '壬午', '辛亥', '癸巳', '乙酉', '丙午', '戊戌'];
const labels = ['年柱', '月柱', '日柱', '时柱', '大运', '流年', '流月'];
function tap(element) { assert.ok(element, 'interactive target exists'); dispatchUserEvent(element, new Event('tap', { bubbles: true })); }
function selected(host) { return [...host.querySelectorAll('.pillar-node.is-target')].map(e => e.dataset.node).sort(); }

test('live diagram renders four to seven aligned columns and retains actual showKe filtering', async () => {
  platform('pages/index/detail');
  const props = reactive({ ganzhiList: sample.slice(0, 4), labels: labels.slice(0, 4) });
  const mounted = mount(component, props);
  try {
    for (let count = 4; count <= 7; count++) {
      props.ganzhiList = sample.slice(0, count); props.labels = labels.slice(0, count); await settle();
      assert.equal(mounted.host.querySelectorAll('.pillar-card').length, count);
      const actual = [...mounted.host.querySelectorAll('[data-edge-id]')].map(e => [e.dataset.kind, +e.dataset.from, +e.dataset.to, e.dataset.type]);
      const diagram = require('../src/libs/utils/bazi-enhanced.ts').buildGanZhiDiagram(props.ganzhiList, props.labels, { showKe: false });
      const expected = ['gan', 'zhi'].flatMap(kind => diagram[kind + 'Edges'].sort((a,b) => a.from-b.from || a.to-b.to).map(e => [kind,e.from,e.to,e.type]));
      assert.deepEqual(actual, expected);
      assert.equal(mounted.host.querySelector('[data-node="2:gan"] .day-mark').textContent, '日主');
    }
  } finally { mounted.dispose(); }
});

test('relationship explanation is a single brief meaning and repeated characters retain pillar identity', async () => {
  platform('pages/index/detail'); const mounted = mount(component, { ganzhiList: sample, labels });
  try {
    const row = mounted.host.querySelector('[data-kind="gan"][data-from="1"][data-to="5"]');
    tap(row); await settle();
    const dialog = mounted.host.querySelector('[role="dialog"]'); assert.ok(dialog);
    assert.match(dialog.textContent, /月柱.*壬.*流年.*丙/);
    assert.match(dialog.textContent, /冲/); assert.equal(dialog.querySelectorAll('.relation-meaning').length, 1);
    assert.doesNotMatch(dialog.textContent, /本盘影响|判断条件|十神|2026|原局/);
    assert.deepEqual(selected(mounted.host), ['1:gan', '5:gan']);
    const pair = [...mounted.host.querySelectorAll('[data-kind="zhi"][data-from="3"][data-to="4"]')];
    assert.ok(pair.length >= 2, 'same endpoints retain separate relationship meanings');
    for (const button of pair) { tap(button); await settle(); assert.equal(mounted.host.querySelectorAll('[role="dialog"]').length,1); assert.deepEqual(selected(mounted.host), ['3:zhi','4:zhi']); }
    tap(pair[pair.length-1]); await settle(); assert.equal(mounted.host.querySelector('[role="dialog"]'), null);
  } finally { mounted.dispose(); }
});

test('changing actual input removes stale explanation and node selection', async () => {
  platform('pages/index/detail');const props=reactive({ganzhiList:[...sample],labels:[...labels]});const mounted=mount(component,props);
  try {
    tap(mounted.host.querySelector('[data-edge-id]'));await settle();assert.ok(mounted.host.querySelector('[role="dialog"]'));
    props.ganzhiList=['甲寅','甲寅','甲寅','甲寅'];props.labels=labels.slice(0,4);await settle();
    assert.equal(mounted.host.querySelector('[role="dialog"]'),null);assert.deepEqual(selected(mounted.host),[]);
    assert.equal(mounted.host.querySelectorAll('.pillar-card').length,4);assert.match(mounted.host.textContent,/暂无可显示的干支关系/);
    props.ganzhiList=[];props.labels=[];await settle();assert.equal(mounted.host.querySelectorAll('.pillar-card').length,0);
  } finally { mounted.dispose(); }
});

test('keyboard, close and outside interactions return focus without stealing another control', async () => {
  platform('pages/index/detail');const mounted=mount(component,{ganzhiList:sample,labels});
  const other=document.createElement('button');other.textContent='另一个操作';document.body.append(other);
  try {
    const row=mounted.host.querySelector('[data-edge-id]');row.focus();press(row,'Enter');await settle();assert.ok(mounted.host.querySelector('[role="dialog"]'));
    keydown(document,'Escape');await settle();assert.equal(mounted.host.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,row);
    press(row,' ');await settle();tap(mounted.host.querySelector('.relation-close'));await settle();assert.equal(document.activeElement,row);
    tap(row);await settle();other.focus();dispatchUserEvent(other,new Event('pointerdown',{bubbles:true}));await settle();assert.equal(mounted.host.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,other);
    tap(row);await settle();tap(mounted.host.querySelector('[data-node="0:zhi"]'));await settle();assert.equal(mounted.host.querySelector('[role="dialog"]'),null);
    tap(row);await settle();mounted.dispose();other.focus();keydown(document,'Escape');assert.equal(document.activeElement,other);
  } finally { if(mounted.host.isConnected)mounted.dispose();other.remove(); }
});

test('placeholder columns preserve names and the real day-master identity, including eight columns', async () => {
  platform('pages/index/detail');
  const props=reactive({ganzhiList:['庚午','','辛亥','癸巳','流年','丙午','戊戌'],labels:[...labels]});
  const mounted=mount(component,props);
  try {
    assert.deepEqual([...mounted.host.querySelectorAll('.pillar-name')].map(e=>e.textContent),['年柱','日柱','时柱','流年','流月']);
    assert.equal(mounted.host.querySelector('.is-day-master [data-node]').dataset.node,'1:gan');
    assert.equal(mounted.host.querySelector('.is-day-master').textContent.includes('辛'),true);
    props.ganzhiList=[...sample,'丁卯'];props.labels=[...labels,'流日'];await settle();
    assert.equal(mounted.host.querySelectorAll('.pillar-card').length,8);
    assert.match(mounted.host.querySelector('.moving-group').textContent,/岁运/);
  } finally { mounted.dispose(); }
});

test('cached page hide and reactivation keep an old relationship explanation closed', async () => {
  platform('pages/index/detail');const mounted=mount(component,{ganzhiList:sample,labels});
  try {
    tap(mounted.host.querySelector('[data-edge-id]'));await settle();assert.ok(mounted.host.querySelector('[role="dialog"]'));
    const child=mounted.vm.$.subTree.component;
    const hooks=child.onHide || [];assert.ok(hooks.length,'real uni page-hide hook is registered');
    hooks.forEach(callback=>callback());await settle();assert.equal(mounted.host.querySelector('[role="dialog"]'),null);
    (child.onShow||[]).forEach(callback=>callback());await settle();assert.deepEqual(selected(mounted.host),[]);
    tap(mounted.host.querySelector('[data-edge-id]'));await settle();assert.ok(mounted.host.querySelector('[role="dialog"]'));
  } finally { mounted.dispose(); }
});

test('deactivated cached component returns with no old relationship highlight or explanation', async () => {
  platform('pages/index/detail');const {ref,KeepAlive}=require('vue'),visible=ref(true),Child=require(path.join(sourceRoot,component)).default;
  const host=document.createElement('div');document.body.append(host);const app=createApp({render:()=>h(KeepAlive,null,{default:()=>visible.value?h(Child,{ganzhiList:sample,labels}):null})});
  app.config.globalProperties.$nne=normalizeNativeEvent;app.mount(host);
  try {
    tap(host.querySelector('[data-edge-id]'));await settle();assert.ok(host.querySelector('[role="dialog"]'));
    visible.value=false;await settle();visible.value=true;await settle();assert.equal(host.querySelector('[role="dialog"]'),null);assert.deepEqual(selected(host),[]);
  } finally {app.unmount();host.remove();}
});
