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
const { createApp } = require('vue');
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
