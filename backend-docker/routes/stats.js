const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const IP_ENCRYPTION_SECRET = String(process.env.ANALYTICS_IP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'analytics-ip-secret');

const SESSION_TIMEOUT_MINUTES = 30;

function resolveGeoFromIP() {
	// No GeoIP database or lookup provider is configured. Preserve unknowns
	// instead of inferring locations or providers from numeric IP ranges.
	return { country: '', region: '', city: '', isp: '' };
}
const { getAnalyticsParts } = require('../services/analytics-time');

function hashIp(ip) {
	return crypto.createHash('sha256').update(String(ip || '')).digest('hex');
}

function buildEncryptionKey() {
	return crypto.createHash('sha256').update(IP_ENCRYPTION_SECRET).digest();
}

function encryptIp(ip) {
	const value = String(ip || '').trim();
	if (!value) return '';
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', buildEncryptionKey(), iv);
	const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptIp(payload) {
	const value = String(payload || '').trim();
	if (!value) return '';
	const parts = value.split(':');
	if (parts.length !== 3) {
		return value;
	}
	try {
		const decipher = crypto.createDecipheriv(
			'aes-256-gcm',
			buildEncryptionKey(),
			Buffer.from(parts[0], 'hex')
		);
		decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
		const decrypted = Buffer.concat([
			decipher.update(Buffer.from(parts[2], 'hex')),
			decipher.final(),
		]);
		return decrypted.toString('utf8');
	} catch (e) {
		return '';
	}
}

function buildIpStorage(ip) {
	const raw = String(ip || '').trim();
	return {
		ip: raw,
		ipHash: raw ? hashIp(raw) : '',
		ipEncrypted: raw ? encryptIp(raw) : '',
	};
}

function formatDateTime(date) {
	return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeRoute(url) {
	const parsed = new URL(url);
	const hashRoute = parsed.hash.replace(/^#!?/, '');
	const route = hashRoute.startsWith('/') ? new URL(hashRoute, parsed.origin) : parsed;
	return { pathname: route.pathname || '/', queryString: route.search || '' };
}

function positiveDuration(value) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.min(2147483647, Math.max(0, Math.floor(n))) : 0;
}

async function insertRow(tx, table, valueMap, suffix = '') {
	const columns = Object.keys(valueMap);
	return tx.run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})${suffix}`, Object.values(valueMap));
}

async function updateRow(tx, table, key, id, valueMap) {
	const columns = Object.keys(valueMap);
	return tx.run(`UPDATE ${table} SET ${columns.map(col => `${col} = ?`).join(', ')} WHERE ${key} = ?`, [...Object.values(valueMap), id]);
}

async function runTransaction(db, callback) {
	const connection = await db.pool.getConnection();
	try {
		await connection.beginTransaction();
		const tx = {
			get: async (sql, args = []) => (await connection.execute(sql, args))[0][0] || null,
			run: async (sql, args = []) => {
				const [result] = await connection.execute(sql, args);
				return { lastID: result.insertId, changes: result.affectedRows };
			},
		};
		const result = await callback(tx);
		await connection.commit();
		return result;
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

async function withTransaction(db, callback) {
	// InnoDB can select a deadlock victim when independent first requests
	// contend on unique visitor/session ids. Retry the entire rolled-back unit.
	for (let attempt = 0; attempt < 3; attempt++) {
		try { return await runTransaction(db, callback); }
		catch (error) {
			if (attempt === 2 || !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_DUP_ENTRY'].includes(error.code)) throw error;
		}
	}
}

const SESSION_SELECT = `SELECT session_id, visitor_id, pvid, pageview_count, duration_seconds,
	DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
	DATE_FORMAT(last_activity_at, '%Y-%m-%d %H:%i:%s') AS last_activity_at
	FROM analytics_sessions`;

function isSessionActive(session, now) {
	if (!session?.last_activity_at) return false;
	const last = Date.parse(`${session.last_activity_at.replace(' ', 'T')}Z`);
	return Number.isFinite(last) && now.getTime() - last < SESSION_TIMEOUT_MINUTES * 60000;
}

function replacementPrefix(visitorId, requestedId) {
	return `r${crypto.createHash('sha256').update(`${visitorId}|${requestedId}`).digest('hex').slice(0, 24)}r`;
}

async function findActiveReplacement(tx, visitorId, requestedId, now) {
	const latest = await tx.get(`${SESSION_SELECT} WHERE visitor_id = ? AND session_id LIKE ? ORDER BY last_activity_at DESC LIMIT 1 FOR UPDATE`, [visitorId, `${replacementPrefix(visitorId, requestedId)}%`]);
	return isSessionActive(latest, now) ? latest : null;
}

async function resolveSession(tx, visitorId, requestedId, now) {
	const requested = requestedId ? await tx.get(`${SESSION_SELECT} WHERE session_id = ? LIMIT 1 FOR UPDATE`, [requestedId]) : null;
	if (requested?.visitor_id === visitorId && isSessionActive(requested, now)) return { session: requested, sessionId: requested.session_id };
	if (requested?.visitor_id === visitorId) {
		// Only this expired tab's replacements can be reused by older clients.
		// The prefix keeps that association across processes without a new table.
		const replacement = await findActiveReplacement(tx, visitorId, requestedId, now);
		if (replacement) return { session: replacement, sessionId: replacement.session_id };
		return { session: null, sessionId: replacementPrefix(visitorId, requestedId) + crypto.randomBytes(12).toString('hex') };
	}
	// A new client id belongs to its own tab, even when this visitor has another
	// active session. Never merge independent tabs or reassign foreign ids.
	return { session: null, sessionId: requestedId && !requested ? requestedId : crypto.randomBytes(24).toString('hex') };
}

async function recordEngagement(db, body, now, pvid) {
	return withTransaction(db, async tx => {
		// Same visitor-first locking order as PV avoids lost duration updates.
		const visitor = await tx.get('SELECT visitor_id FROM analytics_visitors WHERE pvid = ? LIMIT 1 FOR UPDATE', [pvid]);
		if (!visitor || !body.sessionId) return { success: true, skipped: true };
		const requestedId = String(body.sessionId);
		const requested = await tx.get(`${SESSION_SELECT} WHERE session_id = ? AND visitor_id = ? LIMIT 1 FOR UPDATE`, [requestedId, visitor.visitor_id]);
		if (!requested) return { success: true, skipped: true };
		if (!isSessionActive(requested, now) && body.sessionEnded === true) {
			// A final report may arrive after inactivity expiry or after the next
			// pageview. Settle only its original session; never renew it or an alias.
			const started = Date.parse(`${requested.started_at.replace(' ', 'T')}Z`);
			const last = Date.parse(`${requested.last_activity_at.replace(' ', 'T')}Z`);
			if (!Number.isFinite(started) || !Number.isFinite(last)) return { success: true, skipped: true };
			const ended = Math.min(now.getTime(), last + SESSION_TIMEOUT_MINUTES * 60000);
			const maximumDuration = Math.max(0, Math.floor((ended - started) / 1000));
			await updateRow(tx, 'analytics_sessions', 'session_id', requested.session_id, {
				duration_seconds: Math.max(Number(requested.duration_seconds || 0), Math.min(maximumDuration, positiveDuration(body.sessionDuration))),
				ended_at: formatDateTime(new Date(ended)), updated_at: formatDateTime(now),
			});
			return { success: true, settled: true, visitorId: visitor.visitor_id, sessionId: requested.session_id };
		}
		const session = isSessionActive(requested, now) ? requested : await findActiveReplacement(tx, visitor.visitor_id, requestedId, now);
		if (!session) return { success: true, skipped: true };
		const activity = [session.last_activity_at || '', formatDateTime(now)].sort().at(-1);
		await updateRow(tx, 'analytics_sessions', 'session_id', session.session_id, {
			last_activity_at: activity, ended_at: activity,
			duration_seconds: Math.max(Number(session.duration_seconds || 0), session.session_id === requestedId ? positiveDuration(body.sessionDuration) : 0), updated_at: formatDateTime(now),
		});
		return { success: true, visitorId: visitor.visitor_id, sessionId: session.session_id };
	});
}

async function recordPageview(db, body, ip, now, eventDate, pvid, eventId) {
	const { pathname, queryString } = normalizeRoute(body.url);
	const occurredAt = formatDateTime(eventDate);
	const receivedAt = formatDateTime(now);
	const parts = getAnalyticsParts(eventDate);
	const ipStorage = buildIpStorage(ip);
	const geo = resolveGeoFromIP(ip);
	const candidateVisitorId = crypto.createHash('sha1').update(pvid).digest('hex');
	const common = {
		pvid, referrer: body.referrer || '', referrer_type: body.referrerType || '',
		search_engine: body.searchEngine || '', search_keyword: body.searchKeyword || '',
		utm_source: body.utmSource || '', utm_medium: body.utmMedium || '', utm_campaign: body.utmCampaign || '',
		utm_term: body.utmTerm || '', utm_content: body.utmContent || '', ip: ipStorage.ip, ip_hash: ipStorage.ipHash, ip_encrypted: ipStorage.ipEncrypted,
		country: geo.country, region: geo.region, city: geo.city, isp: geo.isp,
		language: body.language || '', timezone: body.timezone || '', device_type: body.deviceType || 'desktop',
		browser: body.browser || '', browser_version: body.browserVersion || '', os: body.os || '', os_version: body.osVersion || '',
	};
	return withTransaction(db, async tx => {
		// The pvid unique index selects the existing legacy identity; the UPSERT
		// also acquires its row lock before any counter or session is read.
		await insertRow(tx, 'analytics_visitors', {
			visitor_id: candidateVisitorId, ...common, first_seen_at: occurredAt, last_seen_at: receivedAt,
			first_page_url: body.url, last_page_url: body.url, entry_pathname: pathname, last_pathname: pathname,
			user_agent: body.userAgent || '', visit_count: 0, session_count: 0, pageview_count: 0, created_at: receivedAt, updated_at: receivedAt,
		}, ' ON DUPLICATE KEY UPDATE visitor_id = visitor_id');
		const visitor = await tx.get('SELECT visitor_id, pvid, visit_count, session_count, pageview_count, DATE_FORMAT(last_seen_at, \'%Y-%m-%d %H:%i:%s\') AS last_seen_at FROM analytics_visitors WHERE pvid = ? LIMIT 1 FOR UPDATE', [pvid]);
		if (!visitor) throw new Error('Analytics visitor identity unavailable');
		if (eventId) {
			const duplicate = await tx.get('SELECT visitor_id, pvid, session_id FROM page_stats WHERE event_id = ? LIMIT 1', [eventId]);
			if (duplicate) {
				if (duplicate.pvid !== pvid) { const error = new Error('Event id belongs to another visitor'); error.status = 409; throw error; }
				return { success: true, duplicate: true, visitorId: duplicate.visitor_id, sessionId: duplicate.session_id };
			}
		}
		const visitorId = visitor.visitor_id;
		const { session, sessionId } = await resolveSession(tx, visitorId, body.sessionId ? String(body.sessionId) : '', now);
		const isNewSession = !session;
		const storedPageCount = Number(visitor.pageview_count || 0);
		const history = storedPageCount === 0 ? await tx.get('SELECT COUNT(*) AS cnt FROM page_stats WHERE pvid = ?', [pvid]) : null;
		const basePageCount = Math.max(storedPageCount, Number(history?.cnt || 0));
		const visitSequence = basePageCount + 1;
		const sessionPageIndex = Number(session?.pageview_count || 0) + 1;
		const isNewVisitor = basePageCount === 0;
		const startedAt = session?.started_at || receivedAt;
		const activity = [session?.last_activity_at || '', receivedAt].sort().at(-1);
		const duration = Math.max(Number(session?.duration_seconds || 0), sessionId !== body.sessionId ? 0 : positiveDuration(body.sessionDuration));
		await updateRow(tx, 'analytics_visitors', 'visitor_id', visitorId, {
			...common, last_seen_at: [visitor.last_seen_at || '', receivedAt].sort().at(-1), last_page_url: body.url, last_pathname: pathname,
			user_agent: body.userAgent || '', visit_count: Math.max(Number(visitor.visit_count || 0), basePageCount) + 1,
			session_count: Number(visitor.session_count || 0) + (isNewSession ? 1 : 0), pageview_count: visitSequence, updated_at: receivedAt,
		});
		const sessionValues = {
			...common, last_activity_at: activity, ended_at: activity, exit_page_url: body.url, exit_pathname: pathname,
			pageview_count: sessionPageIndex, duration_seconds: duration, is_bounce: sessionPageIndex === 1 ? 1 : 0, updated_at: receivedAt,
		};
		if (isNewSession) {
			await insertRow(tx, 'analytics_sessions', {session_id: sessionId, visitor_id: visitorId, started_at: startedAt,
				landing_page_url: body.url, landing_pathname: pathname, ...sessionValues, created_at: receivedAt});
		} else await updateRow(tx, 'analytics_sessions', 'session_id', sessionId, sessionValues);
		const inserted = await insertRow(tx, 'page_stats', {
			visitor_id: visitorId, ...common, event_id: eventId, session_id: sessionId, url: body.url, pathname, query_string: queryString,
			title: body.title || '', user_agent: body.userAgent || '', screen_width: body.screenWidth || 0, screen_height: body.screenHeight || 0,
			viewport_width: body.viewportWidth || 0, viewport_height: body.viewportHeight || 0, is_mobile: body.deviceType === 'mobile' ? 1 : 0,
			charset: body.charset || 'UTF-8', color_depth: body.colorDepth || 24, pixel_ratio: body.pixelRatio || 1, touch_support: body.touchSupport ? 1 : 0,
			connection_type: body.connectionType || '', downlink_speed: body.downlinkSpeed || 0,
			load_time: body.loadTime || 0, dom_content_loaded_time: body.domContentLoadedTime || 0, fcp_time: body.fcpTime || 0,
			is_entry_page: isNewSession ? 1 : 0, is_new_visitor: isNewVisitor ? 1 : 0, session_duration: duration,
			visit_hour: parts.hour, day_of_week: parts.dayOfWeek, visit_date: parts.date, visit_sequence: visitSequence, session_page_index: sessionPageIndex,
			session_started_at: startedAt, last_activity_at: activity, is_logged_in: body.isLoggedIn ? 1 : 0, username: body.username || null, created_at: occurredAt,
		});
		await updateRow(tx, 'analytics_sessions', 'session_id', sessionId,
			isNewSession ? {entry_page_id: inserted.lastID, last_pageview_id: inserted.lastID} : {last_pageview_id: inserted.lastID});
		return { success: true, visitorId, sessionId };
	});
}

router.post('/pageview', async (req, res) => {
	let db;
	try { db = require('../db').getDatabase(); }
	catch (error) { return res.status(503).json({ success: false, error: '统计服务暂不可用' }); }
	const body = req.body || {};
	const eventType = body.eventType || 'pageview';
	const now = new Date();
	const eventDate = new Date(body.timestamp);
	const ip = req.ip || req.connection?.remoteAddress || '';
	const pvid = String(body.pvid || crypto.createHash('sha1').update(`${body.userAgent || ''}|${ip}`).digest('hex'));
	const eventId = body.eventId == null || body.eventId === '' ? null : String(body.eventId);
	if (!['pageview', 'engagement'].includes(eventType) || !body.timestamp || Number.isNaN(eventDate.getTime()) || pvid.length > 64 || (body.sessionId && String(body.sessionId).length > 64) || (eventId && eventId.length > 128) || (eventType === 'pageview' && !body.url)) {
		return res.status(400).json({ success: false, error: '统计参数无效' });
	}
	if (eventType === 'pageview') {
		try { normalizeRoute(body.url); } catch (error) { return res.status(400).json({success:false,error:'统计URL无效'}); }
	}
	try {
		const result = eventType === 'engagement'
			? await recordEngagement(db, body, now, pvid)
			: await recordPageview(db, body, ip, now, eventDate > now ? now : eventDate, pvid, eventId);
		return res.json(result);
	} catch (error) {
		// Unique event ids also arbitrate retries from separate transactions.
		if (eventId && error.code === 'ER_DUP_ENTRY') {
			try {
				const duplicate = await db.get('SELECT visitor_id, pvid, session_id FROM page_stats WHERE event_id = ? LIMIT 1', [eventId]);
				if (duplicate?.pvid === pvid) return res.json({success:true,duplicate:true,visitorId:duplicate.visitor_id,sessionId:duplicate.session_id});
				if (duplicate) return res.status(409).json({success:false,error:'统计事件ID冲突'});
			} catch (readError) { /* Return the original write failure. */ }
		}
		console.error('Pageview stats error:', error.message);
		return res.status(error.status || 500).json({ success: false, error: '统计记录失败' });
	}
});

module.exports = router;
