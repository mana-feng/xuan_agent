const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const http = require('node:http');
const { test } = require('node:test');
const express = require('express');
const WebSocket = require('ws');

// Execute the production routes/services with real HTTP and WebSocket transports.
// The database boundary models row locking and rollback; upstream protocol fixtures
// are deliberately controlled failures, not evidence of real model inference.
function loadModule(relative, dependencies) {
  const filename = path.resolve(__dirname, '..', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : originalRequire(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

function quotaDatabase(count = 1) {
  const state = { count, records: 0, tokenUsage: [], unavailable: false, failInsert: false, connections: 0 };
  let rowLock = Promise.resolve();
  const quota = value => ({ user_id: 41, remaining_daily_count: value, remaining_token: 0, per_minute_limit: 1 });
  const db = {
    get: async () => {
      if (state.unavailable) throw new Error('database unavailable');
      return quota(state.count);
    },
    run: async sql => {
      if (state.unavailable) throw new Error('database unavailable');
      if (sql.includes('INSERT INTO llm_usage_records')) {
        if (state.failInsert) throw new Error('usage insert failed');
        state.records++;
      }
      if (sql.includes('UPDATE user_llm_quotas')) state.count = Math.max(0, state.count - 1);
      return { changes: 1 };
    },
    pool: {
      getConnection: async () => {
        if (state.unavailable) throw new Error('database unavailable');
        state.connections++;
        let releaseLock;
        let localCount;
        let localRecords = 0;
        let localTokenUsage = [];
        const unlock = () => { releaseLock?.(); releaseLock = null; };
        return {
          beginTransaction: async () => {},
          execute: async (sql, params) => {
            if (sql.includes('UPDATE user_llm_quotas')) {
              const previous = rowLock;
              rowLock = new Promise(resolve => { releaseLock = resolve; });
              await previous;
              localCount = state.count;
              if (localCount <= 0) return [{ affectedRows: 0 }];
              localCount--;
              return [{ affectedRows: 1 }];
            }
            if (sql.includes('INSERT INTO llm_usage_records')) {
              if (state.failInsert) throw new Error('usage insert failed');
              localRecords++;
              localTokenUsage.push(params[1]);
              return [{ affectedRows: 1 }];
            }
            if (sql.includes('SELECT')) return [[quota(localCount ?? state.count)]];
            throw new Error(`Unsupported transaction SQL: ${sql}`);
          },
          commit: async () => {
            if (localCount !== undefined) state.count = localCount;
            state.records += localRecords;
            state.tokenUsage.push(...localTokenUsage);
            unlock();
          },
          rollback: async () => { unlock(); },
          release: () => { state.connections--; unlock(); },
        };
      },
    },
  };
  return { db, state };
}

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });

async function fixture(t, { count = 1, provider = 'ollama' } = {}) {
  t.mock.method(console, 'error', () => {});
  const database = quotaDatabase(count);
  let calls = 0;
  const upstream = http.createServer(async (req, res) => {
    calls++;
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    const mode = request.messages?.[0]?.content || request.contents?.[0]?.parts?.[0]?.text || 'success';
    const streaming = provider === 'gemini' ? req.url.includes(':streamGenerateContent') : request.stream;
    if (mode === 'usage') {
      const usage = { prompt_tokens: 120, completion_tokens: 15, total_tokens: 135 };
      if (streaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '阳遁四局' }, finish_reason: 'stop' }], usage }) + '\n\ndata: [DONE]\n\n');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: '阳遁四局' } }], usage }));
      }
      return;
    }
    if (mode === 'http-error') { res.writeHead(500); res.end('{"error":"upstream failed"}'); return; }
    if (mode === 'upstream-401' || mode === 'upstream-403') {
      res.writeHead(Number(mode.slice(-3)));
      res.end('{"error":"provider credentials rejected"}');
      return;
    }
    if (mode === 'concurrent') await new Promise(resolve => setTimeout(resolve, 40));
    if (!streaming) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(mode === 'empty' ? { done: true, message: { content: '' } } : { done: true, message: { content: '实际响应测试' } }));
      return;
    }
    res.setHeader('Content-Type', provider === 'ollama' ? 'application/x-ndjson' : 'text/event-stream');
    if (mode === 'hang') { res.flushHeaders(); return; }
    if (mode === 'empty') { res.end(); return; }
    if (mode === 'error-event') { res.end(provider === 'ollama' ? '{"error":"upstream failed"}\n' : 'data: {"error":{"message":"upstream failed"}}\n\n'); return; }
    if (mode === 'malformed') { res.end(provider === 'ollama' ? '{broken json}\n' : 'data: {broken json}\n\n'); return; }
    let chunks;
    if (provider === 'ollama') {
      chunks = [JSON.stringify({ message: { content: '<think>hidden</think>实际响应测试' }, done: false }) + '\n'];
      if (mode !== 'truncated') chunks.push(JSON.stringify({ message: { content: '' }, done: true }) + '\n');
    } else if (provider === 'gemini') {
      chunks = ['data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '实际响应测试' }] } }] }) + '\n\n'];
      if (mode !== 'truncated') chunks.push('data: ' + JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }) + '\n\n');
    } else if (provider === 'anthropic') {
      chunks = ['event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"实际响应测试"}}\n\n'];
      if (mode !== 'truncated') chunks.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    } else {
      chunks = ['data: {"choices":[{"delta":{"content":"实际响应测试"},"finish_reason":null}]}\n\n'];
      if (mode !== 'truncated') chunks.push('data: [DONE]\n\n');
    }
    // Force UTF-8 characters and records to cross transport chunk boundaries.
    const bytes = Buffer.from(chunks.join(''));
    const split = bytes.indexOf(Buffer.from('实')) + 1;
    res.write(bytes.subarray(0, split));
    setImmediate(() => res.end(bytes.subarray(split)));
  });
  const upstreamPort = await listen(upstream);
  const configService = {
    getLLMConfig: async () => ({ provider, baseUrl: `http://127.0.0.1:${upstreamPort}`, model: 'fixture', apiKey: 'fixture' }),
    getQuotaResetConfig: async () => ({ target: 2 }),
  };
  const dependencies = { '../db': { getDatabase: () => database.db }, '../config-service': configService };
  const quota = loadModule('services/quota.js', dependencies);
  const app = express();
  app.use(express.json());
  app.use('/api/llm', loadModule('routes/llm.js', {
    ...dependencies,
    '../services/quota': quota,
    '../middleware/auth': { authMiddleware: (req, res, next) => { req.user = { id: 41 }; next(); } },
    '../middleware/api-signature': { apiSignatureMiddleware: () => (req, res, next) => next() },
    '../config/rateLimit': { llmLimiter: (req, res, next) => next() },
  }));
  const server = http.createServer(app);
  const { initWebSocketServer } = loadModule('websocket/server.js', {
    ...dependencies,
    '../services/quota': quota,
    '../config': { JWT_SECRET: 'fixture' },
    jsonwebtoken: { verify: () => ({ uid: 41 }) },
  });
  const wss = initWebSocketServer(server);
  const port = await listen(server);
  t.after(async () => {
    for (const client of wss.clients) client.terminate();
    await Promise.all([close(server), close(upstream)]);
  });
  return {
    ...database,
    get calls() { return calls; },
    url: `http://127.0.0.1:${port}`,
    request: async (mode, stream = false, endpoint = 'chat') => {
      const res = await fetch(`http://127.0.0.1:${port}/api/llm/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: mode }], stream }),
      });
      return { status: res.status, text: await res.text() };
    },
    ws: (mode, stream = true) => new Promise((resolve, reject) => {
      const messages = [];
      const socket = new WebSocket(`ws://127.0.0.1:${port}/api/llm/chat/ws`, { headers: { Authorization: 'Bearer fixture' } });
      const timeout = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket did not finish')); }, 2500);
      socket.on('error', reject);
      socket.on('open', () => socket.send(JSON.stringify({ messages: [{ role: 'user', content: mode }], stream })));
      socket.on('message', value => messages.push(JSON.parse(value.toString())));
      socket.on('close', () => { clearTimeout(timeout); resolve(messages); });
    }),
  };
}

for (const transport of ['http', 'ws']) {
  for (const stream of [false, true]) {
    test(`${transport}: real provider token counts reach the committed usage record, stream=${stream}`, async t => {
      const f = await fixture(t, { provider: 'openai' });
      if (transport === 'http') assert.equal((await f.request('usage', stream)).status, 200);
      else assert.ok((await f.ws('usage', stream)).some(item => item.event === 'done'));
      assert.deepEqual(f.state.tokenUsage, [135]);
    });
  }
}

for (const endpoint of ['chat', 'agent']) {
  test(`HTTP ${endpoint}: successful answer records and deducts once before returning`, async t => {
    const f = await fixture(t);
    const res = await f.request('success', false, endpoint);
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.text).reply, '实际响应测试');
    assert.equal(f.state.count, 0);
    assert.equal(f.state.records, 1);
    assert.equal(f.state.connections, 0);
  });

  for (const stream of [false, true]) {
    for (const status of [401, 403]) {
      test(`HTTP ${endpoint}: upstream ${status} with stream=${stream} cannot masquerade as user login expiry`, async t => {
        const f = await fixture(t);
        const res = await f.request(`upstream-${status}`, stream, endpoint);
        assert.equal(res.status, 502);
        const body = JSON.parse(res.text);
        assert.equal(body.code, 'LLM_UPSTREAM_AUTH_FAILED');
        assert.doesNotMatch(body.error, /登录|login|token/i);
        assert.equal(f.calls, 1);
        assert.equal(f.state.count, 1);
        assert.equal(f.state.records, 0);
        assert.equal(f.state.connections, 0);
      });
    }
  }
}

for (const status of [401, 403]) {
  test(`WebSocket: upstream ${status} reports provider credentials without suggesting user login expiry`, async t => {
    const f = await fixture(t);
    const result = await f.ws(`upstream-${status}`);
    assert.equal(result.length, 1);
    assert.equal(result[0].event, 'error');
    assert.equal(result[0].code, 'LLM_UPSTREAM_AUTH_FAILED');
    assert.doesNotMatch(result[0].message, /登录|login|token/i);
    assert.equal(f.calls, 1);
    assert.equal(f.state.count, 1);
    assert.equal(f.state.records, 0);
    assert.equal(f.state.connections, 0);
  });
}

test('HTTP: empty non-stream answer is an error without quota usage', async t => {
  const f = await fixture(t);
  const res = await f.request('empty');
  assert.ok(res.status >= 500);
  assert.equal(f.state.count, 1);
  assert.equal(f.state.records, 0);
});

for (const transport of ['http', 'ws']) {
  for (const mode of ['empty', 'error-event', 'malformed', 'truncated', 'http-error']) {
    test(`${transport}: ${mode} stream never reports success or consumes quota`, async t => {
      const f = await fixture(t);
      const result = transport === 'http' ? (await f.request(mode, true)).text : await f.ws(mode);
      if (transport === 'http') { assert.doesNotMatch(result, /\[DONE\]/); assert.match(result, /"error"/); }
      else { assert.equal(result.some(item => item.event === 'done'), false); assert.ok(result.some(item => item.event === 'error')); }
      assert.equal(f.state.count, 1);
      assert.equal(f.state.records, 0);
      assert.equal(f.state.connections, 0);
    });
  }

  for (const provider of ['ollama', 'openai', 'anthropic', 'gemini']) {
    test(`${transport}: ${provider} completed stream preserves Unicode and charges once`, async t => {
      const f = await fixture(t, { provider });
      if (transport === 'http') {
        const result = (await f.request('success', true)).text;
        assert.match(result, /实际响应测试/);
        assert.match(result, /\[DONE\]/);
        assert.doesNotMatch(result, /hidden|�/);
      } else {
        const result = await f.ws('success');
        assert.equal(result.filter(item => item.event === 'delta').map(item => item.text).join(''), '实际响应测试');
        assert.equal(result.filter(item => item.event === 'done').length, 1);
      }
      assert.equal(f.state.count, 0);
      assert.equal(f.state.records, 1);
      assert.equal(f.state.connections, 0);
    });
  }

  test(`${transport}: zero quota rejects before invoking upstream`, async t => {
    const f = await fixture(t, { count: 0 });
    if (transport === 'http') assert.equal((await f.request('success')).status, 429);
    else assert.equal((await f.ws('success'))[0].event, 'error');
    assert.equal(f.calls, 0);
    assert.equal(f.state.count, 0);
    assert.equal(f.state.records, 0);
  });
}

test('HTTP + WebSocket: concurrent requests cannot spend the same final slot', async t => {
  const f = await fixture(t);
  const [httpResult, wsResult] = await Promise.all([f.request('concurrent', true), f.ws('concurrent')]);
  const successes = Number(httpResult.text.includes('[DONE]')) + Number(wsResult.some(item => item.event === 'done'));
  assert.equal(successes, 1);
  assert.equal(f.calls, 1);
  assert.equal(f.state.count, 0);
  assert.equal(f.state.records, 1);
});

test('HTTP: database check errors fail closed before invoking upstream', async t => {
  const f = await fixture(t);
  f.state.unavailable = true;
  assert.ok((await f.request('success')).status >= 500);
  assert.equal(f.calls, 0);
});

test('HTTP: usage insert failure rolls back deduction and prevents successful response', async t => {
  const f = await fixture(t);
  f.state.failInsert = true;
  assert.ok((await f.request('success')).status >= 500);
  assert.equal(f.state.count, 1);
  assert.equal(f.state.records, 0);
});

test('WebSocket: non-stream Ollama response delivers text and charges once', async t => {
  const f = await fixture(t);
  const result = await f.ws('success', false);
  assert.equal(result.filter(item => item.event === 'delta').map(item => item.text).join(''), '实际响应测试');
  assert.equal(result.filter(item => item.event === 'done').length, 1);
  assert.equal(f.state.count, 0);
  assert.equal(f.state.records, 1);
});

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Condition was not reached');
}

for (const transport of ['http', 'ws']) {
  test(`${transport}: upstream timeout releases the connection and restores the reserved slot`, async t => {
    const previous = process.env.LLM_REQUEST_TIMEOUT_MS;
    process.env.LLM_REQUEST_TIMEOUT_MS = '1000';
    t.after(() => { if (previous === undefined) delete process.env.LLM_REQUEST_TIMEOUT_MS; else process.env.LLM_REQUEST_TIMEOUT_MS = previous; });
    const f = await fixture(t);
    const result = transport === 'http' ? (await f.request('hang', true)).text : await f.ws('hang');
    if (transport === 'http') { assert.match(result, /"error"/); assert.doesNotMatch(result, /\[DONE\]/); }
    else assert.equal(result.some(item => item.event === 'done'), false);
    assert.equal(f.state.count, 1);
    assert.equal(f.state.records, 0);
    assert.equal(f.state.connections, 0);
  });

  test(`${transport}: disconnect aborts upstream and releases the reserved slot`, async t => {
    const f = await fixture(t);
    if (transport === 'http') {
      const controller = new AbortController();
      const pending = fetch(`${f.url}/api/llm/chat`, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hang' }], stream: true }),
      }).catch(() => null);
      await waitFor(() => f.calls === 1);
      controller.abort();
      await pending;
    } else {
      const socket = new WebSocket(f.url.replace('http:', 'ws:') + '/api/llm/chat/ws', { headers: { Authorization: 'Bearer fixture' } });
      socket.on('error', () => {});
      await new Promise(resolve => socket.on('open', resolve));
      socket.send(JSON.stringify({ messages: [{ role: 'user', content: 'hang' }], stream: true }));
      await waitFor(() => f.calls === 1);
      socket.terminate();
    }
    await waitFor(() => f.state.connections === 0);
    assert.equal(f.state.count, 1);
    assert.equal(f.state.records, 0);
  });
}
