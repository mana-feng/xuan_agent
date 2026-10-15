const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const root = path.resolve(__dirname,'../..');
const {createRequire} = require('module');
const req = createRequire(path.join(root,'frontend-docker/package.json'));
require(path.join(root,'frontend-docker/tests/helpers/load-source.cjs')).resetPlatform();
const {createPinia,setActivePinia} = req('pinia'); setActivePinia(createPinia());
const {useBaziStore} = require(path.join(root,'frontend-docker/src/store/bazi.ts'));
const {calendarTimestamp,resolveCalendar} = require(path.join(root,'frontend-docker/src/utils/calendarContext.ts'));
const {timeQiGua} = require(path.join(root,'frontend-docker/src/features/liuyao/qiGua.ts'));
const {compileNajia,getNaja,getGod6} = require(path.join(root,'frontend-docker/src/features/liuyao/najiaCore.ts'));
const {computeDaily} = require(path.join(root,'frontend-docker/src/features/liuyao/dateNajia.ts'));
const sourceDir = path.join(root,'.local-dev/algorithm-site-review');
const manifest = require('./sources.json');
for (const [name, metadata] of Object.entries(manifest)) {
  const content = fs.readFileSync(path.join(sourceDir,name));
  if (crypto.createHash('sha256').update(content).digest('hex') !== metadata.sha256) throw new Error('Baseline hash mismatch: '+name);
}
const ts = req('typescript');
for (const [source,target] of [['hexagram-data.js','data.cjs'],['hexagram-liuyao.js','liuyao.cjs']]) {
  const code=fs.readFileSync(path.join(sourceDir,source),'utf8').replace("'./data.js'","'./data.cjs'");
  fs.writeFileSync(path.join(sourceDir,target),ts.transpileModule(code,{compilerOptions:{allowJs:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);
}
const sandbox = {window:{}};
const paipanSource = fs.readFileSync(path.join(sourceDir,'paipan.js'),'utf8');
// Source inspected: pure constructor and tables; its only browser effect is assigning window.p.
vm.runInNewContext(paipanSource,sandbox,{timeout:5000});
const baseline = sandbox.window.p;
const hexagram = require(path.join(sourceDir,'liuyao.cjs')), data = require(path.join(sourceDir,'data.cjs'));
const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
const dates = ['1900-01-01','1900-01-31','1991-07-01','2020-01-25','2020-06-06','2020-06-07','2023-01-21','2023-01-22','2023-03-22','2023-04-05','2023-04-06','2023-04-19','2023-04-20','2024-02-03','2024-02-04','2024-02-05','2024-02-09','2024-02-10','2024-03-10','2024-11-03','2033-12-22','2034-01-05','2099-12-31'];
const clocks = ['00:00:01','00:59:59','01:00:01','12:30:00','22:59:59','23:00:01','23:59:59'];
const zones = ['Asia/Shanghai','America/New_York','Europe/London','Asia/Kathmandu'];
const hosts = ['Asia/Shanghai','America/New_York','UTC'];
const result = {generatedAt:new Date().toISOString(), baseline:{repository:'https://github.com/hkargv/paipan',commit:'0785b33e14c9e57a49cfd6e78d84510de30eaa60',sha256:crypto.createHash('sha256').update(paipanSource).digest('hex'),note:'GetGZ zwz=true corresponds to midnight day pillar, zwz=false to 23:00 day pillar. No baseline source changes; lunar correction shares ShouXing lineage.'}, bazi:{cases:0,differences:[]}, liuyaoCalendar:{cases:0,differences:[]}, timeCasting:{cases:0,differences:[]}, structure:{cases:0,differences:[],changedRelativesDifferent:0}, solarTerm:{cases:0,differences:[]}, skippedDSTGaps:0};
function pillars(y,m,d,h,mi,s,divide) {
  baseline.zwz = divide === 'midnight';
  const [tg,dz] = baseline.GetGZ(y,m,d,h,mi,s);
  return Object.fromEntries(['year','month','day','time'].map((key,i) => [key,GAN[tg[i]]+ZHI[dz[i]]]));
}
const equals = (a,b) => Object.keys(b).every(k => a[k] === b[k]);
let currentSample;
process.on('unhandledRejection', error => { console.error('CURRENT SAMPLE', JSON.stringify(currentSample)); throw error; });
async function main() {
const originalTZ = process.env.TZ;
for (const date of dates) for (const clock of clocks) for (const zone of zones) for (const divide of ['midnight','zi']) {
  let timestamp;
  try { timestamp = calendarTimestamp(date+' '+clock,zone,'earlier'); } catch (error) { if (/不存在/.test(error.message)) {result.skippedDSTGaps++;continue;} throw error; }
  const parts = (date+' '+clock).match(/\d+/g).map(Number);
  const expected = pillars(...parts,divide);
  const rules = {dayDivide:divide,yearDivide:'lichun',leapMonth:'add-twelve'};
  const calculation = resolveCalendar(timestamp,'bazi',{timeZone:zone,rules});
  for (const host of hosts) {
    process.env.TZ = host;
    currentSample={date,clock,zone,divide,host};
    const bazi = useBaziStore(); bazi.pull({timestamp,gender:0,calculation});
    await new Promise(resolve => setTimeout(resolve, 0));
    result.bazi.cases++;
    if (!equals(bazi.sizhu,expected)) result.bazi.differences.push({date,clock,zone,host,divide,expected,actual:JSON.parse(JSON.stringify(bazi.sizhu))});
    const actual = computeDaily(new Date(timestamp),{timeZone:zone,rules}).gz;
    result.liuyaoCalendar.cases++;
    if (!equals({...actual,time:actual.hour},expected)) result.liuyaoCalendar.differences.push({date,clock,zone,host,divide,expected,actual});
  }
  let [y,m,d,h,mi,s] = parts;
  if (h === 23 && divide === 'zi') { const next = new Date(Date.UTC(y,m-1,d+1)); y=next.getUTCFullYear();m=next.getUTCMonth()+1;d=next.getUTCDate(); }
  const lunar = baseline.Solar2Lunar(y,m,d);
  for (const yearDivide of ['lichun','lunar']) for (const leapMonth of ['add-twelve','same-month']) {
    const year = yearDivide === 'lunar' ? ((lunar[0]-4)%12+12)%12+1 : ZHI.indexOf(expected.year[1])+1;
    const month = lunar[1] + (lunar[3] && leapMonth==='add-twelve' ? 12:0), hour = h===23 ? 1 : Math.floor((h+1)/2)+1;
    const base=year+month+lunar[2], withHour=base+hour;
    const up=data.ORDER[(base%8+7)%8], down=data.ORDER[(withHour%8+7)%8], moving=(withHour%6+5)%6;
    const expectedParams=[...data.YAO[down],...data.YAO[up]];
    expectedParams[moving] = expectedParams[moving]===1?3:4;
    for (const host of hosts) {
      process.env.TZ=host;
      const actual=timeQiGua(new Date(timestamp),{timeZone:zone,rules:{dayDivide:divide,yearDivide,leapMonth}});
      result.timeCasting.cases++;
      if (JSON.stringify(actual)!==JSON.stringify(expectedParams)) result.timeCasting.differences.push({date,clock,zone,host,divide,yearDivide,leapMonth,expected:expectedParams,actual,lunar:lunar.slice(0,4)});
    }
  }
}
process.env.TZ='Asia/Shanghai';
for (let n=0;n<4096;n++) {
  const params=Array.from({length:6},(_,i)=>[0,1,3,4][(n>>(i*2))&3]);
  const actual=compileNajia(params,{date:new Date('2026-10-15T12:00:00+08:00'),timeZone:'Asia/Shanghai'});
  const expected=hexagram.paipan(params.map(v=>({0:8,1:7,3:9,4:6})[v]),actual.dayGz);
  const same=actual.gong===expected.本卦.宫 && actual.shiy[0]===expected.本卦.世爻 && actual.shiy[1]===expected.本卦.应爻 && JSON.stringify(getNaja(actual.mark))===JSON.stringify(expected.本卦.纳甲) && JSON.stringify(actual.qin6)===JSON.stringify(expected.本卦.六亲) && JSON.stringify(actual.god6)===JSON.stringify(expected.六神) && (actual.bian?.mark||null)===(expected.变卦?.爻.join('')||null);
  result.structure.cases++;
  if (!same) result.structure.differences.push({params});
  if (actual.bian && JSON.stringify(actual.bian.qin6)!==JSON.stringify(expected.变卦.六亲)) result.structure.changedRelativesDifferent++;
}
for (const clock of ['16:26:59','16:27:30']) for (const zone of zones) {
  const date='2024-02-04', parts=(date+' '+clock).match(/\d+/g).map(Number);
  const timestamp=calendarTimestamp(date+' '+clock,zone), expected=pillars(...parts,'midnight');
  const store=useBaziStore();store.pull({timestamp,gender:0,timeZone:zone});result.solarTerm.cases++;
  if (!equals(store.sizhu,expected)) result.solarTerm.differences.push({date,clock,zone,expected,actual:JSON.parse(JSON.stringify(store.sizhu))});
}
if (originalTZ===undefined) delete process.env.TZ;else process.env.TZ=originalTZ;
fs.writeFileSync(path.join(__dirname,'boundary-results.json'),JSON.stringify(result,null,2));
if (['bazi','liuyaoCalendar','timeCasting','structure','solarTerm'].some(key=>result[key].differences.length)) process.exitCode=1;
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v?.cases===undefined?v:{cases:v.cases,differences:v.differences.length,examples:v.differences.slice(0,2),changedRelativesDifferent:v.changedRelativesDifferent} ])),null,2));

}
main().catch(error => { console.error(error); process.exitCode=1; });
