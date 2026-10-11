const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { resetPlatform } = require('./helpers/load-ai-source.cjs');
const { callAi } = require('../src/services/ai.ts');
const { saveAiConfig } = require('../src/config/aiConfig.ts');
const originalFetch = global.fetch;
let platform;
const messages = [{ role: 'system', content: '规则' }, { role: 'user', content: '你好' }, { role: 'assistant', content: '前文' }, { role: 'user', content: '继续' }];
function config(provider = 'custom', apiUrl = 'http://127.0.0.1:11439/v1/chat/completions') {
  saveAiConfig({ provider, apiUrl, apiKey: provider === 'custom' ? '' : 'fixture-key', model: 'fixture-model' });
}
function stream(text, cuts = [1, 7, 13]) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    let offset = 0;
    for (const cut of cuts) { controller.enqueue(bytes.slice(offset, cut)); offset = cut; }
    controller.enqueue(bytes.slice(offset)); controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
function event(data) { return `data: ${JSON.stringify(data)}\n\n`; }
beforeEach(() => { platform = resetPlatform(); config(); });
afterEach(() => { global.fetch = originalFetch; });

test('network failure never resends a potentially accepted generation', async () => {
  let requests = 0;
  global.fetch = async () => { requests++; throw new TypeError('Failed to fetch'); };
  await assert.rejects(callAi(messages, { onChunk() {} }), /连接|网络|fetch/i);
  assert.equal(requests, 1); assert.equal(platform.requests.length, 0);
});
test('OpenAI SSE reconstructs split UTF-8, reasoning and terminal response', async () => {
  let captured; const chunks = []; const thinking = [];
  global.fetch = async (url, init) => { captured = { url, ...init }; return stream(event({ choices: [{ delta: { reasoning_content: '思考' } }] }) + event({ choices: [{ delta: { content: '你好' } }] }) + 'data: [DONE]\n\n', [2, 90, 91, 92]); };
  assert.equal(await callAi(messages, { onChunk: x => chunks.push(x), onThinking: x => thinking.push(x) }), '你好');
  assert.deepEqual(chunks, ['你好']); assert.deepEqual(thinking, ['思考']);
  assert.equal(captured.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(captured.body).messages, messages);
});
test('multiline SSE data and CRLF framing are decoded as one event', async () => {
  global.fetch = async () => stream('data: {"choices":[\r\ndata: {"delta":{"content":"回答"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  assert.equal(await callAi(messages, { onChunk() {} }), '回答');
});
test('Anthropic maps system messages and joins text deltas without leaking thinking', async () => {
  config('anthropic', 'https://example.test/v1/messages'); let captured; const thinking = [];
  global.fetch = async (_, init) => { captured = init; return stream(event({ type: 'message_start', message: { role: 'assistant' } }) + event({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '思考' } }) + event({ type: 'content_block_delta', delta: { type: 'text_delta', text: '答案' } }) + event({ type: 'message_stop' })); };
  assert.equal(await callAi(messages, { onChunk() {}, onThinking: x => thinking.push(x) }), '答案');
  assert.equal(captured.headers['x-api-key'], 'fixture-key'); assert.equal(captured.headers.Authorization, undefined);
  assert.equal(JSON.parse(captured.body).system, '规则'); assert.equal(JSON.parse(captured.body).messages.length, 3);
  assert.deepEqual(thinking, ['思考']);
});
test('Gemini native sends model/system format, preserves query and separates all thought/text parts', async () => {
  config('gemini', 'https://example.test/v1beta?region=us'); let captured; const thinking = [];
  global.fetch = async (url, init) => { captured = { url, ...init }; return stream(event({ candidates: [{ content: { parts: [{ text: '推理', thought: true }, { text: '甲' }, { text: '乙' }] }, finishReason: 'STOP' }] })); };
  assert.equal(await callAi(messages, { onChunk() {}, onThinking: x => thinking.push(x) }), '甲乙');
  assert.deepEqual(thinking, ['推理']); assert.match(captured.url, /models\/fixture-model:streamGenerateContent/);
  assert.equal(new URL(captured.url).searchParams.get('alt'), 'sse'); assert.equal(new URL(captured.url).searchParams.get('region'), 'us');
  assert.equal(captured.headers['x-goog-api-key'], 'fixture-key'); assert.equal(JSON.parse(captured.body).contents[1].role, 'model');
});
test('Gemini OpenAI-compatible route keeps OpenAI body and authorization', async () => {
  config('gemini', 'https://example.test/v1beta/openai/chat/completions'); let captured;
  global.fetch = async (_, init) => { captured = init; return stream(event({ choices: [{ delta: { content: '兼容' }, finish_reason: 'stop' }] })); };
  assert.equal(await callAi(messages, { onChunk() {} }), '兼容');
  assert.equal(captured.headers.Authorization, 'Bearer fixture-key'); assert.equal(JSON.parse(captured.body).contents, undefined);
});
for (const [label, payload, pattern] of [
  ['empty stream', 'data: [DONE]\n\n', /空|内容/],
  ['truncated stream', event({ choices: [{ delta: { content: '部分' } }] }), /中断|完整|结束/],
  ['malformed event', 'data: {invalid}\n\ndata: [DONE]\n\n', /解析|格式/],
  ['provider error event', event({ error: { message: 'upstream failed' } }), /失败|异常/],
  ['length-truncated answer', event({ choices: [{ delta: { content: '部分' }, finish_reason: 'length' }] }), /截断|长度|上限/],
]) test(`rejects ${label} without silently accepting an answer`, async () => {
  global.fetch = async () => stream(payload);
  await assert.rejects(callAi(messages, { onChunk() {} }), pattern);
  assert.equal(platform.requests.length, 0);
});
test('a server returning JSON for stream request is consumed without a second generation', async () => {
  let requests = 0;
  global.fetch = async () => { requests++; return Response.json({ choices: [{ message: { content: '完整 JSON 回复' }, finish_reason: 'stop' }] }); };
  assert.equal(await callAi(messages, { onChunk() {} }), '完整 JSON 回复'); assert.equal(requests, 1);
});
test('non-stream Anthropic joins all text blocks', async () => {
  config('anthropic', 'https://example.test/v1/messages');
  global.uni.request = options => { options.success({ statusCode: 200, data: { content: [{ type: 'thinking', thinking: '思考' }, { type: 'text', text: '甲' }, { type: 'text', text: '乙' }], stop_reason: 'end_turn' } }); return { abort() {} }; };
  assert.equal(await callAi(messages), '甲乙');
});
test('non-stream empty reply is rejected', async () => {
  global.uni.request = options => { options.success({ statusCode: 200, data: { choices: [] } }); return { abort() {} }; };
  await assert.rejects(callAi(messages), /空|内容/);
});
test('a failure after a partial stream never sends a replacement request', async () => {
  let reads = 0; const chunks = [];
  global.fetch = async () => new Response(new ReadableStream({ pull(controller) {
    if (reads++ === 0) controller.enqueue(new TextEncoder().encode(event({ choices: [{ delta: { content: '部分' } }] })));
    else controller.error(new TypeError('network reset'));
  } }), { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(callAi(messages, { onChunk: text => chunks.push(text) }), /连接|网络/);
  assert.deepEqual(chunks, ['部分']); assert.equal(platform.requests.length, 0);
});
test('HTTP authorization failure is surfaced once without fallback', async () => {
  global.fetch = async () => new Response('denied', { status: 401 });
  await assert.rejects(callAi(messages, { onChunk() {} }), /401/); assert.equal(platform.requests.length, 0);
});
test('non-stream Gemini joins all answer parts and preserves existing native endpoint', async () => {
  config('gemini', 'https://example.test/v1beta/models/saved-model:streamGenerateContent?alt=sse&region=us'); let request;
  global.uni.request = options => { request = options; options.success({ statusCode: 200, data: { candidates: [{ content: { parts: [{ thought: true, text: '推理' }, { text: '甲' }, { text: '乙' }] }, finishReason: 'STOP' }] } }); return { abort() {} }; };
  assert.equal(await callAi(messages), '甲乙'); assert.match(request.url, /saved-model:generateContent/); assert.equal(new URL(request.url).searchParams.has('alt'), false); assert.equal(request.header['x-goog-api-key'], 'fixture-key');
});
test('non-stream transport cancellation aborts the uni request and ignores late callbacks', async () => {
  const controller = new AbortController(); let aborted = false; let request;
  global.uni.request = options => { request = options; return { abort() { aborted = true; } }; };
  const pending = callAi(messages, undefined, { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, /取消/); assert.equal(aborted, true);
  request.success({ statusCode: 200, data: { choices: [{ message: { content: 'late' } }] } });
});
test('pre-cancelled request never reaches either network transport', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected transport'); };
  await assert.rejects(callAi(messages, { onChunk() {} }, { signal: controller.signal }), /取消/);
  assert.equal(calls, 0); assert.equal(platform.requests.length, 0);
});
test('SSE terminal frame at EOF and comment heartbeats are handled', async () => {
  global.fetch = async () => stream(': heartbeat\r\r' + event({ choices: [{ delta: { content: '最后' } }] }) + 'data: [DONE]');
  assert.equal(await callAi(messages, { onChunk() {} }), '最后');
});
for (const [label, options] of [['caller cancellation', { cancel: true }], ['request timeout', { timeoutMs: 5 }]]) {
  test(`${label} terminates a stalled stream and prevents resend`, async () => {
    const controller = new AbortController();
    let requestSignal;
    global.fetch = async (_, init) => {
      requestSignal = init.signal;
      return new Response(new ReadableStream({ start(reader) {
        init.signal?.addEventListener('abort', () => reader.error(new DOMException('Aborted', 'AbortError')));
      } }), { headers: { 'content-type': 'text/event-stream' } });
    };
    const pending = callAi(messages, { onChunk() {} }, { signal: controller.signal, timeoutMs: options.timeoutMs || 2000 });
    if (options.cancel) controller.abort();
    const result = await Promise.race([pending.then(() => 'resolved', error => error.message), new Promise(resolve => setTimeout(() => resolve('still waiting'), 70))]);
    assert.match(result, options.cancel ? /取消/ : /超时/);
    assert.equal(requestSignal.aborted, true); assert.equal(platform.requests.length, 0);
  });
}
