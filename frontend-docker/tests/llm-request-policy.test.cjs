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
    contents: "export { request } from './src/services/api/index'; export { useAgentPage } from './src/features/agent/useAgentPage'; export { useUserStore } from './src/store/user'; export { useBaziStore } from './src/store/bazi'; export { useZiweiStore } from './src/store/ziwei'; export { executeLiuyaoChart } from './src/features/liuyao/executor'; export { useQimenStore } from './src/store/qimen'; export * from './src/pages/chat/index.nvue';",
    resolveDir: path.resolve(__dirname, '..'), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['vue', 'pinia', '@dcloudio/uni-app', '@/chat/ChatPanel.vue'],
  define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://test.local","VITE_API_SIGNATURE_ENABLED":"false","DEV":false}' },
  plugins: [{ name: 'actual-h5-chat-script', setup(builder) {
    builder.onLoad({ filter: /pages[\\/]chat[\\/]index\.nvue$/ }, ({ path: filename }) => {
      let source = fs.readFileSync(filename, 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
      source = source.replace(/\/\/ #ifndef H5[\s\S]*?\/\/ #endif/g, '');
      return { contents: `${source}\nexport { panelRef, chatContext, buildMessages, sendToLLM, sendWithHttp, sendWithHttpStream };`, loader: 'ts', resolveDir: path.dirname(filename) };
    });
  } }],
})).outputFiles[0].text; });

function setup({ simulatedLatency = 0 } = {}) {
  const storage = new Map();
  const requests = [];
  const mountedHooks = [];
  const loadHooks = [];
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
    if (name === 'vue') return { ...vue, onMounted(callback) { mountedHooks.push(callback); }, onUnmounted() {} };
    if (name === '@dcloudio/uni-app') return { onLoad(callback) { loadHooks.push(callback); }, onUnload() {} };
    if (name === '@/chat/ChatPanel.vue') return {};
    return nativeRequire(name);
  };
  loaded._compile(compiled, __filename);
  const source = loaded.exports;
  source.useUserStore().setAuth({ email: 'test@example.test', access_token: 'test-access-token' });
  const displayed = [];
  let finished = 0;
  let sending = false;
  const history = [];
  source.panelRef.value = {
    setSending(value) { sending = value; }, createWaitingMessage() {}, updateQuotaInfo() {},
    getMessages: () => history,
    appendAssistant: (text, status) => {
      displayed.push({ text, status });
      // ChatPanel's public API ends sending on complete/error messages, but not deltas.
      if (status !== 'stream') sending = false;
    },
    finishStreaming: () => { finished++; sending = false; },
  };
  return { ...source, requests, displayed, history, mountedHooks, loadHooks, get finished() { return finished; }, get sending() { return sending; } };
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

for (const context of ['liuyao', 'ziwei', 'qimen']) {
  test(`${context} initializes its hint before an immediate send and never interrupts the active stream`, async t => {
    const f = setup();
    if (context === 'liuyao') f.executeLiuyaoChart({ title: '合作如何推进', gender: '女', date: new Date(2022, 2, 3, 8), params: [1, 0, 3, 0, 1, 4], methodLabel: '手工起卦' });
    if (context === 'ziwei') f.useZiweiStore().pull({ realname: '当前盘主', gender: 1, timestamp: Date.parse('1991-06-15T16:05:00Z'), timeZone: 'America/New_York' });
    if (context === 'qimen') f.useQimenStore().pull({ question: '合作如何推进', timestamp: Date.parse('2026-10-13T10:25:00+08:00'), timeZone: 'Asia/Shanghai', ruleVersion: 'qimen-chai-bu-v1', recordId: null });
    f.chatContext.value = context;
    const delayedInitializers = [];
    const originalTimer = global.setTimeout;
    t.mock.method(global, 'setTimeout', (callback, delay, ...args) => {
      if (delay === 120) { delayedInitializers.push(callback); return 0; }
      if (delay === 300) return 0; // Successful completion's later quota refresh is unrelated.
      return originalTimer(callback, delay, ...args);
    });
    let controller;
    const encoder = new TextEncoder();
    t.mock.method(global, 'fetch', async () => new Response(new ReadableStream({ start(stream) {
      controller = stream;
      stream.enqueue(encoder.encode('data: {"event":"delta","text":"第一段"}\n\n'));
    } }), { status: 200 }));
    f.mountedHooks.forEach(callback => callback());
    const initializedBeforeSend = f.displayed.some(item => item.status === 'ready' && item.text.includes('已为您加载'));
    const pending = f.sendToLLM('立即开始解读');
    await flush();
    delayedInitializers.forEach(callback => callback());
    const stayedSending = f.sending;
    controller.enqueue(encoder.encode('data: {"event":"delta","text":"第二段"}\n\ndata: [DONE]\n\n'));
    controller.close();
    await pending;
    assert.equal(initializedBeforeSend, true, 'the chart hint must exist before the first user turn');
    assert.equal(stayedSending, true, 'initialization must not clear the sending flag during a stream');
    assert.deepEqual(f.displayed.map(item => item.status), ['ready', 'stream', 'stream']);
    assert.equal(f.finished, 1);
  });
}

for (const context of ['liuyao', 'ziwei', 'qimen']) {
  test(`${context} without chart data immediately shows a neutral hint without inventing model context`, () => {
    const f = setup();
    f.chatContext.value = context;
    f.mountedHooks.forEach(callback => callback());
    assert.ok(f.displayed.some(item => item.status === 'ready' && item.text.includes('尚未关联')));
    assert.ok(f.displayed.every(item => !item.text.includes('已为您加载')));
    assert.deepEqual(f.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
  });
}

for (const stream of [false, true]) {
  test(`Qimen ${stream ? 'stream' : 'HTTP'} request includes the computed board once and keeps authentication`, async t => {
    const f = setup();
    f.useQimenStore().pull({ question: '合作如何推进', timestamp: Date.parse('2026-10-13T10:25:00+08:00'), timeZone: 'Asia/Shanghai', ruleVersion: 'qimen-chai-bu-v1', recordId: 17 });
    f.loadHooks.forEach(callback => callback({ from: 'qimen' }));
    const originalTimer = global.setTimeout;
    t.mock.method(global, 'setTimeout', (callback, delay, ...args) => delay === 300 ? 0 : originalTimer(callback, delay, ...args));
    let sent;
    if (stream) {
      t.mock.method(global, 'fetch', async (url, options) => {
        assert.equal(url, 'http://test.local/api/llm/chat');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer test-access-token');
        sent = JSON.parse(options.body);
        return responseStream(['data: {"event":"delta","text":"根据当前奇门盘局"}\n\ndata: [DONE]\n\n']);
      });
    }
    const messages = f.buildMessages('请分析这个盘');
    if (stream) await f.sendWithHttpStream(messages);
    else {
      await f.sendWithHttp(messages);
      const request = f.requests.find(item => item.url.endsWith('/api/llm/chat'));
      assert.equal(request.header.Authorization, 'Bearer test-access-token');
      sent = request.data;
    }
    assert.equal(sent.stream, stream);
    assert.equal(sent.messages.filter(item => item.role === 'system').length, 1);
    assert.match(sent.messages[0].content, /User Qimen/);
    assert.match(sent.messages[0].content, /合作如何推进/);
    assert.match(sent.messages[0].content, /qimen-chai-bu-v1/);
    for (const key of ['diPan', 'tianPan', 'jiuXing', 'baMen', 'baShen']) assert.ok(sent.messages[0].content.includes(key), key);
    assert.equal(sent.messages.at(-1).content, '请分析这个盘');
    assert.equal(f.displayed.some(item => item.text.includes('User Qimen')), false, 'system context must stay out of the visible transcript');
  });
}

for (const scenario of ['HTTP 429', 'SSE error after partial text', 'non-stream HTTP 429']) {
  test(`${scenario} refreshes the displayed quota without another generation`, async t => {
    const f = setup();
    const quotaUpdates = [];
    f.panelRef.value.updateQuotaInfo = info => quotaUpdates.push(info);
    let streamCalls = 0;
    if (scenario === 'non-stream HTTP 429') {
      const originalFetch = global.fetch;
      global.fetch = undefined;
      t.after(() => { global.fetch = originalFetch; });
    } else {
      t.mock.method(global, 'fetch', async () => {
        streamCalls++;
        return scenario === 'HTTP 429'
          ? new Response(JSON.stringify({ error: '额度不足', code: 'QUOTA_EXCEEDED' }), { status: 429 })
          : responseStream(['data: {"event":"delta","text":"partial"}\n\n', 'data: {"error":"upstream failed after charging"}\n\n']);
      });
    }
    t.mock.method(global.uni, 'request', options => {
      f.requests.push(options);
      if (options.url.endsWith('/api/llm/chat')) {
        options.success({ statusCode: 429, data: { error: '额度不足', code: 'QUOTA_EXCEEDED' } });
      } else if (options.url.endsWith('/api/llm/quota')) {
        options.success({ statusCode: 200, data: { remainingCount: 0, remainingTokens: 0 } });
      } else {
        options.success({ statusCode: 200, data: {} });
      }
    });
    await f.sendToLLM('请分析');
    await flush();
    assert.ok(f.displayed.some(item => item.status === 'error'));
    assert.deepEqual(quotaUpdates, [{ remainingCount: 0, remainingTokens: 0 }]);
    const quotaRequests = f.requests.filter(item => item.url.endsWith('/api/llm/quota'));
    assert.equal(quotaRequests.length, 1);
    assert.equal(quotaRequests[0].method, 'GET');
    assert.equal(streamCalls + f.requests.filter(item => item.url.endsWith('/api/llm/chat')).length, 1);
  });
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
