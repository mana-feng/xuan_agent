const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../src');
const pause = () => new Promise(resolve => setTimeout(resolve, 25));

function browser(options = {}) {
  const dom = new JSDOM('<!doctype html><title>Analytics test</title>', { url: options.url || 'https://analytics.example/#/home', pretendToBeVisual: true });
  const w = dom.window;
  let now = options.now || 1800000000000;
  let visibility = options.hidden ? 'hidden' : 'visible';
  const requests = [];
  const hooks = [];
  const logs = [];
  const timers = new Map();
  let nextTimerId = 1;
  const schedule = options.fakeTimers ? (callback, delay) => {
    const id = nextTimerId++;
    timers.set(id, { callback, due: now + delay });
    return id;
  } : setTimeout;
  const cancel = options.fakeTimers ? id => timers.delete(id) : clearTimeout;
  Object.defineProperty(w.document, 'visibilityState', { get: () => visibility });
  Object.defineProperty(w.navigator, 'userAgent', { value: options.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.6723.91 Safari/537.36' });
  Object.defineProperty(w.navigator, 'maxTouchPoints', { value: options.touch || 0 });
  Object.defineProperty(w, 'innerWidth', { value: options.width || 1280 });
  if (options.storage) {
    for (const [name, entries] of Object.entries(options.storage)) for (const [key, value] of entries) w[name].setItem(key, value);
  }
  if (options.storageThrows) for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(w, name, { get() { throw new Error('storage blocked'); } });
  w.navigator.sendBeacon = (url, body) => {
    requests.push({ transport: 'beacon', url, payload: JSON.parse(body.parts.join('')) });
    if (options.beaconThrows) throw new Error('beacon unavailable');
    return options.beacon !== false;
  };
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  class TestBlob { constructor(parts) { this.parts = parts; } }
  const context = vm.createContext({ window: w, document: w.document, navigator: w.navigator, location: w.location, history: w.history, URL: w.URL, URLSearchParams: w.URLSearchParams, Date: FakeDate, Math, Intl, performance: w.performance, Blob: TestBlob, setTimeout: schedule, clearTimeout: cancel, console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args) }, fetch: (url, init) => {
    requests.push({ transport: 'fetch', url, init, payload: JSON.parse(init.body) });
    return options.fetchReject ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: options.fetchOk !== false, status: options.fetchOk === false ? 503 : 200 });
  } });
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(context, name, { get: () => w[name] });
  function load(relative) {
    const filename = path.join(root, relative);
    const exports = {};
    context.exports = exports;
    context.require = name => {
      if (name === 'vue') return { onUnmounted: cb => hooks.push(cb), watch: () => () => {} };
      if (name.includes('appConfig')) return { useAppConfigStore: () => ({ loaded: options.loaded !== false }) };
      if (name.includes('analytics')) return api;
      throw new Error(`Unexpected dependency ${name}`);
    };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInContext(`(function(exports, require) { ${code}\n})(exports, require)`, context, { filename });
    return exports;
  }
  const api = load('utils/analytics.ts');
  const composable = load('composables/usePageAnalytics.ts');
  return { w, api, requests, logs, pendingTimers: () => timers.size, runTimers: () => { for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } }, mount: () => { const before = hooks.length; composable.usePageAnalytics(); return () => hooks[before]?.(); }, advance: ms => { now += ms; }, visibility: state => { visibility = state; w.document.dispatchEvent(new w.Event('visibilitychange')); }, pageviews: () => requests.filter(x => x.payload.eventType !== 'engagement'), engagements: () => requests.filter(x => x.payload.eventType === 'engagement'), snapshot: () => ({ localStorage: Object.entries(w.localStorage), sessionStorage: Object.entries(w.sessionStorage) }), close: () => { for (const cb of hooks) cb(); w.close(); } };
}

test('one real history.back emits one pageview despite both browser route events', async () => {
  const b = browser();
  try {
    b.mount();
    b.w.history.pushState({}, '', '#/one'); await pause();
    b.w.history.pushState({}, '', '#/two'); await pause();
    const before = b.pageviews().length;
    const traversed = new Promise(resolve => b.w.addEventListener('hashchange', resolve, { once: true }));
    b.w.history.back(); await traversed; await pause();
    assert.equal(b.pageviews().length - before, 1);
    assert.equal(b.pageviews().at(-1).payload.url, 'https://analytics.example/#/one');
  } finally { b.close(); }
});

test('same normalized route replacements do not add pageviews; real revisits do', async () => {
  const b = browser({ url: 'https://analytics.example/?b=2&a=1#/home?y=2&x=1' });
  try {
    b.mount();
    b.w.history.replaceState({}, '', '?a=1&b=2#/home?x=1&y=2'); await pause();
    assert.equal(b.pageviews().length, 1);
    b.w.history.pushState({}, '', '#/one'); await pause();
    b.w.history.pushState({}, '', '#/home?x=1&y=2'); await pause();
    assert.equal(b.pageviews().length, 3);
  } finally { b.close(); }
});

test('collector ownership keeps one wrapper until last unmount and cancels pending route work', async () => {
  const b = browser();
  const original = b.w.history.pushState;
  try {
    const stop1 = b.mount(); const wrapped = b.w.history.pushState;
    const stop2 = b.mount();
    assert.equal(b.w.history.pushState, wrapped);
    assert.equal(b.pageviews().length, 1);
    stop1();
    b.w.history.pushState({}, '', '#/one'); await pause();
    assert.equal(b.pageviews().length, 2);
    stop2(); assert.equal(b.w.history.pushState, original);
    const before = b.pageviews().length;
    b.w.history.pushState({}, '', '#/two'); await pause();
    assert.equal(b.pageviews().length, before);
    const stop3 = b.mount();
    b.w.history.pushState({}, '', '#/three'); stop3(); await pause();
    assert.equal(b.w.history.pushState, original);
    assert.ok(b.pageviews().length <= before + 2);
  } finally { b.close(); }
});

test('bootstrap config failure cannot block basic collection', () => {
  const b = browser({ loaded: false });
  try { b.mount(); assert.equal(b.pageviews().length, 1); } finally { b.close(); }
});

test('blocked persistent/session storage falls back to stable in-memory identifiers', () => {
  const b = browser({ storageThrows: true });
  try {
    assert.doesNotThrow(() => { b.api.collectPageView(); b.api.collectPageView(); });
    const [first, second] = b.pageviews().map(x => x.payload);
    assert.ok(first.pvid); assert.equal(first.pvid, second.pvid); assert.equal(first.sessionId, second.sessionId);
    assert.equal(first.isEntryPage, true); assert.equal(second.isEntryPage, false);
  } finally { b.close(); }
});

test('session survives reload preserving original start, entry and visible duration', () => {
  const first = browser();
  let snapshot, original;
  try {
    first.mount(); original = first.pageviews()[0].payload;
    first.advance(12000); first.w.dispatchEvent(new first.w.Event('pagehide'));
    snapshot = first.snapshot();
  } finally { first.close(); }
  const second = browser({ storage: snapshot, now: 1800000013000 });
  try {
    second.mount(); const payload = second.pageviews()[0].payload;
    assert.equal(payload.sessionId, original.sessionId);
    assert.equal(payload.pvid, original.pvid);
    assert.equal(payload.isEntryPage, false);
    assert.equal(payload.sessionDuration, 12);
  } finally { second.close(); }
});

test('30 minutes without activity starts a new session while preserving visitor id', () => {
  const b = browser();
  try {
    b.api.collectPageView(); const first = b.pageviews()[0].payload;
    b.advance(30 * 60 * 1000); b.api.collectPageView();
    const second = b.pageviews()[1].payload;
    assert.notEqual(second.sessionId, first.sessionId); assert.equal(second.pvid, first.pvid);
    assert.equal(second.isEntryPage, true); assert.equal(second.sessionDuration, 0);
  } finally { b.close(); }
});

test('hidden intervals never inflate duration and the final page reports engagement only', () => {
  const b = browser();
  try {
    b.mount(); b.advance(10000); b.visibility('hidden');
    assert.equal(b.engagements().at(-1)?.payload.sessionDuration, 10);
    b.advance(120000); b.visibility('visible'); b.advance(5000);
    b.w.dispatchEvent(new b.w.Event('pagehide'));
    assert.equal(b.engagements().at(-1)?.payload.sessionDuration, 15);
    assert.equal(b.pageviews().length, 1);
  } finally { b.close(); }
});

test('a never-visible tab creates no pageview until its first activation', () => {
  const b = browser({ hidden: true });
  try {
    b.mount(); b.advance(3600000); b.w.dispatchEvent(new b.w.Event('pagehide'));
    assert.equal(b.requests.length, 0);
    b.visibility('visible'); assert.equal(b.pageviews().length, 1);
    assert.equal(b.pageviews()[0].payload.sessionDuration, 0);
  } finally { b.close(); }
});

test('a visible idle tab stops counting after the 30 minute inactivity boundary', () => {
  const b = browser();
  try {
    b.mount(); b.advance(2 * 3600000); b.w.dispatchEvent(new b.w.Event('pagehide'));
    assert.equal(b.engagements().at(-1)?.payload.sessionDuration, 1800);
    assert.equal(b.engagements().at(-1)?.payload.sessionEnded, true);
  } finally { b.close(); }
});

test('real activity renews inactivity deadline and a return after timeout receives an entry pageview', () => {
  const b = browser();
  try {
    b.mount(); const first = b.pageviews()[0].payload;
    b.advance(20 * 60000); b.w.document.dispatchEvent(new b.w.Event('pointerdown'));
    b.advance(20 * 60000); b.visibility('hidden');
    assert.equal(b.engagements().at(-1)?.payload.sessionDuration, 2400);
    b.advance(31 * 60000); b.visibility('visible');
    assert.equal(b.pageviews().length, 2);
    assert.notEqual(b.pageviews()[1].payload.sessionId, first.sessionId);
    assert.equal(b.pageviews()[1].payload.isEntryPage, true);
  } finally { b.close(); }
});

for (const [ua, touch, width, expected] of [
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.6723.91 Safari/537.36 Edg/130.0.2849.68', 0, 400, ['Edge', '130.0.2849.68', 'Windows', '10', 'desktop']],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1', 5, 390, ['Safari', '17.6', 'iOS', '17.6.1', 'mobile']],
  ['Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1', 5, 1024, ['Safari', '17.6', 'iPadOS', '17.6', 'tablet']],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15', 5, 1024, ['Safari', '17.6', 'iPadOS', '', 'tablet']],
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.6723.91 Mobile Safari/537.36', 5, 412, ['Chrome', '130.0.6723.91', 'Android', '14', 'mobile']],
]) test(`standard UA is classified without window-width hardware guesses: ${expected.join('/')}`, () => {
  const b = browser({ ua, touch, width });
  try {
    b.api.collectPageView(); const p = b.pageviews()[0].payload;
    assert.deepEqual([p.browser, p.browserVersion, p.os, p.osVersion, p.deviceType], expected);
  } finally { b.close(); }
});

test('hash route UTM is collected with outer-query precedence', () => {
  const b = browser({ url: 'https://analytics.example/?utm_source=outer#/home?utm_source=hash&utm_medium=email&utm_campaign=autumn' });
  try {
    b.api.collectPageView(); const p = b.pageviews()[0].payload;
    assert.equal(p.utmSource, 'outer'); assert.equal(p.utmMedium, 'email'); assert.equal(p.utmCampaign, 'autumn');
  } finally { b.close(); }
});

for (const options of [{ beacon: false }, { beaconThrows: true }]) test(`beacon refusal falls back once with stable event identity (${JSON.stringify(options)})`, async () => {
  const b = browser(options);
  try {
    b.api.setStatsEndpoint('/custom/stats'); b.api.collectPageView(); await pause();
    assert.equal(b.requests.length, 2);
    const [beacon, fetch] = b.requests;
    assert.equal(fetch.transport, 'fetch'); assert.equal(fetch.url, '/custom/stats'); assert.equal(fetch.init.keepalive, true);
    assert.ok(beacon.payload.eventId); assert.equal(beacon.payload.eventId, fetch.payload.eventId);
    assert.equal(fetch.payload.eventType, 'pageview');
  } finally { b.close(); }
});

test('failed fetch response/rejection does not loop or expose visitor payload in logs', async () => {
  for (const options of [{ fetchOk: false }, { fetchReject: true }]) {
    const b = browser({ beacon: false, ...options });
    try {
      b.api.collectPageView(); await pause();
      assert.equal(b.requests.length, 2);
      assert.equal(b.logs.some(args => args.some(arg => arg && typeof arg === 'object' && ('pvid' in arg || 'username' in arg))), false);
    } finally { b.close(); }
  }
});


test('a reload opened in background cannot send an old session engagement before activation', () => {
  const first = browser(); let snapshot;
  try { first.mount(); first.advance(10000); first.visibility('hidden'); snapshot = first.snapshot(); } finally { first.close(); }
  const b = browser({ hidden: true, storage: snapshot, now: 1800000015000 });
  try { b.mount(); b.w.dispatchEvent(new b.w.Event('pagehide')); assert.equal(b.requests.length, 0); } finally { b.close(); }
});

test('repeated pageshow events cannot discard an active visible interval', () => {
  const b = browser();
  try {
    b.mount(); b.advance(10000); b.w.dispatchEvent(new b.w.Event('pageshow'));
    b.advance(5000); b.w.dispatchEvent(new b.w.Event('pagehide'));
    assert.equal(b.engagements().at(-1)?.payload.sessionDuration, 15);
  } finally { b.close(); }
});

test('BFCache restoration counts a real page re-entry without including the hidden interval', () => {
  const b = browser();
  try {
    b.mount(); b.advance(10000); b.w.dispatchEvent(new b.w.Event('pagehide'));
    b.advance(120000); b.w.dispatchEvent(new b.w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(b.pageviews().length, 2);
    assert.equal(b.pageviews()[1].payload.isEntryPage, false);
    assert.equal(b.pageviews()[1].payload.sessionDuration, 10);
  } finally { b.close(); }
});

test('engagement closes the expired session before new-session pageview is sent', () => {
  const b = browser();
  try {
    b.mount(); const initial = b.pageviews()[0].payload;
    b.advance(31 * 60000); b.w.document.dispatchEvent(new b.w.Event('pointerdown'));
    assert.equal(b.engagements().at(-1)?.payload.sessionId, initial.sessionId);
    assert.equal(b.engagements().at(-1)?.payload.sessionDuration, 1800);
    assert.equal(b.pageviews().length, 2);
    assert.notEqual(b.pageviews()[1].payload.sessionId, initial.sessionId);
  } finally { b.close(); }
});

test('missing sendBeacon still submits once through fetch', () => {
  const b = browser();
  try {
    b.w.navigator.sendBeacon = undefined; b.api.collectPageView();
    assert.equal(b.requests.length, 1); assert.equal(b.requests[0].transport, 'fetch');
  } finally { b.close(); }
});


test('a later history owner retains its wrapper but cannot reactivate a released collector', () => {
  const b = browser();
  try {
    const stop = b.mount();
    const analyticsPush = b.w.history.pushState;
    const laterPush = function (...args) { analyticsPush.apply(this, args); };
    b.w.history.pushState = laterPush;
    stop(); const before = b.pageviews().length;
    assert.equal(b.w.history.pushState, laterPush);
    b.w.history.pushState({}, '', '#/released');
    assert.equal(b.pageviews().length, before);
  } finally { b.close(); }
});


test('activity heartbeat keeps one session current during forty minutes of continued use without a fake pageview', () => {
  const b = browser({ fakeTimers: true });
  try {
    b.mount(); const original = b.pageviews()[0].payload;
    b.advance(20 * 60000); b.w.document.dispatchEvent(new b.w.Event('pointerdown'));
    assert.equal(b.engagements().length, 1);
    assert.equal(b.engagements()[0].payload.sessionId, original.sessionId);
    assert.equal(b.engagements()[0].payload.sessionDuration, 1200);
    b.advance(20 * 60000); b.visibility('hidden');
    assert.equal(b.engagements().at(-1).payload.sessionDuration, 2400);
    assert.equal(b.pageviews().length, 1);
    assert.equal(b.engagements().at(-1).payload.timestamp - b.engagements()[0].payload.timestamp, 20 * 60000);
  } finally { b.close(); }
});

test('frequent activity is throttled into one trailing heartbeat and never becomes periodic idle keepalive', () => {
  const b = browser({ fakeTimers: true });
  try {
    b.mount();
    for (let i = 0; i < 3; i++) { b.advance(1000); b.w.document.dispatchEvent(new b.w.Event('pointerdown')); }
    assert.equal(b.engagements().length, 0);
    assert.equal(b.pendingTimers(), 1);
    b.advance(57000); b.runTimers();
    assert.equal(b.engagements().length, 1);
    assert.equal(b.engagements()[0].payload.sessionDuration, 60);
    assert.equal(b.pendingTimers(), 0);
    b.advance(31 * 60000); b.runTimers();
    assert.equal(b.engagements().length, 1);
    b.w.document.dispatchEvent(new b.w.Event('pointerdown'));
    assert.equal(b.pageviews().length, 2);
    assert.equal(b.pageviews()[1].payload.isEntryPage, true);
  } finally { b.close(); }
});

test('hide and final unmount cancel a pending heartbeat and hidden activity cannot schedule one', () => {
  const b = browser({ fakeTimers: true });
  try {
    const stop = b.mount(); b.advance(1000); b.w.document.dispatchEvent(new b.w.Event('keydown'));
    assert.equal(b.pendingTimers(), 1);
    b.visibility('hidden'); assert.equal(b.pendingTimers(), 0);
    const hiddenCount = b.requests.length;
    b.w.document.dispatchEvent(new b.w.Event('pointerdown')); b.advance(60000); b.runTimers();
    assert.equal(b.requests.length, hiddenCount);
    b.visibility('visible'); b.advance(1000); b.w.document.dispatchEvent(new b.w.Event('keydown'));
    b.advance(1000); b.w.document.dispatchEvent(new b.w.Event('keydown'));
    assert.equal(b.pendingTimers(), 1);
    stop(); assert.equal(b.pendingTimers(), 0);
    const stoppedCount = b.requests.length;
    b.advance(60000); b.runTimers(); assert.equal(b.requests.length, stoppedCount);
  } finally { b.close(); }
});
