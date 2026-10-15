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
		ts.transpileModule(fs.readFileSync(filename, 'utf8').replace(/import\.meta/g, '({ env: {} })'), {
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

test('hexagram preview reads top to bottom and keeps moving markers separate from the strokes', () => {
	const mounted = mount('components/liuyao/ParamPreview.vue', { params: [1, 4, 0, 3, 1, 0] });
	try {
		const rows = [...mounted.host.querySelectorAll('[role="listitem"]')];
		assert.equal(rows.length, 6);
		assert.deepEqual(rows.map(row => row.querySelector('.yao-prefix').textContent), ['上爻', '五爻', '四爻', '三爻', '二爻', '初爻']);
		assert.deepEqual(rows.map(row => row.querySelector('.yao-name').textContent), ['少阴', '少阳', '老阳', '少阴', '老阴', '少阳']);
		assert.deepEqual(rows.map(row => row.querySelectorAll('.yao-stroke').length), [2, 1, 1, 2, 2, 1]);
		assert.deepEqual(rows.map(row => row.querySelector('.yao-motion').textContent.trim()), ['', '', '○', '', '×', '']);
		assert.equal(rows[2].querySelector('.yao-strokes').textContent.trim(), '');
		assert.match(mounted.host.querySelector('.param-summary').textContent, /2.*动爻/);
	} finally { mounted.dispose(); }
});

test('partially generated online hexagram keeps six positions without inventing uncast lines', () => {
	const mounted = mount('components/liuyao/ParamPreview.vue', { params: [4] });
	try {
		const rows = [...mounted.host.querySelectorAll('[role="listitem"]')];
		assert.equal(rows.length, 6);
		assert.equal(rows[5].querySelector('.yao-prefix').textContent, '初爻');
		assert.equal(rows[5].querySelector('.yao-name').textContent, '老阴');
		assert.equal(mounted.host.querySelectorAll('.yao-stroke').length, 2);
		assert.equal(mounted.host.querySelectorAll('.yao-pending').length, 5);
		assert.match(mounted.host.querySelector('.param-summary').textContent, /1.*6/);
	} finally { mounted.dispose(); }
});

test('manual yao choices show four graphical states and select the canonical value once by keyboard', async () => {
	const selected = [], changes = [];
	const mounted = mount('components/liuyao/YaoSelector.vue', {
		label: '初爻',
		modelValue: '0',
		options: [
			{ label: '请选择', value: '' },
			{ label: '少阴', name: '少阴', value: 0 },
			{ label: '少阳', name: '少阳', value: 1 },
			{ label: '老阳', name: '老阳', value: 3 },
			{ label: '老阴', name: '老阴', value: 4 },
		],
		'onUpdate:modelValue': value => selected.push(value), onChange: event => changes.push(event.detail.value),
	});
	try {
		const trigger = mounted.host.querySelector('.picker-trigger');
		assert.match(trigger.getAttribute('aria-label') || '', /初爻.*少阴/);
		assert.equal(mounted.host.querySelectorAll('.yao-stroke').length, 2, 'manual selection must use the same broken yin line as the preview');
		assert.equal(mounted.host.querySelector('[role="img"]').getAttribute('aria-label'), '阴爻，静爻');
		trigger.focus(); press(trigger, 'Enter'); await nextTick(); await nextTick();
		const dialog = mounted.host.querySelector('[role="dialog"]');
		assert.ok(dialog); assert.equal(dialog.getAttribute('aria-label'), '选择初爻');
		assert.equal(mounted.host.querySelector('uni-picker'), null, 'do not fall back to a textual native wheel');
		const choices = [...dialog.querySelectorAll('.yao-choice-option')];
		assert.equal(choices.length, 4);
		assert.deepEqual(choices.map(choice => choice.querySelectorAll('.yao-stroke').length), [2, 1, 1, 2]);
		assert.deepEqual(choices.map(choice => choice.querySelector('.yao-motion').textContent.trim()), ['', '', '○', '×']);
		assert.equal(choices[0].getAttribute('aria-pressed'), 'true');
		key(choices[2], 'keydown', 'Enter'); key(choices[2], 'keydown', 'Enter', true); key(choices[2], 'keyup', 'Enter');
		await nextTick(); await nextTick();
		assert.deepEqual(selected, ['3']); assert.deepEqual(changes, [3]);
		assert.equal(mounted.host.querySelector('[role="dialog"]'), null);
		assert.equal(document.activeElement, trigger);
	} finally {
		mounted.dispose();
	}
});

test('dismissing manual yao choices leaves the original value intact and clearing is explicit', async () => {
	const selected = [];
	const mounted = mount('components/liuyao/YaoSelector.vue', {
		label: '上爻', modelValue: 4,
		options: [{ value: '', label: '请选择' }, ...[0, 1, 3, 4].map(value => ({ value }))],
		'onUpdate:modelValue': value => selected.push(value),
	});
	try {
		const trigger = mounted.host.querySelector('.picker-trigger'); trigger.focus();
		press(trigger, ' '); await nextTick(); await nextTick();
		const dialog = mounted.host.querySelector('[role="dialog"]');
		key(dialog, 'keydown', 'Escape'); await nextTick();
		assert.deepEqual(selected, []); assert.equal(document.activeElement, trigger);
		press(trigger, 'Enter'); await nextTick(); await nextTick();
		press(mounted.host.querySelector('.yao-choice-clear'), 'Enter'); await nextTick();
		assert.deepEqual(selected, ['']);
		assert.equal(mounted.host.querySelector('[role="dialog"]'), null);
	} finally { mounted.dispose(); }
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

test('shared time card keeps supplied calendar data and exposes edit and optional restore actions by keyboard', () => {
	let edits = 0, restores = 0;
	const mounted = mount('components/form/TimeCard.vue', {
		label: '出生时间', date: '二〇二三年闰二月十五', clock: '23:07', zone: '纽约 · America/New_York',
		alternateLabel: '对应公历', alternate: '2023/04/05 23:07', onEdit: () => edits++, onNow: () => restores++,
	});
	try {
		assert.equal(mounted.host.querySelector('.time-card-date').textContent, '二〇二三年闰二月十五');
		assert.equal(mounted.host.querySelector('.time-card-clock').textContent, '23:07');
		assert.match(mounted.host.querySelector('.time-card-zone').textContent, /America\/New_York/);
		assert.match(mounted.host.querySelector('.time-card-alternate').textContent, /对应公历.*2023\/04\/05 23:07/);
		assert.equal(mounted.host.querySelector('.time-card-now'), null);
		press(mounted.host.querySelector('.time-card-edit'), 'Enter');
		assert.equal(edits, 1); assert.equal(restores, 0);
	} finally { mounted.dispose(); }
	const casting = mount('components/liuyao/TimeInput.vue', {
		modelValue: '2024-02-29 00:05', source: 'custom', onOpen: () => edits++, onUseNow: () => restores++,
	});
	try {
		assert.equal(casting.host.querySelector('.time-card-date').textContent, '2024 / 02 / 29');
		assert.equal(casting.host.querySelector('.time-card-clock').textContent, '00:05');
		assert.match(casting.host.querySelector('.time-card-status').textContent, /已指定时间/);
		press(casting.host.querySelector('.time-card-edit'), ' ');
		press(casting.host.querySelector('.time-card-now'), 'Enter');
		assert.equal(edits, 2); assert.equal(restores, 1);
	} finally { casting.dispose(); }
});

test('both birth pages retain the exact clock when switching the shared display to lunar dates', async () => {
	for (const page of ['index', 'ziwei']) {
		const mounted = mount(`pages/${page}/index.nvue`);
		try {
			press(mounted.host.querySelector('.time-card-edit'), 'Enter');
			await nextTick(); await nextTick();
			for (const [label, value] of [['年份', '1988'], ['月份', '02'], ['日期', '29'], ['小时', '00'], ['分钟', '05']]) {
				const field = mounted.host.querySelector(`[aria-label="${label}"]`);
				field.value = value; field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
			}
			press(mounted.host.querySelector('.datetime-confirm'), 'Enter');
			await nextTick(); await nextTick();
			assert.equal(mounted.host.querySelector('.time-card-date').textContent, '1988 / 02 / 29');
			assert.equal(mounted.host.querySelector('.time-card-clock').textContent, '00:05');
			const calendar = mounted.host.querySelectorAll('[aria-label="出生日期历法"] [role="button"]');
			press(calendar[1], ' '); await nextTick(); await nextTick();
			assert.match(mounted.host.querySelector('.time-card-date').textContent, /年.*月/);
			assert.equal(mounted.host.querySelector('.time-card-clock').textContent, '00:05');
			assert.match(mounted.host.querySelector('.time-card-alternate').textContent, /对应公历.*1988\/02\/29 00:05/);
			assert.equal(mounted.host.querySelector('.time-card-now'), null);
		} finally { mounted.dispose(); }
	}
});

test('birth editor corrects the day boundary and restores focus to its trigger after Escape', async () => {
	const mounted = mount('pages/ziwei/index.nvue');
	try {
		const trigger = mounted.host.querySelector('uni-button.time-card-edit');
		trigger.focus();
		press(trigger, 'Enter');
		await nextTick();
		await nextTick();
		const dialog = mounted.host.querySelector('[role="dialog"]');
		assert.ok(dialog);
		const date = dialog.querySelector('[aria-label="年份"]');
		assert.equal(document.activeElement, date);
		for (const [label, value] of [['年份', '2024'], ['月份', '02'], ['日期', '30']]) {
			const input = dialog.querySelector(`[aria-label="${label}"]`);
			input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		}
		await nextTick();
		assert.ok(mounted.host.querySelector('[role="dialog"]'));
		assert.equal(dialog.querySelector('[role="alert"]'), null);
		assert.equal(dialog.querySelector('[aria-label="日期"]').value, '29');
		key(date, 'keydown', 'Escape');
		await nextTick();
		assert.equal(mounted.host.querySelector('[role="dialog"]'), null);
		assert.equal(document.activeElement, trigger);
	} finally {
		mounted.dispose();
	}
});

test('date and clock fields accept distant birth years directly and adjust a leap day when the year changes', async () => {
	const confirmed = [];
	const mounted = mount('components/form/DateTimeDialog.vue', { date: '2024-02-29', clock: '23:59', title: '出生时间', onConfirm: value => confirmed.push(value) });
	try {
		const fill = (label, value) => { const input = mounted.host.querySelector(`[aria-label="${label}"]`); input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
		fill('年份', '1988'); fill('月份', '2'); fill('日期', '29'); fill('小时', '0'); fill('分钟', '5');
		press(mounted.host.querySelector('.datetime-confirm'), 'Enter'); await nextTick();
		assert.deepEqual(confirmed, [{ date: '1988-02-29', clock: '00:05', leap: false }]);
		fill('年份', '1989'); await nextTick();
		assert.equal(mounted.host.querySelector('[aria-label="日期"]').value, '28');
		press(mounted.host.querySelector('.datetime-confirm'), 'Enter');
		assert.equal(confirmed.length, 2); assert.equal(confirmed[1].date, '1989-02-28');
	} finally { mounted.dispose(); }
});

test('lunar date fields preserve an explicit leap month without treating it as a Gregorian date', async () => {
	const confirmed = [];
	const mounted = mount('components/form/DateTimeDialog.vue', { date: '2023-02-15', clock: '23:00', lunar: true, leap: true, onConfirm: value => confirmed.push(value) });
	try {
		press(mounted.host.querySelector('.datetime-confirm'), 'Enter'); await nextTick();
		assert.deepEqual(confirmed, [{ date: '2023-02-15', clock: '23:00', leap: true }]);
		const input = mounted.host.querySelector('[aria-label="月份"]'); input.value = '3'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		press(mounted.host.querySelector('.datetime-confirm'), 'Enter'); await nextTick();
		assert.equal(confirmed.length, 1); assert.match(mounted.host.querySelector('[role="alert"]').textContent, /闰月|农历/);
	} finally { mounted.dispose(); }
});

test('lunar editor preserves supported solar boundary dates and clamps to their matching lunar boundaries', async () => {
	for (const [date, clock] of [['1899-12-01', '00:05'], ['2099-11-20', '23:59']]) {
		const confirmed = [];
		const mounted = mount('components/form/DateTimeDialog.vue', { date, clock, lunar: true, onConfirm: value => confirmed.push(value) });
		try {
			press(mounted.host.querySelector('.datetime-confirm'), 'Enter'); await nextTick();
			assert.deepEqual(confirmed, [{ date, clock, leap: false }], 'opening and confirming must preserve the original date');
			for (const [label, value] of [['年份', date.startsWith('1899') ? '0' : '9999'], ['月份', date.startsWith('1899') ? '0' : '99'], ['日期', date.startsWith('1899') ? '0' : '99']]) {
				const field = mounted.host.querySelector(`[aria-label="${label}"]`);
				field.value = value; field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); field.dispatchEvent(new dom.window.Event('blur'));
			}
			press(mounted.host.querySelector('.datetime-confirm'), 'Enter'); await nextTick();
			assert.deepEqual(confirmed[1], { date, clock, leap: false }, 'clamp using supported solar dates expressed in the chosen calendar');
		} finally { mounted.dispose(); }
	}
});

test('out-of-range fields clamp to the nearest boundary without range hints', async () => {
	const confirmed = [];
	const mounted = mount('components/form/DateTimeDialog.vue', { date: '2024-02-29', clock: '23:59', onConfirm: value => confirmed.push(value) });
	try {
		const fill = (label, value) => { const input = mounted.host.querySelector(`[aria-label="${label}"]`); input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
		for (const [label, value] of [['年份', '9999'], ['月份', '13'], ['日期', '80'], ['小时', '99'], ['分钟', '99']]) fill(label, value);
		await nextTick();
		for (const [label, expected] of [['年份', '2099'], ['月份', '12'], ['日期', '31'], ['小时', '23'], ['分钟', '59']]) assert.equal(mounted.host.querySelector(`[aria-label="${label}"]`).value, expected, label);
		assert.equal(mounted.host.querySelector('.datetime-range'), null);
		assert.equal(mounted.host.querySelector('[role="alert"]'), null);
		assert.equal(mounted.host.querySelector('.datetime-confirm').getAttribute('aria-disabled'), 'false');
		press(mounted.host.querySelector('.datetime-confirm'), 'Enter');
		assert.deepEqual(confirmed[0], { date: '2099-12-31', clock: '23:59', leap: false });
		for (const label of ['年份', '月份', '日期', '小时', '分钟']) {
			fill(label, '0'); mounted.host.querySelector(`[aria-label="${label}"]`).dispatchEvent(new dom.window.Event('blur'));
		}
		await nextTick();
		assert.equal(mounted.host.querySelector('[role="alert"]'), null);
		assert.equal(mounted.host.querySelector('.datetime-confirm').getAttribute('aria-disabled'), 'false');
		press(mounted.host.querySelector('.datetime-confirm'), 'Enter');
		assert.deepEqual(confirmed[1], { date: '1900-01-01', clock: '00:00', leap: false });
	} finally { mounted.dispose(); }
});

test('day correction follows Gregorian leap years and selected lunar month', async () => {
	for (const [date, lunar, leap, expected] of [
		['1900-02-29', false, false, '28'], ['2000-02-29', false, false, '29'],
		['2024-04-31', false, false, '30'], ['2023-02-30', true, true, '29'],
	]) {
		const mounted = mount('components/form/DateTimeDialog.vue', { date, clock: '12:00', lunar, leap });
		try {
			await nextTick();
			assert.equal(mounted.host.querySelector('[aria-label="日期"]').getAttribute('aria-invalid'), 'false', date);
			assert.equal(mounted.host.querySelector('[aria-label="日期"]').value, expected);
		} finally { mounted.dispose(); }
	}
});

test('partial year entry remains editable until blur and repeating the same boundary updates the displayed input', async () => {
	const mounted = mount('components/form/DateTimeDialog.vue', { date: '2024-12-31', clock: '23:59' });
	try {
		const input = mounted.host.querySelector('[aria-label="年份"]');
		for (const year of ['1', '19', '198']) {
			input.value = year; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await nextTick();
			assert.equal(input.value, year);
		}
		input.dispatchEvent(new dom.window.Event('blur')); await nextTick(); assert.equal(input.value, '1900');
		const month = mounted.host.querySelector('[aria-label="月份"]');
		month.value = '99'; month.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await nextTick();
		assert.equal(month.value, '12');
	} finally { mounted.dispose(); }
});
