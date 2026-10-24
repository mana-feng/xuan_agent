// Development-only reference exporter. Never bundled in Android runtime.
// node tools/export-najia-qimen.cjs <frontend checkout>
const fs = require('fs'), path = require('path'), Module = require('module'), crypto = require('crypto');
const frontend = path.resolve(process.argv[2] || 'F:/github/xuan_agent/.local-dev/worktrees/frontend-sync');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(frontend, 'node_modules/typescript'));
const oldResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return oldResolve.call(this, request.startsWith('@/') ? path.join(frontend, 'src', request.slice(2)) : request, ...args); };
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, esModuleInterop:true } }).outputText, f);
const najia = require(path.join(frontend,'src/features/liuyao/najiaCore.ts'));
const constants = require(path.join(frontend,'src/features/liuyao/najiaConst.ts'));
const cast = require(path.join(frontend,'src/features/liuyao/qiGua.ts'));
const qimen = require(path.join(frontend,'vendor/qfdk-qimen/lib/qimen.js'));
const {Solar} = require(path.join(frontend,'node_modules/lunar-javascript'));
const out = path.join(root,'android-app/core/src/test/resources');
fs.mkdirSync(out,{recursive:true});
const join = x => x ? x.join(',') : '';
function sig(c) { return [c.mark,c.name,c.gong,c.type,join(c.shiy.slice(0,2)),join(c.qin6),join(c.qinx),join(c.god6),join(c.dong),c.hide ? join(c.hide.seat):'',c.hide?join(c.hide.qin6):'',c.hide?join(c.hide.qinx):'',c.bian?.mark||'',c.bian?.name||'',c.bian?.gong||'',c.bian?join(c.bian.qin6):'',c.bian?join(c.bian.qinx):''].join('|'); }
const cases = [];
for(let i=0;i<64;i++) for(const moving of [false,true]) { const a=i.toString(2).padStart(6,'0').split('').map(Number).map(v=>moving?(v?3:4):v); cases.push([a.join(','),sig(najia.compileNajia(a,{date:new Date('2024-02-10T04:30:00Z'),timeZone:'Asia/Shanghai',dayGz:'甲辰'}))].join('\t')); }
fs.writeFileSync(path.join(out,'liuyao-reference.tsv'),cases.join('\n')+'\n');
fs.writeFileSync(path.join(root,'android-app/core/src/main/resources/liuyao-names.tsv'),Object.entries(constants.GUA64).map(([k,v])=>k+'\t'+v).join('\n')+'\n');
const dates = ['1900-01-01T00:00:00','2099-12-31T23:00:00','2024-02-10T12:30:00','2024-02-10T22:59:59','2024-02-10T23:00:00','2024-06-21T04:50:45','2024-06-21T04:51:00','2024-12-21T17:20:19','2024-12-21T17:21:00'];
// Scan all double hours in both seasons: covers center lodging, all xun heads and both directions.
for(const month of [1,7]) for(let day=1;day<=30;day+=3) for(let hour=0;hour<24;hour+=2) dates.push('2024-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')+'T'+String(hour).padStart(2,'0')+':00:00');
const qlines=dates.map(civil=>{ const [y,m,d,h,mi,s]=civil.split(/\D/).map(Number); const c=qimen.calculate(Solar.fromYmdHms(y,m,d,h,mi,s),{method:'时家'}); if(c.error)throw Error(c.message); const board=k=>Array.from({length:9},(_,i)=>c[k][i+1]||'').join(','); return [civil,[c.siZhu.year,c.siZhu.month,c.siZhu.day,c.siZhu.time,c.juShu.jieQiName,c.juShu.type,c.juShu.number,c.juShu.yuan,c.xunShou,c.dayXunShou,c.zhiFuGong,c.zhiFuYuanGong,c.zhiFuXing,c.zhiShiGong,c.zhiShiMen,join(c.kongWangZhi),join(c.kongWangGong),c.maStar.zhi,c.maStar.gong,...['diPan','tianPan','jiuXing','baMen','baShen','anGan'].map(board)].join('|')].join('\t'); });
fs.writeFileSync(path.join(out,'qimen-reference.tsv'),qlines.join('\n')+'\n');
const casting = ['2024-02-10T12:30:00','2023-03-25T23:00:00','2024-02-03T23:00:00'].flatMap(civil=>['midnight','zi'].flatMap(dayDivide=>['lichun','lunar'].flatMap(yearDivide=>['add-twelve','same-month'].map(leapMonth=>[civil,dayDivide,yearDivide,leapMonth,cast.timeQiGua(new Date(civil+'+08:00'),{timeZone:'Asia/Shanghai',rules:{dayDivide,yearDivide,leapMonth}}).join(',')].join('\t')))));
fs.writeFileSync(path.join(out,'liuyao-casting.tsv'),casting.join('\n')+'\n');
console.log(JSON.stringify({liuyao:cases.length,qimen:qlines.length,casting:casting.length,sha256:crypto.createHash('sha256').update(cases.join('\n')+qlines.join('\n')).digest('hex')}));
