const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const { buildLLMPayload, consumeLLMStream, extractLLMTokenUsage } = require('../services/llm');

test('OpenAI streaming requests ask for usage and preserve configured stream options', () => {
  const cfg = { provider: 'openai', model: 'local', extra: '{"stream_options":{"other_option":true}}' };
  assert.deepEqual(buildLLMPayload(cfg, [], true).stream_options, { include_usage: true, other_option: true });
  assert.equal(buildLLMPayload({ provider: 'openai' }, [], false).stream_options, undefined);
  assert.equal(buildLLMPayload({ provider: 'ollama' }, [], true).stream_options, undefined);
  assert.equal(buildLLMPayload({ provider: 'openai', extra: '{"stream_options":{"include_usage":false}}' }, [], true).stream_options.include_usage, false);
});

test('stream usage after finish_reason reaches the caller without becoming visible text', async () => {
  let text = '';
  const frames = [
    { choices: [{ delta: { content: '阳遁四局' }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 1451, completion_tokens: 59, total_tokens: 1510 } },
  ].map(x => `data: ${JSON.stringify(x)}\n\n`).join('') + 'data: [DONE]\n\n';
  const result = await consumeLLMStream({ provider: 'openai' }, Readable.from([Buffer.from(frames)]), delta => { text += delta; });
  assert.equal(text, '阳遁四局');
  assert.equal(result.tokensUsed, 1510);
});

test('usage reports are cumulative, not summed across chunks', async () => {
  const frames = [
    { choices: [{ delta: { content: '回答' } }], usage: { total_tokens: 10 } },
    { choices: [{ finish_reason: 'stop' }], usage: { total_tokens: 20 } },
  ].map(x => `data: ${JSON.stringify(x)}\n\n`).join('');
  const result = await consumeLLMStream({ provider: 'openai' }, Readable.from([Buffer.from(frames)]), () => {});
  assert.equal(result.tokensUsed, 20);
});

test('non-stream OpenAI usage is validated and never invents negative or non-numeric counts', () => {
  assert.equal(extractLLMTokenUsage({ provider: 'openai' }, { usage: { total_tokens: 1510 } }), 1510);
  assert.equal(extractLLMTokenUsage({ provider: 'openai' }, { usage: { prompt_tokens: 12, completion_tokens: 3 } }), 15);
  for (const value of [-1, NaN, Infinity, '15', 2.4]) assert.equal(extractLLMTokenUsage({ provider: 'openai' }, { usage: { total_tokens: value } }), 0);
  assert.equal(extractLLMTokenUsage({ provider: 'openai' }, {}), 0);
});

test('Ollama native token counts include prompt and generated tokens without double-counting cache', () => {
  const cfg = { provider: 'ollama' };
  assert.equal(extractLLMTokenUsage(cfg, {prompt_eval_count:120, prompt_eval_cached_count:100, eval_count:20}),140);
  for (const value of [-1, NaN, Infinity, '15', 2.4, Number.MAX_SAFE_INTEGER]) {
    assert.equal(extractLLMTokenUsage(cfg, {prompt_eval_count:value, eval_count:20}),0);
  }
  assert.equal(extractLLMTokenUsage(cfg, {eval_count:20}),0);
});

test('Ollama final NDJSON usage reaches HTTP and WebSocket callers once', async () => {
  const frames=[{message:{content:'真实回答'},done:false},{message:{content:''},done:true,prompt_eval_count:120,eval_count:20}].map(frame=>JSON.stringify(frame)+'\n').join('');
  let text='';
  const result=await consumeLLMStream({provider:'ollama'},Readable.from([Buffer.from(frames)]),delta=>{text+=delta;});
  assert.equal(text,'真实回答');
  assert.equal(result.tokensUsed,140);
});
