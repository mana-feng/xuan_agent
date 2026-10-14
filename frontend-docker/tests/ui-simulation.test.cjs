const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createSimulationServer } = require('../scripts/ui-simulation/server.cjs');

let server;
let origin;
let access;
let refresh;
let cookie;
before(async () => {
  server = createSimulationServer({ frontendPort: 4174, streamIntervalMs: 1 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
async function call(path, options = {}) {
  const response = await fetch(origin + path, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}), ...options.headers },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const json = await response.json();
  return { response, json };
}
async function scenario(value) {
  const result = await call('/__simulation/scenario', { body: value });
  assert.equal(result.response.status, 200);
}
async function login() {
  const result = await call('/api/auth/login', { body: { identifier: 'demo@example.test', password: 'Demo123!', device_id: 'ui-test' } });
  assert.equal(result.response.status, 200);
  access = result.json.data.access_token;
  refresh = result.json.data.refresh_token;
  cookie = result.response.headers.get('set-cookie').split(';')[0];
  return result;
}
beforeEach(async () => {
  access = refresh = cookie = undefined;
  await call('/__simulation/reset', { body: {} });
});

test('runtime configuration and announcements identify the isolated simulation', async () => {
  const config = await call('/api/config/bootstrap');
  assert.equal(config.response.status, 200);
  assert.equal(config.json.success, true);
  assert.equal(config.json.data.simulation, true);
  const full = await call('/api/announcements');
  const meta = await call('/api/announcements?onlyMeta=true');
  assert.match(full.json.data.list[0].content, /模拟/);
  assert.equal(meta.json.data.meta[0].id, full.json.data.list[0].id);
  assert.ok(full.json.data.list[0].updatedAt);
  assert.equal((await call('/api/stats/pageview', { body: { path: '/pages/agent/index' } })).response.status, 200);
});

test('demo login, authenticated me, cookie refresh and logout follow the production token contract', async () => {
  assert.equal((await call('/api/llm/quota')).response.status, 401);
  assert.equal((await call('/api/auth/login', { body: { identifier: 'demo@example.test', password: 'wrong' } })).response.status, 401);
  const logged = await login();
  assert.equal(logged.json.data.user.email, 'demo@example.test');
  assert.match(logged.response.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await call('/api/auth/me')).json.data.user.email, 'demo@example.test');
  const previous = access;
  await call('/__simulation/expire-access', { body: {} });
  assert.equal((await call('/api/llm/quota')).response.status, 401);
  const renewed = await call('/api/auth/refresh', { body: { device_id: 'ui-test' }, headers: { Cookie: cookie } });
  assert.equal(renewed.response.status, 200);
  access = renewed.json.data.access_token;
  assert.notEqual(access, previous);
  cookie = renewed.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/llm/quota')).response.status, 200);
  await call('/api/auth/logout', { body: {}, headers: { Cookie: cookie } });
  assert.equal((await call('/api/llm/quota')).response.status, 401);
  assert.equal((await call('/api/auth/refresh', { body: {}, headers: { Cookie: cookie } })).response.status, 401);
});

test('email verification and registration remain local and never send email', async () => {
  const sent = await call('/api/email/send-code', { body: { email: 'new@example.test', type: 'register' } });
  assert.equal(sent.response.status, 200);
  assert.equal(sent.json.data.code, '123456');
  assert.match(sent.json.message, /模拟/);
  assert.equal((await call('/api/email/send-code', { body: { email: 'real@example.com' } })).response.status, 400);
  assert.equal((await call('/api/auth/register', { body: { username: '测试用户', email: 'new@example.test', password: 'Demo456!', verification_code: 'wrong' } })).response.status, 400);
  const registered = await call('/api/auth/register', { body: { username: '测试用户', email: 'new@example.test', password: 'Demo456!', verification_code: '123456' } });
  assert.equal(registered.response.status, 200);
  assert.equal(registered.json.data.user.username, '测试用户');
  assert.ok(registered.json.data.access_token);
});

test('all four record types support real HTTP create, read, update and typed deletion', async () => {
  await login();
  for (const type of ['bazi', 'ziwei', 'liuyao', 'qimen']) {
    const payload = { name: `新增${type}`, gender: '1', birthDatetime: 826979400000, calendarType: 'solar', rawPayload: { lite: true, testMarker: type } };
    if (type === 'qimen') payload.rawPayload = { module: 'qimen', version: 1, testMarker: type, input: { question: payload.name, timestamp: payload.birthDatetime, timeZone: 'Asia/Shanghai', ruleVersion: 'qimen-chai-bu-v1', recordId: null }, snapshot: { metadata: { timestamp: payload.birthDatetime } } };
    const created = await call(`/api/${type}`, { body: payload });
    assert.equal(created.response.status, 200);
    assert.equal(created.json.data.updated, false);
    const id = created.json.data.id;
    assert.ok(Number.isInteger(id));
    const updated = await call(`/api/${type}/${id}`, { method: 'PUT', body: { ...payload, name: `修改${type}` } });
    assert.equal(updated.json.data.updated, true);
    const list = await call(`/api/charts?type=${type}&keyword=${encodeURIComponent(`修改${type}`)}`);
    assert.equal(list.json.data.total, 1);
    assert.equal(list.json.data.list[0].id, id);
    assert.equal(list.json.data.list[0].rawPayload.testMarker, type);
    assert.equal(list.json.data.list[0].birthDatetime, '1996-03-16T12:30:00.000Z');
    assert.equal((await call(`/api/charts/${id}?type=${type}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await call(`/api/${type}/${id}`, { method: 'PUT', body: payload })).json.code, 'NOT_FOUND');
  }
  await call('/api/charts/1?type=ziwei', { method: 'DELETE' });
  const bazi = await call('/api/charts?type=bazi');
  const ziwei = await call('/api/charts?type=ziwei');
  assert.ok(bazi.json.data.list.some(row => row.id === 1));
  assert.ok(!ziwei.json.data.list.some(row => row.id === 1));
});

test('qimen fixtures preserve calculation inputs and independent IDs for history restoration', async () => {
  await login();
  const history = await call('/api/charts?type=qimen');
  assert.equal(history.response.status, 200);
  assert.equal(history.json.data.total, 14);
  const item = history.json.data.list[0];
  assert.equal(item.type, 'qimen');
  assert.equal(item.gender, null);
  assert.equal(item.rawPayload.module, 'qimen');
  assert.equal(item.rawPayload.version, 1);
  assert.equal(item.rawPayload.input.ruleVersion, 'qimen-chai-bu-v1');
  assert.equal(item.rawPayload.input.timeZone, 'Asia/Shanghai');
  assert.equal(item.rawPayload.input.timestamp, Date.parse(item.birthDatetime));
  assert.equal(item.rawPayload.input.recordId, item.id);
  assert.equal(item.rawPayload.input.question, item.title);
  assert.equal((await call(`/api/qimen/${item.id}`, { method: 'DELETE' })).response.status, 200);
  assert.equal((await call('/api/charts?type=qimen')).json.data.total, 13);
  assert.equal((await call('/api/charts?type=bazi')).json.data.total, 14);
});

test('simulation qimen writes reject damaged contracts that the production route cannot restore', async () => {
  await login();
  const valid = { module: 'qimen', version: 1, input: { question: '可恢复时盘', timestamp: 1791865800000, timeZone: 'Asia/Shanghai', ruleVersion: 'qimen-chai-bu-v1', recordId: null }, snapshot: { metadata: { timestamp: 1791865800000 } } };
  for (const rawPayload of [
    { user: null, bazi: null },
    { ...valid, module: 'bazi' },
    { ...valid, version: 2 },
    { ...valid, input: { ...valid.input, ruleVersion: 'unknown' } },
    { ...valid, input: { ...valid.input, timeZone: 'Invalid/Zone' } },
    { ...valid, input: { ...valid.input, timestamp: 1791865800001 } },
    { ...valid, snapshot: null },
    { ...valid, snapshot: [] },
  ]) {
    const body = { name: '拒绝破损数据', birthDatetime: valid.input.timestamp, rawPayload };
    for (const [method, route] of [['POST', '/api/qimen'], ['PUT', '/api/qimen/1']]) {
      assert.equal((await call(route, { method, body })).response.status, 400);
    }
  }
  const history = await call('/api/charts?type=qimen');
  assert.equal(history.json.data.total, 14);
  assert.equal(history.json.data.list.find(row => row.id === 1).title, '【模拟】奇门时盘 01');
});

test('local chat captures actual chart messages without authentication fields and resets them', async () => {
  const messages = [{ role: 'system', content: '奇门上下文：阴遁六局；值符天心' }, { role: 'user', content: '分析这张时盘' }];
  const request = { stream: false, messages, apiKey: 'must-not-be-recorded', password: 'must-not-be-recorded', access_token: 'must-not-be-recorded' };
  assert.equal((await call('/api/llm/chat', { body: request })).response.status, 401);
  await login();
  assert.equal((await call('/api/llm/chat', { body: request })).response.status, 200);
  const captured = await call('/__simulation/chat-requests');
  assert.equal(captured.response.status, 200);
  assert.equal(captured.json.data.list.length, 1);
  assert.deepEqual(captured.json.data.list[0].messages, messages);
  assert.equal(captured.json.data.list[0].path, '/api/llm/chat');
  assert.equal(captured.json.data.list[0].stream, false);
  assert.doesNotMatch(JSON.stringify(captured.json), /must-not-be-recorded|simulation-access-/);
  assert.doesNotMatch(JSON.stringify((await call('/__simulation/requests')).json), /奇门上下文/);
  await call('/__simulation/reset', { body: {} });
  assert.equal((await call('/__simulation/chat-requests')).json.data.list.length, 0);
});

test('history returns all fixtures by default, filters gender and keyword, and sorts before optional pagination', async () => {
  await login();
  const all = await call('/api/charts?type=bazi');
  assert.ok(all.json.data.list.length > 12, 'exercise the actual frontend 12-row pagination');
  assert.equal(all.json.data.hasMore, false);
  const filtered = await call('/api/charts?type=bazi&gender=1&keyword=' + encodeURIComponent('模拟'));
  assert.ok(filtered.json.data.list.length > 0);
  assert.ok(filtered.json.data.list.every(row => row.gender === '1' && row.title.includes('模拟')));
  const asc = await call('/api/charts?type=bazi&sortBy=created_at&sortOrder=ASC');
  const desc = await call('/api/charts?type=bazi&sortBy=created_at&sortOrder=DESC');
  assert.deepEqual(asc.json.data.list.map(row => row.id), desc.json.data.list.map(row => row.id).reverse());
  const second = await call('/api/charts?type=bazi&sortBy=created_at&sortOrder=ASC&page=2&limit=3');
  assert.deepEqual(second.json.data.list.map(row => row.id), asc.json.data.list.slice(3, 6).map(row => row.id));
  assert.equal(second.json.data.total, asc.json.data.total);
  assert.equal(second.json.data.hasMore, true);
});

test('scenario controls exercise loading, empty, failed writes, unauthenticated and reset without persistence', async () => {
  await login();
  const original = (await call('/api/charts?type=bazi')).json.data.total;
  await scenario({ scenario: 'loading', delayMs: 70 });
  const start = Date.now();
  await call('/api/charts?type=bazi');
  assert.ok(Date.now() - start >= 60);
  await scenario({ scenario: 'empty' });
  assert.equal((await call('/api/charts?type=bazi')).json.data.total, 0);
  await scenario({ scenario: 'error' });
  assert.equal((await call('/api/bazi', { body: { name: '不应写入' } })).response.status, 503);
  await scenario({ scenario: 'success' });
  assert.equal((await call('/api/charts?type=bazi')).json.data.total, original);
  await scenario({ scenario: 'unauthenticated' });
  assert.equal((await call('/api/llm/quota')).response.status, 401);
  assert.equal((await call('/api/auth/refresh', { body: { refresh_token: refresh } })).response.status, 401);
  await call('/__simulation/reset', { body: {} });
  assert.equal((await call('/api/llm/quota')).response.status, 401, 'reset invalidates fixture sessions');
  await login();
  assert.equal((await call('/api/charts?type=bazi')).json.data.total, original);
});

test('ordinary chat and SSE deliver the consumer delta shape and deduct exactly one quota per generation', async () => {
  await login();
  const beforeCount = (await call('/api/llm/quota')).json.data.remainingCount;
  const reply = await call('/api/llm/chat', { body: { stream: false, messages: [{ role: 'user', content: '测试解读' }] } });
  assert.match(reply.json.data.reply, /模拟/);
  const streamed = await fetch(origin + '/api/llm/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` }, body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: '继续测试' }] }) });
  assert.match(streamed.headers.get('content-type'), /text\/event-stream/);
  const text = await streamed.text();
  assert.match(text, /data: \[DONE\]/);
  const deltas = text.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
  assert.ok(deltas.length > 1);
  assert.match(deltas.map(item => item.choices[0].delta.content).join(''), /模拟/);
  assert.equal((await call('/api/llm/quota')).json.data.remainingCount, beforeCount - 2);
  await scenario({ scenario: 'quota' });
  assert.equal((await call('/api/llm/quota')).json.data.remainingCount, 0);
  const refused = await call('/api/llm/chat', { body: { stream: true, messages: [{ role: 'user', content: '超额请求' }] } });
  assert.equal(refused.response.status, 429);
  assert.equal(refused.json.code, 'QUOTA_EXCEEDED');
});

test('stream error and interrupted streams expose failure instead of sending a false DONE', async () => {
  await login();
  for (const name of ['stream-error', 'stream-interrupted']) {
    await scenario({ scenario: name });
    const response = await fetch(origin + '/api/llm/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` }, body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: '测试中断' }] }) });
    const text = await response.text();
    assert.doesNotMatch(text, /\[DONE\]/);
    if (name === 'stream-error') assert.match(text, /SIMULATED_STREAM_ERROR/);
    else assert.ok(text.includes('delta'));
  }
});

test('Agent emits the HTML action marker expected by the real frontend and leaves chart calculation there', async () => {
  await login();
  const examples = [
    ['查看历史记录', 'navigate', 'history'],
    ['打开八字排盘', 'navigate', 'bazi'],
    ['帮我排八字，男，1996-03-21 18:30', 'run_bazi_chart'],
    ['帮我排紫微，女，1996-03-21 18:30', 'run_ziwei_chart'],
    ['按时间起卦，问换工作', 'run_liuyao_chart'],
    ['查看事业宫', 'focus_ziwei_palace'],
  ];
  for (const [content, type, target] of examples) {
    const result = await call('/api/llm/agent', { body: { stream: false, messages: [{ role: 'user', content }] } });
    assert.equal(result.response.status, 200);
    const action = JSON.parse(result.json.data.reply.match(/<!--AGENT_ACTION:(.*?)-->/)[1]);
    assert.equal(action.type, type);
    if (target) assert.equal(action.target, target);
    if (type === 'run_bazi_chart') assert.equal(action.payload.date, '1996-03-21');
    assert.equal(action.payload?.bazi, undefined, 'the fixture supplies inputs only');
  }
});

test('control panel, invalid input and localhost-only origins are observable through HTTP', async () => {
  const panel = await fetch(origin + '/');
  assert.equal(panel.status, 200);
  assert.match(await panel.text(), /本地模拟/);
  const disallowed = await call('/__simulation/scenario', { body: { scenario: 'error' }, headers: { Origin: 'https://external.example' } });
  assert.equal(disallowed.response.status, 403);
  assert.equal((await call('/__simulation/scenario', { body: { scenario: 'unrecognized' } })).response.status, 400);
  assert.equal((await call('/__simulation/state')).json.data.scenario, 'success');
  const malformed = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
});

test('runner can restart from fresh memory without rewriting the frontend environment files', async () => {
  const frontend = path.resolve(__dirname, '..');
  const envFiles = fs.readdirSync(frontend).filter(name => name.startsWith('.env'));
  const originalFiles = new Map(envFiles.map(name => [name, fs.readFileSync(path.join(frontend, name), 'utf8')]));
  async function boot() {
    const child = spawn(process.execPath, [path.join(frontend, 'scripts/ui-simulation/run.cjs'), '--api-only', '--api-port=0'], { cwd: frontend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Runner did not expose an API URL: ${errors}`)); }, 5000);
      child.stdout.on('data', chunk => {
        text += chunk;
        const match = text.match(/API (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Runner exited ${code}: ${errors}`)); });
    });
    return { url, child, async stop() { if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); } };
  }
  let instance = await boot();
  try {
    const loginResponse = await fetch(instance.url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'demo@example.test', password: 'Demo123!' }) });
    const token = (await loginResponse.json()).data.access_token;
    assert.equal((await fetch(instance.url + '/api/charts/1?type=bazi', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await (await fetch(instance.url + '/__simulation/state')).json()).data.counts.bazi, 13);
    await instance.stop();
    instance = await boot();
    assert.equal((await (await fetch(instance.url + '/__simulation/state')).json()).data.counts.bazi, 14);
    assert.equal((await fetch(instance.url + '/api/llm/quota', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    for (const [name, original] of originalFiles) assert.equal(fs.readFileSync(path.join(frontend, name), 'utf8'), original);
    assert.deepEqual(fs.readdirSync(frontend).filter(name => name.startsWith('.env')), envFiles);
  } finally { await instance.stop(); }
});
