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
const { h5Button } = require('../src/utils/keyboard.ts');

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
	return { host, vm, dispose() { app.unmount(); host.remove(); } };
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


test('user menu traps focus within its options and locks background scrolling', async () => {
	const mounted = mount('components/UserAvatarDropdown.vue');
	try {
		const trigger = mounted.host.querySelector('.user-avatar');
		trigger.focus();
		press(trigger, 'Enter');
		await nextTick();
		await nextTick();
		const items = mounted.host.querySelectorAll('.menu-item');
		assert.equal(items.length, 4, 'main keeps login, announcement, history and about actions');
		assert.equal(document.activeElement, items[0], 'opening moves focus into the menu');
		assert.equal(document.body.style.position, 'fixed');
		const last = items[items.length - 1];
		last.focus();
		assert.equal(keydown(last, 'Tab').defaultPrevented, true);
		assert.equal(document.activeElement, items[0], 'Tab cannot reach controls behind the panel');
		const backTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
		dispatchUserEvent(items[0], backTab);
		assert.equal(document.activeElement, last);
		keydown(last, 'Escape');
		await nextTick();
		assert.equal(document.body.style.position, '');
		assert.equal(document.activeElement, trigger);
	} finally { mounted.dispose(); }
});

test('main user menu page-hide hook closes the dialog and releases the page', async () => {
	const mounted = mount('components/UserAvatarDropdown.vue');
	try {
		press(mounted.host.querySelector('.user-avatar'), 'Enter');
		await nextTick(); await nextTick();
		assert.equal(document.body.style.position, 'fixed');
		const hidden = mounted.vm.$.onHide || [];
		assert.ok(hidden.length, 'uni page-hide hook must be registered');
		hidden.forEach(callback => callback());
		await nextTick();
		assert.equal(mounted.host.querySelector('.dropdown-panel'), null);
		assert.equal(document.body.style.position, '');
	} finally { mounted.dispose(); }
});

test('cached modal consumers release focus and scroll locks while inactive', async () => {
	const { h, ref, KeepAlive } = require('vue');
	const { useModalFocus } = require('../src/utils/useModalFocus.ts');
	const visible = ref(true);
	const Modal = { setup() {
		const root = ref();
		useModalFocus(ref(true), root, () => {});
		return () => h('div', { ref: root, tabindex: -1 }, [h('button', 'modal control')]);
	} };
	const Other = { render: () => h('button', 'other page') };
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp({ render: () => h(KeepAlive, null, { default: () => h(visible.value ? Modal : Other) }) });
	app.mount(host);
	try {
		await nextTick();
		await nextTick();
		assert.equal(document.body.style.position, 'fixed');
		visible.value = false;
		await nextTick();
		await nextTick();
		assert.equal(document.body.style.position, '', 'cached dialogs must release the old page');
		const otherButton = host.querySelector('button');
		otherButton.focus();
		assert.equal(document.activeElement, otherButton, 'inactive dialogs cannot steal focus');
		visible.value = true;
		await nextTick();
		await nextTick();
		assert.equal(document.body.style.position, 'fixed', 'still-open dialog restores protection on activation');
		assert.equal(document.activeElement.textContent, 'modal control');
	} finally { app.unmount(); host.remove(); }
});


function drawerEnvironment(t) {
	global.getCurrentPages = () => [{ route: 'pages/agent/index' }];
	global.uni = { getStorageSync() {}, setStorageSync() {} };
	const media = { matches: true, addEventListener() {}, removeEventListener() {} };
	if (!window.matchMedia) window.matchMedia = () => ({});
	t.mock.method(window, 'matchMedia', () => media);
	const frames = [];
	global.requestAnimationFrame = callback => frames.push(callback);
	t.after(() => { delete global.requestAnimationFrame; });
	const originalStyle = window.getComputedStyle.bind(window);
	t.mock.method(window, 'getComputedStyle', element => {
		const style = originalStyle(element);
		if (!element.matches('.x-sidebar,.x-menu-scrim')) return style;
		// JSDOM has no CSS motion engine; supply the browser's transition timing.
		return new Proxy(style, { get(target, key) {
			if (key === 'transitionDuration') return '0.2s';
			if (key === 'transitionDelay') return '0s';
			if (key === 'transitionProperty') return element.matches('.x-sidebar') ? 'transform' : 'opacity';
			return Reflect.get(target, key);
		} });
	});
	return {
		async settle() {
			await nextTick();
			while (frames.length) frames.splice(0).forEach(callback => callback());
			await nextTick();
		},
		async finish(host) {
			await this.settle();
			for (const element of host.querySelectorAll('.x-sidebar,.x-menu-scrim')) {
				element.dispatchEvent(new dom.window.Event('transitionend', { bubbles: true }));
			}
			await nextTick();
		},
	};
}

test('drawer keeps the backdrop and scroll lock until its closing motion finishes', async t => {
	// Removing the closing overlay/lock early exposes the moving page underneath.
	const motion = drawerEnvironment(t);
	const mounted = mount('components/shell/WorkbenchNav.vue');
	try {
		const toggle = mounted.host.querySelector('.x-menu-toggle');
		toggle.focus();
		press(toggle, 'Enter');
		await motion.finish(mounted.host);
		assert.equal(document.body.style.position, 'fixed');
		press(mounted.host.querySelector('.x-drawer-close'), 'Enter');
		await motion.settle();
		assert.equal(toggle.getAttribute('aria-expanded'), 'false');
		assert.equal(document.body.style.position, 'fixed', 'closing must not reveal an unlocked page mid-motion');
		const scrim = mounted.host.querySelector('.x-menu-scrim');
		assert.ok(scrim, 'backdrop must remain throughout the closing motion');
		assert.notEqual(scrim.style.display, 'none');
		await motion.finish(mounted.host);
		assert.equal(mounted.host.querySelector('.x-sidebar').style.display, 'none');
		assert.equal(scrim.style.display, 'none');
		assert.equal(document.body.style.position, '');
		assert.equal(document.activeElement, toggle);
	} finally { mounted.dispose(); }
});

test('reopening a closing drawer cancels cleanup from its previous exit', async t => {
	const motion = drawerEnvironment(t);
	const mounted = mount('components/shell/WorkbenchNav.vue');
	try {
		const toggle = mounted.host.querySelector('.x-menu-toggle');
		press(toggle, 'Enter');
		await motion.finish(mounted.host);
		press(mounted.host.querySelector('.x-drawer-close'), 'Enter');
		await motion.settle();
		dispatchUserEvent(toggle, new dom.window.Event('tap'));
		await motion.finish(mounted.host);
		assert.equal(toggle.getAttribute('aria-expanded'), 'true');
		assert.equal(document.body.style.position, 'fixed');
		assert.notEqual(mounted.host.querySelector('.x-sidebar').style.display, 'none');
		keydown(document.activeElement, 'Escape');
		await motion.finish(mounted.host);
		assert.equal(document.body.style.position, '');
	} finally { mounted.dispose(); }
});

test('drawer announcement handoff returns focus to the visible menu toggle', async t => {
	const motion = drawerEnvironment(t);
	let announcement;
	global.uni.$emit = () => {
		announcement = mount('components/layout/AnnouncementDialog.vue', { announcements: [], loading: false, error: '' });
	};
	const mounted = mount('components/shell/WorkbenchNav.vue');
	try {
		const toggle = mounted.host.querySelector('.x-menu-toggle');
		toggle.focus();
		press(toggle, 'Enter');
		await motion.finish(mounted.host);
		const footer = mounted.host.querySelector('.x-side-footer [role="button"]');
		footer.focus();
		press(footer, 'Enter');
		await motion.finish(mounted.host);
		assert.ok(announcement.host.querySelector('.announcement-dialog'));
		assert.equal(document.body.style.position, 'fixed');
		announcement.dispose();
		announcement = undefined;
		assert.equal(document.activeElement, toggle, 'a hidden drawer footer must not receive restored focus');
		assert.equal(document.body.style.position, '');
	} finally { announcement?.dispose(); mounted.dispose(); }
});

test('cached navigation releases its drawer lock and returns with a closed drawer', async t => {
	const motion = drawerEnvironment(t);
	const { h, ref, KeepAlive } = require('vue');
	const visible = ref(true);
	const Nav = require('../src/components/shell/WorkbenchNav.vue').default;
	const Other = { render: () => h('div') };
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp({ render: () => h(KeepAlive, null, { default: () => h(visible.value ? Nav : Other) }) });
	app.mount(host);
	try {
		press(host.querySelector('.x-menu-toggle'), 'Enter');
		await motion.finish(host);
		assert.equal(document.body.style.position, 'fixed');
		visible.value = false;
		await motion.settle();
		assert.equal(document.body.style.position, '', 'a cached page cannot retain a modal scroll lock');
		visible.value = true;
		await motion.finish(host);
		assert.equal(host.querySelector('.x-menu-toggle').getAttribute('aria-expanded'), 'false');
		assert.equal(host.querySelector('.x-sidebar').style.display, 'none');
	} finally { app.unmount(); host.remove(); }
});

test('main navigation page-hide hook closes the drawer and releases its lock', async t => {
	const motion = drawerEnvironment(t);
	const mounted = mount('components/shell/WorkbenchNav.vue');
	try {
		press(mounted.host.querySelector('.x-menu-toggle'), 'Enter');
		await motion.finish(mounted.host);
		assert.equal(document.body.style.position, 'fixed');
		const hidden = mounted.vm.$.onHide || [];
		assert.ok(hidden.length, 'uni page-hide hook must be registered');
		hidden.forEach(callback => callback());
		await motion.finish(mounted.host);
		assert.equal(mounted.host.querySelector('.x-menu-toggle').getAttribute('aria-expanded'), 'false');
		assert.equal(document.body.style.position, '');
	} finally { mounted.dispose(); }
});


function keyboardEvent(key, element) {
  return {
    key,
    currentTarget: element,
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  };
}

test('a key press survives a render that recreates its handlers on the same focused element', () => {
  const dom = new JSDOM('<button></button>');
  const priorElement = global.Element;
  const priorDocument = global.document;
  global.Element = dom.window.Element;
  global.document = dom.window.document;
  try {
    const element = dom.window.document.querySelector('button');
    element.focus();
    let activations = 0;
    h5Button(() => { activations++; }).onKeydown(keyboardEvent('Enter', element));
    h5Button(() => { activations++; }).onKeyup(keyboardEvent('Enter', element));
    assert.equal(activations, 1);
  } finally {
    global.Element = priorElement;
    global.document = priorDocument;
    dom.window.close();
  }
});

test('focus loss cancels a held activation key', () => {
  const dom = new JSDOM('<button></button>');
  const priorElement = global.Element;
  const priorDocument = global.document;
  global.Element = dom.window.Element;
  global.document = dom.window.document;
  try {
    const element = dom.window.document.querySelector('button');
    element.focus();
    let activations = 0;
    const handlers = h5Button(() => { activations++; });
    handlers.onKeydown(keyboardEvent(' ', element));
    handlers.onBlur();
    handlers.onKeyup(keyboardEvent(' ', element));
    assert.equal(activations, 0);
  } finally {
    global.Element = priorElement;
    global.document = priorDocument;
    dom.window.close();
  }
});
