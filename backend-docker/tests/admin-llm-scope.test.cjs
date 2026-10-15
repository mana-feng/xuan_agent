const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

function load() {
  const routes = [], calls = [], router = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    router[method] = (route, ...handlers) => routes.push({ method, route, handle: handlers.at(-1) });
  }
  const service = {};
  for (const method of ['getLLMConfig', 'getLLMModels', 'setLLMConfig', 'activateLLMModel', 'deleteLLMModel']) {
    service[method] = async (...args) => {
      calls.push({ method, args });
      return method === 'getLLMModels' ? [] : { scope: args[1] };
    };
  }
  const database = {}, module = { exports: {} };
  const filename = path.resolve(__dirname, '../routes/admin.js');
  new Function('require', 'module', 'exports', fs.readFileSync(filename, 'utf8'))(request => {
    if (request === 'express') return { Router: () => router };
    if (request === '../db') return { getDatabase: () => database };
    if (request === '../config-service') return service;
    if (request === '../middleware/auth') return { adminMiddleware() {} };
    if (request === '../middleware/api-signature') return { apiSignatureMiddleware: () => () => {} };
    if (['bcryptjs', '../services/email', '../services/scheduler', '../security'].includes(request)) return {};
    throw new Error(`Unexpected dependency: ${request}`);
  }, module, module.exports);
  return { calls, async invoke(method, route, request = {}) {
    const handler = routes.find(item => item.method === method && item.route === route);
    assert.ok(handler);
    const response = { statusCode: 200 };
    const res = { status(code) { response.statusCode = code; return this; }, json(body) { response.body = body; return this; } };
    await handler.handle({ query: {}, body: {}, params: { id: '7' }, ...request }, res);
    return response;
  } };
}

const endpoints = [
  ['get', '/llm-config', ['getLLMConfig', 'getLLMModels']],
  ['put', '/llm-config', ['setLLMConfig']],
  ['get', '/llm-models', ['getLLMModels']],
  ['post', '/llm-models/:id/activate', ['activateLLMModel']],
  ['delete', '/llm-models/:id', ['deleteLLMModel']],
];
for (const [method, route, expected] of endpoints) {
  test(`${method} ${route}: keeps Chat and Agent operations in their selected scope`, async () => {
    for (const request of [{ query: { scope: 'agent' } }, { body: { scope: 'agent' } }, {}]) {
      const app = load();
      assert.equal((await app.invoke(method, route, request)).statusCode, 200);
      assert.deepEqual(app.calls.map(call => call.method), expected);
      for (const call of app.calls) assert.equal(call.args.at(-1), request.query || request.body ? 'agent' : 'chat');
    }
  });
  test(`${method} ${route}: rejects unknown or conflicting scopes before any configuration access`, async () => {
    for (const request of [{ query: { scope: 'other' } }, { body: { scope: 'other' } }, { query: { scope: 'agent' }, body: { scope: 'chat' } }]) {
      const app = load();
      assert.equal((await app.invoke(method, route, request)).statusCode, 400);
      assert.equal(app.calls.length, 0);
    }
  });
}
