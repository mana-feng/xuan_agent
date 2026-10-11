const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { build } = require('esbuild');
const vue = require('vue');
const { createPinia, setActivePinia } = require('pinia');

// Run real Agent/chat/API code. Only native page hooks and network boundaries are
// replaced. Slow network completion is simulated without making tests wait minutes.
let compiled;
test.before(async () => { compiled = (await build({
  absWorkingDir: path.resolve(__dirname, '..'),
  stdin: {
    contents: "export { request } from './src/services/api/index'; export { useAgentPage } from './src/features/agent/useAgentPage'; export { useUserStore } from './src/store/user'; export { useBaziStore } from './src/store/bazi'; export * from './src/pages/chat/index.nvue';",
    resolveDir: path.resolve(__dirname, '..'), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['vue', 'pinia', '@dcloudio/uni-app', '@/chat/ChatPanel.vue'],
  define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://test.local","VITE_API_SIGNATURE_ENABLED":"false","DEV":false}' },
  plugins: [{ name: 'actual-h5-chat-script', setup(builder) {
    builder.onLoad({ filter: /pages[\\/]chat[\\/]index\.nvue$/ }, ({ path: filename }) => {
      let source = fs.readFileSync(filename, 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
      source = source.replace(/\/\/ #ifndef H5[\s\S]*?\/\/ #endif/g, '');
      return { contents: `${source}\nexport { panelRef, buildMessages, sendToLLM, sendWithHttp, sendWithHttpStream };`, loader: 'ts', resolveDir: path.dirname(filename) };
    });
  } }],
})).outputFiles[0].text; });

function setup({ simulatedLatency = 0 } = {}) {
  const storage = new Map();
  const requests = [];
  global.uni = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
    getSystemInfoSync: () => ({}), showToast() {}, showModal() {},
    request(options) {
      requests.push(options);
      if ((options.timeout ?? 60000) < simulatedLatency) options.fail({ errMsg: 'request:fail timeout' });
      else options.success({ statusCode: 200, data: { reply: '完成响应' } });
    },
  };
  setActivePinia(createPinia());
  const loaded = new Module(__filename, module);
  loaded.paths = module.paths;
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name === 'vue') return { ...vue, onMounted() {}, onUnmounted() {} };
    if (name === '@dcloudio/uni-app') return { onLoad() {}, onUnload() {} };
    if (name === '@/chat/ChatPanel.vue') return {};
    return nativeRequire(name);
  };
  loaded._compile(compiled, __filename);
  const source = loaded.exports;
  source.useUserStore().setAuth({ email: 'test@example.test', access_token: 'test-access-token' });
  const displayed = [];
  let finished = 0;
  const history = [];
  source.panelRef.value = {
    setSending() {}, createWaitingMessage() {}, updateQuotaInfo() {},
    getMessages: () => history,
    appendAssistant: (text, status) => displayed.push({ text, status }),
    finishStreaming: () => { finished++; },
  };
  return { ...source, requests, displayed, history, get finished() { return finished; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const message = [{ role: 'user', content: '你好' }];
function responseStream(events) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(controller) {
    for (const event of events) controller.enqueue(encoder.encode(event));
    controller.close();
  } }), { status: 200 });
}

test('Agent can finish a 90 second non-stream response before its LLM deadline', async () => {
  const f = setup({ simulatedLatency: 90000 });
  const page = f.useAgentPage();
  page.handleQuickPrompt('你好');
  await flush();
  assert.equal(page.messages.value.at(-1).status, 'ready');
  assert.equal(page.messages.value.at(-1).text, '完成响应');
  assert.equal(f.requests[0].timeout, 195000);
});

test('non-stream chat also waits for slow LLM responses while ordinary APIs keep their default', async () => {
  const f = setup({ simulatedLatency: 90000 });
  await f.sendWithHttp(message);
  assert.equal(f.displayed.at(-1).text, '完成响应');
  assert.equal(f.requests[0].timeout, 195000);
  await assert.rejects(f.request('/api/profile'), error => /timeout/.test(error.message));
  assert.equal(f.requests[1].timeout, undefined);
});

test('an error after an SSE POST never automatically issues a second chargeable generation', async t => {
  const f = setup();
  let streamCalls = 0;
  t.mock.method(global, 'fetch', async () => {
    streamCalls++;
    return responseStream(['data: {"event":"delta","text":"partial"}\n\n', 'data: {"error":"upstream failed"}\n\n']);
  });
  await f.sendToLLM('你好');
  assert.equal(streamCalls, 1);
  assert.equal(f.requests.filter(request => request.url.endsWith('/api/llm/chat')).length, 0);
  assert.ok(f.displayed.some(item => item.status === 'error'));
});

test('a failed stream transport does not automatically retry even when the server may have committed', async t => {
  const f = setup();
  t.mock.method(global, 'fetch', async () => { throw new Error('Connection reset after request delivery'); });
  await f.sendToLLM('你好');
  assert.equal(f.requests.filter(request => request.url.endsWith('/api/llm/chat')).length, 0);
});

test('lack of streaming capability selects ordinary HTTP before any stream request is sent', async t => {
  const f = setup();
  const originalFetch = global.fetch;
  global.fetch = undefined;
  t.after(() => { global.fetch = originalFetch; });
  await f.sendToLLM('你好');
  assert.equal(f.requests.filter(request => request.url.endsWith('/api/llm/chat')).length, 1);
  assert.equal(f.displayed.at(-1).status, 'ready');
});

test('stream EOF without DONE is rejected and never marked as a completed answer', async t => {
  const f = setup();
  t.mock.method(global, 'fetch', async () => responseStream(['data: {"event":"delta","text":"partial"}\n\n']));
  await assert.rejects(f.sendWithHttpStream(message));
  assert.equal(f.finished, 0);
});

test('completed SSE uses an abort signal and finishes once', async t => {
  const f = setup();
  let signal;
  t.mock.method(global, 'fetch', async (url, options) => {
    signal = options.signal;
    return responseStream(['data: {"event":"delta","text":"完成响应"}\n\n', 'data: [DONE]\n\n']);
  });
  await f.sendWithHttpStream(message);
  assert.ok(signal instanceof AbortSignal);
  assert.equal(f.finished, 1);
});

test('SSE deadline aborts the pending request without automatically retrying', async t => {
  const f = setup();
  const originalTimer = global.setTimeout;
  const deadlines = [];
  t.mock.method(global, 'setTimeout', (callback, delay, ...args) => {
    deadlines.push(delay);
    return originalTimer(callback, delay === 195000 ? 1 : delay, ...args);
  });
  let signal;
  t.mock.method(global, 'fetch', async (url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true }));
  });
  await f.sendToLLM('你好');
  assert.equal(signal.aborted, true);
  assert.ok(deadlines.includes(195000));
  assert.equal(f.requests.filter(request => request.url.endsWith('/api/llm/chat')).length, 0);
  assert.equal(f.finished, 0);
});

test('every stateless chat turn includes one current chart context without writing it into UI history', () => {
  const f = setup();
  f.useBaziStore().pull({ realname: '测试甲', gender: 0, timestamp: new Date(1998, 7, 12, 9, 0).getTime(), recordId: null });
  const first = f.buildMessages('请分析');
  f.history.push({ id: 'user1', role: 'user', text: '请分析', status: 'ready' }, { id: 'assistant1', role: 'assistant', text: '第一轮回答', status: 'ready' }, { id: 'error1', role: 'assistant', text: '调用失败', status: 'error' });
  const second = f.buildMessages('继续分析');
  assert.equal(first.filter(item => item.role === 'system').length, 1);
  assert.equal(second.filter(item => item.role === 'system').length, 1);
  assert.match(first[0].content, /name: "测试甲"/);
  assert.match(second[0].content, /name: "测试甲"/);
  assert.deepEqual(second.slice(1), [{ role: 'user', content: '请分析' }, { role: 'assistant', content: '第一轮回答' }, { role: 'user', content: '继续分析' }]);
  assert.equal(f.history.length, 3);
});

test('the UI send order of user then waiting includes the current user prompt only once', async t => {
  const f = setup();
  const input = '这一轮请继续分析';
  // ChatPanel.handleSend inserts the user before emitting send. The page then
  // creates its waiting assistant message before it builds the outgoing payload.
  f.history.push({ id: 'current-user', role: 'user', text: input, status: 'ready' });
  f.panelRef.value.createWaitingMessage = () => {
    f.history.push({ id: 'current-waiting', role: 'assistant', text: '', status: 'waiting' });
  };
  let payload;
  t.mock.method(global, 'fetch', async (url, options) => {
    payload = JSON.parse(options.body);
    return responseStream(['data: {"event":"delta","text":"完成响应"}\n\n', 'data: [DONE]\n\n']);
  });
  await f.sendToLLM(input);
  assert.deepEqual(payload.messages.filter(item => item.role === 'user'), [{ role: 'user', content: input }]);
});

const expiredResponse = () => new Response(JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: '登录已失效，请重新登录' }), { status: 401 });
const completedResponse = () => responseStream(['data: {"event":"delta","text":"完成响应"}\n\n', 'data: [DONE]\n\n']);

test('SSE auth 401 refreshes once and rebuilds headers with the new access token', async t => {
  const f = setup(); let refreshes = 0; const headers = [];
  t.mock.method(global.uni, 'request', options => {
    if (options.url.endsWith('/api/auth/refresh')) { refreshes++; options.success({ statusCode: 200, data: { access_token: 'fresh-token' } }); }
    else options.success({ statusCode: 200, data: {} });
  });
  t.mock.method(global, 'fetch', async (url, options) => {
    headers.push(options.headers.Authorization);
    return headers.length === 1 ? expiredResponse() : completedResponse();
  });
  await f.sendWithHttpStream(message);
  assert.equal(refreshes, 1);
  assert.deepEqual(headers, ['Bearer test-access-token', 'Bearer fresh-token']);
  assert.equal(f.finished, 1);
});

test('SSE auth 401 does not send another generation when refresh fails', async t => {
  const f = setup(); let calls = 0; let refreshes = 0;
  t.mock.method(global.uni, 'request', options => { refreshes++; options.success({ statusCode: 401, data: {} }); });
  t.mock.method(global, 'fetch', async () => { calls++; return expiredResponse(); });
  await assert.rejects(f.sendWithHttpStream(message));
  assert.equal(refreshes, 1); assert.equal(calls, 1); assert.equal(f.finished, 0);
});

test('SSE repeated auth 401 stops after one refresh and one retry', async t => {
  const f = setup(); let calls = 0; let refreshes = 0;
  t.mock.method(global.uni, 'request', options => { refreshes++; options.success({ statusCode: 200, data: { access_token: 'fresh-token' } }); });
  t.mock.method(global, 'fetch', async () => { calls++; return expiredResponse(); });
  await assert.rejects(f.sendWithHttpStream(message));
  assert.equal(refreshes, 1); assert.equal(calls, 2); assert.equal(f.finished, 0);
});

test('SSE upstream 401 cannot be mistaken for local login expiry or retried', async t => {
  const f = setup(); let calls = 0;
  t.mock.method(global, 'fetch', async () => { calls++; return new Response(JSON.stringify({ error: '模型服务鉴权失败' }), { status: 401 }); });
  await assert.rejects(f.sendWithHttpStream(message));
  assert.equal(calls, 1); assert.equal(f.requests.length, 0);
});

test('simultaneous SSE auth 401 responses share the existing refresh lock', async t => {
  const f = setup(); let refreshes = 0;
  t.mock.method(global.uni, 'request', options => {
    if (options.url.endsWith('/api/auth/refresh')) { refreshes++; setTimeout(() => options.success({ statusCode: 200, data: { access_token: 'fresh-token' } }), 10); }
    else options.success({ statusCode: 200, data: {} });
  });
  t.mock.method(global, 'fetch', async (url, options) => options.headers.Authorization === 'Bearer fresh-token' ? completedResponse() : expiredResponse());
  await Promise.all([f.sendWithHttpStream(message), f.sendWithHttpStream(message)]);
  assert.equal(refreshes, 1); assert.equal(f.finished, 2);
});
