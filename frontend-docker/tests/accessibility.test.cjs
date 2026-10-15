const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement']) {
	global[name] = dom.window[name];
}
const { createApp, nextTick } = require('vue');
const sourceRoot = path.resolve(__dirname, '../src');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	return originalResolve.call(this, request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, ...args);
};
require.extensions['.ts'] = (module, filename) => {
	module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS },
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

function mount(relativePath, props) {
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp(require(path.join(sourceRoot, relativePath)).default, props);
	app.mount(host);
	return { host, dispose() { app.unmount(); host.remove(); } };
}

function keydown(element, key, repeat = false) {
	const event = new dom.window.KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true });
	element.dispatchEvent(event);
	return event;
}

function keyup(element, key) {
	const event = new dom.window.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true });
	element.dispatchEvent(event);
	return event;
}

function press(element, key) {
	keydown(element, key);
	return keyup(element, key);
}

test('announcement dialog keeps keyboard focus inside and restores the opener and scrolling on close', async () => {
	const opener = document.createElement('button');
	document.body.append(opener);
	opener.focus();
	document.body.style.overflow = 'auto';
	let closes = 0;
	const mounted = mount('components/layout/AnnouncementDialog.vue', { announcements: [], loading: false, error: '', onClose: () => closes++ });
	try {
		await nextTick();
		await nextTick();
		const dialog = mounted.host.querySelector('[role="dialog"]');
		const close = mounted.host.querySelector('[aria-label="关闭公告"]');
		const done = mounted.host.querySelector('.announcement-done');
		assert.ok(dialog.contains(document.activeElement), 'opening the dialog moves focus out of the background');
		assert.equal(document.body.style.overflow, 'hidden');
		done.focus();
		keydown(done, 'Tab');
		assert.equal(document.activeElement, close, 'Tab wraps from the last control to the first');
		opener.focus();
		assert.ok(dialog.contains(document.activeElement), 'background cannot take keyboard focus while open');
		keydown(close, 'Escape');
		assert.equal(closes, 1);
	} finally { mounted.dispose(); }
	assert.equal(document.activeElement, opener);
	assert.equal(document.body.style.overflow, 'auto');
	opener.remove();
});

test('announcement failure offers retry without a contradictory empty message and cached content remains readable', () => {
	let retries = 0;
	const mounted = mount('components/layout/AnnouncementDialog.vue', { announcements: [], loading: false, error: '模拟请求失败', onRetry: () => retries++ });
	try {
		assert.match(mounted.host.textContent, /模拟请求失败/);
		assert.doesNotMatch(mounted.host.textContent, /暂无公告/);
		press(mounted.host.querySelector('.announcement-retry'), 'Enter');
		assert.equal(retries, 1);
	} finally { mounted.dispose(); }
	const cached = mount('components/layout/AnnouncementDialog.vue', { announcements: [{ id: 1, title: '使用提醒', content: '第一行\n第二行', expiresAt: null }], loading: false, error: '模拟请求失败' });
	try {
		assert.match(cached.host.textContent, /第一行\n第二行/);
		assert.match(cached.host.textContent, /模拟请求失败/);
	} finally { cached.dispose(); }
});

test('palette cards show the current choice, select once by keyboard and restore focus on dismissal', async () => {
	const opener = document.createElement('button'); document.body.append(opener); opener.focus();
	const selections = []; let closes = 0;
	const mounted = mount('components/shell/PaletteDialog.vue', { palette: 'aurora', onSelect: index => selections.push(index), onClose: () => closes++ });
	try {
		await nextTick(); await nextTick();
		const options = mounted.host.querySelectorAll('.palette-option');
		assert.equal(options.length, 3);
		assert.equal(options[0].getAttribute('aria-pressed'), 'true');
		assert.equal(options[1].getAttribute('aria-pressed'), 'false');
		assert.match(options[0].textContent, /青蓝流光/);
		assert.ok(mounted.host.querySelector('[role="dialog"]').contains(document.activeElement));
		press(options[1], ' ');
		assert.deepEqual(selections, [1], 'choosing amber must emit its actual palette index once');
		keydown(options[1], 'Escape'); assert.equal(closes, 1);
	} finally { mounted.dispose(); }
	assert.equal(document.activeElement, opener);
	opener.remove();
	assert.notEqual(document.body.style.overflow, 'hidden');
});

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
			send.dispatchEvent(new dom.window.Event('tap', { bubbles: true }));
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
		expand.dispatchEvent(new dom.window.Event('tap', { bubbles: true }));
		assert.equal(expansions, 2);
	} finally { mounted.dispose(); }
	const expanded = mount('pages/ziwei/components/PalaceContent.nvue', { palace, expanded: true });
	try { assert.equal(expanded.host.querySelector('.palace-expand'), null); }
	finally { expanded.dispose(); }
});

test('palace overview limits dense metadata while expanded details retain all chart fields', () => {
	const data = { ...palace, majorStars: [{ name: '紫微', brightness: '庙', mutagen: '科' }], minorStars: [{ name: '文昌', brightness: '旺' }], adjectiveStars: [{ name: '天喜' }], boshi12: '博士', jiangqian12: '将星', suiqian12: '岁建' };
	const compact = mount('pages/ziwei/components/PalaceContent.nvue', { palace: data });
	try {
		assert.match(compact.host.textContent, /紫微/);
		assert.doesNotMatch(compact.host.textContent, /小限|110|将星|天喜/);
	} finally { compact.dispose(); }
	const details = mount('pages/ziwei/components/PalaceContent.nvue', { palace: data, expanded: true, dynamicStars: ['流禄'], scopeMutagens: { 紫微: [{scope:'decadal',label:'大禄'}] } });
	try {
		for (const value of ['紫微', '文昌', '天喜', '博士', '将星', '岁建', '110', '流禄', '大禄']) assert.ok(details.host.textContent.includes(value), `missing ${value}`);
	} finally { details.dispose(); }
});

test('compact palace labels follow the selected timeline scope instead of the first available scope', () => {
	const mounted = mount('pages/ziwei/components/PalaceContent.nvue', { palace, activeScope: 'decadal', dynamicLabels: [{type:'hourly',text:'时命宫'},{type:'decadal',text:'大兄弟'}] });
	try { assert.match(mounted.host.textContent, /大兄弟/); assert.doesNotMatch(mounted.host.textContent, /时命宫/); }
	finally { mounted.dispose(); }
});

test('an activation key cannot leak to a document listener installed by the action', () => {
	let modalConfirms = 0;
	const onModalKeyup = (event) => { if (event.key === 'Enter') modalConfirms++; };
	const mounted = mount('components/agent/AgentConsolePanel.vue', {
		...consoleProps,
		onSend: () => document.addEventListener('keyup', onModalKeyup),
	});
	try {
		press(mounted.host.querySelector('.send-btn'), 'Enter');
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
