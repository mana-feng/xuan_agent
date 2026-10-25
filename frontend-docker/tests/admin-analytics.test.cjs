const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
process.env.TZ = 'America/Los_Angeles';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement']) global[key] = dom.window[key];
const { createApp, nextTick } = require('vue');
const root = path.resolve(__dirname, '../../backend-docker/admin-ui/src');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;
let platform;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
Module._load = function (request, parent, isMain) {
  if (request === '@/services/api/admin') return { getAdminAnalyticsStats: (...args) => platform.request(...args) };
  if (request === '@/services/api/index') return { request: (...args) => platform.apiRequest(...args) };
  if (request === '@/store/user') return { useUserStore: () => ({ isAdmin: true }) };
  if (request === '@dcloudio/uni-app') return {
    onShow: callback => platform.shows.push(callback), onHide: callback => platform.hides.push(callback),
  };
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
require.extensions['.nvue'] = (module, filename) => {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button|image)(?=[\s>])/g, '$1uni-$2');
  descriptor.template.ast = undefined;
  const compiled = compileScript(descriptor, { id: 'analytics-test', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') || tag.startsWith('tm-') || tag.startsWith('yx-') || tag === 'scroll-view' } },
  });
  module._compile(ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
};
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await nextTick(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function visitor(title, type = 'external') {
  return { url: '/home', pathname: '/home', title, ip: '127.0.0.1', screenWidth: 390, screenHeight: 844, pixelRatio: 2,
    language: 'zh-CN', deviceType: 'mobile', browser: 'Test', browserVersion: '1', os: 'Test', osVersion: '1',
    referrerType: type, time: '2026-10-15T16:05:00.000Z', isLoggedIn: false, username: null };
}
function response(extra = {}) {
  return { success: true, data: {
    todayPageviews: 7, yesterdayPageviews: 0, totalPageviews: 57, uniqueVisitors: 9, totalSessions: 12,
    weeklyPageviews: 17, monthlyPageviews: 27, deviceStats: { mobile: 1, tablet: 0, desktop: 1 },
    topBrowsers: [], topOs: [], topPages: [], topReferrers: [], connectionStats: [], geoCountries: [], ispStats: [],
    referrerTypeStats: [], searchEngineStats: [], searchKeywords: [], screenResolutions: [],
    hourlyData: [{ hour: 0, count: 0 }, { hour: 1, count: 2 }],
    dailyTrend: [{ date: '2026-10-15', pv: 0, uv: 0 }, { date: '2026-10-16', pv: 7, uv: 2 }], dowData: [],
    newVisitorCount: 4, returningVisitorCount: 2, bounceRate: 25, entryPages: [], exitPages: [],
    performanceStats: { avgLoadTime: 0, minLoadTime: 0, maxLoadTime: 0, avgFCP: 0, avgDCL: 0 },
    languageStats: [], timezoneStats: [], utmCampaigns: [], recentVisitors: [visitor('首页')],
    recentTotal: 1, recentPage: 1, recentPageSize: 20, recentPageCount: 1, statisticsTimeZone: 'Asia/Shanghai',
    generatedAt: '2026-10-15T16:06:00.000Z', visitorPeriod: 'last30Days',
    visitorDefinitions: { new: '近30天首次访问的去重访客', returning: '近30天再次开启会话的去重访客，可与新访客重叠' }, ...extra,
  } };
}
async function mount(request) {
  platform = { shows: [], hides: [], calls: [], timers: new Map(), timerId: 0,
    request(...args) { this.calls.push(args); return request(...args); } };
  global.setInterval = callback => { const id = ++platform.timerId; platform.timers.set(id, callback); return id; };
  global.clearInterval = id => platform.timers.delete(id);
  global.uni = { getSystemInfoSync: () => ({ statusBarHeight: 0 }), navigateBack() {} };
  const host = document.createElement('div'); document.body.append(host);
  const filename = path.join(root, 'pages/admin/analytics-stats.nvue'); delete require.cache[filename];
  const app = createApp(require(filename).default); app.mount(host);
  platform.shows.forEach(callback => callback()); await flush();
  return { host, p: platform, async show() { platform.shows.forEach(callback => callback()); await flush(); },
    async hide() { platform.hides.forEach(callback => callback()); await flush(); },
    dispose() { app.unmount(); host.remove(); global.setInterval = originalSetInterval; global.clearInterval = originalClearInterval; },
  };
}
async function press(element, key = 'Enter') {
  assert.ok(element, 'keyboard control exists');
  for (const type of ['keydown', 'keyup']) element.dispatchEvent(new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  await flush();
}
const labels = host => [...host.querySelectorAll('[label]')].map(element => element.getAttribute('label'));
const totalValue = host => host.querySelector('.metric-item:nth-of-type(3) tm-text:nth-child(2)')?.getAttribute('label');

test('initial show and mount share one request and expose loading without a false empty state', async () => {
  const pending = deferred(); const page = await mount(() => pending.promise);
  try {
    assert.equal(page.p.calls.length, 1);
    assert.match(page.host.querySelector('[role="status"]')?.textContent || '', /加载/);
    assert.equal(page.host.querySelector('.empty-tip'), null);
    pending.resolve(response()); await flush();
    assert.match(page.host.querySelector('.analytics-updated')?.textContent || '', /2026-10-16 00:06/);
  } finally { page.dispose(); }
});

test('manual refresh supersedes an old request and an old failure cannot erase the new result', async () => {
  const old = deferred(); let call = 0;
  const page = await mount(() => ++call === 1 ? Promise.resolve(response()) : call === 2 ? old.promise : Promise.resolve(response({ totalPageviews: 99 })));
  try {
    await press(page.host.querySelector('[aria-label="刷新访问统计"]'));
    await press(page.host.querySelector('[aria-label="刷新访问统计"]'), ' ');
    assert.equal(totalValue(page.host), '99');
    old.reject(new Error('old failed')); await flush();
    assert.equal(totalValue(page.host), '99'); assert.equal(page.host.querySelector('[role="alert"]'), null);
  } finally { page.dispose(); }
});

test('refresh failure keeps the successful values and timestamp and offers a visible retry', async () => {
  let call = 0; const page = await mount(() => ++call === 1 ? Promise.resolve(response()) : Promise.resolve({ success: false, data: null }));
  try {
    const updated = page.host.querySelector('.analytics-updated')?.textContent;
    await press(page.host.querySelector('[aria-label="刷新访问统计"]'));
    assert.equal(totalValue(page.host), '57');
    assert.match(page.host.querySelector('[role="alert"]')?.textContent || '', /失败.*上次成功/);
    assert.equal(page.host.querySelector('.analytics-updated')?.textContent, updated);
    assert.ok(page.host.querySelector('[aria-label="刷新访问统计"]'));
  } finally { page.dispose(); }
});

test('hide invalidates in-flight results and stops polling; show resumes once and unmount releases the timer', async () => {
  const hidden = deferred(); let call = 0; const page = await mount(() => ++call === 1 ? Promise.resolve(response()) : call === 2 ? hidden.promise : Promise.resolve(response({ totalPageviews: 88 })));
  try {
    assert.equal(page.p.timers.size, 1);
    [...page.p.timers.values()][0](); await flush();
    await page.hide(); assert.equal(page.p.timers.size, 0);
    hidden.resolve(response({ totalPageviews: 999 })); await flush(); assert.equal(totalValue(page.host), '57');
    await page.show(); await page.show(); assert.equal(page.p.calls.length, 3); assert.equal(totalValue(page.host), '88');
    assert.equal(page.p.timers.size, 1);
  } finally { page.dispose(); }
  assert.equal(page.p.timers.size, 0);
});

test('server pagination uses full record count beyond 500 and accepts a clamped page after deletion', async () => {
  let call = 0; const page = await mount(() => ++call === 1 ? Promise.resolve(response({ recentTotal: 521, recentPageCount: 27 })) : Promise.resolve(response({ recentVisitors: [visitor('剩余记录')], recentTotal: 1, recentPage: 1, recentPageCount: 1 })));
  try {
    assert.ok(labels(page.host).includes('共 521 条记录，每页 20 条'));
    assert.ok(labels(page.host).includes('1 / 27'));
    await press(page.host.querySelector('[aria-label="下一页访问记录"]'));
    assert.deepEqual(page.p.calls, [[1, 20], [2, 20]]);
    assert.equal(page.host.querySelector('.rt-item tm-text').getAttribute('label'), '剩余记录');
    assert.equal(page.host.querySelector('.pagination'), null);
    assert.ok(labels(page.host).includes('共 1 条记录，每页 20 条'));
  } finally { page.dispose(); }
});

test('a failed page request retains its page number and rows', async () => {
  let call = 0; const page = await mount(() => ++call === 1 ? Promise.resolve(response({ recentTotal: 21, recentPageCount: 2 })) : Promise.reject(new Error('offline')));
  try {
    await press(page.host.querySelector('[aria-label="下一页访问记录"]'));
    assert.ok(labels(page.host).includes('1 / 2')); assert.ok(labels(page.host).includes('首页'));
    assert.match(page.host.querySelector('[role="alert"]')?.textContent || '', /失败/);
  } finally { page.dispose(); }
});

test('trend keeps ascending calendar days, zero bars stay zero and timestamps use Beijing time', async () => {
  const page = await mount(() => Promise.resolve(response({ recentVisitors: [visitor('外部', 'external'), visitor('站内', 'internal'), visitor('邮件', 'email')] })));
  try {
    assert.deepEqual([...page.host.querySelectorAll('.trend-bar-wrap > tm-text')].map(el => el.getAttribute('label')), ['10/15', '10/16']);
    assert.equal(page.host.querySelector('.pv-bar').style.height, '0px');
    assert.equal(page.host.querySelector('.hour-bar').style.height, '0px');
    assert.ok(labels(page.host).includes('2026-10-16 00:05'));
    for (const label of ['外部链接', '站内链接', '邮件链接']) assert.ok(labels(page.host).includes(label), label);
    assert.match(page.host.textContent, /近30天.*可.*重叠/);
  } finally { page.dispose(); }
});

test('an older success cannot replace the latest refresh or clear its loading state', async () => {
  const older = deferred(); const latest = deferred(); let call = 0;
  const page = await mount(() => ++call === 1 ? Promise.resolve(response()) : call === 2 ? older.promise : latest.promise);
  try {
    await press(page.host.querySelector('[aria-label="刷新访问统计"]'));
    await press(page.host.querySelector('[aria-label="刷新访问统计"]'));
    older.resolve(response({ totalPageviews: 999 })); await flush();
    assert.equal(totalValue(page.host), '57'); assert.ok(page.host.querySelector('[role="status"]'));
    latest.resolve(response({ totalPageviews: 66 })); await flush();
    assert.equal(totalValue(page.host), '66'); assert.equal(page.host.querySelector('[role="status"]'), null);
  } finally { page.dispose(); }
});

test('an initial failure is explicit and a retry can show a confirmed empty result', async () => {
  let call = 0; const page = await mount(() => ++call === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(response({ recentVisitors: [], recentTotal: 0 })));
  try {
    assert.match(page.host.querySelector('[role="alert"]')?.textContent || '', /加载失败/);
    assert.equal(page.host.querySelector('.empty-tip'), null);
    await press(page.host.querySelector('[aria-label="刷新访问统计"]'));
    assert.ok(page.host.querySelector('.empty-tip')); assert.equal(page.host.querySelector('[role="alert"]'), null);
  } finally { page.dispose(); }
});

test('legacy responses never reuse a stale full record total or pretend a truncated list is complete', async () => {
  let call = 0;
  const legacy = response({ recentVisitors: Array.from({ length: 500 }, (_, i) => visitor('记录' + i)) });
  for (const field of ['recentTotal', 'recentPage', 'recentPageSize', 'recentPageCount', 'statisticsTimeZone', 'generatedAt', 'visitorPeriod', 'visitorDefinitions']) delete legacy.data[field];
  const page = await mount(() => Promise.resolve(++call === 1 ? response({ recentTotal: 521, recentPageCount: 27 }) : legacy));
  try {
    await press(page.host.querySelector('[aria-label="刷新访问统计"]'));
    assert.ok(labels(page.host).includes('本次返回 500 条记录（总量暂不可用）'));
    assert.equal(page.host.querySelector('.pagination'), null);
  } finally { page.dispose(); }
});

test('the analytics API sends pagination on the existing authenticated endpoint', async () => {
  const calls = []; platform = { apiRequest: (...args) => { calls.push(args); return Promise.resolve(response()); } };
  const filename = path.join(root, 'services/api/admin.ts'); delete require.cache[filename];
  const api = require(filename); await api.getAdminAnalyticsStats(); await api.getAdminAnalyticsStats(27, 20);
  assert.deepEqual(calls.map(call => call[0]), ['/api/admin/stats/analytics?page=1&pageSize=20', '/api/admin/stats/analytics?page=27&pageSize=20']);
  assert.ok(calls.every(call => call[1].method === 'GET' && call[1].needAuth));
});
