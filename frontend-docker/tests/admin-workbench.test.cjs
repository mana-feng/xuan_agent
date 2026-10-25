const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:3052/' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement']) global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle;
const { createApp, nextTick } = require('vue');
const root = path.resolve(__dirname, '../../backend-docker/admin-ui/src');
const resolve = Module._resolveFilename;
const load = Module._load;
let platform;
Module._resolveFilename = function (request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args); };
Module._load = function (request, parent, isMain) {
  if (request === '@/services/api/admin') return { getAdminStats: async () => ({ success: true, data: { totalUsers: 3, totalRecords: 23, todayUsers: 1, todayRecords: 2 } }) };
  if (request === '@/store/user') return { useUserStore: () => platform.user };
  if (request === '@dcloudio/uni-app') return { onShow: callback => platform.shows.push(callback), onHide() {} };
  return load.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
require.extensions['.vue'] = (module, filename) => {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button|image)(?=[\s>])/g, '$1uni-$2');
  descriptor.template.ast = undefined;
  const compiled = compileScript(descriptor, { id: 'admin-workbench', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') || tag.startsWith('tm-') || tag.startsWith('yx-') } } });
  module._compile(ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
};
require.extensions['.nvue'] = require.extensions['.vue'];
async function mount(route = 'pages/admin/dashboard', component = 'components/yx-nav-header/yx-nav-header.vue') {
  platform = { route, paths: [], shows: [], storage: new Map(), logoutCalls: 0 };
  platform.user = { username: 'UI Admin', email: 'ui@example.test', isLoggedIn: true, isAdmin: true, restoreAuth() {}, async logout() { platform.logoutCalls++; } };
  global.getCurrentPages = () => [{ route: platform.route }];
  global.uni = {
    getStorageSync: key => platform.storage.get(key), setStorageSync: (key, value) => platform.storage.set(key, value),
    getSystemInfoSync: () => ({ windowWidth: 390, statusBarHeight: 0 }), upx2px: value => value / 2,
    navigateTo: ({ url }) => platform.paths.push(url), redirectTo: ({ url }) => platform.paths.push(url), reLaunch: ({ url }) => platform.paths.push(url), showToast() {},
  };
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp(require(path.join(root, component)).default);
  app.mount(host); platform.shows.forEach(callback => callback()); await nextTick();
  return { host, p: platform, dispose() { app.unmount(); host.remove(); } };
}
async function press(element, key = 'Enter') {
  assert.ok(element, 'interactive control exists');
  for (const type of ['keydown', 'keyup']) element.dispatchEvent(new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  await nextTick();
}
test('admin navigation includes every management destination and highlights the active route', async () => {
  const page = await mount('pages/admin/quota-config');
  try {
    const nav = page.host.querySelector('[aria-label="后台主导航"]'); assert.ok(nav);
    const routes = [...nav.querySelectorAll('[data-admin-route]')].map(el => el.getAttribute('data-admin-route'));
    for (const name of ['dashboard', 'users', 'records', 'announcements', 'llm-config', 'llm-quota', 'quota-config', 'email-config', 'analytics-stats']) assert.ok(routes.includes('/pages/admin/' + name), name);
    assert.equal(nav.querySelector('[aria-current="page"]').getAttribute('data-admin-route'), '/pages/admin/quota-config');
  } finally { page.dispose(); }
});
test('navigation activates once from the keyboard and closes an open mobile drawer', async () => {
  const page = await mount();
  try {
    await press(page.host.querySelector('[aria-label="打开后台导航"]'));
    assert.equal(page.host.querySelector('[aria-label="打开后台导航"]').getAttribute('aria-expanded'), 'true');
    await press(page.host.querySelector('[data-admin-route="/pages/admin/users"]'), ' ');
    assert.deepEqual(page.p.paths, ['/pages/admin/users']);
    assert.equal(page.host.querySelector('[aria-label="打开后台导航"]').getAttribute('aria-expanded'), 'false');
  } finally { page.dispose(); }
});
test('Escape closes the drawer, restores focus to its opener and releases the scroll lock', async () => {
  const page = await mount();
  try {
    const opener = page.host.querySelector('[aria-label="打开后台导航"]'); opener.focus();
    await press(opener); await nextTick();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick();
    assert.equal(opener.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, opener);
    assert.notEqual(document.body.style.position, 'fixed');
  } finally { page.dispose(); }
});
test('palette selection updates the visible theme and persists the selected palette', async () => {
  const page = await mount();
  try {
    await press(page.host.querySelector('[aria-label="切换后台配色"]'));
    await press(page.host.querySelector('[data-admin-palette-option="sunset"]'));
    assert.equal(document.documentElement.getAttribute('data-admin-palette'), 'sunset');
    assert.equal(page.p.storage.get('xuan-admin-palette'), 'sunset');
    assert.equal(page.host.querySelector('[aria-label="切换后台配色"]').getAttribute('aria-expanded'), 'false');
  } finally { page.dispose(); }
});
test('logout retains the user store logout flow and returns to the login route', async () => {
  const page = await mount();
  try {
    await press(page.host.querySelector('[aria-label="退出管理员登录"]')); await nextTick();
    assert.equal(page.p.logoutCalls, 1); assert.deepEqual(page.p.paths, ['/pages/auth/auth']);
  } finally { page.dispose(); }
});

test('dashboard shortcuts retain their routes when activated with the keyboard', async () => {
  const page = await mount('pages/admin/dashboard', 'pages/admin/dashboard.nvue');
  try {
    const cards = [...page.host.querySelectorAll('.dashboard-menu-card')];
    const expected = ['users', 'records', 'announcements', 'llm-config', 'llm-quota', 'quota-config', 'email-config', 'analytics-stats'];
    assert.equal(cards.length, expected.length);
    for (let i = 0; i < cards.length; i++) { await press(cards[i], i % 2 ? ' ' : 'Enter'); assert.equal(page.p.paths.at(-1), '/pages/admin/' + expected[i]); }
    assert.equal(page.p.paths.length, expected.length);
  } finally { page.dispose(); }
});

test('browser address changes keep breadcrumb and active navigation in sync', async () => {
  window.history.replaceState(null, '', '#/pages/admin/records');
  const page = await mount('pages/admin/users');
  try {
    assert.equal(page.host.querySelector('.admin-breadcrumb').textContent, '排盘记录');
    window.history.replaceState(null, '', '#/pages/admin/analytics-stats');
    window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    await nextTick();
    assert.equal(page.host.querySelector('.admin-breadcrumb').textContent, '访问统计');
    assert.equal(page.host.querySelector('[aria-current="page"]').getAttribute('data-admin-route'), '/pages/admin/analytics-stats');
  } finally { page.dispose(); window.history.replaceState(null, '', '/'); }
});

for (const action of ['Escape', 'close button']) test('admin dialog closes with ' + action + ' and restores the opener', async () => {
  const { h, ref } = require('vue');
  const Dialog = require(path.join(root, 'components/yx-admin-dialog/yx-admin-dialog.vue')).default;
  const opener=document.createElement('button'); opener.textContent='调整额度'; document.body.append(opener); opener.focus();
  const host=document.createElement('div'); document.body.append(host);
  const visible=ref(true); let submitCalls=0;
  const app=createApp({ render:()=>h(Dialog, {show:visible.value,title:'调整用户额度','onUpdate:show':value=>{visible.value=value;}}, {default:()=>h('input',{'aria-label':'剩余次数',value:'25'}),footer:()=>h('button',{onClick:()=>submitCalls++},'保存')}) });
  app.mount(host); await nextTick(); await nextTick();
  try {
    assert.ok(host.querySelector('[role="dialog"][aria-label="调整用户额度"]'));
    assert.equal(host.querySelectorAll('.admin-dialog-close').length,1);
    assert.ok(host.querySelector('.admin-dialog-footer button'));
    assert.equal(document.body.style.position,'fixed');
    if(action==='Escape') document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    else await press(host.querySelector('.admin-dialog-close'));
    await nextTick(); await nextTick();
    assert.equal(visible.value,false); assert.equal(host.querySelector('[role="dialog"]'),null);
    assert.equal(submitCalls,0); assert.equal(document.activeElement,opener);
    assert.notEqual(document.body.style.position,'fixed');
  } finally {app.unmount();host.remove();opener.remove();}
});
