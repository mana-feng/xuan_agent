const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const { createPinia, setActivePinia } = require('pinia');

// Run the actual hook, stores and API client; only the uni platform/network is replaced.
const compiled = buildSync({
	absWorkingDir: path.resolve(__dirname, '..'),
	stdin: {
		contents: "export { useAgentPage } from './src/features/agent/useAgentPage'; export { useUserStore } from './src/store/user'; export { useBaziStore } from './src/store/bazi'; export { useZiweiStore } from './src/store/ziwei';",
		resolveDir: path.resolve(__dirname, '..'),
		loader: 'ts',
	},
	bundle: true,
	platform: 'node',
	format: 'cjs',
	write: false,
	external: ['vue', 'pinia'],
	define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://test.local","DEV":false}' },
}).outputFiles[0].text;
const production = new Module(__filename, module);
production.paths = module.paths;
production._compile(compiled, __filename);
const { useAgentPage, useUserStore, useBaziStore, useZiweiStore } = production.exports;

function setup() {
	const storage = new Map();
	const requests = [];
	const dialogs = [];
	const navigations = [];
	global.uni = {
		getStorageSync: (key) => storage.get(key),
		setStorageSync: (key, value) => storage.set(key, value),
		removeStorageSync: (key) => storage.delete(key),
		showModal: (options) => dialogs.push(options),
		showToast: () => {},
		navigateTo: (options) => { navigations.push(options.url); options.success?.({}); },
		request: (options) => {
			requests.push(options);
			options.success({ statusCode: 200, data: { reply: '你好，请告诉我你的问题。' } });
		},
	};
	setActivePinia(createPinia());
	const page = useAgentPage();
	page.initializePage();
	return { page, user: useUserStore(), bazi: useBaziStore(), ziwei: useZiweiStore(), storage, requests, dialogs, navigations };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('anonymous free input is blocked before API traffic and retains the draft and conversation', async () => {
	const { page, requests, dialogs } = setup();
	page.draft.value = '请帮我排盘';
	const before = JSON.stringify(page.messages.value);
	page.handleSend();
	await flush();
	assert.equal(requests.length, 0, 'anonymous prompts must not reach the Agent API');
	assert.equal(dialogs.length, 1, 'show a login explanation instead');
	assert.equal(page.draft.value, '请帮我排盘');
	assert.equal(JSON.stringify(page.messages.value), before);
	assert.equal(page.sending.value, false);
});

test('anonymous quick prompts share the guard and confirmed guidance opens login without sending', async () => {
	const { page, requests, dialogs, navigations } = setup();
	page.handleQuickPrompt('打开八字');
	await flush();
	assert.equal(requests.length, 0, 'quick prompts must not bypass authentication');
	assert.equal(dialogs.length, 1);
	dialogs[0].success({ confirm: true, cancel: false });
	dialogs[0].complete?.();
	assert.deepEqual(navigations, ['/pages/auth/auth']);
	assert.equal(requests.length, 0, 'confirming login guidance does not send the prompt');
});

test('canceling login guidance stays on the page and repeated clicks do not stack dialogs', async () => {
	const { page, requests, dialogs, navigations } = setup();
	page.draft.value = '保留我的输入';
	page.handleSend();
	page.handleQuickPrompt('查看历史');
	await flush();
	assert.equal(dialogs.length, 1);
	dialogs[0].success({ confirm: false, cancel: true });
	dialogs[0].complete?.();
	assert.deepEqual(navigations, []);
	assert.equal(requests.length, 0);
	assert.equal(page.draft.value, '保留我的输入');
	page.handleSend();
	assert.equal(dialogs.length, 2, 'guidance can reopen after cancellation');
});

test('authenticated input uses the real API client with Bearer credentials and displays the reply', async () => {
	const { page, user, requests, dialogs } = setup();
	user.setAuth({ email: 'test@example.test', access_token: 'test-access-token' });
	page.draft.value = '你好';
	page.handleSend();
	await flush();
	assert.equal(dialogs.length, 0);
	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, 'http://test.local/api/llm/agent');
	assert.equal(requests[0].method, 'POST');
	assert.equal(requests[0].header.Authorization, 'Bearer test-access-token');
	assert.deepEqual(requests[0].data.messages.at(-1), { role: 'user', content: '你好' });
	assert.equal(page.messages.value.at(-1).text, '你好，请告诉我你的问题。');
	assert.equal(page.sending.value, false);
});

test('a removed token cannot send even when the reactive login label was previously evaluated', async () => {
	const { page, user, storage, requests, dialogs } = setup();
	user.setAuth({ email: 'test@example.test', access_token: 'test-access-token' });
	void page.accessLabel.value;
	storage.delete('access_token');
	page.handleQuickPrompt('你好');
	await flush();
	assert.equal(requests.length, 0);
	assert.equal(dialogs.length, 1);
});

test('empty input does not send or prompt for login', async () => {
	const { page, requests, dialogs } = setup();
	page.draft.value = '  ';
	page.handleSend();
	await flush();
	assert.equal(requests.length, 0);
	assert.equal(dialogs.length, 0);
});

const baziProfile = { timeZone: 'Asia/Shanghai', realname: '甲', gender: 0, timestamp: new Date(2026, 9, 10, 12, 30).getTime(), recordId: 11 };
const ziweiProfile = { realname: '乙', gender: 1, timestamp: new Date(2022, 2, 3, 8, 0).getTime(), recordId: 22 };

test('Agent sends the independent identities of both charts in its model context', async () => {
	const { page, user, bazi, ziwei, requests } = setup();
	bazi.pull(baziProfile);
	ziwei.pull(ziweiProfile);
	user.set({ realname: '共享资料', gender: 0, timestamp: new Date(2000, 0, 1).getTime() });
	user.setAuth({ email: 'test@example.test', access_token: 'test-access-token' });
	page.handleQuickPrompt('你好');
	await flush();
	const context = requests[0].data.messages[0].content;
	assert.match(context, /八字[^\n]*甲[^\n]*男[^\n]*2026\/10\/10 12:30/);
	assert.match(context, /紫微[^\n]*乙[^\n]*女[^\n]*2022\/03\/03 08:00/);
	assert.doesNotMatch(context, /共享资料/, 'the shared profile must not overwrite either chart identity');
});

test('Agent initialization restores both chart caches with their matching identities', () => {
	const { page, user, bazi, ziwei, storage } = setup();
	storage.set('bazi_last_context', JSON.stringify(baziProfile));
	storage.set('ziwei_last_context', JSON.stringify(ziweiProfile));
	user.set({ realname: '丙', timestamp: new Date(2000, 0, 1).getTime() });
	page.initializePage();
	assert.equal(bazi.solar.year, 2026);
	assert.ok(ziwei.astrolabe, 'the restored Ziwei profile must regenerate its own chart');
	assert.match(page.contextItems.value[0], /甲.*男.*2026\/10\/10 12:30/);
	assert.match(page.contextItems.value[1], /乙.*女.*2022\/03\/03 08:00/);
});
