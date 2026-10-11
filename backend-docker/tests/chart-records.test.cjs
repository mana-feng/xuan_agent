const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const SecurityUtils = require('../security');
const helpers = require('../utils/helpers');

// Exercise the actual route handlers. Only registration, auth/signature middleware,
// and the database boundary are replaced; no server, credentials or DB are used.
function loadRoutes(type, database) {
  const routes = [];
  const router = {};
  for (const method of ['post', 'put', 'get', 'delete']) {
    router[method] = (route, ...handlers) => routes.push({ method, route, handle: handlers.at(-1) });
  }
  const filename = path.resolve(__dirname, `../routes/${type}.js`);
  const module = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', fs.readFileSync(filename, 'utf8'));
  evaluate(function requireRouteDependency(request) {
      if (request === 'express') return { Router: () => router };
      if (request === '../db') return { getDatabase: () => database };
      if (request === '../utils/helpers') return helpers;
      if (request === '../security') return SecurityUtils;
      if (request === '../middleware/auth') return { authMiddleware() {} };
      if (request === '../middleware/api-signature') return { apiSignatureMiddleware: () => () => {} };
      if (request === '../utils/error-sanitizer') return { sanitizeErrorForLog: error => error.message };
      throw new Error(`Unexpected dependency: ${request}`);
    }, module, module.exports);
  return async function invoke(method, route, request = {}) {
    const entry = routes.find(item => item.method === method && item.route === route);
    assert.ok(entry, `${method} ${route} is registered`);
    const response = { statusCode: 200, body: null };
    const res = {
      status(code) { response.statusCode = code; return this; },
      json(body) { response.body = JSON.parse(JSON.stringify(body)); return this; },
    };
    await entry.handle({ user: { id: 41 }, body: {}, params: {}, query: {}, ...request }, res);
    return response;
  };
}

const birthTimestamp = Date.UTC(2026, 9, 10, 4, 30);
const birthISO = '2026-10-10T04:30:00.000Z';
const payloads = {
  bazi: { lite: true, user: { realname: '甲', gender: 0, timestamp: birthTimestamp } },
  ziwei: { lite: true, module: 'ziwei', user: { realname: '乙', gender: 1, timestamp: birthTimestamp } },
  liuyao: { lite: true, params: [1, 0, 3, 0, 1, 4], options: { title: '测试起卦', gender: '男', date: birthISO }, ts: birthTimestamp },
};

for (const type of ['bazi', 'ziwei', 'liuyao']) {
  test(`${type}: creation writes authenticated owner and recoverable payload to its own table`, async () => {
    const writes = [];
    const invoke = loadRoutes(type, { run: async (sql, args) => { writes.push({ sql, args }); return { lastID: 7, changes: 1 }; } });
    const response = await invoke('post', '/', { body: { name: type, gender: '0', birthDatetime: birthTimestamp, calendarType: 'solar', rawPayload: payloads[type], user_id: 99 } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.id, 7);
    assert.equal(response.body.user_id, 41);
    assert.equal(response.body.updated, false);
    assert.equal(response.body.birthDatetime, birthISO);
    assert.match(writes[0].sql, new RegExp(`INSERT INTO ${type}_records`));
    assert.deepEqual(writes[0].args.slice(0, 5), [41, type, '0', birthISO, 'solar']);
    assert.deepEqual(JSON.parse(writes[0].args[5]), payloads[type]);
  });

  test(`${type}: an update cannot access another user's numeric record ID`, async () => {
    let written = false;
    const reads = [];
    const invoke = loadRoutes(type, {
      get: async (sql, args) => { reads.push({ sql, args }); return null; },
      run: async () => { written = true; return { changes: 1 }; },
    });
    const response = await invoke('put', '/:id', { params: { id: '7' }, body: { name: type, birthDatetime: birthTimestamp, gender: '1', rawPayload: payloads[type] } });
    assert.equal(response.statusCode, 404);
    assert.equal(written, false);
    assert.match(reads[0].sql, new RegExp(`FROM ${type}_records WHERE id = \\? AND user_id = \\?`));
    assert.deepEqual(reads[0].args, [7, 41]);
  });

  test(`${type}: repeated saves update the same owned record without changing its numeric ID`, async () => {
    const writes = [];
    const invoke = loadRoutes(type, {
      get: async () => ({ id: 7, user_id: 41 }),
      run: async (sql, args) => { writes.push({ sql, args }); return { changes: 1 }; },
    });
    const request = { params: { id: '7' }, body: { name: type, birthDatetime: birthTimestamp, gender: '1', calendarType: 'solar', rawPayload: payloads[type] } };
    const first = await invoke('put', '/:id', request);
    const second = await invoke('put', '/:id', request);
    assert.equal(first.body.id, 7);
    assert.equal(second.body.id, 7);
    assert.equal(second.body.updated, true);
    assert.match(writes[1].sql, new RegExp(`UPDATE ${type}_records`));
    assert.match(writes[1].sql, /WHERE id = \? AND user_id = \?/);
    assert.deepEqual(writes[1].args.slice(-2), [7, 41]);
    assert.deepEqual(JSON.parse(writes[1].args[4]), payloads[type]);
  });

  test(`${type}: its list is scoped to the user and supplies parsed payload for frontend detail restoration`, async () => {
    const reads = [];
    const invoke = loadRoutes(type, { all: async (sql, args) => {
      reads.push({ sql, args });
      return [{ id: 7, name: type, gender: '0', birthDatetime: birthISO, calendarType: 'solar', rawPayload: JSON.stringify(payloads[type]), createdAt: '2026-10-10 12:30:00' }];
    } });
    const response = await invoke('get', '/');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.list[0].id, 7);
    assert.equal(response.body.list[0].birthDatetime, birthISO);
    assert.deepEqual(response.body.list[0].rawPayload, payloads[type]);
    assert.match(reads[0].sql, new RegExp(`FROM ${type}_records WHERE user_id = \\?`));
    assert.deepEqual(reads[0].args, [41]);
  });
}

for (const type of ['bazi', 'ziwei', 'liuyao']) {
  test(`unified history type=${type} selects only that type and owner, allowing equal IDs in different tables`, async () => {
    const reads = [];
    const invoke = loadRoutes('bazi', { all: async (sql, args) => {
      reads.push({ sql, args });
      return [{ id: 7, name: type, gender: '1', birthDatetime: birthISO, calendarType: 'solar', rawPayload: JSON.stringify(payloads[type]), createdAt: '2026-10-10 12:30:00' }];
    } });
    const response = await invoke('get', '/charts', { query: { type } });
    assert.equal(response.body.list[0].type, type);
    assert.equal(response.body.list[0].id, 7);
    assert.equal(response.body.total, 1);
    assert.equal(response.body.hasMore, false);
    assert.match(reads[0].sql, new RegExp(`FROM ${type}_records WHERE user_id = \\?`));
    assert.deepEqual(reads[0].args, [41]);
  });

  test(`unified deletion type=${type} scopes the numeric ID to its table and owner`, async () => {
    const writes = [];
    const invoke = loadRoutes('bazi', { run: async (sql, args) => { writes.push({ sql, args }); return { changes: 0 }; } });
    const response = await invoke('delete', '/charts/:id', { params: { id: '7' }, query: { type } });
    assert.equal(response.statusCode, 404);
    assert.match(writes[0].sql, new RegExp(`DELETE FROM ${type}_records WHERE id = \\? AND user_id = \\?`));
    assert.deepEqual(writes[0].args, [7, 41]);
  });
}
