const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const file = path.resolve(__dirname, '../routes/admin.js');
const realDate = Date;
class Clock extends realDate {
	constructor(...args) {
		super(...(args.length ? args : ['2026-10-16T00:30:00+08:00']));
	}
	static now() {
		return new realDate('2026-10-16T00:30:00+08:00').getTime();
	}
}
function fixture() {
	const sql = new DatabaseSync(':memory:');
	const fields = [
		'pvid',
		'visitor_id',
		'session_id',
		'url',
		'pathname',
		'referrer',
		'title',
		'device_type',
		'browser',
		'browser_version',
		'os',
		'os_version',
		'connection_type',
		'referrer_type',
		'search_engine',
		'search_keyword',
		'screen_width',
		'screen_height',
		'visit_hour',
		'visit_date',
		'day_of_week',
		'is_new_visitor',
		'is_entry_page',
		'load_time',
		'fcp_time',
		'dom_content_loaded_time',
		'utm_source',
		'utm_medium',
		'utm_campaign',
		'language',
		'timezone',
		'ip',
		'ip_encrypted',
		'pixel_ratio',
		'is_logged_in',
		'username',
		'created_at',
	];
	sql.exec(
		'CREATE TABLE page_stats (id INTEGER PRIMARY KEY AUTOINCREMENT,' +
			fields.map((name) => name + " DEFAULT ''").join(',') +
			')'
	);
	sql.function('CONCAT', { varargs: true }, (...args) => args.join(''));
	sql.function('LOCATE', (needle, haystack) => String(haystack).indexOf(needle) + 1);
	sql.function('SUBSTRING', (str, start) => String(str).slice(start - 1));
	sql.function('SUBSTRING_INDEX', (str, delimiter, count) => {
		const parts = String(str).split(delimiter);
		return count >= 0 ? parts.slice(0, count).join(delimiter) : parts.slice(count).join(delimiter);
	});
	sql.function('CONVERT_TZ', (value, from, to) => {
		const match = String(to).match(/^([+-])(\d\d):(\d\d)$/);
		if (!match) return null;
		const offset = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1);
		return new realDate(
			new realDate(String(value).replace(' ', 'T') + 'Z').getTime() + offset * 60000
		)
			.toISOString()
			.slice(0, 19)
			.replace('T', ' ');
	});
	sql.function('DATE_FORMAT', (value, format) =>
		format === '%H'
			? String(value).slice(11, 13)
			: format.includes('%H:%i:%s')
				? String(value)
				: String(value).slice(0, 10)
	);
	sql.function('HOUR', (value) => Number(String(value).slice(11, 13)));
	sql.function(
		'DAYOFWEEK',
		(value) => new realDate(String(value).replace(' ', 'T') + 'Z').getUTCDay() + 1
	);
	const fix = (query) => query.replace(/ANY_VALUE\(title\)/g, 'MAX(title)');
	const db = {
		get: async (query, values = []) => sql.prepare(fix(query)).get(...values),
		all: async (query, values = []) => sql.prepare(fix(query)).all(...values),
	};
	function add(values = {}) {
		const row = {
			pvid: 'visitor-a',
			visitor_id: 'legacy-a',
			session_id: 'session-a',
			url: 'https://example.test/#/pages/agent/index',
			pathname: '/',
			created_at: '2026-10-15 17:00:00',
			is_new_visitor: 0,
			is_entry_page: 0,
			screen_width: 1920,
			screen_height: 1080,
			...values,
		};
		const keys = Object.keys(row);
		sql
			.prepare(
				'INSERT INTO page_stats (' +
					keys.join(',') +
					') VALUES (' +
					keys.map(() => '?').join(',') +
					')'
			)
			.run(...Object.values(row));
	}
	async function invoke(query = {}, adapter = db) {
		const source = fs.readFileSync(file, 'utf8');
		const start = source.indexOf("router.get('/stats/analytics'");
		const registration = source.slice(start, source.indexOf('\n});', start) + 4);
		let handler;
		const serviceFile = path.resolve(__dirname, '../services/analytics-summary.js');
		const service = fs.existsSync(serviceFile) ? require(serviceFile) : {};
		vm.runInNewContext(registration, {
			router: {
				get: (_route, _auth, callback) => {
					handler = callback;
				},
			},
			adminMiddleware() {},
			db: adapter,
			Date: Clock,
			require: () => service,
			console: { error() {} },
		});
		const response = {
			statusCode: 200,
			status(code) {
				this.statusCode = code;
				return this;
			},
			json(body) {
				this.body = body;
			},
		};
		await handler({ query }, response);
		return response;
	}
	return { sql, db, add, invoke };
}
test('hash paths and nonempty source/keyword data remain distinct in analytics', async () => {
	const f = fixture();
	f.add({ referrer: 'https://example.org/search', search_keyword: 'chart' });
	f.add({ url: 'https://example.test/#/pages/bazi/index' });
	const r = await f.invoke();
	assert.equal(r.statusCode, 200);
	assert.deepEqual(r.body.data.topPages.map((x) => x.pathname).sort(), [
		'/pages/agent/index',
		'/pages/bazi/index',
	]);
	assert.equal(r.body.data.topReferrers.length, 1);
	assert.equal(r.body.data.searchKeywords.length, 1);
});
test('repeated pages do not create returning visitors; later sessions do', async () => {
	const f = fixture();
	f.add({ is_new_visitor: 1, is_entry_page: 1 });
	f.add({ created_at: '2026-10-15 17:01:00' });
	f.add({ created_at: '2026-10-15 17:02:00' });
	let r = await f.invoke();
	assert.equal(r.body.data.newVisitorCount, 1);
	assert.equal(r.body.data.returningVisitorCount, 0);
	f.add({ session_id: 'session-b', created_at: '2026-10-15 18:00:00', is_entry_page: 1 });
	r = await f.invoke();
	assert.equal(r.body.data.returningVisitorCount, 1);
	assert.equal(r.body.data.totalSessions, 2);
});
test('business day is Shanghai time and daily trend has exactly 30 ascending zero-filled dates', async () => {
	const f = fixture();
	f.add({ created_at: '2026-10-15 16:10:00', visit_date: '2026-10-15' });
	f.add({
		created_at: '2026-10-15 15:59:00',
		visit_date: '2026-10-15',
		pvid: 'visitor-b',
		session_id: 'session-b',
	});
	const r = await f.invoke();
	assert.equal(r.body.data.todayPageviews, 1);
	assert.equal(r.body.data.yesterdayPageviews, 1);
	assert.equal(r.body.data.statisticsTimeZone, 'Asia/Shanghai');
	const trend = r.body.data.dailyTrend;
	assert.equal(trend.length, 30);
	assert.equal(trend.at(-1).date, '2026-10-16');
	assert.equal(trend.at(-1).pv, 1);
	assert.equal(trend[0].pv, 0);
	assert.equal(r.body.data.hourlyData[0].count, 1);
});
test('server pagination returns total and clamps an out-of-range requested page', async () => {
	const f = fixture();
	for (let i = 0; i < 41; i++) f.add({ title: 'record-' + i });
	const r = await f.invoke({ page: '99', pageSize: '20' });
	assert.equal(r.body.data.recentTotal, 41);
	assert.equal(r.body.data.recentPage, 3);
	assert.equal(r.body.data.recentPageCount, 3);
	assert.equal(r.body.data.recentVisitors.length, 1);
	assert.equal(r.body.data.recentVisitors[0].title, 'record-0');
});
test('a failed SQL read is an error response rather than successful zeros', async () => {
	const f = fixture();
	const r = await f.invoke(
		{},
		{
			get: async () => {
				throw Error('database unavailable');
			},
			all: async () => {
				throw Error('database unavailable');
			},
		}
	);
	assert.ok(r.statusCode >= 500);
	assert.notEqual(r.body.success, true);
});

test('recent UTC timestamps are independent of MySQL driver local time parsing', async () => {
	const f = fixture();
	f.add({ created_at: '2026-10-15 17:00:00' });
	const adapter = {
		...f.db,
		all: async (query, values = []) => {
			const rows = await f.db.all(query, values);
			if (
				query.includes('ORDER BY created_at DESC,id DESC LIMIT') &&
				!query.includes("DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at")
			)
				return rows.map((row) => ({
					...row,
					created_at: new realDate(String(row.created_at).replace(' ', 'T') + '+08:00'),
				}));
			return rows;
		},
	};
	const r = await f.invoke({}, adapter);
	assert.equal(r.body.data.recentVisitors[0].time, '2026-10-15T17:00:00.000Z');
});
