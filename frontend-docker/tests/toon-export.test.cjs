const assert = require('node:assert/strict');
const { resolveObjectURL } = require('node:buffer');
const { test, beforeEach } = require('node:test');
const { JSDOM } = require('jsdom');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');

const profile = { realname: '导出甲', gender: 0, timestamp: new Date(1990, 4, 20, 12, 30).getTime() };
const other = { realname: '其他乙', gender: 1, timestamp: new Date(1985, 2, 3, 8, 0).getTime() };
let platform;
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });

function prepare(t, type, { clickError = false, clipboardError = false } = {}) {
	const timers = [];
	t.mock.method(global, 'setTimeout', callback => { timers.push(callback); return timers.length; });
	t.mock.method(global, 'clearTimeout', () => {});
	platform.flushTimers = () => timers.splice(0).forEach(callback => callback());
  const dom = new JSDOM('<!doctype html><body></body>');
  global.document = dom.window.document;
  const urls = [];
  const downloads = [];
  const copies = [];
  const create = URL.createObjectURL.bind(URL);
  t.mock.method(URL, 'createObjectURL', blob => { const url = create(blob); urls.push(url); return url; });
  // jsdom has no download backend. Keep real Blob/URL bytes and intercept only browser handoff.
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
    if (clickError) throw new Error('download blocked');
    downloads.push({ filename: this.download, url: this.href, blob: resolveObjectURL(this.href) });
  });
  uni.setClipboardData = ({ data, success, fail }) => {
    copies.push(data);
    if (clipboardError) fail({ errMsg: 'clipboard denied' }); else success();
  };
  t.after(() => { urls.forEach(url => URL.revokeObjectURL(url)); dom.window.close(); delete global.document; });
  useUserStore().set(profile);
  (type === 'bazi' ? useBaziStore() : useZiweiStore()).pull(profile);
  const page = loadPage(type === 'bazi' ? 'pages/index/detail.nvue' : 'pages/ziwei/result.nvue', ['exportToon', 'exportError']);
  useUserStore().set(other);
  (type === 'bazi' ? useZiweiStore() : useBaziStore()).pull(other);
  return { page, urls, downloads, copies };
}

for (const type of ['bazi', 'ziwei']) {
  test(`${type} export hands off UTF-8 TOON bytes and filename for the displayed chart`, async t => {
    const { page, downloads, copies } = prepare(t, type);
    page.exportToon();
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].filename, `${type}-199005201230.toon`);
    assert.equal(downloads[0].blob.type, 'text/plain;charset=utf-8');
    const text = await downloads[0].blob.text();
    assert.match(text, /name: "导出甲"/);
    assert.match(text, /gender: "男"/);
    assert.ok(text.includes(`birthTimestamp: ${profile.timestamp}`));
    assert.doesNotMatch(text, /其他乙/);
    assert.equal(copies.length, 0);
    assert.equal(page.exportError.value, '');
  });

  test(`${type} export keeps the Blob URL valid through browser handoff then releases it`, t => {
    const { page, urls } = prepare(t, type);
    page.exportToon();
    assert.ok(resolveObjectURL(urls[0]), 'the URL must remain readable after the click handler returns');
    platform.flushTimers();
    assert.equal(resolveObjectURL(urls[0]), undefined, 'the temporary URL must eventually be released');
  });

  test(`${type} export reports handoff without claiming the browser finished saving`, t => {
    const { page } = prepare(t, type);
    page.exportToon();
    assert.equal(platform.toasts.length, 1);
    assert.match(platform.toasts[0].title, /下载/);
    assert.doesNotMatch(platform.toasts[0].title, /已下载|下载成功|下载完成/);
  });

  test(`${type} failed download releases its Blob URL and reports failure without copying`, t => {
    const { page, urls, copies, downloads } = prepare(t, type, { clickError: true });
    page.exportToon();
    platform.flushTimers();
    assert.equal(resolveObjectURL(urls[0]), undefined, 'failed handoff must not leak the export Blob');
    assert.equal(downloads.length, 0);
    assert.equal(copies.length, 0);
    assert.equal(platform.toasts.length, 0);
    assert.match(page.exportError.value, /导出失败.*download blocked/);
  });

  test(`${type} failed download does not call an unavailable clipboard`, t => {
    const { page, urls, copies } = prepare(t, type, { clickError: true, clipboardError: true });
    page.exportToon();
    platform.flushTimers();
    assert.match(page.exportError.value, /导出失败.*download blocked/);
    assert.equal(copies.length, 0);
    assert.equal(platform.toasts.length, 0);
    assert.equal(resolveObjectURL(urls[0]), undefined);
  });
}
