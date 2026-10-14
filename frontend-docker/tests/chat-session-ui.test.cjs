const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('node:crypto');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement']) global[name] = dom.window[name];
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
const vue = require('vue');
const root = path.resolve(__dirname, '../src');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
require.extensions['.vue'] = (module, filename) => {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|scroll-view)(?=[\s>])/g, '$1uni-$2').replace(/@tap\b/g, '@click');
  descriptor.template.ast = undefined;
  const compiled = compileScript(descriptor, { id: 'chat-session-test', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') } } });
  module._compile(ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const identity = { account: 'alice@example.test', chartType: 'qimen', chart: { timestamp: 1000, question: '模拟问题' }, recordId: 5 };
function platform() {
  const storage = new Map();
  global.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), showToast() {} };
  return storage;
}
function mount(initialIdentity = identity) {
  const props = vue.reactive({ sessionIdentity: initialIdentity, sessionAccount: identity.account }); const sends = []; let panel; let resets = 0;
  const host = document.createElement('div'); document.body.append(host);
  const app = vue.createApp({ render: () => vue.h(require(path.join(root, 'chat/ChatPanel.vue')).default, {
    ...props, ref: value => panel = value, onSend: text => { sends.push(text); panel.createWaitingMessage(); }, onSessionReset: () => { resets++; },
  }) });
  app.mount(host);
  return { host, props, sends, get panel() { return panel; }, get resets() { return resets; }, dispose() { app.unmount(); host.remove(); } };
}
async function waitFor(check) { for (let i = 0; i < 100; i++) { await vue.nextTick(); if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.ok(check(), 'expected UI state did not appear'); }
async function fill(f, value) { const input = f.host.querySelector('textarea'); input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await vue.nextTick(); }

test('ordinary chat clears private messages and invalidates pending replies on logout and account switch', async () => {
  platform(); const f = mount(null);
  try {
    await vue.nextTick();
    const oldPanel = f.panel.captureSession();
    f.panel.appendAssistant('alice 私密回复', 'stream'); await fill(f, 'alice 私密草稿');
    const resets = f.resets;
    f.props.sessionAccount = ''; await vue.nextTick();
    oldPanel.appendAssistant('退出后的迟到回复', 'ready'); await vue.nextTick();
    assert.equal(f.resets, resets + 1, 'logout must cancel the active request even without a chart');
    assert.doesNotMatch(f.host.textContent, /alice 私密回复|退出后的迟到回复/);
    assert.equal(f.host.querySelector('textarea').value, '');
    const guestPanel = f.panel.captureSession(); f.panel.appendAssistant('访客对话', 'ready');
    f.props.sessionAccount = 'bob@example.test'; await vue.nextTick();
    guestPanel.appendAssistant('登录后的迟到回复', 'ready'); await vue.nextTick();
    assert.equal(f.resets, resets + 2);
    assert.doesNotMatch(f.host.textContent, /访客对话|登录后的迟到回复/);
    assert.equal(f.props.sessionIdentity, null);
  } finally { f.dispose(); }
});

test('real chat controls save and restore conversation, draft and incomplete streaming after remount', async () => {
  platform(); let f = mount();
  try {
    await waitFor(() => /对话将加密保存/.test(f.host.textContent));
    await fill(f, '浏览器问题'); f.host.querySelector('.chat-send').click(); await vue.nextTick();
    assert.deepEqual(f.sends, ['浏览器问题']);
    f.panel.appendAssistant('尚未说完', 'stream');
    await waitFor(() => /已保存到此设备/.test(f.host.textContent)); f.dispose(); f = mount();
    await waitFor(() => /已恢复此命盘/.test(f.host.textContent));
    assert.match(f.host.textContent, /浏览器问题/); assert.match(f.host.textContent, /尚未说完/); assert.match(f.host.textContent, /回复已中断/);
    assert.deepEqual(f.sends, []); assert.equal(f.host.querySelector('textarea').disabled, false);
    await fill(f, '草稿仍在'); await waitFor(() => /已保存到此设备/.test(f.host.textContent)); f.dispose(); f = mount();
    await waitFor(() => /已恢复此命盘/.test(f.host.textContent)); assert.equal(f.host.querySelector('textarea').value, '草稿仍在');
  } finally { f.dispose(); }
});

test('logout and clear remove visible content and invalidate late response callbacks', async () => {
  platform(); const f = mount();
  try {
    await waitFor(() => /对话将加密保存/.test(f.host.textContent));
    const oldPanel = f.panel.captureSession(); f.panel.appendAssistant('alice 的私密回复', 'ready');
    f.props.sessionIdentity = null; await vue.nextTick();
    oldPanel.appendAssistant('迟到的回复', 'ready');
    assert.doesNotMatch(f.host.textContent, /alice 的私密回复|迟到的回复/);
    f.props.sessionIdentity = identity; await waitFor(() => /已恢复此命盘/.test(f.host.textContent));
    assert.doesNotMatch(f.host.textContent, /迟到的回复/);
    f.panel.appendAssistant('要清空的回复', 'ready'); await waitFor(() => /已保存到此设备/.test(f.host.textContent));
    [...f.host.querySelectorAll('button')].find(button => button.textContent === '清空对话').click();
    await waitFor(() => /当前对话已清空/.test(f.host.textContent)); assert.doesNotMatch(f.host.textContent, /要清空的回复/);
  } finally { f.dispose(); }
});

test('a failed partial reply remains incomplete immediately and after restore', async () => {
  platform(); let f = mount();
  try {
    await waitFor(() => /对话将加密保存/.test(f.host.textContent));
    f.panel.createWaitingMessage(); f.panel.appendAssistant('部分回答', 'stream'); f.panel.appendAssistant('连接中断', 'error');
    assert.equal(f.panel.getMessages().find(message => message.text === '部分回答').status, 'error');
    await waitFor(() => /已保存到此设备/.test(f.host.textContent)); f.dispose(); f = mount();
    await waitFor(() => /已恢复此命盘/.test(f.host.textContent));
    assert.equal(f.panel.getMessages().find(message => message.text === '部分回答').status, 'error');
  } finally { f.dispose(); }
});

test('late response callbacks are inert after the panel unmounts', async () => {
  platform(); const f = mount();
  await waitFor(() => /对话将加密保存/.test(f.host.textContent));
  const pending = f.panel.captureSession(); const messages = f.panel.getMessages();
  f.dispose(); pending.appendAssistant('卸载后的私密回复', 'ready');
  assert.equal(messages.some(message => message.text === '卸载后的私密回复'), false);
});
