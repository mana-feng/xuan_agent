const { getAnalyticsTimeZone, getAnalyticsWindow } = require('./analytics-time');

const VIEW_CTE = `WITH views AS (
 SELECT p.*,
 COALESCE(NULLIF(pvid, ''), NULLIF(visitor_id, '')) AS visitor_key,
 NULLIF(session_id, '') AS session_key,
 CASE WHEN LOCATE('#/', url) > 0 THEN SUBSTRING_INDEX(SUBSTRING(url, LOCATE('#/', url) + 1), '?', 1)
 ELSE COALESCE(NULLIF(pathname, ''), '/') END AS analytics_path
 FROM page_stats p
)`;
const SESSION_CTE = `${VIEW_CTE}, sessions AS (
 SELECT visitor_key, session_key, MIN(created_at) AS started_at, MIN(id) AS first_id, COUNT(*) AS hits
 FROM views WHERE visitor_key IS NOT NULL AND session_key IS NOT NULL GROUP BY visitor_key, session_key
), ranked_sessions AS (
 SELECT sessions.*, ROW_NUMBER() OVER (PARTITION BY visitor_key ORDER BY started_at, first_id) AS visit_number FROM sessions
)`;
const count = (value) => Number(value) || 0;
const utcSql = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
function utcIso(value) {
	if (!value) return '';
	const date =
		value instanceof Date
			? value
			: new Date(
					/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? value : String(value).replace(' ', 'T') + 'Z'
				);
	return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
function pageInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}
async function readSummary(db, options) {
	const now = options.now || new Date();
	const zone = getAnalyticsTimeZone();
	const sqlZone =
		{ 'Asia/Shanghai': '+08:00', 'Asia/Singapore': '+08:00', UTC: '+00:00', 'Etc/UTC': '+00:00' }[
			zone
		] || zone;
	const day = getAnalyticsWindow(now, 1),
		week = getAnalyticsWindow(now, 7),
		month = getAnalyticsWindow(now, 30);
	const end = utcSql(day.endUtc),
		today = utcSql(day.startUtc),
		yesterday = utcSql(getAnalyticsWindow(now, 2).startUtc);
	const weekStart = utcSql(week.startUtc),
		monthStart = utcSql(month.startUtc);
	const validZone = await db.get(
		"SELECT CONVERT_TZ('2000-01-01 00:00:00', '+00:00', ?) AS local_time",
		[sqlZone]
	);
	if (!validZone?.local_time) throw new Error('Analytics time zone is unavailable in MySQL');
	const totals = await db.get(
		`${VIEW_CTE} SELECT COUNT(*) AS pv, COUNT(DISTINCT visitor_key) AS uv,
 COUNT(DISTINCT session_key) AS sessions,
 SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS today,
 SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS yesterday,
 SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS week,
 SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS month FROM views`,
		[today, end, yesterday, today, weekStart, end, monthStart, end]
	);
	const visitorTotals = await db.get(
		`${VIEW_CTE} SELECT COUNT(*) AS count FROM
 (SELECT visitor_key, MIN(created_at) AS first_seen FROM views WHERE visitor_key IS NOT NULL GROUP BY visitor_key) AS visitors
 WHERE first_seen >= ? AND first_seen < ?`,
		[monthStart, end]
	);
	const sessionTotals = await db.get(
		`${SESSION_CTE} SELECT
 COUNT(DISTINCT CASE WHEN visit_number > 1 AND started_at >= ? AND started_at < ? THEN visitor_key END) AS returning_visitors,
 SUM(CASE WHEN started_at >= ? AND started_at < ? AND hits=1 THEN 1 ELSE 0 END) AS bounces,
 SUM(CASE WHEN started_at >= ? AND started_at < ? THEN 1 ELSE 0 END) AS period_sessions FROM ranked_sessions`,
		[monthStart, end, monthStart, end, monthStart, end]
	);
	const data = {
		todayPageviews: count(totals.today),
		yesterdayPageviews: count(totals.yesterday),
		totalPageviews: count(totals.pv),
		uniqueVisitors: count(totals.uv),
		totalSessions: count(totals.sessions),
		weeklyPageviews: count(totals.week),
		monthlyPageviews: count(totals.month),
		newVisitorCount: count(visitorTotals.count),
		returningVisitorCount: count(sessionTotals.returning_visitors),
		bounceRate: count(sessionTotals.period_sessions)
			? Math.round((10000 * count(sessionTotals.bounces)) / count(sessionTotals.period_sessions)) /
				100
			: 0,
		statisticsTimeZone: zone,
		generatedAt: now.toISOString(),
		visitorPeriod: 'last30Days',
		visitorDefinitions: {
			new: '近30天首次访问的去重访客',
			returning: '近30天再次开启会话的去重访客，可与新访客重叠',
		},
		bounceDefinition: '近30天开启且仅浏览一个页面的会话占比',
	};
	const definitions = [
		[
			'topBrowsers',
			"SELECT browser,browser_version,COUNT(*) AS count FROM views WHERE browser != '' GROUP BY browser,browser_version ORDER BY count DESC LIMIT 20",
			(r) => ({ browser: r.browser, version: r.browser_version, count: count(r.count) }),
		],
		[
			'topOs',
			"SELECT os,os_version,COUNT(*) AS count FROM views WHERE os != '' GROUP BY os,os_version ORDER BY count DESC LIMIT 20",
			(r) => ({ os: r.os, version: r.os_version, count: count(r.count) }),
		],
		[
			'topPages',
			'SELECT analytics_path AS pathname,MAX(title) AS title,COUNT(*) AS count FROM views GROUP BY analytics_path ORDER BY count DESC,analytics_path LIMIT 20',
			(r) => ({ pathname: r.pathname, title: r.title || '', count: count(r.count) }),
		],
		[
			'topReferrers',
			"SELECT referrer,COUNT(*) AS count FROM views WHERE TRIM(referrer) != '' GROUP BY referrer ORDER BY count DESC LIMIT 20",
			(r) => ({ referrer: r.referrer, count: count(r.count) }),
		],
		[
			'connectionStats',
			"SELECT connection_type AS type,COUNT(*) AS count FROM views WHERE connection_type != '' AND connection_type != 'unknown' GROUP BY connection_type ORDER BY count DESC",
			(r) => ({ type: r.type, count: count(r.count) }),
		],
		[
			'referrerTypeStats',
			"SELECT referrer_type AS type,COUNT(*) AS count FROM views WHERE referrer_type != '' GROUP BY referrer_type ORDER BY count DESC",
			(r) => ({ type: r.type, count: count(r.count) }),
		],
		[
			'searchEngineStats',
			"SELECT search_engine AS engine,COUNT(*) AS count FROM views WHERE search_engine != '' GROUP BY search_engine ORDER BY count DESC",
			(r) => ({ engine: r.engine, count: count(r.count) }),
		],
		[
			'searchKeywords',
			"SELECT search_keyword AS keyword,COUNT(*) AS count FROM views WHERE TRIM(search_keyword) != '' GROUP BY search_keyword ORDER BY count DESC LIMIT 20",
			(r) => ({ keyword: r.keyword, count: count(r.count) }),
		],
		[
			'screenResolutions',
			"SELECT CONCAT(screen_width,'x',screen_height) AS resolution,COUNT(*) AS count FROM views WHERE screen_width > 0 GROUP BY screen_width,screen_height ORDER BY count DESC LIMIT 10",
			(r) => ({ resolution: r.resolution, count: count(r.count) }),
		],
		[
			'utmCampaigns',
			"SELECT utm_source,utm_medium,utm_campaign,COUNT(*) AS count FROM views WHERE utm_source != '' GROUP BY utm_source,utm_medium,utm_campaign ORDER BY count DESC LIMIT 15",
			(r) => ({
				source: r.utm_source,
				medium: r.utm_medium,
				campaign: r.utm_campaign,
				count: count(r.count),
			}),
		],
		[
			'languageStats',
			"SELECT language,COUNT(*) AS count FROM views WHERE language != '' GROUP BY language ORDER BY count DESC LIMIT 10",
			(r) => ({ language: r.language, count: count(r.count) }),
		],
		[
			'timezoneStats',
			"SELECT timezone,COUNT(*) AS count FROM views WHERE timezone != '' GROUP BY timezone ORDER BY count DESC LIMIT 10",
			(r) => ({ timezone: r.timezone, count: count(r.count) }),
		],
	];
	for (const [key, sql, map] of definitions)
		data[key] = (await db.all(`${VIEW_CTE} ${sql}`)).map(map);
	const devices = await db.all(
		`${VIEW_CTE} SELECT device_type,COUNT(*) AS count FROM views GROUP BY device_type`
	);
	data.deviceStats = { mobile: 0, tablet: 0, desktop: 0 };
	for (const row of devices) {
		const type = ['mobile', 'tablet'].includes(row.device_type) ? row.device_type : 'desktop';
		data.deviceStats[type] += count(row.count);
	}
	const daily = await db.all(
		`${VIEW_CTE} SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00',?), '%Y-%m-%d') AS date,COUNT(*) AS pv,COUNT(DISTINCT visitor_key) AS uv FROM views WHERE created_at >= ? AND created_at < ? GROUP BY date ORDER BY date`,
		[sqlZone, monthStart, end]
	);
	data.dailyTrend = Array.from({ length: 30 }, (_, i) => {
		const date = new Date(month.startDate + 'T00:00:00Z');
		date.setUTCDate(date.getUTCDate() + i);
		const label = date.toISOString().slice(0, 10),
			row = daily.find((item) => item.date === label);
		return { date: label, pv: count(row?.pv), uv: count(row?.uv) };
	});
	const hours = await db.all(
		`${VIEW_CTE} SELECT HOUR(CONVERT_TZ(created_at,'+00:00',?)) AS hour,COUNT(*) AS count FROM views WHERE created_at >= ? AND created_at < ? GROUP BY hour`,
		[sqlZone, monthStart, end]
	);
	data.hourlyData = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		count: count(hours.find((row) => Number(row.hour) === hour)?.count),
	}));
	const days = await db.all(
		`${VIEW_CTE} SELECT DAYOFWEEK(CONVERT_TZ(created_at,'+00:00',?))-1 AS day,COUNT(*) AS count FROM views WHERE created_at >= ? AND created_at < ? GROUP BY day`,
		[sqlZone, monthStart, end]
	);
	data.dowData = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, day) => ({
		day: label,
		dayIndex: day,
		count: count(days.find((row) => Number(row.day) === day)?.count),
	}));
	const entries = await db.all(
		`${VIEW_CTE}, entry_visits AS (SELECT analytics_path, ROW_NUMBER() OVER(PARTITION BY session_key ORDER BY created_at,id) AS position FROM views WHERE session_key IS NOT NULL) SELECT analytics_path AS pathname,COUNT(*) AS count FROM entry_visits WHERE position=1 GROUP BY analytics_path ORDER BY count DESC LIMIT 10`
	);
	data.entryPages = entries.map((row) => ({ pathname: row.pathname, count: count(row.count) }));
	const exits = await db.all(
		`${VIEW_CTE}, exit_visits AS (SELECT analytics_path, ROW_NUMBER() OVER(PARTITION BY session_key ORDER BY created_at DESC,id DESC) AS position FROM views WHERE session_key IS NOT NULL) SELECT analytics_path AS pathname,COUNT(*) AS count FROM exit_visits WHERE position=1 GROUP BY analytics_path ORDER BY count DESC LIMIT 10`
	);
	data.exitPages = exits.map((row) => ({
		pathname: row.pathname,
		entryCount: count(entries.find((entry) => entry.pathname === row.pathname)?.count),
		exitCount: count(row.count),
	}));
	const perf = await db.get(
		`${VIEW_CTE} SELECT AVG(load_time) AS avg_load,MIN(load_time) AS min_load,MAX(load_time) AS max_load,AVG(fcp_time) AS avg_fcp,AVG(dom_content_loaded_time) AS avg_dcl FROM views WHERE load_time > 0`
	);
	data.performanceStats = {
		avgLoadTime: Math.round(count(perf.avg_load)),
		minLoadTime: Math.round(count(perf.min_load)),
		maxLoadTime: Math.round(count(perf.max_load)),
		avgFCP: Math.round(count(perf.avg_fcp)),
		avgDCL: Math.round(count(perf.avg_dcl)),
	};
	data.geoCountries = [];
	data.ispStats = [];
	data.recentTotal = count(totals.pv);
	data.recentPageSize = pageInteger(options.pageSize, 20, 100);
	data.recentPageCount = Math.max(1, Math.ceil(data.recentTotal / data.recentPageSize));
	data.recentPage = Math.min(pageInteger(options.page, 1), data.recentPageCount);
	const offset = (data.recentPage - 1) * data.recentPageSize;
	const recent = await db.all(
		`${VIEW_CTE} SELECT url,analytics_path AS pathname,title,COALESCE(NULLIF(ip,''),ip_encrypted) AS ip,screen_width,screen_height,pixel_ratio,language,device_type,browser,browser_version,os,os_version,referrer_type,DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,is_logged_in,username FROM views ORDER BY created_at DESC,id DESC LIMIT ${data.recentPageSize} OFFSET ${offset}`
	);
	data.recentVisitors = recent.map((row) => ({
		url: row.url || '',
		pathname: row.pathname || '/',
		title: row.title || '',
		ip: row.ip || '',
		screenWidth: count(row.screen_width),
		screenHeight: count(row.screen_height),
		pixelRatio: count(row.pixel_ratio) || 1,
		language: row.language || '',
		deviceType: row.device_type || '',
		browser: row.browser || '',
		browserVersion: row.browser_version || '',
		os: row.os || '',
		osVersion: row.os_version || '',
		referrerType: row.referrer_type || '',
		time: utcIso(row.created_at),
		isLoggedIn: !!row.is_logged_in,
		username: row.username || null,
	}));
	return data;
}
async function getAnalyticsSummary(db, options = {}) {
	if (!db.pool?.getConnection) return readSummary(db, options);
	const connection = await db.pool.getConnection();
	try {
		await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
		await connection.beginTransaction();
		const adapter = {
			get: async (sql, params = []) => {
				const [rows] = await connection.execute(sql, params);
				return rows[0] || null;
			},
			all: async (sql, params = []) => {
				const [rows] = await connection.execute(sql, params);
				return rows;
			},
		};
		const data = await readSummary(adapter, options);
		await connection.commit();
		return data;
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}
module.exports = { getAnalyticsSummary };
