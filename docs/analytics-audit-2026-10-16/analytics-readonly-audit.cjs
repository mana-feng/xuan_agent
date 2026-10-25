const fs = require('fs');
const vm = require('vm');
const ts = require('F:/github/xuan_agent/frontend-docker/node_modules/typescript');
const root = 'F:/github/xuan_agent/frontend-docker/src';
function compile(file) { return ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS }}).outputText; }
const analyticsCode = compile(root + '/utils/analytics.ts');
const composableCode = compile(root + '/composables/usePageAnalytics.ts');
function storage(map = new Map()) { return {getItem:key=>map.get(key)??null,setItem:(key,val)=>map.set(key,String(val)),map}; }
function analytics({ ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.0', width=1421, session=storage(), local=storage(), beacon=true, url='https://xuan.example/#/pages/index/index?utm_source=hash-campaign' }={}) {
 const sent=[]; let now=1000000;
 class AuditDate extends Date {constructor(...args){super(...(args.length?args:[now]));} static now(){return now;}}
 const location=new URL(url);
 const context={exports:{}, console:{log(){},warn(){}}, Date:AuditDate,Math,URL,Intl,Blob:class{constructor(parts){this.text=parts.join('')}},navigator:{userAgent:ua,language:'zh-CN',maxTouchPoints:0,sendBeacon:(url,blob)=>{sent.push(JSON.parse(blob.text));return beacon}}, window:{innerWidth:width,innerHeight:890,location,screen:{width:1920,height:1080,colorDepth:24},devicePixelRatio:1},document:{referrer:'https://www.google.com/search?q=test',title:'Audit',characterSet:'UTF-8'},location,performance:{getEntriesByType:()=>[]},sessionStorage:session,localStorage:local};
 vm.runInNewContext(analyticsCode,context);
 return {api:context.exports,sent,session,local,setTime(value){now=value},context};
}
function composable(loaded=true) {
 let pv=0; const queues=[];const teardown=[];const listeners=new Map(); const config={loaded};
 const window={addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)};
 const history={pushState(){},replaceState(){}};
 const context={exports:{},window,history,setTimeout:fn=>queues.push(fn),require(name){if(name==='vue')return{watch(){return()=>{}},onUnmounted:fn=>teardown.push(fn)};if(name.includes('appConfig'))return{useAppConfigStore:()=>config};if(name.includes('analytics'))return{trackPageView:()=>pv++};throw new Error(name)}};
 vm.runInNewContext(composableCode,context);
 return {api:context.exports,history,teardown,getPv:()=>pv,flush(){while(queues.length)queues.shift()()},emit(name){for(const fn of listeners.get(name)??[])fn()},listenerCount:name=>listeners.get(name)?.size??0};
}
const output={};
{
 const c=composable();c.api.usePageAnalytics();const start=c.getPv();c.emit('popstate');c.emit('hashchange');c.flush();output.singleHashBack={initial:start,afterOneBack:c.getPv(),extra:c.getPv()-start};
 c.teardown[0]();c.api.usePageAnalytics();const before=c.getPv();c.history.pushState({},'', '#next');c.flush();output.remountHistoryPatch={pvForSinglePush:c.getPv()-before};
}
{
 const c=composable();c.api.usePageAnalytics();c.api.usePageAnalytics();c.teardown[0]();output.multipleOwners={hashListenersAfterOneOwnerUnmount:c.listenerCount('hashchange')};
 const failed=composable(false);failed.api.usePageAnalytics();failed.emit('hashchange');failed.flush();output.failedBootstrap={pageviews:failed.getPv(),listeners:failed.listenerCount('hashchange')};
}
{
 const a=analytics();a.api.collectPageView();const edge=a.sent.at(-1);output.edge={browser:edge.browser,browserVersion:edge.browserVersion,os:edge.os,osVersion:edge.osVersion,utmSource:edge.utmSource??null};
 const ios=analytics({ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',width:390});ios.api.collectPageView();output.ios={browser:ios.sent[0].browser,browserVersion:ios.sent[0].browserVersion,os:ios.sent[0].os,osVersion:ios.sent[0].osVersion};
 a.setTime(1030000);a.api.collectPageView();const b=analytics({session:a.session,local:a.local});b.setTime(1120000);b.api.collectPageView();output.refresh={before:{id:a.sent[1].sessionId,duration:a.sent[1].sessionDuration,entry:a.sent[1].isEntryPage},after:{id:b.sent[0].sessionId,duration:b.sent[0].sessionDuration,entry:b.sent[0].isEntryPage}};
 const b2=analytics({session:a.session,local:a.local});b2.api.collectPageView();output.clonedTabSession={sameId:b2.sent[0].sessionId===a.sent[0].sessionId};
 const f=analytics({beacon:false});f.api.collectPageView();output.failedBeacon={attempts:f.sent.length};
}
console.log(JSON.stringify(output,null,2));
