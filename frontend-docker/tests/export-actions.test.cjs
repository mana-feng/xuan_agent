const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.__UNI_FEATURE_WXS__ = false;
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'CustomEvent', 'KeyboardEvent']) {
	global[name] = dom.window[name];
}
const sourceRoot = path.resolve(__dirname, '../src');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === 'vue') request = '@dcloudio/uni-h5-vue';
	return originalResolve.call(this, request === 'qimen-engine' ? path.join(sourceRoot, '../vendor/qfdk-qimen/lib/qimen.js') : request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, ...args);
};
const { createApp, nextTick, reactive } = require('vue');
const { createPinia } = require('pinia');

// Each user interaction starts after the previous render. JSDOM dispatches
// synchronously, so wall-clock milliseconds can otherwise make Vue mistake a
// new bubbling event for one already in progress when its listener was attached.
let userEventTime = Date.now();
test.beforeEach(context => {
	context.mock.method(Date, 'now', () => userEventTime);
});

// Run the installed uni runtime's real event normalizer without booting its router/platform APIs.
const uniSource = fs.readFileSync(require.resolve('@dcloudio/uni-h5/dist/uni-h5.es.js'), 'utf8');
const uniAst = ts.createSourceFile('uni-h5.js', uniSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const eventNames = new Set(['isBuiltInElement', 'isKeyboardEvent', 'isClickEvent', 'isMouseEvent', 'isTouchEvent', '$nne', 'findUniTarget', 'createNativeEvent', 'wrapperEvent', 'normalizeClickEvent', 'normalizeMouseEvent', 'createTouchEvent']);
const eventSource = uniAst.statements.filter(node => {
	const name = ts.isFunctionDeclaration(node) ? node.name?.text : ts.isVariableStatement(node) ? node.declarationList.declarations[0]?.name.getText(uniAst) : '';
	return eventNames.has(name);
}).map(node => node.getText(uniAst)).join('\n');
const shared = require('@vue/shared');
const normalizeNativeEvent = new Function('normalizeTarget', 'extend', 'isPlainObject', 'wrapperH5WxsEvent', 'getWindowTop', `${eventSource}\nreturn $nne;`)(
	require('@dcloudio/uni-shared').normalizeTarget, shared.extend, shared.isPlainObject,
	() => undefined, // No WXS or renderjs handlers are used by the tested components.
	() => 0,
);
require.extensions['.ts'] = (module, filename) => {
	module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8').replace(/import\.meta/g, '({ env: {} })'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
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
		templateOptions: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('uni-') || tag.startsWith('tm-') || tag.startsWith('yx-') } },
	});
	module._compile(ts.transpileModule(compiled.content, {
		compilerOptions: { module: ts.ModuleKind.CommonJS },
	}).outputText, filename);
};
require.extensions['.nvue'] = require.extensions['.vue'];

function mount(relativePath, props, initialize = () => {}) {
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp(require(path.join(sourceRoot, relativePath)).default, props);
	app.use(createPinia());
	initialize();
	app.config.globalProperties.$nne = normalizeNativeEvent;
	const vm = app.mount(host);
	return { host, app, vm, dispose() { app.unmount(); host.remove(); } };
}

function dispatchUserEvent(element, event) {
	userEventTime++;
	element.dispatchEvent(event);
	return event;
}

function keydown(element, key, repeat = false) {
	return dispatchUserEvent(element, new dom.window.KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }));
}

function keyup(element, key) {
	return dispatchUserEvent(element, new dom.window.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
}

function press(element, key) {
	keydown(element, key);
	return keyup(element, key);
}


function platform(route) {
  const storage = new Map(), toasts = [];
  global.getCurrentPages = () => [{ route }];
  global.uni = { getSystemInfoSync: () => ({ windowWidth: 390 }), $on() {}, $off() {},
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    showToast: options => toasts.push(options), hideKeyboard() {}, showLoading() {}, hideLoading() {}, $emit() {}, removeStorageSync: key => storage.delete(key) };
  return { storage, toasts };
}
async function settle() { for (let i = 0; i < 4; i++) await nextTick(); }


const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
function liuyaoPage() {
  const boundary = platform('pages/liuyao/result');
  const mounted = mount('pages/liuyao/result.nvue', undefined, () => executeLiuyaoChart({
    title: '导出验收：合作, "样例"\\路径', gender: '女', date: new Date('2026-10-22T22:43:00+08:00'),
    params: [3, 0, 1, 4, 1, 0], methodLabel: '手工指定', timeZone: 'Asia/Singapore',
  }));
  return { ...mounted, ...boundary };
}
function button(host, label) { return [...host.querySelectorAll('uni-button')].find(node => node.textContent.trim() === label); }
async function tap(host, label) {
  const target = button(host, label); assert.ok(target, `missing button ${label}`);
  dispatchUserEvent(target, new Event('tap')); await settle();
}

test('Liuyao copy button sends displayed Chinese text with moving lines to the clipboard boundary', async () => {
  const page = liuyaoPage(); let copied;
  uni.setClipboardData = ({ data, success }) => { copied = data; success(); };
  try {
    await tap(page.host, '复制排盘');
    assert.ok(copied.includes('占问（原文）：\n> 导出验收：合作, "样例"\\路径'));
    assert.equal(copied.split('\n').filter(line => /^本卦：/.test(line)).length, 1);
    assert.match(copied, /水火既济/); assert.match(copied, /泽山咸/);
    assert.match(copied, /Asia\/Singapore/);
    assert.match(copied, /老阴动爻（阴变阳）/); assert.match(copied, /老阳动爻（阳变阴）/);
    assert.doesNotMatch(copied, /\||—/);
    assert.equal(page.toasts.length, 1); assert.match(page.toasts[0].title, /已复制/);
  } finally { page.dispose(); }
});

for (const mode of ['denied', 'throws']) {
  test(`Liuyao copy button reports ${mode} clipboard failure without a success message`, async t => {
    const page = liuyaoPage();
    uni.setClipboardData = ({ fail }) => {
      if (mode === 'throws') throw new Error('clipboard unavailable');
      fail?.({ errMsg: 'clipboard denied' });
    };
    t.mock.method(console, 'warn', () => {});
    try {
      await tap(page.host, '复制排盘');
      assert.equal(page.toasts.length, 1);
      assert.match(page.toasts[0].title, /复制失败/);
      assert.doesNotMatch(page.toasts[0].title, /已复制/);
      assert.match(page.toasts[0].title, /clipboard/);
    } finally { page.dispose(); }
  });
}

const { resolveObjectURL } = require('node:buffer');
// Filenames retain the documented device-local convention; payloads retain the birth zone.
const exportFixtureInstant = Date.parse('1992-08-17T09:30:00+08:00');
const exportFixtureLocalMinute = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(exportFixtureInstant).replace(/\D/g, '');
for (const type of ['bazi', 'ziwei']) {
 for (const timeZone of ['Asia/Singapore', 'America/New_York']) {
  for (const mode of ['download', 'failure']) {
    test(`${type} mounted export button ${mode} in ${timeZone} preserves UTF-8 content and reports the actual outcome`, async t => {
      const boundary = platform(`pages/${type === 'bazi' ? 'index/detail' : 'ziwei/result'}`);
      const mounted = mount(type === 'bazi' ? 'pages/index/detail.nvue' : 'pages/ziwei/result.nvue', undefined, () => {
        const store = type === 'bazi' ? require('../src/store/bazi.ts').useBaziStore() : require('../src/store/ziwei.ts').useZiweiStore();
        store.pull({realname:'导出验收, "样例"\\路径',gender:0,timestamp:exportFixtureInstant,timeZone});
      });
      let blob, filename, copies = 0;
      const urls = [];
      t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
        filename = this.download; blob = resolveObjectURL(this.href); urls.push(this.href);
        if (mode !== 'download') throw new Error('download blocked');
      });
      uni.setClipboardData = ({ success }) => { copies++; success(); };
      try {
        await tap(mounted.host, '导出 TOON');
        assert.equal(filename, `${type}-${exportFixtureLocalMinute}.toon`);
        assert.equal(blob.type, 'text/plain;charset=utf-8');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
        assert.ok(text.includes('导出验收')); assert.ok(text.includes(timeZone));
        assert.ok(text.includes('714015000000'));
        assert.equal(copies, 0, 'TOON export must never copy');
        if (mode === 'download') {
          assert.match(boundary.toasts.at(-1).title, /已请求浏览器下载/);
        } else {
          assert.equal(boundary.toasts.length, 0);
          const error = mounted.host.querySelector('[role="alert"]');
          assert.ok(error);
          assert.match(type === 'bazi' ? error.querySelector('tm-text')?.getAttribute('label') || '' : error.textContent, /导出失败.*download blocked/);
        }
      } finally { mounted.dispose(); urls.forEach(url => URL.revokeObjectURL(url)); }
    });
  }
}
}


const { useQimenStore } = require('../src/store/qimen.ts');
const qimenInput = { question: '奇门导出验收, "样例"\\路径', timestamp: Date.parse('2026-10-23T00:00:00Z'), timeZone: 'America/New_York' };
function qimenPage(input = qimenInput) {
  const boundary = platform('pages/qimen/result');
  const mounted = mount('pages/qimen/result.nvue', undefined, () => {
    if (input) useQimenStore().pull(input);
  });
  return { ...mounted, ...boundary };
}
function captureQimenExport(t, { downloadError = false } = {}) {
  const captured = { downloads: [], copies: [] };
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
    const blob = resolveObjectURL(this.href);
    captured.downloads.push({ filename: this.download, blob, url: this.href });
    if (downloadError) throw new Error('download unavailable');
  });
  uni.setClipboardData = ({ data, success }) => { captured.copies.push(data); success(); };
  t.after(() => captured.downloads.forEach(item => URL.revokeObjectURL(item.url)));
  return captured;
}

test('Qimen export button hands off the displayed plate as a UTF-8 TOON file without recalculating', async t => {
  const page = qimenPage(), store = useQimenStore(), chartBefore = store.chart;
  const captured = captureQimenExport(t);
  t.mock.method(store, 'pull', () => { throw new Error('export must not calculate a new plate'); });
  try {
    await tap(page.host, '导出 TOON');
    assert.equal(store.chart, chartBefore);
    assert.equal(captured.downloads.length, 1); assert.equal(captured.copies.length, 0);
    const { filename, blob } = captured.downloads[0];
    assert.equal(filename, 'qimen-20261023T000000Z.toon');
    assert.equal(blob.type, 'text/plain;charset=utf-8');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer());
    assert.ok(text.includes('奇门导出验收')); assert.ok(text.includes('America/New_York'));
    assert.ok(text.includes('qimen-chai-bu-v1'));
    assert.equal(page.toasts.length, 1); assert.match(page.toasts[0].title, /已请求浏览器下载/);
    assert.doesNotMatch(page.toasts[0].title, /下载成功|下载完成|已下载/);
    assert.equal(page.host.querySelector('.qm-error'), null);
  } finally { page.dispose(); }
});

test('Qimen failed browser handoff shows an error without copying', async t => {
  const page = qimenPage(), captured = captureQimenExport(t, { downloadError: true });
  try {
    await tap(page.host, '导出 TOON');
    assert.equal(captured.copies.length, 0);
    const error = page.host.querySelector('.qm-error[role="alert"]');
    assert.ok(error); assert.match(error.textContent, /导出失败.*download unavailable/);
    assert.equal(page.toasts.length, 0);
  } finally { page.dispose(); }
});

test('Qimen result without a plate has no export button', async () => {
  const page = qimenPage(null);
  try { assert.equal(button(page.host, '导出 TOON'), undefined); assert.match(page.host.textContent, /还没有可显示的九宫盘/); }
  finally { page.dispose(); }
});

test('Qimen export explains an invalid source time and allows retry after correction', async t => {
  const page = qimenPage(), captured = captureQimenExport(t), store = useQimenStore();
  const timestamp = store.input.timestamp;
  try {
    store.input.timestamp = null;
    await tap(page.host, '导出 TOON');
    assert.equal(captured.downloads.length, 0); assert.equal(captured.copies.length, 0);
    assert.match(page.host.querySelector('.qm-error[role="alert"]').textContent, /起局|时间/);
    store.input.timestamp = timestamp;
    await tap(page.host, '导出 TOON');
    assert.equal(captured.downloads.length, 1); assert.equal(page.host.querySelector('.qm-error'), null);
  } finally { page.dispose(); }
});

test('Qimen export preserves the valid Unix epoch instant instead of treating zero as missing', async t => {
  const page = qimenPage({ question: '零时刻样例', timestamp: 0, timeZone: 'Asia/Shanghai' }), captured = captureQimenExport(t);
  try {
    await tap(page.host, '导出 TOON');
    assert.equal(captured.downloads.length, 1);
    assert.equal(captured.downloads[0].filename, 'qimen-19700101T000000Z.toon');
  } finally { page.dispose(); }
});

test('Qimen mounted export strictly decodes to every displayed source field with the official parser', { skip: !process.env.TOON_REFERENCE_MODULE }, async t => {
  const page = qimenPage(), captured = captureQimenExport(t), store = useQimenStore();
  const input = JSON.parse(JSON.stringify(store.input)), chart = JSON.parse(JSON.stringify(store.chart));
  try {
    await tap(page.host, '导出 TOON');
    const { pathToFileURL } = require('node:url');
    const { decode } = await import(pathToFileURL(process.env.TOON_REFERENCE_MODULE).href);
    const decoded = decode(await captured.downloads[0].blob.text(), { strict: true });
    assert.equal(decoded.module, 'qimen'); assert.equal(decoded.version, 1);
    assert.deepEqual(decoded.input, input); assert.deepEqual(decoded.chart, chart);
    assert.equal(decoded.rules.id, 'qimen-chai-bu-v1');
    assert.equal(decoded.rules.clock, '北京时间 UTC+08:00'); assert.equal(decoded.rules.dayDivide, '23:00');
    assert.equal(decoded.chart.metadata.inputCivil, '2026-10-22 20:00:00');
    assert.equal(decoded.chart.metadata.calculationCivil, '2026-10-23 08:00:00');
    assert.equal(decoded.input.timeZone, 'America/New_York');
    assert.deepEqual(Object.keys(decoded.chart.diPan).sort(), ['1','2','3','4','5','6','7','8','9']);
  } finally { page.dispose(); }
});

function resultExportPage(type) {
  if (type === 'qimen') return { ...qimenPage(), store: useQimenStore() };
  const boundary = platform(`pages/${type === 'bazi' ? 'index/detail' : 'ziwei/result'}`);
  let store;
  const page = mount(type === 'bazi' ? 'pages/index/detail.nvue' : 'pages/ziwei/result.nvue', undefined, () => {
    store = type === 'bazi' ? require('../src/store/bazi.ts').useBaziStore() : require('../src/store/ziwei.ts').useZiweiStore();
    store.pull({ realname: '导出一致性合成样例', gender: 0, timestamp: Date.parse('1992-08-17T09:30:00+08:00'), timeZone: 'Asia/Singapore' });
  });
  return { ...page, ...boundary, store };
}
function exportAlert(page) {
  const alert = page.host.querySelector('[role="alert"], .error-message, .export-error, .qm-error');
  return alert?.querySelector('tm-text')?.getAttribute('label') || alert?.textContent || '';
}

for (const type of ['bazi', 'ziwei', 'qimen']) {
  test(`${type} export rejects invalid source instants with a visible error and no handoff`, async t => {
    const page = resultExportPage(type), captured = captureQimenExport(t);
    try {
      for (const timestamp of [null, undefined, NaN, Infinity, 9e15, '1992-08-17']) {
        page.store.input.timestamp = timestamp;
        await tap(page.host, '导出 TOON');
        assert.equal(captured.downloads.length, 0); assert.equal(captured.copies.length, 0);
        assert.match(exportAlert(page), /时间|起局/);
        assert.ok(page.host.querySelector('[role="alert"]'), 'export errors must be announced');
      }
      assert.equal(page.toasts.length, 0);
    } finally { page.dispose(); }
  });

  test(`${type} download failure never copies and a successful retry clears the error`, async t => {
    const page = resultExportPage(type);
    let blocked = true, copies = 0;
    t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', () => { if (blocked) throw new Error('download blocked'); });
    uni.setClipboardData = ({ success }) => { copies++; success(); };
    try {
      await tap(page.host, '导出 TOON');
      assert.equal(copies, 0); assert.match(exportAlert(page), /导出失败.*download blocked/);
      assert.ok(page.host.querySelector('[role="alert"]')); assert.equal(page.toasts.length, 0);
      blocked = false;
      await tap(page.host, '导出 TOON');
      assert.equal(copies, 0); assert.equal(exportAlert(page), ''); assert.equal(page.toasts.length, 1);
      assert.match(page.toasts[0].title, /已请求浏览器下载/);
    } finally { page.dispose(); }
  });

  test(`${type} missing browser download API shows failure without touching the clipboard`, async t => {
    const page = resultExportPage(type);
    let copies = 0;
    uni.setClipboardData = ({ success }) => { copies++; success(); };
    const descriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { ...descriptor, value: undefined });
    try {
      await tap(page.host, '导出 TOON');
      assert.equal(copies, 0); assert.match(exportAlert(page), /导出失败/);
      assert.ok(page.host.querySelector('[role="alert"]')); assert.equal(page.toasts.length, 0);
    } finally { Object.defineProperty(URL, 'createObjectURL', descriptor); page.dispose(); }
  });

  test(`${type} click Enter and Space each request one download from the current source`, async t => {
    const page = resultExportPage(type);
    let downloads = 0, copies = 0;
    const input = page.store.input, snapshot = JSON.stringify(input);
    t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', () => { downloads++; });
    t.mock.method(page.store, 'pull', () => { throw new Error('export must not pull'); });
    uni.setClipboardData = () => { copies++; };
    try {
      await tap(page.host, '导出 TOON'); assert.equal(downloads, 1);
      const target = button(page.host, '导出 TOON'); target.focus();
      press(target, 'Enter'); await settle(); assert.equal(downloads, 2);
      press(target, ' '); await settle(); assert.equal(downloads, 3);
      assert.equal(copies, 0); assert.equal(page.store.input, input); assert.equal(JSON.stringify(input), snapshot);
    } finally { page.dispose(); }
  });
}

test('Bazi export refuses an unconfirmed legacy time zone instead of downloading null', async t => {
  const page = resultExportPage('bazi'), captured = captureQimenExport(t);
  page.store.legacyNeedsTimeZone = true;
  try {
    await tap(page.host, '导出 TOON');
    assert.equal(captured.downloads.length, 0); assert.equal(captured.copies.length, 0);
    assert.match(exportAlert(page), /时区/); assert.equal(page.toasts.length, 0);
  } finally { page.dispose(); }
});

test('Bazi epoch export filename uses the source instant in the existing device-local minute format', async t => {
  const page = resultExportPage('bazi'), captured = captureQimenExport(t);
  page.store.pull({ realname: '零时刻样例', gender: 0, timestamp: 0, timeZone: 'Asia/Shanghai' });
  try {
    await tap(page.host, '导出 TOON');
    assert.equal(captured.downloads.length, 1);
    // The existing filename convention follows the device zone, including historical offsets.
    const local = new Date(0), pad = n => String(n).padStart(2, '0');
    assert.equal(captured.downloads[0].filename, `bazi-${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}${pad(local.getHours())}${pad(local.getMinutes())}.toon`);
    assert.ok((await captured.downloads[0].blob.text()).includes('birthTimestamp: 0'));
  } finally { page.dispose(); }
});
