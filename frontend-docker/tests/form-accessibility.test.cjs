const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement'])
	global[name] = dom.window[name];
const { createApp, h, nextTick } = require('vue');
const { createPinia, setActivePinia } = require('pinia');
const sourceRoot = path.resolve(__dirname, '../src');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (request, ...args) {
	return originalResolve.call(
		this,
		request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request,
		...args
	);
};
Module._load = function (request, parent, isMain) {
	if (request === '@dcloudio/uni-app') return { onLoad() {}, onShow() {} };
	if (request.endsWith('PageScaffold.vue'))
		return {
			default: {
				setup(_, { slots }) {
					return () => h('main', slots.default?.());
				},
			},
			__esModule: true,
		};
	return originalLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) =>
	module._compile(
		ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
		}).outputText,
		filename
	);
require.extensions['.vue'] = (module, filename) => {
	const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
	descriptor.template.content = descriptor.template.content.replace(
		/(<\/?)(view|text|button|picker|navigator)(?=[\s>])/g,
		'$1uni-$2'
	);
	// Native tm overlays are outside this keyboard test; preserve their visible-state input as a custom element.
	descriptor.template.content = descriptor.template.content.replace(/v-model:show=/g, ':show=');
	descriptor.template.ast = undefined;
	const compiled = compileScript(descriptor, {
		id: path.basename(filename).replace(/\W/g, '-'),
		inlineTemplate: true,
		templateOptions: {
			compilerOptions: {
				isCustomElement: (tag) => tag.startsWith('uni-') || tag.startsWith('tm-'),
			},
		},
	});
	module._compile(
		ts.transpileModule(compiled.content, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
		}).outputText,
		filename
	);
};
require.extensions['.nvue'] = require.extensions['.vue'];

function mount(relativePath, props = {}) {
	global.uni = {
		getStorageSync() {},
		setStorageSync() {},
		showToast() {},
		showModal() {},
		navigateTo() {},
		hideKeyboard() {},
	};
	const host = document.createElement('div');
	document.body.append(host);
	const pinia = createPinia();
	setActivePinia(pinia);
	const app = createApp(require(path.join(sourceRoot, relativePath)).default, props);
	app.use(pinia).mount(host);
	return {
		host,
		dispose() {
			app.unmount();
			host.remove();
		},
	};
}
function key(element, type, value, repeat = false) {
	const event = new dom.window.KeyboardEvent(type, {
		key: value,
		repeat,
		bubbles: true,
		cancelable: true,
	});
	element.dispatchEvent(event);
	return event;
}
function press(element, value) {
	key(element, 'keydown', value);
	key(element, 'keyup', value);
}

test('method selection supports Tab and Enter/Space once even for held keys', () => {
	let selected = 0;
	const mounted = mount('components/liuyao/MethodCard.vue', {
		text: '时间起卦',
		onSelect: () => selected++,
	});
	try {
		const action = mounted.host.querySelector('.method-card');
		action.focus();
		assert.equal(document.activeElement, action);
		assert.equal(action.getAttribute('aria-label'), '选择时间起卦');
		for (const value of ['Enter', ' ']) {
			assert.equal(key(action, 'keydown', value).defaultPrevented, true);
			key(action, 'keydown', value, true);
			key(action, 'keyup', value);
			key(action, 'keyup', value);
		}
		assert.equal(selected, 2);
	} finally {
		mounted.dispose();
	}
});

test('online generation and disabled submission obey their live disabled state', async () => {
	const mounted = mount('pages/liuyao/index.nvue');
	try {
		const actions = mounted.host.querySelectorAll('.method-card');
		press(actions[1], 'Enter');
		await nextTick();
		const generate = mounted.host.querySelector('.online-casting .casting-button');
		assert.ok(generate, 'keyboard method selection must render online casting');
		press(generate, 'Enter');
		await nextTick();
		assert.match(mounted.host.querySelector('.casting-progress').textContent, /1\/6/);
		assert.equal(generate.getAttribute('tabindex'), '-1');
		press(generate, 'Enter');
		press(generate, ' ');
		await nextTick();
		assert.match(mounted.host.querySelector('.casting-progress').textContent, /1\/6/);
		const submit = mounted.host.querySelector('.casting-button.primary');
		assert.equal(submit.getAttribute('aria-disabled'), 'true');
		assert.equal(submit.getAttribute('tabindex'), '-1');
		let navigations = 0;
		global.uni.navigateTo = () => navigations++;
		press(submit, 'Enter');
		press(submit, ' ');
		assert.equal(navigations, 0);
	} finally {
		mounted.dispose();
	}
});

test('manual yao picker opens once by keyboard and names the actual line', () => {
	const mounted = mount('components/liuyao/YaoSelector.vue', {
		label: '初爻',
		modelValue: '0',
		options: [
			{ label: '请选择', value: '' },
			{ label: '少阴', name: '少阴', value: 0 },
		],
	});
	try {
		let opens = 0;
		mounted.host.querySelector('uni-picker').addEventListener('click', () => opens++);
		const trigger = mounted.host.querySelector('.picker-trigger');
		assert.match(trigger.getAttribute('aria-label') || '', /初爻.*少阴/);
		press(trigger, 'Enter');
		press(trigger, ' ');
		assert.equal(opens, 2);
	} finally {
		mounted.dispose();
	}
});

test('birth time settings expand by keyboard and preserve the selected zone and DST occurrence when folded', async () => {
	const mounted = mount('pages/ziwei/index.nvue');
	try {
		const toggle = mounted.host.querySelector('[aria-controls="birth-time-settings"]');
		assert.ok(toggle, 'advanced time settings must have a keyboard-operable disclosure');
		assert.equal(toggle.getAttribute('aria-expanded'), 'false');
		assert.equal(mounted.host.querySelector('#birth-time-settings'), null);
		assert.match(toggle.textContent, /北京/);
		press(toggle, 'Enter');
		await nextTick();
		const settings = mounted.host.querySelector('#birth-time-settings');
		assert.ok(settings);
		const picker = settings.querySelector('uni-picker');
		let opens = 0;
		picker.addEventListener('click', () => opens++);
		press(settings.querySelector('[aria-haspopup="dialog"]'), ' ');
		assert.equal(opens, 1);
		picker.dispatchEvent(new dom.window.CustomEvent('change', { detail: { value: 5 } }));
		await nextTick();
		const choices = settings.querySelectorAll('[aria-label="夏令时重复时间选择"] [role="button"]');
		press(choices[2], 'Enter');
		await nextTick();
		assert.equal(choices[2].getAttribute('aria-pressed'), 'true');
		press(toggle, ' ');
		await nextTick();
		assert.equal(toggle.getAttribute('aria-expanded'), 'false');
		assert.equal(mounted.host.querySelector('#birth-time-settings'), null);
		assert.match(toggle.textContent, /纽约/);
		assert.match(toggle.textContent, /较晚/);
		press(toggle, 'Enter');
		await nextTick();
		assert.equal(mounted.host.querySelectorAll('[aria-label="夏令时重复时间选择"] [role="button"]')[2].getAttribute('aria-pressed'), 'true');
	} finally {
		mounted.dispose();
	}
});

test('birth editor keeps invalid input visible and restores focus to its trigger after Escape', async () => {
	const mounted = mount('pages/ziwei/index.nvue');
	try {
		const trigger = mounted.host.querySelector('uni-button.birth-time-control');
		trigger.focus();
		press(trigger, 'Enter');
		await nextTick();
		await nextTick();
		const dialog = mounted.host.querySelector('[role="dialog"]');
		assert.ok(dialog);
		const date = dialog.querySelector('[aria-label="出生日期 年月日"]');
		assert.equal(document.activeElement, date);
		date.value = '2024-02-30';
		date.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		press(dialog.querySelector('.birth-submit'), 'Enter');
		await nextTick();
		assert.ok(mounted.host.querySelector('[role="dialog"]'));
		assert.match(dialog.querySelector('[role="alert"]').textContent, /日期|时间/);
		assert.equal(date.value, '2024-02-30');
		key(date, 'keydown', 'Escape');
		await nextTick();
		assert.equal(mounted.host.querySelector('[role="dialog"]'), null);
		assert.equal(document.activeElement, trigger);
	} finally {
		mounted.dispose();
	}
});
