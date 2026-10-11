const test = require('node:test');
const { before } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { build } = require('esbuild');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement']) global[name] = dom.window[name];
const { createApp, nextTick } = require('vue');
const { createPinia } = require('pinia');
let AuthPage;
let TmText;

function resetPlatform(requests = []) {
	global.uni = {
		getStorageSync: () => null, setStorageSync: () => {}, removeStorageSync: () => {},
		getSystemInfoSync: () => ({ windowHeight: 800, windowWidth: 375, statusBarHeight: 20 }),
		request: (options) => requests.push(options), showToast: () => {},
	};
}

before(async () => {
	const compiled = await build({
		absWorkingDir: path.resolve(__dirname, '..'),
		stdin: { contents: "export { default } from './src/pages/auth/auth.nvue'; export { default as TmText } from './src/libs/tmui/components/tm-text/tm-text.vue';", resolveDir: path.resolve(__dirname, '..'), loader: 'ts' },
		bundle: true, platform: 'node', format: 'cjs', write: false, external: ['vue', 'pinia'],
		define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://test.local","DEV":false}' },
		plugins: [{ name: 'actual-uni-components', setup(builder) {
			builder.onLoad({ filter: /\.(n?vue)$/ }, ({ path: filename }) => {
				const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
				// Use H5's pointer-event mapping and the actual tm-text emitted-click boundary.
				descriptor.template.content = descriptor.template.content
					.replace(/<!-- #ifdef APP-PLUS-NVUE -->[\s\S]*?<!-- #endif -->/g, '')
					.replace(/@tap\b/g, '@click');
				descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button|scroll-view)(?=[\s>])/g, '$1uni-$2');
				// TMUI's icon-prefix metadata is presentation only; JSDOM's Element.prefix is read-only.
				descriptor.template.content = descriptor.template.content.replace(/\bprefix=/g, 'data-prefix=');
				descriptor.template.ast = undefined;
				const component = compileScript(descriptor, {
					id: path.basename(filename).replace(/\W/g, '-'), inlineTemplate: true,
					templateOptions: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('uni-') || (tag.startsWith('tm-') && tag !== 'tm-text') } },
				});
				return { contents: component.content, loader: 'ts', resolveDir: path.dirname(filename) };
			});
		} }],
	});
	const production = new Module(__filename, module);
	production.paths = module.paths;
	resetPlatform();
	production._compile(compiled.outputFiles[0].text, __filename);
	AuthPage = production.exports.default;
	TmText = production.exports.TmText;
});

function mount() {
	const requests = [];
	resetPlatform(requests);
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp(AuthPage);
	app.use(createPinia());
	app.component('tm-text', TmText);
	app.mount(host);
	const tap = (element) => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
	tap(host.querySelectorAll('.tab-item')[1]);
	return { host, requests, tap, dispose() { app.unmount(); host.remove(); } };
}

for (const [label, title] of [['《用户服务协议》', '用户服务协议'], ['《隐私权政策》', '隐私权政策']]) {
	test(`${title} opens readable scrollable content and closes back to the registration form`, async () => {
		const mounted = mount();
		try {
			await nextTick();
			const target = [...mounted.host.querySelectorAll('.protocol-text-wrapper [role="button"]')]
				.find((element) => element.textContent.includes(label));
			assert.ok(target, 'the entire agreement control must be an accessible button');
			// Click the control itself, like a pointer aimed at its padded blank area, not its inner text.
			mounted.tap(target);
			await nextTick();
			const reader = mounted.host.querySelector('.protocol-reader');
			assert.ok(reader, 'the agreement link must open the actual document');
			assert.match(reader.querySelector('.protocol-title').textContent, new RegExp(title));
			assert.ok(reader.querySelector('uni-scroll-view'), 'long content must have a reading area');
			assert.ok(reader.querySelectorAll('.protocol-section').length >= 5, 'render the document sections');
			assert.equal(mounted.host.querySelector('.protocol-hint'), null, 'show the document in place of the form');
			mounted.tap(reader.querySelector('.protocol-close'));
			await nextTick();
			assert.equal(mounted.host.querySelector('.protocol-reader'), null);
			assert.ok(mounted.host.querySelector('.protocol-hint'), 'closing returns to the same registration tab');
			assert.equal(mounted.requests.length, 0, 'reading agreements does not submit registration');
		} finally { mounted.dispose(); }
	});
}

test('agreement controls use their wrapper for keyboard activation and Escape closes the reader', async () => {
	const mounted = mount();
	try {
		for (const [label, key] of [['《用户服务协议》', 'Enter'], ['《隐私权政策》', ' ']]) {
			await nextTick();
			const target = [...mounted.host.querySelectorAll('.protocol-text-wrapper [role="button"]')]
				.find((element) => element.textContent.includes(label));
			target.focus();
			assert.equal(document.activeElement, target);
			target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, repeat: true, bubbles: true, cancelable: true }));
			await nextTick();
			assert.equal(mounted.host.querySelector('.protocol-reader'), null, 'activate only after key release');
			target.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
			await nextTick();
			assert.equal(mounted.host.querySelectorAll('.protocol-reader').length, 1);
			mounted.host.querySelector('.protocol-reader').dispatchEvent(new dom.window.KeyboardEvent('keydown', {
				key: 'Escape', bubbles: true, cancelable: true,
			}));
			await nextTick();
			assert.equal(mounted.host.querySelector('.protocol-reader'), null);
			assert.ok(mounted.host.querySelector('.protocol-hint'));
		}
		assert.equal(mounted.requests.length, 0);
	} finally { mounted.dispose(); }
});
