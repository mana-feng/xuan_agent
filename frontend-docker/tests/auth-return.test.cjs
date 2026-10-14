const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useQimenStore } = require('../src/store/qimen.ts');

let platform;
beforeEach(() => {
  platform = resetPlatform();
  global.uni.getSystemInfoSync = () => ({ windowHeight: 800, statusBarHeight: 20 });
  global.getCurrentPages = () => [];
  setActivePinia(createPinia());
  platform.respond = async url => url === '/api/qimen'
    ? { success: true, data: { id: 42 } }
    : { success: true, data: { access_token: 'return-test-token', user: { username: '测试用户', email: 'test@example.test', role: 'user' } } };
});

function authPage(options = {}) {
  const page = loadPage('pages/auth/auth.nvue', ['loginIdentifier', 'loginPassword', 'submitLogin', 'registerUsername', 'registerEmail', 'registerPassword', 'registerPasswordConfirm', 'registerVerificationCode', 'submitRegister']);
  platform.hooks.load.at(-1)?.(options);
  page.loginIdentifier.value = 'test_user';
  page.loginPassword.value = 'Sample password 42';
  page.registerUsername.value = 'test_user';
  page.registerEmail.value = 'test@example.test';
  page.registerPassword.value = page.registerPasswordConfirm.value = 'Sample password 42';
  page.registerVerificationCode.value = '123456';
  return page;
}

function runSuccessTimers(t) {
  const timer = global.setTimeout;
  t.mock.method(global, 'setTimeout', (callback, delay, ...args) => {
    if (delay === 600) { callback(...args); return 0; }
    return timer(callback, delay, ...args);
  });
}

test('avatar login returns to the unsaved Qimen result and the restored page can save to the account', async t => {
  runSuccessTimers(t);
  const store = useQimenStore();
  store.pull({ question: '登录后继续保存', timestamp: Date.parse('2026-10-13T10:25:00+08:00'), timeZone: 'Asia/Shanghai' });
  const chart = store.chart;
  global.getCurrentPages = () => [{ route: 'pages/qimen/result', options: {} }];
  const avatar = loadPage('components/UserAvatarDropdown.vue', ['handleLogin']);
  avatar.handleLogin();
  const target = new URL(platform.routes.at(-1), 'http://test.local');
  assert.equal(target.pathname, '/pages/auth/auth');
  assert.equal(target.searchParams.get('returnTo'), '/pages/qimen/result');
  const auth = authPage(Object.fromEntries(target.searchParams));
  await auth.submitLogin();
  assert.equal(platform.routes.at(-1), '/pages/qimen/result');
  assert.equal(store.chart, chart);
  const result = loadPage('pages/qimen/result.nvue', ['saveToAccount']);
  await result.saveToAccount();
  assert.equal(platform.requests.at(-1).url, '/api/qimen');
  assert.equal(platform.requests.at(-1).data.rawPayload.input.question, '登录后继续保存');
  assert.equal(store.input.recordId, 42);
});

for (const [route, options, expected] of [
  ['pages/chat/index', { from: 'qimen' }, '/pages/chat/index?from=qimen'],
  ['pages/ziwei/index', { edit: '1' }, '/pages/ziwei/index?edit=1'],
  ['pages/history/list', {}, '/pages/history/list'],
]) {
  test(`avatar login retains the supported return destination ${expected}`, () => {
    global.getCurrentPages = () => [{ route, options }];
    loadPage('components/UserAvatarDropdown.vue', ['handleLogin']).handleLogin();
    assert.equal(new URL(platform.routes.at(-1), 'http://test.local').searchParams.get('returnTo'), expected);
  });
}

for (const route of ['pages/auth/auth', 'pages/not-registered/result', 'https://example.test']) {
  test(`avatar does not carry unsupported or recursive origin ${route}`, () => {
    global.getCurrentPages = () => [{ route, options: {} }];
    loadPage('components/UserAvatarDropdown.vue', ['handleLogin']).handleLogin();
    assert.equal(new URL(platform.routes.at(-1), 'http://test.local').searchParams.has('returnTo'), false);
  });
}

for (const operation of ['submitLogin', 'submitRegister']) {
  for (const returnTo of ['/pages/qimen/result', '%2Fpages%2Fqimen%2Fresult', '/pages/chat/index?from=qimen', '/pages/qimen/index?edit=1']) {
    test(`${operation} honors supported internal return destination ${returnTo}`, async t => {
      runSuccessTimers(t);
      await authPage({ returnTo })[operation]();
      assert.equal(platform.routes.at(-1), decodeURIComponent(returnTo));
    });
  }
  test(`${operation} retains the default homepage when no return path was supplied`, async t => {
    runSuccessTimers(t);
    await authPage()[operation]();
    assert.equal(platform.routes.at(-1), '/pages/agent/index');
  });
}

test('auth rejects external, malformed, unknown and recursive redirect targets', async t => {
  runSuccessTimers(t);
  for (const returnTo of [
    'https://example.test', '//example.test', '\\example.test', '/pages/not-registered/result',
    '/pages/auth/auth', '/pages/qimen/result?redirect=https://example.test',
    '/pages/chat/index?from=qimen&returnTo=https://example.test', '/pages/chat/index?from=external',
    '/pages/chat/index?from=qimen\n',
    '/pages/qimen/result#https://example.test', '/pages/qimen/result\r\n//example.test',
    '%252F%252Fexample.test', '%broken', ['//example.test'],
  ]) {
    await authPage({ returnTo }).submitLogin();
    assert.equal(platform.routes.at(-1), '/pages/agent/index', String(returnTo));
  }
});

test('a failed login stays on auth and a successful retry still returns to the original chart', async t => {
  runSuccessTimers(t);
  const page = authPage({ returnTo: '/pages/qimen/result' });
  const success = platform.respond;
  platform.respond = async () => ({ success: false, error: '账号或密码不正确' });
  await page.submitLogin();
  assert.equal(platform.routes.length, 0);
  platform.respond = success;
  await page.submitLogin();
  assert.equal(platform.routes.at(-1), '/pages/qimen/result');
});
