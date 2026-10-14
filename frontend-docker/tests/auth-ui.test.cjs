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
const vue = require('vue');
const { createApp, nextTick } = vue;
const { createPinia } = require('pinia');
const sourceRoot = path.resolve(__dirname, '../src');
const resolve = Module._resolveFilename;
const load = Module._load;
let platform;
Module._resolveFilename = function (request, ...args) {
	return resolve.call(this, request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, ...args);
};
Module._load = function (request, parent, isMain) {
	// Match Vite's single Vue runtime when loading the real uni H5 input from its dependency tree.
	if (request === 'vue') return vue;
	if (request === '@dcloudio/uni-app') return { onLoad: (callback) => platform.onLoad = callback };
	// Only the external HTTP boundary is replaced; store, validation, navigation and email helper run unchanged.
	if (request === '@/services/api/index') return { request: async (url, options) => {
		platform.requests.push({ url, ...options });
		return platform.respond(url, options);
	} };
	return load.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
require.extensions['.vue'] = (module, filename) => {
	const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
	// Use the real uni H5 input: its inner input consumes Enter and emits confirm from the wrapper.
	descriptor.template.content = descriptor.template.content
		.replace(/(<\/?)(input)(?=[\s>])/g, '$1AuthH5Input')
		.replace(/(<\/?)(view|text|button|scroll-view)(?=[\s>])/g, '$1uni-$2')
		.replace(/\bprefix=/g, 'data-prefix=')
		.replace(/@tap\b/g, '@click');
	descriptor.template.ast = undefined;
	const compiled = compileScript(descriptor, {
		id: path.basename(filename).replace(/\W/g, '-'), inlineTemplate: true,
		templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') || tag.startsWith('tm-') } },
	});
	module._compile(ts.transpileModule(compiled.content, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
	}).outputText, filename);
};
require.extensions['.nvue'] = require.extensions['.vue'];

function mount(options = {}) {
	const storage = new Map();
	platform = { requests: [], routes: [], respond: async () => ({ success: false, message: '暂时无法连接，请重试' }) };
	global.uni = {
		getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
		removeStorageSync: key => storage.delete(key), getSystemInfoSync: () => ({ windowHeight: 800, statusBarHeight: 20 }),
		showToast() {}, reLaunch: ({ url }) => platform.routes.push(url), navigateBack() {},
	};
	global.getCurrentPages = () => [];
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp(require(path.join(sourceRoot, 'pages/auth/auth.nvue')).default);
	app.component('AuthH5Input', require('@dcloudio/uni-h5').Input);
	app.use(createPinia()).mount(host);
	platform.onLoad(options);
	return { host, platform, dispose() { app.unmount(); host.remove(); } };
}
function key(element, type, value, repeat = false) {
	assert.ok(element, 'the expected interactive control must be rendered');
	const event = new dom.window.KeyboardEvent(type, { key: value, repeat, bubbles: true, cancelable: true });
	element.dispatchEvent(event);
	return event;
}
function press(element, value = 'Enter') { key(element, 'keydown', value); key(element, 'keyup', value); }
async function flush() { await nextTick(); await new Promise(resolve => setImmediate(resolve)); await nextTick(); }
async function fill(host, values) {
	await nextTick();
	const inputs = [...host.querySelectorAll('input')];
	assert.equal(inputs.length, values.length, 'all form fields must render real editable inputs');
	inputs.forEach((input, index) => { input.value = values[index]; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
	// Real uni inputs throttle model updates by 100ms; allow ordinary typing to settle here.
	await new Promise(resolve => setTimeout(resolve, 110));
	await nextTick();
	return inputs;
}
async function registerTab(host) { press(host.querySelectorAll('.tab-item')[1]); await nextTick(); }
const success = { success: true, data: { access_token: 'auth-ui-test-token', refresh_token: 'test-refresh', user: { username: '测试用户', email: 'test@example.test', role: 'user' } } };
function successTimers(t) {
	const timer = global.setTimeout;
	t.mock.method(global, 'setTimeout', (callback, delay, ...args) => delay === 600 ? (callback(...args), 0) : timer(callback, delay, ...args));
}

test('login and registration inputs keep visible accessible names after typing', async () => {
	const mounted = mount();
	try {
		for (const expected of [['邮箱或用户名', '密码'], ['用户名', '邮箱', '邮箱验证码', '密码', '确认密码']]) {
			const inputs = await fill(mounted.host, expected.map(() => 'example'));
			inputs.forEach((input, index) => {
				const label = document.getElementById(input.getAttribute('aria-labelledby'));
				assert.ok(label, 'the actual input must reference a visible label');
				assert.equal(label.textContent, expected[index]);
				input.focus();
				assert.equal(document.activeElement, input);
			});
			if (expected.length === 2) {
				assert.equal(inputs[0].getAttribute('autocomplete'), 'username');
				assert.equal(inputs[1].getAttribute('autocomplete'), 'current-password');
				await registerTab(mounted.host);
			} else {
				assert.equal(inputs[2].getAttribute('autocomplete'), 'one-time-code');
				assert.equal(inputs[4].getAttribute('autocomplete'), 'new-password');
			}
		}
	} finally { mounted.dispose(); }
});

test('tabs, agreement links and home navigation accept keyboard focus and activation', async () => {
	const mounted = mount();
	try {
		const tabs = mounted.host.querySelectorAll('.tab-item');
		for (const control of [mounted.host.querySelector('.nav-back-btn'), ...tabs]) {
			control.focus(); assert.equal(document.activeElement, control);
		}
		press(tabs[1], ' '); await nextTick();
		const agreement = mounted.host.querySelector('.protocol-link');
		agreement.focus(); assert.equal(document.activeElement, agreement);
		press(agreement); await nextTick();
		assert.ok(mounted.host.querySelector('.protocol-reader'));
		press(mounted.host.querySelector('.nav-back-btn')); await nextTick();
		assert.ok(mounted.host.querySelector('.protocol-hint'), 'back from agreement retains the registration form');
		press(mounted.host.querySelector('.nav-back-btn'));
		assert.deepEqual(mounted.platform.routes, ['/pages/agent/index']);
		assert.equal(mounted.platform.requests.length, 0);
	} finally { mounted.dispose(); }
});

test('Enter submits login, announces failure inline, and keyboard retry preserves credentials and returnTo', async t => {
	successTimers(t);
	const mounted = mount({ returnTo: '/pages/qimen/result' });
	try {
		const inputs = await fill(mounted.host, ['test_user', '  Password<42>  ']);
		press(inputs[1]); await flush();
		assert.equal(mounted.platform.requests.length, 1);
		const alert = mounted.host.querySelector('[role="alert"]');
		assert.match(alert?.textContent || '', /暂时无法连接/);
		assert.equal(inputs[1].getAttribute('aria-describedby'), alert.id);
		assert.equal(mounted.platform.routes.length, 0);
		mounted.platform.respond = async () => success;
		const retry = alert.querySelector('[role="button"]');
		retry.focus(); assert.equal(document.activeElement, retry);
		press(retry); await flush();
		assert.equal(mounted.platform.requests.length, 2);
		assert.equal(mounted.platform.requests[1].data.password, '  Password<42>  ');
		assert.deepEqual(mounted.platform.routes, ['/pages/qimen/result']);
	} finally { mounted.dispose(); }
});

test('pending login ignores repeated Enter and pointer activation until it can be retried', async () => {
	const mounted = mount();
	let finish;
	mounted.platform.respond = () => new Promise(resolve => finish = resolve);
	try {
		const inputs = await fill(mounted.host, ['test_user', 'Password42']);
		press(inputs[1]); await nextTick();
		press(inputs[1]);
		const submit = mounted.host.querySelector('.auth-submit');
		assert.equal(submit?.getAttribute('aria-disabled'), 'true');
		assert.equal(submit.getAttribute('tabindex'), '-1');
		submit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
		assert.equal(mounted.platform.requests.length, 1);
		finish({ success: false, message: '请求未完成，请重试' }); await flush();
		assert.equal(submit.getAttribute('aria-disabled'), 'false');
	} finally { mounted.dispose(); }
});

test('pressing Enter immediately after fast typing submits the latest password', async () => {
	const mounted = mount();
	try {
		const inputs = await fill(mounted.host, ['test_user', 'Password4']);
		for (const value of ['Password42', 'Password42!']) {
			inputs[1].value = value;
			inputs[1].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		}
		press(inputs[1]); await flush();
		assert.equal(mounted.platform.requests[0]?.data.password, 'Password42!');
	} finally { mounted.dispose(); }
});

for (const form of ['login', 'register']) for (const endBeforeKeyup of [false, true]) {
	test(`${form}: Enter confirms a Chinese candidate without submitting when composition ends ${endBeforeKeyup ? 'before' : 'after'} keyup`, async () => {
		const mounted = mount();
		try {
			if (form === 'register') await registerTab(mounted.host);
			const [identifier] = await fill(mounted.host, form === 'login'
				? ['test_user', 'Password42']
				: ['test_user', 'test@example.test', '123456', 'Password42', 'Password42']);
			identifier.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
			identifier.value = '测试用户';
			identifier.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, isComposing: true }));
			identifier.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
			if (endBeforeKeyup) identifier.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '测试用户' }));
			identifier.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: 'Enter', isComposing: !endBeforeKeyup, bubbles: true, cancelable: true }));
			await flush();
			assert.equal(mounted.platform.requests.length, 0, 'candidate confirmation must never send credentials');
			if (!endBeforeKeyup) identifier.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '测试用户' }));
			await flush();
			press(identifier); await flush();
			assert.equal(mounted.platform.requests.length, 1, 'a separate normal Enter still submits');
			assert.equal(mounted.platform.requests[0].data[form === 'login' ? 'identifier' : 'username'], '测试用户');
		} finally { mounted.dispose(); }
	});
}

test('registration Enter validates the confirmation, then submits code and password together', async t => {
	successTimers(t);
	const mounted = mount({ returnTo: '/pages/chat/index?from=qimen' });
	try {
		await registerTab(mounted.host);
		let inputs = await fill(mounted.host, ['测试用户', 'test@example.test', '123456', 'Password42', 'different']);
		press(inputs[4]); await flush();
		assert.match(mounted.host.querySelector('[role="alert"]')?.textContent || '', /两次输入的密码不一致/);
		assert.equal(mounted.platform.requests.length, 0);
		inputs = await fill(mounted.host, ['测试用户', 'test@example.test', '123456', 'Password42', 'Password42']);
		assert.equal(mounted.host.querySelector('[role="alert"]'), null, 'editing clears stale validation feedback');
		mounted.platform.respond = async () => success;
		press(inputs[4]); await flush();
		assert.equal(mounted.platform.requests.length, 1);
		assert.equal(mounted.platform.requests[0].url, '/api/auth/register');
		assert.equal(mounted.platform.requests[0].data.verification_code, '123456');
		assert.equal(mounted.platform.requests[0].data.password, 'Password42');
		assert.deepEqual(mounted.platform.routes, ['/pages/chat/index?from=qimen']);
	} finally { mounted.dispose(); }
});

test('verification failure can retry by keyboard and success announces its countdown inline', async () => {
	const mounted = mount();
	try {
		await registerTab(mounted.host);
		await fill(mounted.host, ['测试用户', 'test@example.test', '', '', '']);
		const send = mounted.host.querySelector('.code-button');
		press(send, ' '); await flush();
		assert.match(mounted.host.querySelector('[role="alert"]')?.textContent || '', /暂时无法连接/);
		mounted.platform.respond = async () => ({ success: true, message: '验证码已发送到您的邮箱', data: {} });
		press(mounted.host.querySelector('[role="alert"] [role="button"]')); await flush();
		assert.equal(mounted.platform.requests.length, 2);
		assert.equal(mounted.platform.requests[1].url, '/api/email/send-code');
		assert.match(mounted.host.querySelector('[role="status"]')?.textContent || '', /验证码已发送/);
		assert.match(send.textContent, /60/);
		assert.equal(send.getAttribute('aria-disabled'), 'true');
		press(send); send.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
		assert.equal(mounted.platform.requests.length, 2, 'countdown blocks duplicate sends from every activation route');
	} finally { mounted.dispose(); }
});
