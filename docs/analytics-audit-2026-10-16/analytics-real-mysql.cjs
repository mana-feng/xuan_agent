const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

process.env.TZ = 'Asia/Singapore';
process.env.ANALYTICS_TIMEZONE = 'Asia/Shanghai';
const repo = 'F:/github/xuan_agent';
const backendRequire = createRequire(path.join(repo, 'backend-docker/package.json'));
const mysql = backendRequire('mysql2/promise');
const privateConfig = JSON.parse(fs.readFileSync(path.join(repo, '.local-dev/acceptance-2026-10-16/private.json'), 'utf8'));
const originalSchema = 'xuan_acceptance_20261016';
const testSchema = 'xuan_analytics_test_' + crypto.randomBytes(8).toString('hex');
const tables = ['analytics_visitors', 'analytics_sessions', 'page_stats'];
assert.match(testSchema, /^xuan_analytics_test_[0-9a-f]{16}$/);
assert.notEqual(testSchema, originalSchema);
const settings = { host: '127.0.0.1', port: 13316, user: 'root', password: privateConfig.dbPassword, charset: 'utf8mb4', connectionLimit: 12, dateStrings: false };
const report = { generatedAt: new Date().toISOString(), engine: 'real MySQL / InnoDB', processTimeZone: process.env.TZ, analyticsTimeZone: process.env.ANALYTICS_TIMEZONE, sourceSchema: originalSchema, testSchema, sourceHashes: {}, checks: [], limitations: ['Express transport registration and clock are substituted; business handler and SQL execute unchanged.', 'Tests create, mutate, and remove only the randomly generated test schema.'] };
const sourcePaths = ['backend-docker/routes/stats.js', 'backend-docker/services/analytics-summary.js', 'backend-docker/services/analytics-time.js', 'frontend-docker/src/utils/analytics.ts', 'frontend-docker/src/composables/usePageAnalytics.ts'];
for (const name of sourcePaths) report.sourceHashes[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, name))).digest('hex');
let clock = Date.parse('2026-10-16T02:00:00Z');
let admin, pool, db, handler;
function adapter(connectionPool) {
  return { pool: connectionPool, get: async (sql, params = []) => (await connectionPool.execute(sql, params))[0][0] || null, all: async (sql, params = []) => (await connectionPool.execute(sql, params))[0] };
}
function loadHandler() {
  const routePath = path.join(repo, 'backend-docker/routes/stats.js');
  const localRequire = createRequire(routePath);
  const FakeDate = class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
  vm.runInNewContext(fs.readFileSync(routePath, 'utf8'), { require: name => name === 'express' ? { Router: () => ({ post: (route, callback) => { handler = callback; } }) } : name === '../db' ? { getDatabase: () => db } : localRequire(name), module: { exports: {} }, console: { error() {} }, process, Buffer, URL, Date: FakeDate }, { filename: routePath });
}
function clientBrowser() {
  const file = path.join(repo, 'frontend-docker/tests/analytics-client.test.cjs');
  const localRequire = createRequire(file);
  const skip = () => {};
  const box = { __dirname: path.dirname(file), require: name => name === 'node:test' ? Object.assign(skip, { test: skip }) : localRequire(name), console, process, Buffer, URL, structuredClone, setTimeout, clearTimeout };
  vm.createContext(box); vm.runInContext(fs.readFileSync(file, 'utf8') + '\nglobalThis.clientFactory=browser;', box);
  return box.clientFactory({ fakeTimers: true, now: clock });
}
async function post(values = {}, ip = '192.0.2.10') {
  const body = { url: 'https://analytics.example/#/pages/agent/index', pvid: 'visitor-a', sessionId: 'session-a', eventType: 'pageview', timestamp: clock, ...values };
  let status = 200, response;
  await handler({ body, ip }, { status(value) { status = value; return this; }, json(value) { response = value; return this; } });
  return { status, ...response };
}
async function reset() { for (const table of tables) await pool.query('TRUNCATE TABLE `' + table + '`'); clock = Date.parse('2026-10-16T02:00:00Z'); }
async function snapshotOriginal() {
  const snapshots = {};
  for (const table of tables) {
    const [rows] = await admin.query('SELECT * FROM `' + originalSchema + '`.`' + table + '` ORDER BY ' + (table === 'page_stats' ? 'id' : table === 'analytics_visitors' ? 'visitor_id' : 'session_id'));
    snapshots[table] = { rows: rows.length, sha256: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return snapshots;
}
async function check(name, action) {
  try { await reset(); const evidence = await action(); report.checks.push({ name, status: 'PASS', evidence }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, status: 'FAIL', error: { code: error.code || error.name, message: String(error.message).replaceAll(settings.password, '[redacted]') } }); console.log('FAIL ' + name + ': ' + (error.code || error.name)); }
}
async function main() {
  admin = await mysql.createConnection(settings);
  report.originalBefore = await snapshotOriginal();
  const [version] = await admin.query('SELECT VERSION() AS version'); report.mysqlVersion = version[0].version;
  await admin.query('CREATE DATABASE `' + testSchema + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  for (const table of tables) await admin.query('CREATE TABLE `' + testSchema + '`.`' + table + '` LIKE `' + originalSchema + '`.`' + table + '`');
  pool = mysql.createPool({ ...settings, database: testSchema }); db = adapter(pool);
  const cols = await db.all('SHOW COLUMNS FROM page_stats');
  if (!cols.some(row => row.Field === 'event_id')) await pool.query('ALTER TABLE page_stats ADD COLUMN event_id VARCHAR(128) DEFAULT NULL');
  const indexes = await db.all('SHOW INDEX FROM page_stats');
  if (!indexes.some(row => row.Key_name === 'idx_page_stats_event_id')) await pool.query('CREATE UNIQUE INDEX idx_page_stats_event_id ON page_stats(event_id)');
  loadHandler();
  await check('concurrent first pageviews retain exact visitor/session counters', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => post({ eventId: 'parallel-' + i })));
    assert.ok(responses.every(row => row.status === 200), JSON.stringify(responses));
    const visitor = await db.get('SELECT pageview_count,session_count FROM analytics_visitors');
    const session = await db.get('SELECT pageview_count FROM analytics_sessions');
    const pages = await db.all('SELECT visit_sequence,session_page_index,is_new_visitor FROM page_stats ORDER BY visit_sequence');
    assert.equal(visitor.pageview_count, 12); assert.equal(visitor.session_count, 1); assert.equal(session.pageview_count, 12);
    assert.deepEqual(pages.map(row => row.visit_sequence), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.deepEqual(pages.map(row => row.session_page_index), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.equal(pages.filter(row => row.is_new_visitor).length, 1);
    return { concurrentRequests: 12, pv: pages.length, visitors: 1, sessions: 1, pageviewCounter: visitor.pageview_count };
  });
  await check('concurrent identical event id is counted once', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => post({ eventId: 'same-event' })));
    assert.ok(responses.every(row => row.status === 200));
    const page = await db.get('SELECT COUNT(*) AS count FROM page_stats'), visitor = await db.get('SELECT pageview_count FROM analytics_visitors'), session = await db.get('SELECT pageview_count FROM analytics_sessions');
    assert.equal(page.count, 1); assert.equal(visitor.pageview_count, 1); assert.equal(session.pageview_count, 1);
    return { requests: 8, pv: page.count, duplicateResponses: responses.filter(row => row.duplicate).length };
  });
  await check('cross visitor event id conflict rolls back second identity', async () => {
    const responses = await Promise.all([post({ eventId: 'shared' }), post({ pvid: 'visitor-b', eventId: 'shared' })]);
    assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM page_stats')).count, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM analytics_visitors')).count, 1);
    return { statuses: responses.map(row => row.status).sort(), pv: 1, visitors: 1 };
  });
  await check('IP and browser changes retain permanent identity', async () => {
    const first = await post({ eventId: 'ip-first', userAgent: 'browser-a' });
    const next = await post({ eventId: 'ip-next', userAgent: 'browser-b' }, '198.51.100.20');
    assert.equal(first.status, 200); assert.equal(next.status, 200); assert.equal(first.visitorId, next.visitorId);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM analytics_visitors')).count, 1);
    assert.equal((await db.get('SELECT pageview_count FROM analytics_visitors')).pageview_count, 2);
    return { pv: 2, visitors: 1, stableVisitorId: true };
  });
  await check('expired old client session rotates exactly once', async () => {
    const first = await post({ eventId: 'first' }); clock += 31 * 60000;
    const next = await post({ eventId: 'next', sessionDuration: 1900 }); const third = await post({ eventId: 'third', sessionDuration: 1901 });
    assert.equal(next.status, 200); assert.equal(third.status, 200); assert.notEqual(next.sessionId, first.sessionId); assert.equal(next.sessionId, third.sessionId);
    const pages = await db.all('SELECT session_page_index FROM page_stats ORDER BY id');
    assert.deepEqual(pages.map(row => row.session_page_index), [1, 1, 2]);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM analytics_sessions')).count, 2);
    return { pv: 3, sessions: 2, sessionPageIndexes: pages.map(row => row.session_page_index) };
  });
  await check('engagement updates duration without adding PV or counters', async () => {
    await post({ eventId: 'first' }); clock += 60000;
    const result = await post({ eventType: 'engagement', sessionDuration: 25, eventId: 'engagement-1', url: undefined });
    assert.equal(result.status, 200); assert.notEqual(result.skipped, true);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM page_stats')).count, 1);
    assert.equal((await db.get('SELECT pageview_count FROM analytics_visitors')).pageview_count, 1);
    const session = await db.get('SELECT duration_seconds,pageview_count FROM analytics_sessions'); assert.equal(session.duration_seconds, 25); assert.equal(session.pageview_count, 1);
    return { pv: 1, durationSeconds: session.duration_seconds, sessionPageviews: session.pageview_count };
  });
  await check('independent same visitor tabs retain their own durations', async () => {
    const responses = await Promise.all([post({ sessionId: 'tab-a', eventId: 'tab-a-pv' }), post({ sessionId: 'tab-b', eventId: 'tab-b-pv' })]);
    assert.ok(responses.every(row => row.status === 200)); assert.deepEqual(responses.map(row => row.sessionId).sort(), ['tab-a', 'tab-b']);
    clock += 60000;
    assert.equal((await post({ eventType: 'engagement', sessionId: 'tab-a', sessionDuration: 12 })).sessionId, 'tab-a');
    assert.equal((await post({ eventType: 'engagement', sessionId: 'tab-b', sessionDuration: 25 })).sessionId, 'tab-b');
    const sessions = await db.all('SELECT session_id,duration_seconds,pageview_count FROM analytics_sessions ORDER BY session_id');
    assert.deepEqual(sessions.map(row => row.duration_seconds), [12, 25]); assert.deepEqual(sessions.map(row => row.pageview_count), [1, 1]);
    return { sessions: sessions.length, pv: 2, durations: sessions.map(row => row.duration_seconds) };
  });
  await check('replacement alias persists after handler reload and never targets another tab', async () => {
    await post({ sessionId: 'tab-a', sessionDuration: 100, eventId: 'a-first' });
    clock += 20 * 60000; await post({ sessionId: 'tab-b', eventId: 'b-first' });
    clock += 11 * 60000; const rotated = await post({ sessionId: 'tab-a', sessionDuration: 1900, eventId: 'a-second' });
    assert.equal(rotated.status, 200); assert.notEqual(rotated.sessionId, 'tab-a'); assert.notEqual(rotated.sessionId, 'tab-b');
    loadHandler(); clock += 60000;
    const alias = await post({ sessionId: 'tab-a', eventType: 'engagement', sessionDuration: 9999 }); assert.equal(alias.sessionId, rotated.sessionId);
    const next = await post({ sessionId: 'tab-a', sessionDuration: 10000, eventId: 'a-third' }); assert.equal(next.sessionId, rotated.sessionId);
    const original = await db.get("SELECT duration_seconds FROM analytics_sessions WHERE session_id='tab-a'"), replacement = await db.get('SELECT duration_seconds,pageview_count FROM analytics_sessions WHERE session_id=?', [rotated.sessionId]);
    assert.equal(original.duration_seconds, 100); assert.equal(replacement.duration_seconds, 0); assert.equal(replacement.pageview_count, 2);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM analytics_sessions')).count, 3);
    return { sessions: 3, sameAliasAfterReload: true, oldDurationIgnored: true, originalDuration: 100, replacementDuration: 0 };
  });
  await check('actual client activity heartbeats preserve forty minutes in native MySQL', async () => {
    const browser = clientBrowser(); let delivered = 0;
    async function deliver() { for (; delivered < browser.requests.length; delivered++) { const payload = browser.requests[delivered].payload; clock = payload.timestamp; const result = await post(payload); assert.equal(result.status, 200); assert.notEqual(result.skipped, true); } }
    try {
      browser.mount(); await deliver();
      browser.advance(20 * 60000); browser.w.document.dispatchEvent(new browser.w.Event('pointerdown')); browser.runTimers(); await deliver();
      browser.advance(20 * 60000); browser.visibility('hidden'); await deliver();
      const session = await db.get('SELECT duration_seconds,pageview_count FROM analytics_sessions');
      assert.equal(session.duration_seconds, 2400); assert.equal(session.pageview_count, 1);
      assert.equal((await db.get('SELECT COUNT(*) AS count FROM analytics_sessions')).count, 1);
      assert.equal((await db.get('SELECT COUNT(*) AS count FROM page_stats')).count, 1);
      return { clientPageviews: browser.pageviews().length, clientEngagements: browser.engagements().length, pv: 1, sessions: 1, durationSeconds: 2400 };
    } finally { browser.close(); }
  });
  await check('database trigger failure rolls back entire pageview', async () => {
    await post({ eventId: 'before' });
    const before = { visitor: await db.all('SELECT * FROM analytics_visitors'), session: await db.all('SELECT * FROM analytics_sessions'), pages: await db.all('SELECT * FROM page_stats') };
    await pool.query("CREATE TRIGGER reject_test_page BEFORE INSERT ON page_stats FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'intentional isolated write failure'");
    try { assert.equal((await post({ eventId: 'fail' })).status, 500); }
    finally { await pool.query('DROP TRIGGER reject_test_page'); }
    const after = { visitor: await db.all('SELECT * FROM analytics_visitors'), session: await db.all('SELECT * FROM analytics_sessions'), pages: await db.all('SELECT * FROM page_stats') };
    assert.deepEqual(after, before);
    assert.equal((await post({ eventId: 'retry' })).status, 200);
    assert.equal((await db.get('SELECT pageview_count FROM analytics_visitors')).pageview_count, 2);
    return { injectedFailureStatus: 500, rollbackPreservedAllThreeTables: true, successfulRetryPV: 2 };
  });
  await check('native summary CTEs pagination Shanghai dates and nonUTC serialization', async () => {
    clock = Date.parse('2026-09-01T00:00:00Z'); assert.equal((await post({ eventId: 'old', sessionId: 'old-session' })).status, 200);
    clock = Date.parse('2026-10-15T15:59:00Z'); assert.equal((await post({ pvid: 'visitor-b', sessionId: 'b-session', eventId: 'yesterday', url: 'https://analytics.example/#/pages/bazi/index', referrer: 'https://referrer.example/search', searchKeyword: 'example-query' })).status, 200);
    clock = Date.parse('2026-10-15T16:10:00Z');
    for (let i = 0; i < 41; i++) { assert.equal((await post({ sessionId: 'new-session', eventId: 'today-' + i, title: 'today-' + i })).status, 200); clock += 1000; }
    const serviceFile = path.join(repo, 'backend-docker/services/analytics-summary.js'); delete require.cache[require.resolve(serviceFile)];
    const { getAnalyticsSummary } = require(serviceFile);
    const summary = await getAnalyticsSummary(db, { page: '99', pageSize: 20, now: new Date('2026-10-15T16:30:00Z') });
    const expected = { totalPageviews: 43, uniqueVisitors: 2, totalSessions: 3, todayPageviews: 41, yesterdayPageviews: 1, weeklyPageviews: 42, monthlyPageviews: 42, newVisitorCount: 1, returningVisitorCount: 1, bounceRate: 50, recentTotal: 43, recentPage: 3, recentPageCount: 3 };
    for (const [key, value] of Object.entries(expected)) assert.equal(summary[key], value, key);
    assert.equal(summary.dailyTrend.length, 30); assert.equal(summary.dailyTrend.at(-1).date, '2026-10-16'); assert.equal(summary.dailyTrend.at(-1).pv, 41);
    assert.equal(summary.topPages.length, 2); assert.equal(summary.topReferrers.length, 1); assert.equal(summary.searchKeywords.length, 1); assert.equal(summary.recentVisitors.length, 3);
    const first = await getAnalyticsSummary(db, { now: new Date('2026-10-15T16:30:00Z') });
    assert.equal(first.recentVisitors[0].time, '2026-10-15T16:10:40.000Z', 'UTC serialization in Asia/Singapore process');
    return { ...expected, dailyTrendDays: summary.dailyTrend.length, topPageCount: summary.topPages.length, referrerCount: summary.topReferrers.length, keywordCount: summary.searchKeywords.length, latestTime: first.recentVisitors[0].time };
  });
}
main().catch(error => { report.fatal = { code: error.code || error.name, message: String(error.message).replaceAll(settings.password, '[redacted]') }; console.log('FATAL ' + (error.code || error.name)); }).finally(async () => {
  try { if (admin) { report.originalAfter = await snapshotOriginal(); report.originalUnchanged = JSON.stringify(report.originalBefore) === JSON.stringify(report.originalAfter); } }
  catch (error) { report.originalAuditError = error.code || error.name; }
  try { if (pool) await pool.end(); if (admin) { assert.match(testSchema, /^xuan_analytics_test_[0-9a-f]{16}$/); assert.notEqual(testSchema, originalSchema); await admin.query('DROP DATABASE IF EXISTS `' + testSchema + '`'); report.testSchemaRemoved = true; await admin.end(); } }
  catch (error) { report.cleanupError = error.code || error.name; }
  report.sourcesUnchangedDuringRun = sourcePaths.every(name => report.sourceHashes[name] === crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, name))).digest('hex'));
  report.passed = report.checks.filter(item => item.status === 'PASS').length;
  report.failed = report.checks.filter(item => item.status === 'FAIL').length;
  const output = path.join(__dirname, 'analytics-real-mysql-results.json'); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, fatal: report.fatal?.code, originalUnchanged: report.originalUnchanged, testSchemaRemoved: report.testSchemaRemoved, output }));
  process.exitCode = report.fatal || report.failed || !report.originalUnchanged || !report.testSchemaRemoved ? 1 : 0;
});
