const fs=require('fs'),vm=require('vm');
const ts=require('F:/github/xuan_agent/frontend-docker/node_modules/typescript');
const {parse}=require('F:/github/xuan_agent/frontend-docker/node_modules/@vue/compiler-sfc');
const filename='F:/github/xuan_agent/backend-docker/admin-ui/src/pages/admin/analytics-stats.nvue';
const {descriptor}=parse(fs.readFileSync(filename,'utf8'));
const source=descriptor.scriptSetup.content+ '\nexports.audit={stats,currentPage,totalPages,paginatedVisitors,recentTrend,barHeight,loadStats};';
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const pending=[],mount=[],unmount=[],intervals=[],errors=[];
const context={exports:{},require(name){
 if(name==='vue')return{computed:fn=>({get value(){return fn()}}),reactive:x=>x,ref:x=>({value:x}),onMounted:fn=>mount.push(fn),onUnmounted:fn=>unmount.push(fn)};
 if(name.includes('store/user'))return{useUserStore:()=>({})};
 if(name.includes('api/admin'))return{getAdminAnalyticsStats:()=>new Promise(resolve=>pending.push(resolve))};throw Error(name);
},uni:{getSystemInfoSync:()=>({})},setInterval:fn=>{intervals.push(fn);return 1},clearInterval(){},console:{error:(...a)=>errors.push(a)}};
vm.runInNewContext(js,context);
(async()=>{
const a=context.exports.audit;
a.stats.dailyTrend=[{date:'2026-10-14',pv:1,uv:1},{date:'2026-10-15',pv:2,uv:1},{date:'2026-10-16',pv:3,uv:2}];
const trend=a.recentTrend.value.map(x=>x.date);
a.stats.recentVisitors=Array.from({length:41},(_,i)=>({id:i}));a.currentPage.value=3;
const before={page:a.currentPage.value,totalPages:a.totalPages.value,visible:a.paginatedVisitors.value.length};
const p1=a.loadStats(),p2=a.loadStats();pending[1]({success:true,data:{totalPageviews:20,recentVisitors:Array.from({length:10},(_,i)=>({id:i}))}});await p2;const newer=a.stats.totalPageviews;pending[0]({success:true,data:{totalPageviews:10}});await p1;
console.log(JSON.stringify({trendDates:trend,zeroCountBarHeight:a.barHeight(0,100),beforeRefresh:before,afterRefresh:{page:a.currentPage.value,totalPages:a.totalPages.value,visible:a.paginatedVisitors.value.length},responseOrder:{newer,olderOverwritesTo:a.stats.totalPageviews}},null,2));
})();
