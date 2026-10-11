const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const { hashRefreshToken } = require('../utils/token');

// Run production route handlers and crypto. Only external DB/configuration and
// middleware are replaced; these tests never read credentials or contact MySQL.
function loadAuth(database) {
  const express = require('express');
  const filename = path.resolve(__dirname, '../routes/auth.js');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(filename, 'utf8'))((name) => {
    if (name === '../db') return { getDatabase: () => database };
    if (name === '../config') return { JWT_SECRET: 'isolated-auth-test-signing-key', ACCESS_TOKEN_EXPIRES_IN: '15m', REFRESH_TOKEN_EXPIRES_DAYS: 7 };
    if (name === '../config/rateLimit') return { authLimiter(_req, _res, next) { next(); }, refreshLimiter(_req, _res, next) { next(); } };
    if (name === '../middleware/auth') return { authMiddleware(_req, _res, next) { next(); } };
    if (name === 'express') return express;
    return require(name);
  }, module, module.exports);
  return async function invoke(route, body) {
    const layer = module.exports.stack.find(entry => entry.route?.path === route);
    const handler = layer.route.stack.at(-1).handle;
    const response = { statusCode: 200, body: null, cookies: [] };
    const res = {
      status(code) { response.statusCode = code; return this; },
      json(value) { response.body = value; return this; },
      cookie(...args) { response.cookies.push(args); },
      clearCookie() {},
    };
    await handler({ body, headers: {}, cookies: {}, ip: '127.0.0.1' }, res);
    return response;
  };
}

function databaseFixture({ code = {}, user = false, failRefreshInsert = false } = {}) {
  let state = {
    users: user ? [{ id: 41, email: 'test@example.com', username: 'test_user', role: 'user' }] : [],
    codes: [{ id: 7, email: 'test@example.com', code: '123456', type: 'register', used: 0, expires_at: new Date(Date.now() + 60000), ...code }],
    tokens: [{ id: 9, user_id: 41, token_hash: hashRefreshToken('initial-test-refresh'), device_id: 'test-device', revoked_at: null, expires_at: new Date(Date.now() + 60000) }],
  };
  let transactionQueue = Promise.resolve();
  const normalized = sql => sql.replace(/\s+/g, ' ').trim();
  async function get(sql, args) {
    sql = normalized(sql);
    if (sql.includes('FROM email_verification_codes')) {
      const row = state.codes.find(item => item.email === args[0] && item.code === args[1] && item.type === args[2]);
      return row ? { ...row } : null;
    }
    if (sql.includes('FROM refresh_tokens')) {
      const row = state.tokens.find(item => item.token_hash === args[0] && (args.length === 1 || item.device_id === args[1]));
      return row ? { ...row } : null;
    }
    if (sql.includes('FROM users WHERE id =')) return state.users.find(item => item.id === args[0]) || null;
    if (sql.includes('FROM users WHERE email =')) return state.users.find(item => item.email === args[0] || item.username === args[1]) || null;
    throw new Error(`Unexpected read: ${sql}`);
  }
  async function run(sql, args) {
    sql = normalized(sql);
    if (sql.startsWith('INSERT INTO users')) {
      const row = { id: 41, email: args[0], username: args[1], password_hash: args[2], role: 'user' };
      state.users.push(row);
      return { lastID: row.id, changes: 1 };
    }
    if (sql.startsWith('UPDATE email_verification_codes')) {
      const row = state.codes.find(item => item.id === args[0]);
      const eligible = row && (!sql.includes('used = 0') || row.used === 0) && (!sql.includes('expires_at > NOW()') || row.expires_at > new Date());
      if (eligible) row.used = 1;
      return { changes: eligible ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE refresh_tokens')) {
      const row = state.tokens.find(item => item.id === args[0]);
      const eligible = row && (!sql.includes('revoked_at IS NULL') || row.revoked_at === null) && (!sql.includes('expires_at > NOW()') || row.expires_at > new Date());
      if (eligible) row.revoked_at = new Date();
      return { changes: eligible ? 1 : 0 };
    }
    if (sql.startsWith('INSERT INTO refresh_tokens')) {
      if (failRefreshInsert) throw new Error('Simulated refresh insert failure');
      state.tokens.push({ id: 10 + state.tokens.length, user_id: args[0], token_hash: args[1], device_id: args[2], expires_at: new Date(args[3]), revoked_at: null });
      return { lastID: 10, changes: 1 };
    }
    throw new Error(`Unexpected write: ${sql}`);
  }
  return {
    get, run, state: () => state,
    pool: { async getConnection() {
      let snapshot;
      let unlock;
      return {
        async beginTransaction() {
          const previous = transactionQueue;
          transactionQueue = new Promise(resolve => { unlock = resolve; });
          await previous;
          snapshot = structuredClone(state);
        },
        async execute(sql, args) {
          if (/^\s*SELECT/.test(sql)) { const row = await get(sql, args); return [row ? [row] : []]; }
          const result = await run(sql, args);
          return [{ insertId: result.lastID, affectedRows: result.changes }];
        },
        async commit() { snapshot = null; },
        async rollback() { if (snapshot) state = snapshot; },
        release() { unlock?.(); },
      };
    } },
  };
}

const registration = { email: 'test@example.com', username: 'test_user', password: '  Sample<"Password>42  ', verification_code: '123456', device_id: 'test-device' };

test('direct registration without email verification is rejected', async () => {
  const db = databaseFixture();
  const response = await loadAuth(db)('/register', { ...registration, verification_code: undefined });
  assert.equal(response.statusCode, 400);
  assert.equal(db.state().users.length, 0);
});

for (const [name, code] of Object.entries({ wrong: { code: '654321' }, used: { used: 1 }, expired: { expires_at: new Date(0) }, otherEmail: { email: 'other@example.com' }, otherPurpose: { type: 'reset' } })) {
  test(`registration rejects a ${name} email code before creating an account`, async () => {
    const db = databaseFixture({ code });
    const response = await loadAuth(db)('/register', registration);
    assert.equal(response.statusCode, 400);
    assert.equal(db.state().users.length, 0);
  });
}

test('registration consumes its valid email code and preserves the exact password', async () => {
  const db = databaseFixture();
  const response = await loadAuth(db)('/register', registration);
  assert.equal(response.statusCode, 200);
  assert.equal(db.state().codes[0].used, 1);
  assert.equal(await bcrypt.compare(registration.password, db.state().users[0].password_hash), true);
  assert.ok(response.body.access_token);
  assert.ok(response.body.refresh_token);
});

test('failed registration rolls back its code consumption and account creation', async t => {
  t.mock.method(console, 'error', () => {});
  const db = databaseFixture({ failRefreshInsert: true });
  const response = await loadAuth(db)('/register', registration);
  assert.equal(response.statusCode, 500);
  assert.equal(db.state().codes[0].used, 0);
  assert.equal(db.state().users.length, 0);
});

test('concurrent refresh requests cannot both rotate the same token', async () => {
  const db = databaseFixture({ user: true });
  const invoke = loadAuth(db);
  const payload = { refresh_token: 'initial-test-refresh', device_id: 'test-device' };
  const responses = await Promise.all([invoke('/refresh', payload), invoke('/refresh', payload)]);
  assert.deepEqual(responses.map(item => item.statusCode).sort(), [200, 401]);
  assert.equal(db.state().tokens.filter(item => !item.revoked_at).length, 1);
  assert.equal((await invoke('/refresh', payload)).statusCode, 401);
});

test('failed replacement token persistence does not revoke the current refresh token', async t => {
  t.mock.method(console, 'error', () => {});
  const db = databaseFixture({ user: true, failRefreshInsert: true });
  const response = await loadAuth(db)('/refresh', { refresh_token: 'initial-test-refresh', device_id: 'test-device' });
  assert.equal(response.statusCode, 500);
  assert.equal(db.state().tokens[0].revoked_at, null);
});
