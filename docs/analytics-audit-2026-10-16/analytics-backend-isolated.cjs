// Read-only isolated audit. No real database, HTTP server, environment file, or model access.
// Original source is executed in a VM; MySQL DATE_SUB/ANY_VALUE are adapted for SQLite.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const root='F:/github/xuan_agent';process.env.TZ='Asia/Singapore';
const source=fs.readFileSync(root+'/backend-docker/routes/stats.js','utf8'),admin=fs.readFileSync(root+'/backend-docker/routes/admin.js','utf8');
const RealDate=Date,fixed='2026-10-16T00:30:00+08:00';
class FixedDate extends RealDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return new RealDate(fixed).getTime();}}
function setup(){
 const sql=new DatabaseSync(':memory:');sql.function('NOW',()=>new FixedDate().toISOString().slice(0,19).replace('T',' '));sql.function('CONCAT',(...a)=>a.join(''));
 for(const table of ['analytics_visitors','analytics_sessions']){
  const columns=source.match(new RegExp('INSERT INTO '+table+' \\(([\\s\\S]*?)\\) VALUES'))[1].split(',').map(s=>s.trim());
  sql.exec(`CREATE TABLE ${table} (${columns.map(c=>c+(((c==='visitor_id'&&table==='analytics_visitors')||(c==='session_id'&&table==='analytics_sessions'))?' TEXT PRIMARY KEY':c==='pvid'&&table==='analytics_visitors'?' TEXT UNIQUE':'')).join(',')})`);
 }
 const columns=[...source.split('const valueMap = {')[1].split('\n\t\t};')[0].matchAll(/^\s*(\w+):/gm)].map(m=>m[1]);columns.push('url','pathname');
 sql.exec(`CREATE TABLE page_stats (id INTEGER PRIMARY KEY,${columns.join(',')},created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
 const errors=[];let fail=false;
 const fix=s=>s.replace(/DATE_SUB\(\?, INTERVAL \? MINUTE\)/g,"datetime(?, '-' || ? || ' minutes')").replace(/ANY_VALUE\(title\)/g,'MAX(title)');
 const db={get:async(s,p=[])=>sql.prepare(fix(s)).get(...p),all:async(s,p=[])=>s.includes('information_schema')?columns.map(COLUMN_NAME=>({COLUMN_NAME})):sql.prepare(fix(s)).all(...p),run:async(s,p=[])=>{if(fail&&s.startsWith('INSERT INTO page_stats')){fail=false;throw Error('injected insert failure');}const r=sql.prepare(fix(s)).run(...p);return {lastID:r.lastInsertRowid,changes:r.changes};}};
 let page,aggregate;const consoleMock={log(){},error:(...a)=>errors.push(a[1])};
 vm.runInNewContext(source,{require:n=>n==='express'?{Router:()=>({post:(p,f)=>page=f})}:n==='crypto'?crypto:{getDatabase:()=>db},module:{exports:{}},process:{env:{}},Date:FixedDate,URL,Buffer,console:consoleMock});
 const start=admin.indexOf("router.get('/stats/analytics'");
 const register=(adapter)=>{let handler;vm.runInNewContext(admin.slice(start,admin.indexOf('\n});',start)+4),{router:{get:(p,m,f)=>handler=f},adminMiddleware:()=>{},db:adapter,Date:FixedDate,console:consoleMock});return handler;};
 aggregate=register(db);const res=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(v){this.body=v;}});
 return {sql,db,errors,failNext:()=>fail=true,send:async(body={},ip='8.8.8.8')=>{const r=res();await page({ip,body:{url:'https://example.test/#/pages/index/index',timestamp:fixed,pvid:'v1',sessionId:'s1',userAgent:'UA',referrer:'https://referrer.test',searchKeyword:'chart',...body}},r);return r;},analytics:async(adapter)=>{const r=res();await (adapter?register(adapter):aggregate)({},r);return r;}};
}
(async()=>{
 let x=setup();const first=await x.send(),changed=await x.send({},'1.1.1.1');console.log('IDENTITY_CHANGE',JSON.stringify({statuses:[first.statusCode,changed.statusCode],pageviews:x.sql.prepare('SELECT COUNT(*) n FROM page_stats').get().n,errors:x.errors}));
 x=setup();await x.send({timestamp:'2026-10-15T20:00:00Z'});await x.send({timestamp:'2026-10-15T21:00:00Z'});console.log('TIMEOUT',JSON.stringify({visitor:x.sql.prepare('SELECT session_count FROM analytics_visitors').get(),sessions:x.sql.prepare('SELECT session_id,started_at,pageview_count,is_bounce FROM analytics_sessions').all(),pages:x.sql.prepare('SELECT session_page_index,session_started_at FROM page_stats').all()}));
 x=setup();for(const route of ['index/index','chat/chat','history/list'])await x.send({url:'https://example.test/#/pages/'+route});let a=await x.analytics();console.log('METRICS_HASH_SQL_TIMEZONE',JSON.stringify({pageviews:a.body.data.totalPageviews,unique:a.body.data.uniqueVisitors,new:a.body.data.newVisitorCount,returning:a.body.data.returningVisitorCount,topReferrers:a.body.data.topReferrers,searchKeywords:a.body.data.searchKeywords,topPages:a.body.data.topPages,storedDates:x.sql.prepare('SELECT visit_date,visit_hour,day_of_week FROM page_stats LIMIT 1').get(),errors:x.errors}));
 const broken=await x.analytics({get:async()=>{throw Error('database unavailable')},all:async()=>{throw Error('database unavailable')}});console.log('READ_FAILURE',JSON.stringify({status:broken.statusCode,success:broken.body.success,total:broken.body.data.totalPageviews,unique:broken.body.data.uniqueVisitors}));
 x=setup();x.failNext();const failed=await x.send(),retry=await x.send();console.log('PARTIAL_WRITE',JSON.stringify({statuses:[failed.statusCode,retry.statusCode],visitor:x.sql.prepare('SELECT pageview_count FROM analytics_visitors').get(),session:x.sql.prepare('SELECT pageview_count,is_bounce FROM analytics_sessions').get(),pages:x.sql.prepare('SELECT COUNT(*) n,SUM(is_new_visitor) new,SUM(session_page_index) page_index FROM page_stats').get()}));
 x=setup();await x.send();await x.send();console.log('DUPLICATE_PAYLOAD',JSON.stringify({pageviews:x.sql.prepare('SELECT COUNT(*) n FROM page_stats').get().n,session:x.sql.prepare('SELECT pageview_count,is_bounce FROM analytics_sessions').get()}));
 x=setup();const concurrent=await Promise.all([x.send(),x.send()]);console.log('CONCURRENT_FIRST_REQUESTS',JSON.stringify({statuses:concurrent.map(r=>r.statusCode),errors:x.errors}));
})();
