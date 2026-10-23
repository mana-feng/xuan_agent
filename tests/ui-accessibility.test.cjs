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
	app.mount(host);
	return { host, dispose() { app.unmount(); host.remove(); } };
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

const consoleProps = {
	subtitle: '', pendingAction: null, contextItems: [], messages: [], lastMessageId: '',
	modelValue: '请帮我排盘', sending: false, composeTip: '',
};

test('send is a Tab stop and Enter/Space sends once while held keys do not repeat', () => {
	let sends = 0;
	const mounted = mount('components/agent/AgentConsolePanel.vue', { ...consoleProps, onSend: () => sends++ });
	try {
		const send = mounted.host.querySelector('.send-btn');
		send.focus();
		assert.equal(document.activeElement, send, 'send must accept keyboard focus');
		assert.equal(send.getAttribute('role'), 'button');
		assert.equal(keydown(send, 'Enter').defaultPrevented, true);
		keydown(send, 'Enter', true);
		keyup(send, 'Enter');
		assert.equal(sends, 1);
		assert.equal(keydown(send, ' ').defaultPrevented, true);
		keyup(send, ' ');
		assert.equal(sends, 2);
		keydown(send, 'Tab');
		assert.equal(sends, 2);
	} finally { mounted.dispose(); }
});

test('sending and blank drafts cannot send from keyboard or pointer events', () => {
	for (const overrides of [{ sending: true }, { modelValue: '  ' }]) {
		let sends = 0;
		const mounted = mount('components/agent/AgentConsolePanel.vue', {
			...consoleProps, ...overrides, onSend: () => sends++,
		});
		try {
			const send = mounted.host.querySelector('.send-btn');
			assert.equal(send.getAttribute('tabindex'), '-1');
			press(send, 'Enter');
			press(send, ' ');
			dispatchUserEvent(send, new dom.window.Event('tap', { bubbles: true }));
			assert.equal(sends, 0);
		} finally { mounted.dispose(); }
	}
});

test('quick prompt is focusable and keyboard activation emits its actual prompt once', () => {
	const prompts = [];
	const mounted = mount('components/agent/AgentQuickPrompts.vue', {
		quickPrompts: [{ label: '职业', prompt: '帮我看职业方向' }],
		onQuickPrompt: (prompt) => prompts.push(prompt),
	});
	try {
		const chip = mounted.host.querySelector('.quick-chip');
		chip.focus();
		assert.equal(document.activeElement, chip);
		keydown(chip, ' ');
		keydown(chip, ' ', true);
		keyup(chip, ' ');
		assert.deepEqual(prompts, ['帮我看职业方向']);
	} finally { mounted.dispose(); }
});

test('tool actions expose distinct keyboard actions for navigation and Agent prompt', () => {
	const actions = [];
	const mounted = mount('components/agent/AgentToolPanel.vue', {
		toolCards: [{ target: 'bazi', icon: '', title: '八字', subtitle: '', summary: '', badges: [], prompt: '帮我用八字' }],
		onOpenTarget: (target) => actions.push(['open', target]),
		onQuickPrompt: (prompt) => actions.push(['prompt', prompt]),
	});
	try {
		for (const action of mounted.host.querySelectorAll('.tool-btn')) {
			action.focus();
			assert.equal(document.activeElement, action);
			press(action, 'Enter');
		}
		assert.deepEqual(actions, [['open', 'bazi'], ['prompt', '帮我用八字']]);
	} finally { mounted.dispose(); }
});

const palace = {
	name: '命宫', majorStars: [], minorStars: [], adjectiveStars: [],
	decadal: { range: [2, 11] }, ages: [2, 14, 26, 38, 50, 62, 74, 86, 98, 110],
	heavenlyStem: '甲', earthlyBranch: '子',
};

test('palace offers one explicit expansion action and hides it inside the expanded view', () => {
	let expansions = 0;
	const mounted = mount('pages/ziwei/components/PalaceContent.nvue', { palace, onExpand: () => expansions++ });
	try {
		const expand = mounted.host.querySelector('.palace-expand');
		assert.ok(expand, 'each palace needs a discoverable expansion action');
		expand.focus();
		assert.equal(document.activeElement, expand);
		press(expand, 'Enter');
		assert.equal(expansions, 1);
		dispatchUserEvent(expand, new dom.window.Event('tap', { bubbles: true }));
		assert.equal(expansions, 2);
	} finally { mounted.dispose(); }
	const expanded = mount('pages/ziwei/components/PalaceContent.nvue', { palace, expanded: true });
	try { assert.equal(expanded.host.querySelector('.palace-expand'), null); }
	finally { expanded.dispose(); }
});

test('an activation key cannot leak to a document listener installed by the action', () => {
	let sends = 0;
	let modalConfirms = 0;
	const onModalKeyup = (event) => { if (event.key === 'Enter') modalConfirms++; };
	const mounted = mount('components/agent/AgentConsolePanel.vue', {
		...consoleProps,
		onSend: () => { sends++; document.addEventListener('keyup', onModalKeyup); },
	});
	try {
		press(mounted.host.querySelector('.send-btn'), 'Enter');
		assert.equal(sends, 1);
		assert.equal(modalConfirms, 0, 'opening a modal must not confirm it with the same Enter');
	} finally {
		document.removeEventListener('keyup', onModalKeyup);
		mounted.dispose();
	}
});

test('the textarea confirm key cannot also confirm a newly opened modal', () => {
	let sends = 0;
	let modalConfirms = 0;
	const onModalKeyup = (event) => { if (event.key === 'Enter') modalConfirms++; };
	const mounted = mount('components/agent/AgentConsolePanel.vue', {
		...consoleProps,
		onSend: () => { sends++; document.addEventListener('keyup', onModalKeyup); },
	});
	try {
		const input = mounted.host.querySelector('.compose-input');
		// uni textarea emits confirm from its inner Enter keyup, before that key reaches document.
		input.addEventListener('keyup', () => input.dispatchEvent(new dom.window.Event('confirm')));
		press(input, 'Enter');
		assert.equal(sends, 1);
		assert.equal(modalConfirms, 0);
	} finally {
		document.removeEventListener('keyup', onModalKeyup);
		mounted.dispose();
	}
});

test('blank or in-flight drafts cannot bypass send guards using textarea confirm', () => {
	for (const overrides of [{ sending: true }, { modelValue: ' \n ' }]) {
		let sends = 0;
		const mounted = mount('components/agent/AgentConsolePanel.vue', { ...consoleProps, ...overrides, onSend: () => sends++ });
		try {
			dispatchUserEvent(mounted.host.querySelector('.compose-input'), new dom.window.Event('confirm'));
			assert.equal(sends, 0);
		} finally { mounted.dispose(); }
	}
});

test('pending navigation activates once from keyboard and is blocked while sending', () => {
	for (const sending of [false, true]) {
		let applications = 0;
		const mounted = mount('components/agent/AgentConsolePanel.vue', {
			...consoleProps, sending, pendingAction: { label: '打开八字', target: 'bazi' }, onApplyPending: () => applications++,
		});
		try {
			const action = mounted.host.querySelector('.action-btn');
			press(action, 'Enter');
			assert.equal(applications, sending ? 0 : 1);
			dispatchUserEvent(action, new dom.window.Event('tap'));
			assert.equal(applications, sending ? 0 : 2);
		} finally { mounted.dispose(); }
	}
});

test('thinking disclosure keyboard toggles the actual displayed message in every message state', async () => {
	for (const [status, text] of [['waiting', ''], ['stream', '回答中'], ['ready', '完整回答']]) {
		const message = reactive({ id: 'msg-1', role: 'assistant', time: '10:00', text, status, thinking: '思考内容', showThinking: false });
		const mounted = mount('components/agent/AgentConsolePanel.vue', { ...consoleProps, messages: [message] });
		try {
			const toggle = mounted.host.querySelector('.thinking-content, .thinking-toggle-bar');
			toggle.focus();
			assert.equal(document.activeElement, toggle);
			assert.equal(toggle.getAttribute('aria-expanded'), 'false');
			press(toggle, 'Enter');
			await nextTick();
			assert.equal(mounted.host.querySelector('.thinking-text').textContent, '思考内容');
			assert.equal(toggle.getAttribute('aria-expanded'), 'true');
			press(toggle, ' ');
			await nextTick();
			assert.equal(mounted.host.querySelector('.thinking-text'), null);
		} finally { mounted.dispose(); }
	}
});

test('local user menu opens with keyboard, closes with Escape and restores trigger focus', async () => {
	const mounted = mount('components/UserAvatarDropdown.vue');
	try {
		const trigger = mounted.host.querySelector('.user-avatar');
		assert.equal(trigger.getAttribute('aria-label'), '用户菜单');
		trigger.focus();
		assert.equal(document.activeElement, trigger);
		press(trigger, 'Enter');
		await nextTick();
		assert.equal(trigger.getAttribute('aria-expanded'), 'true');
		const item = mounted.host.querySelector('.menu-item');
		item.focus();
		assert.equal(document.activeElement, item);
		assert.equal(keydown(item, 'Escape').defaultPrevented, true);
		await nextTick();
		assert.equal(mounted.host.querySelector('.dropdown-panel'), null);
		assert.equal(document.activeElement, trigger);
		assert.equal(trigger.getAttribute('aria-expanded'), 'false');
	} finally { mounted.dispose(); }
});

test('user menu keyboard and pointer actions retain the three local routes', async () => {
	const routes = [];
	global.uni = { navigateTo: ({ url }) => routes.push(url) };
	const mounted = mount('components/UserAvatarDropdown.vue');
	try {
		for (let index = 0; index < 3; index++) {
			dispatchUserEvent(mounted.host.querySelector('.user-avatar'), new dom.window.Event('tap'));
			await nextTick();
			const items = mounted.host.querySelectorAll('.menu-item');
			assert.equal(items.length, 3);
			if (index === 1) dispatchUserEvent(items[index], new dom.window.Event('click', { bubbles: true }));
			else press(items[index], index === 0 ? 'Enter' : ' ');
			await nextTick();
			assert.equal(mounted.host.querySelector('.dropdown-panel'), null);
		}
		assert.deepEqual(routes, ['/pages/settings/index', '/pages/history/list', '/pages/about/index']);
	} finally { mounted.dispose(); }
});

test('user menu backdrop closes the visible menu', async () => {
	const mounted = mount('components/UserAvatarDropdown.vue');
	try {
		dispatchUserEvent(mounted.host.querySelector('.user-avatar'), new dom.window.Event('tap'));
		await nextTick();
		dispatchUserEvent(mounted.host.querySelector('.dropdown-panel'), new dom.window.Event('tap'));
		await nextTick();
		assert.equal(mounted.host.querySelector('.dropdown-panel'), null);
	} finally { mounted.dispose(); }
});

test('user menu traps focus within its options and locks background scrolling', async () => {
	const mounted = mount('components/UserAvatarDropdown.vue');
	try {
		const trigger = mounted.host.querySelector('.user-avatar');
		trigger.focus();
		press(trigger, 'Enter');
		await nextTick();
		await nextTick();
		const items = mounted.host.querySelectorAll('.menu-item');
		assert.equal(document.activeElement, items[0], 'opening moves focus into the menu');
		assert.equal(document.body.style.position, 'fixed');
		items[2].focus();
		assert.equal(keydown(items[2], 'Tab').defaultPrevented, true);
		assert.equal(document.activeElement, items[0], 'Tab cannot reach controls behind the panel');
		const backTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
		dispatchUserEvent(items[0], backTab);
		assert.equal(document.activeElement, items[2]);
		keydown(items[2], 'Escape');
		await nextTick();
		assert.equal(document.body.style.position, '');
		assert.equal(document.activeElement, trigger);
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

test('home icon is named, focusable, and keyboard opens the frontend Agent home', () => {
	const routes = [];
	global.getCurrentPages = () => [{ route: 'pages/about/index' }];
	global.uni = { getSystemInfoSync: () => ({ windowWidth: 390 }),
		$on() {}, $off() {}, reLaunch: ({ url }) => routes.push(url) };
	const mounted = mount('components/yx-nav-header/yx-nav-header.vue');
	try {
		const home = mounted.host.querySelector('.app-header__logo');
		assert.equal(home.getAttribute('aria-label'), '返回首页');
		home.focus();
		assert.equal(document.activeElement, home);
		press(home, ' ');
		assert.deepEqual(routes, ['/pages/agent/index']);
	} finally { mounted.dispose(); }
});

test('stream updates while a disclosure key is held do not discard its keyboard activation', async () => {
	const message = reactive({ id: 'stream-1', role: 'assistant', time: '10:00', text: '', status: 'stream', thinking: '初始思考', showThinking: false });
	const mounted = mount('components/agent/AgentConsolePanel.vue', { ...consoleProps, messages: [message] });
	try {
		const toggle = mounted.host.querySelector('.thinking-content');
		toggle.focus();
		keydown(toggle, ' ');
		message.thinking += '，新增流式内容';
		await nextTick();
		keyup(toggle, ' ');
		await nextTick();
		assert.equal(mounted.host.querySelector('.thinking-text')?.textContent, '初始思考，新增流式内容');
	} finally { mounted.dispose(); }
});

test('moving focus away cancels a held activation key', () => {
	let sends = 0;
	const mounted = mount('components/agent/AgentConsolePanel.vue', { ...consoleProps, onSend: () => sends++ });
	try {
		const send = mounted.host.querySelector('.send-btn');
		send.focus();
		keydown(send, ' ');
		mounted.host.querySelector('.compose-input').focus();
		send.focus();
		keyup(send, ' ');
		assert.equal(sends, 0, 'focus loss cancels the press before key release');
	} finally { mounted.dispose(); }
});

function mountZiweiResult() {
	const storage = new Map();
	global.getCurrentPages = () => [{ route: 'pages/ziwei/result' }];
	global.uni = {
		getSystemInfoSync: () => ({ windowWidth: 390 }),
		$on() {}, $off() {},
		getStorageSync: (key) => storage.get(key),
		setStorageSync: (key, value) => storage.set(key, value),
	};
	return mount('pages/ziwei/result.nvue', undefined, () => {
		require('../src/store/ziwei.ts').useZiweiStore().pull({
			timestamp: new Date(1990, 0, 1, 9).getTime(), gender: 0,
		});
	});
}

test('palace detail escapes the transformed card and Escape returns focus to its trigger', async () => {
	const mounted = mountZiweiResult();
	try {
		const trigger = mounted.host.querySelector('.palace-expand');
		trigger.focus();
		press(trigger, 'Enter');
		await nextTick();
		const mask = document.querySelector('.overview-dialog-mask');
		assert.ok(mask);
		assert.equal(mask.closest('.page-card'), null, 'fixed dialog cannot live inside the animated card');
		assert.equal(mask.parentElement, document.body, 'the H5 dialog must use the viewport overlay layer');
		const close = mask.querySelector('[aria-label="关闭宫位放大"]');
		assert.ok(close);
		await nextTick();
		assert.equal(document.activeElement, close);
		assert.equal(mask.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
		assert.equal(keydown(close, 'Escape').defaultPrevented, true);
		await nextTick();
		assert.equal(document.querySelector('.overview-dialog-mask'), null);
		assert.equal(document.activeElement, trigger);
	} finally { mounted.dispose(); }
});

test('palace detail close action supports Space and its backdrop remains clickable', async () => {
	const mounted = mountZiweiResult();
	try {
		const trigger = mounted.host.querySelector('.palace-expand');
		for (const action of ['keyboard', 'backdrop']) {
			trigger.focus();
			press(trigger, ' ');
			await nextTick();
			const mask = document.querySelector('.overview-dialog-mask');
			assert.ok(mask);
			if (action === 'keyboard') {
				const close = mask.querySelector('.overview-close');
				assert.equal(close.getAttribute('role'), 'button');
				press(close, ' ');
			} else dispatchUserEvent(mask, new dom.window.Event('tap', { bubbles: true }));
			await nextTick();
			assert.equal(document.querySelector('.overview-dialog-mask'), null);
			assert.equal(document.activeElement, trigger);
		}
	} finally { mounted.dispose(); }
});

test('standalone history visibly renders saved local records without an account gate', async t => {
  const storage = new Map();
  global.getCurrentPages = () => [{ route: 'pages/history/list' }];
  global.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), $on() {}, $off() {}, showToast() {} };
  require('../src/utils/localChartRecords.ts').saveChartRecord('qimen', { title: '历史列表可见性测试', id: 99,
    birthDatetime: '2026-10-16T08:00:00.000Z', createdAt: '2026-10-16T08:00:00.000Z' });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mounted = mount('pages/history/list.nvue');
  try {
    t.mock.timers.tick(100);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await nextTick();
    assert.ok(mounted.host.querySelector('.record-open'), 'saved records must be in the visible document, outside an inert template');
    assert.equal(mounted.host.querySelector('.record-name').textContent, '历史列表可见性测试');
  } finally { mounted.dispose(); }
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
