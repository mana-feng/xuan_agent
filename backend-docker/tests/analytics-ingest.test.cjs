const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

// Only MySQL I/O and Express registration are substituted; the actual route runs.
function fixture() {
	const state = { analytics_visitors: [], analytics_sessions: [], page_stats: [] };
	let clock = Date.parse('2026-10-16T02:00:00Z');
	let nextPageId = 1;
	let failPageInsert = false;
	let nextSessionFailure = null;
	let tail = Promise.resolve();
	const queries = [];
	async function execute(sql, args = []) {
		queries.push(sql);
		const table = /(?:FROM|INTO|UPDATE)\s+(analytics_visitors|analytics_sessions|page_stats)/i.exec(sql)?.[1];
		if (/information_schema.columns/.test(sql)) return [('id visitor_id pvid session_id event_id url pathname query_string referrer title user_agent screen_width screen_height viewport_width viewport_height device_type is_mobile browser browser_version os os_version language charset color_depth pixel_ratio touch_support connection_type downlink_speed ip ip_hash ip_encrypted timezone load_time dom_content_loaded_time fcp_time is_entry_page utm_source utm_medium utm_campaign utm_term utm_content referrer_type search_engine search_keyword country region city isp is_new_visitor session_duration visit_hour day_of_week visit_date visit_sequence session_page_index session_started_at last_activity_at is_logged_in username created_at').split(' ').map(COLUMN_NAME => ({COLUMN_NAME})), []];
		if (!table) throw new Error('Unexpected SQL: ' + sql);
		const rows = state[table];
		if (/^SELECT/i.test(sql)) {
			let found = rows.slice();
			const where = sql.split(/\bWHERE\b/i)[1] || '';
			let index = 0;
			for (const match of where.matchAll(/\b(visitor_id|pvid|session_id|event_id)\s*=\s*\?/g)) {
				const key = match[1], value = args[index++];
				found = found.filter(row => row[key] === value);
			}
			if (/session_id LIKE \?/.test(where)) { const prefix=args[index++].replace(/%$/, ''); found=found.filter(row=>row.session_id.startsWith(prefix)); }
			if (/ORDER BY last_activity_at DESC/.test(sql)) found.sort((a,b) => String(b.last_activity_at).localeCompare(String(a.last_activity_at)));
			if (/COUNT\(\*\)/i.test(sql)) return [[{ cnt: found.length }], []];
			return [structuredClone(found), []];
		}
		if (/^INSERT/i.test(sql)) {
			if (table === 'page_stats' && failPageInsert) throw new Error('injected page insert failure');
			if (table === 'analytics_sessions' && nextSessionFailure) { const error=new Error('injected transient write failure'); error.code=nextSessionFailure; nextSessionFailure=null; throw error; }
			const cols = /\(([^)]+)\)\s*VALUES/i.exec(sql)[1].split(',').map(c => c.trim());
			const row = Object.fromEntries(cols.map((col, i) => [col, args[i]]));
			if (!row.created_at) row.created_at = '2026-10-16 02:00:00';
			const collision = rows.find(r => table === 'analytics_visitors' ? r.visitor_id === row.visitor_id || r.pvid === row.pvid : table === 'analytics_sessions' ? r.session_id === row.session_id : row.event_id && r.event_id === row.event_id);
			if (collision) {
				if (/ON DUPLICATE KEY/i.test(sql)) return [{ affectedRows: 0 }, []];
				const error = new Error('duplicate key'); error.code = 'ER_DUP_ENTRY'; throw error;
			}
			if (table === 'page_stats') row.id = nextPageId++;
			rows.push(row);
			return [{ insertId: row.id || 0, affectedRows: 1 }, []];
		}
		if (/^UPDATE/i.test(sql)) {
			const where = /WHERE\s+(visitor_id|session_id)\s*=\s*\?/i.exec(sql);
			const row = rows.find(r => r[where[1]] === args.at(-1));
			if (row) {
				let index = 0;
				const set = sql.split(/\bSET\b/i)[1].split(/\bWHERE\b/i)[0];
				for (const assignment of set.split(',')) {
					const [key, expr] = assignment.trim().split(/\s*=\s*/);
					if (expr === '?') row[key] = args[index++];
					else if (/\+\s*\?/.test(expr)) row[key] = Number(row[key] || 0) + args[index++];
					else if (/\+\s*1/.test(expr)) row[key] = Number(row[key] || 0) + 1;
					else if (/NOW/.test(expr)) row[key] = '2026-10-16 02:00:00';
					else throw new Error('Unsupported assignment: ' + assignment);
				}
			}
			return [{ affectedRows: row ? 1 : 0 }, []];
		}
		throw new Error('Unexpected SQL: ' + sql);
	}
	const db = {
		get: async (sql,args) => (await execute(sql,args))[0][0] || null,
		all: async (sql,args) => (await execute(sql,args))[0],
		run: async (sql,args) => { const [r] = await execute(sql,args); return { lastID:r.insertId, changes:r.affectedRows }; },
		pool: { getConnection: async () => {
			let releaseLock, snapshot;
			return {
				beginTransaction: async () => { const prev=tail; tail=new Promise(resolve => { releaseLock=resolve; }); await prev; snapshot=structuredClone(state); },
				execute,
				commit: async () => {},
				rollback: async () => { for (const key of Object.keys(state)) state[key]=snapshot[key]; },
				release: () => releaseLock?.(),
			};
		} },
	};
	const routePath = path.resolve(__dirname, '../routes/stats.js');
	let handler;
	const localRequire = createRequire(routePath);
	const FakeDate = class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
	vm.runInNewContext(fs.readFileSync(routePath, 'utf8'), {
		require: name => name === 'express' ? { Router: () => ({post: (url, cb) => { handler=cb; }}) } : name === '../db' ? {getDatabase:()=>db} : localRequire(name),
		module: {exports:{}}, console: {log(){},error(){}}, process, Buffer, URL, Date:FakeDate,
	}, {filename:routePath});
	return { state, queries, setClock: value => {clock=Date.parse(value);}, failPages: () => {failPageInsert=true;}, failNextSession: code => {nextSessionFailure=code;},
		post: async (body={}, ip='1.2.3.4') => { let status=200, response; await handler({body:{url:'https://example.com/#/pages/index/index',timestamp:new Date(clock).toISOString(),pvid:'visitor-a',sessionId:'session-a', ...body},ip},{status(code){status=code;return this;},json(value){response=value;return this;}}); return {status,body:response}; }
	};
}

test('one permanent visitor survives IP and browser changes, including legacy visitor ids', async () => {
	const f=fixture();
	f.state.analytics_visitors.push({visitor_id:'legacy-old-id',pvid:'visitor-a',first_seen_at:'2026-10-10 00:00:00',last_seen_at:'2026-10-10 00:00:00',visit_count:4,pageview_count:4,session_count:1});
	const a=await f.post({userAgent:'old'},'1.2.3.4'); const b=await f.post({userAgent:'new'},'2.3.4.5');
	assert.equal(a.status,200); assert.equal(b.status,200);
	assert.equal(b.body.visitorId,'legacy-old-id'); assert.equal(f.state.analytics_visitors.length,1); assert.equal(f.state.analytics_visitors[0].pageview_count,6);
});

test('IPv4 and IPv6 addresses do not invent geography without a configured GeoIP source',async()=>{
	for (const ip of ['1.2.3.4','8.8.8.8','2001:4860:4860::8888','240e::1']) {
		const f=fixture(); assert.equal((await f.post({},ip)).status,200);
		for(const table of ['analytics_visitors','analytics_sessions','page_stats']) {
			const row=f.state[table][0]; assert.equal(row.country,'',`${table} country for ${ip}`); assert.equal(row.region,'',`${table} region for ${ip}`); assert.equal(row.city,'',`${table} city for ${ip}`); assert.equal(row.isp,'',`${table} ISP for ${ip}`); assert.equal(row.ip,ip); assert.match(row.ip_hash,/^[a-f0-9]{64}$/); assert.ok(row.ip_encrypted);
		}
	}
});

test('a legacy page without a visitor aggregate is returning and retains its page sequence',async()=>{
	const f=fixture(); f.state.page_stats.push({id:90,pvid:'visitor-a',visitor_id:'',session_id:'old-session',visit_sequence:1});
	assert.equal((await f.post()).status,200); assert.equal(f.state.page_stats[1].is_new_visitor,0); assert.equal(f.state.page_stats[1].visit_sequence,2); assert.equal(f.state.analytics_visitors[0].pageview_count,2);
});

test('expired ids rotate once on the server even when old clients keep sending them',async()=>{
	const f=fixture(); await f.post(); f.setClock('2026-10-16T02:31:00Z');
	const second=await f.post(); const third=await f.post();
	assert.notEqual(second.body.sessionId,'session-a'); assert.equal(third.body.sessionId,second.body.sessionId);
	assert.equal(f.state.analytics_sessions.length,2); assert.deepEqual(f.state.page_stats.map(r=>r.session_page_index),[1,1,2]);
});

test('page failure rolls back visitor and session counters with the page row',async()=>{
	const f=fixture(); await f.post(); const before=structuredClone(f.state); f.failPages();
	assert.equal((await f.post()).status,500); assert.deepEqual(f.state,before);
});

test('concurrent first views keep one visitor and session with consistent sequences',async()=>{
	const f=fixture(); const results=await Promise.all([f.post({eventId:'event-1'}),f.post({eventId:'event-2'})]);
	assert.ok(results.every(r=>r.status===200)); assert.equal(f.state.analytics_visitors.length,1); assert.equal(f.state.analytics_sessions.length,1);
	assert.deepEqual(f.state.page_stats.map(r=>r.visit_sequence),[1,2]); assert.deepEqual(f.state.page_stats.map(r=>r.session_page_index),[1,2]);
	assert.deepEqual(f.state.page_stats.map(r=>r.is_new_visitor),[1,0]); assert.equal(f.state.analytics_visitors[0].pageview_count,2);
});

test('stable event id retries count one page, visitor and session',async()=>{
	const f=fixture(); assert.equal((await f.post({eventId:'retry'})).status,200); assert.equal((await f.post({eventId:'retry'})).status,200);
	assert.equal(f.state.page_stats.length,1); assert.equal(f.state.analytics_visitors[0].pageview_count,1); assert.equal(f.state.analytics_sessions[0].pageview_count,1);
});

test('hash routes retain route paths and queries and use business day parts with UTC timestamps',async()=>{
	const f=fixture(); f.setClock('2026-10-16T00:00:10Z'); await f.post({url:'https://example.com/#/pages/bazi/result?record=3',timestamp:'2026-10-15T16:10:00Z'});
	const row=f.state.page_stats[0]; assert.equal(row.pathname,'/pages/bazi/result'); assert.equal(row.query_string,'?record=3'); assert.equal(row.visit_date,'2026-10-16'); assert.equal(row.visit_hour,0); assert.equal(row.day_of_week,5); assert.equal(row.created_at,'2026-10-15 16:10:00');
});

test('session start remains fixed and delayed timestamps cannot rewind activity or duration',async()=>{
	const f=fixture(); await f.post({sessionDuration:15}); f.setClock('2026-10-16T02:05:00Z'); await f.post({timestamp:'2026-10-16T01:00:00Z',sessionDuration:3});
	const [first,second]=f.state.page_stats; assert.equal(second.session_started_at,first.session_started_at); assert.equal(second.last_activity_at,'2026-10-16 02:05:00'); assert.ok(f.state.analytics_sessions[0].duration_seconds>=15);
});

test('engagement changes only duration and activity, and ignores missing or foreign sessions',async()=>{
	const f=fixture(); await f.post(); f.setClock('2026-10-16T02:01:00Z'); const result=await f.post({eventType:'engagement',sessionDuration:25,url:undefined});
	assert.equal(result.status,200); assert.equal(f.state.page_stats.length,1); assert.equal(f.state.analytics_visitors[0].pageview_count,1); assert.equal(f.state.analytics_sessions[0].pageview_count,1); assert.ok(f.state.analytics_sessions[0].duration_seconds>=25);
	await f.post({eventType:'engagement',pvid:'someone-else',sessionDuration:200,url:undefined}); assert.equal(f.state.analytics_visitors.length,1); assert.equal(f.state.page_stats.length,1);
});

test('a supplied session id cannot reassign another permanent visitor session',async()=>{
	const f=fixture(); await f.post(); const result=await f.post({pvid:'visitor-b'});
	assert.equal(result.status,200); assert.notEqual(result.body.sessionId,'session-a'); assert.equal(f.state.analytics_sessions[0].pvid,'visitor-a'); assert.equal(f.state.analytics_sessions.length,2);
});

test('independent tabs retain their own session ids and engagement durations',async()=>{
	const f=fixture(); const a=await f.post({sessionId:'tab-a'}); const b=await f.post({sessionId:'tab-b'});
	assert.equal(a.body.sessionId,'tab-a'); assert.equal(b.body.sessionId,'tab-b'); assert.equal(f.state.analytics_sessions.length,2);
	f.setClock('2026-10-16T02:01:00Z'); await f.post({eventType:'engagement',sessionId:'tab-a',sessionDuration:12}); await f.post({eventType:'engagement',sessionId:'tab-b',sessionDuration:25});
	assert.equal(f.state.analytics_sessions.find(s=>s.session_id==='tab-a').duration_seconds,12); assert.equal(f.state.analytics_sessions.find(s=>s.session_id==='tab-b').duration_seconds,25);
	assert.equal(f.state.page_stats.length,2); assert.deepEqual(f.state.page_stats.map(p=>p.session_page_index),[1,1]);
});

test('an expired tab rotates independently from another active tab',async()=>{
	const f=fixture(); await f.post({sessionId:'tab-a'}); f.setClock('2026-10-16T02:20:00Z'); await f.post({sessionId:'tab-b'}); f.setClock('2026-10-16T02:31:00Z');
	const rotated=await f.post({sessionId:'tab-a'}); assert.notEqual(rotated.body.sessionId,'tab-a'); assert.notEqual(rotated.body.sessionId,'tab-b');
	assert.equal(f.state.analytics_sessions.length,3); assert.equal((await f.post({sessionId:'tab-a'})).body.sessionId,rotated.body.sessionId);
});

test('engagement from an expired original id updates only its existing replacement without old duration',async()=>{
	const f=fixture(); await f.post({sessionDuration:100}); f.setClock('2026-10-16T02:31:00Z'); const rotated=await f.post({sessionDuration:1900});
	f.setClock('2026-10-16T02:32:00Z'); await f.post({sessionId:'other-tab'}); const result=await f.post({eventType:'engagement',sessionDuration:1920,url:undefined});
	assert.equal(result.body.sessionId,rotated.body.sessionId); const replacement=f.state.analytics_sessions.find(s=>s.session_id===rotated.body.sessionId);
	assert.equal(replacement.last_activity_at,'2026-10-16 02:32:00'); assert.equal(replacement.duration_seconds,0); assert.equal(f.state.analytics_sessions[0].duration_seconds,100); assert.equal(f.state.page_stats.length,3);
});

test('activity heartbeats retain one session over forty minutes without extra pageviews',async()=>{
	const f=fixture(); await f.post(); f.setClock('2026-10-16T02:20:00Z'); assert.equal((await f.post({eventType:'engagement',sessionDuration:1200,url:undefined})).body.sessionId,'session-a');
	f.setClock('2026-10-16T02:40:00Z'); assert.equal((await f.post({eventType:'engagement',sessionDuration:2400,url:undefined})).body.sessionId,'session-a');
	assert.equal(f.state.analytics_sessions.length,1); assert.equal(f.state.analytics_sessions[0].duration_seconds,2400); assert.equal(f.state.page_stats.length,1); assert.equal(f.state.analytics_visitors[0].pageview_count,1);
});

test('transaction deadlocks and concurrent session-id collisions retry without drifting counters',async()=>{
	for (const code of ['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_DUP_ENTRY']) {
		const f=fixture(); f.failNextSession(code); const result=await f.post();
		assert.equal(result.status,200,code); assert.equal(f.state.page_stats.length,1); assert.equal(f.state.analytics_visitors[0].pageview_count,1); assert.equal(f.state.analytics_visitors[0].session_count,1);
	}
});

test('an old client does not carry its expired session duration into a replacement session',async()=>{
	const f=fixture(); await f.post({sessionDuration:100}); f.setClock('2026-10-16T02:31:00Z'); await f.post({sessionDuration:1900}); await f.post({sessionDuration:1901});
	assert.equal(f.state.analytics_sessions[1].duration_seconds,0);
});

test('expired or unknown engagement cannot create or revive sessions',async()=>{
	const f=fixture(); await f.post(); f.setClock('2026-10-16T02:31:00Z'); const before=structuredClone(f.state);
	assert.equal((await f.post({eventType:'engagement',sessionDuration:999,url:undefined})).body.skipped,true);
	assert.deepEqual(f.state,before); await f.post({eventType:'engagement',pvid:'unknown',sessionDuration:999,url:undefined}); assert.deepEqual(f.state,before);
});

test('business day windows cover DST transitions using local midnights',()=>{
	const servicePath=path.resolve(__dirname,'../services/analytics-time.js');
	assert.ok(fs.existsSync(servicePath),'analytics time service must exist');
	const time=require(servicePath); const old=process.env.ANALYTICS_TIMEZONE;
	try { process.env.ANALYTICS_TIMEZONE='America/New_York'; const w=time.getAnalyticsWindow(new Date('2026-03-08T16:00:00Z'),1); assert.equal(w.today,'2026-03-08'); assert.equal(w.yesterday,'2026-03-07'); assert.equal(w.startDate,'2026-03-08'); assert.equal(w.endExclusiveDate,'2026-03-09'); assert.equal(w.startUtc.toISOString(),'2026-03-08T05:00:00.000Z'); assert.equal(w.endUtc.toISOString(),'2026-03-09T04:00:00.000Z'); }
	finally { if(old===undefined) delete process.env.ANALYTICS_TIMEZONE;else process.env.ANALYTICS_TIMEZONE=old; }
});

for (const returnFirst of [false, true]) test(`actual idle client settles its expired session without revival (new page arrives first: ${returnFirst})`, async () => {
	const filename = path.resolve(__dirname, '../../frontend-docker/tests/analytics-client.test.cjs');
	const localRequire = createRequire(filename);
	const context = { __dirname: path.dirname(filename), require: name => name === 'node:test' ? { test() {} } : localRequire(name), console, process, setTimeout, clearTimeout };
	vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nglobalThis.makeClient = browser;', context, { filename });
	const client = context.makeClient({ fakeTimers: true, now: Date.parse('2026-10-16T02:00:00Z') });
	const f = fixture();
	try {
		client.mount();
		const initial = client.pageviews()[0].payload;
		await f.post(initial);
		client.advance(31 * 60000);
		f.setClock('2026-10-16T02:31:00Z');
		let nextSession;
		if (returnFirst) {
			client.w.document.dispatchEvent(new client.w.Event('pointerdown'));
			await f.post(client.pageviews()[1].payload);
			nextSession = structuredClone(f.state.analytics_sessions[1]);
		} else client.w.dispatchEvent(new client.w.Event('pagehide'));
		const final = client.engagements().at(-1).payload;
		assert.equal(final.sessionEnded, true);
		assert.equal((await f.post(final)).body.settled, true);
		assert.equal(f.state.analytics_sessions[0].duration_seconds, 1800);
		assert.equal(f.state.analytics_sessions[0].last_activity_at, '2026-10-16 02:00:00');
		assert.equal(f.state.analytics_sessions.length, returnFirst ? 2 : 1);
		assert.equal(f.state.page_stats.length, returnFirst ? 2 : 1);
		if (returnFirst) assert.deepEqual(f.state.analytics_sessions[1], nextSession);
		else {
			const next = await f.post({ ...initial, eventId: 'return-after-idle' });
			assert.notEqual(next.body.sessionId, initial.sessionId);
		}
	} finally { client.close(); }
});

test('late final settlement is bounded and cannot change an active replacement session', async () => {
	const f = fixture();
	await f.post({ sessionDuration: 100 });
	f.setClock('2026-10-16T02:31:00Z');
	await f.post();
	const replacement = structuredClone(f.state.analytics_sessions[1]);
	const final = { eventType: 'engagement', sessionEnded: true, sessionDuration: 999999, url: undefined };
	assert.equal((await f.post(final)).body.sessionId, 'session-a');
	assert.equal(f.state.analytics_sessions[0].duration_seconds, 1800);
	assert.equal(f.state.analytics_sessions[0].last_activity_at, '2026-10-16 02:00:00');
	assert.equal(f.state.analytics_sessions[0].ended_at, '2026-10-16 02:30:00');
	assert.deepEqual(f.state.analytics_sessions[1], replacement);
	await f.post({ ...final, sessionDuration: 10 });
	assert.equal(f.state.analytics_sessions[0].duration_seconds, 1800);
	assert.equal(f.state.page_stats.length, 2);
});

test('final settlement cannot create an unknown session or claim another visitor session', async () => {
	const f = fixture();
	await f.post();
	f.setClock('2026-10-16T02:31:00Z');
	const before = structuredClone(f.state);
	for (const values of [{ pvid: 'unknown' }, { sessionId: 'unknown' }]) {
		assert.equal((await f.post({ eventType: 'engagement', sessionEnded: true, sessionDuration: 1800, ...values })).body.skipped, true);
	}
	assert.deepEqual(f.state, before);
});

test('legacy schema gets a nullable unique event id and concurrent index creation is harmless',async()=>{
	for (const simulateConcurrentCreate of [false,true]) {
		const columns=new Map(); const indexes=new Set(); const statements=[];
		const db={
			all:async sql=>[...(columns.get(/table_name = '([^']+)'/.exec(sql)?.[1]) || [])].map(name=>({name})),
			get:async(sql,args)=>({cnt:indexes.has(args?.[0]) ? 1 : 0}),
			run:async(sql)=>{
				statements.push(sql);
				const alter=/ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql);
				if(alter){ if(!columns.has(alter[1]))columns.set(alter[1],new Set()); columns.get(alter[1]).add(alter[2]); }
				const index=/CREATE (?:UNIQUE )?INDEX (\w+)/.exec(sql);
				if(index){ indexes.add(index[1]); if(simulateConcurrentCreate && index[1]==='idx_page_stats_event_id'){const error=new Error('index created by other startup'); error.code='ER_DUP_KEYNAME'; throw error;} }
				return {};
			},
		};
		const initPath=path.resolve(__dirname,'../database/init.js'); const module={exports:{}};
		vm.runInNewContext(fs.readFileSync(initPath,'utf8'),{module,require:name=>name==='../db'?{getDatabase:()=>db}:name==='../config-service'?{initTable:async()=>{}}:{},process:{env:{}},console:{log(){},warn(){}}},{filename:initPath});
		await module.exports.initTables(); await module.exports.initTables();
		assert.equal(statements.filter(sql=>/^ALTER TABLE page_stats ADD COLUMN event_id VARCHAR\(128\) DEFAULT NULL/.test(sql)).length,1);
		assert.equal(statements.filter(sql=>/^CREATE UNIQUE INDEX idx_page_stats_event_id ON page_stats \(event_id\)/.test(sql)).length,1);
		assert.equal(statements.filter(sql=>/^ALTER TABLE analytics_visitors ADD COLUMN event_id/.test(sql)).length,0);
	}
});
