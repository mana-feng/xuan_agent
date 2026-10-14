'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {root,f,B,S,cn,parts,natal,expected}=require('./oracle.cjs');
const out=__dirname;
const {resetPlatform}=require(path.join(root,'frontend-docker/tests/helpers/load-source.cjs'));
const {createPinia,setActivePinia}=require(path.join(root,'frontend-docker/node_modules/pinia'));
const {useZiweiStore}=require(path.join(root,'frontend-docker/src/store/ziwei.ts'));
const pad=n=>String(n).padStart(2,'0');
const births=[];
for(let m=1;m<=12;m++)for(const gender of [0,1])births.push({id:`birth-${m}-${gender}`,civil:`1952-${pad(m)}-15 ${pad((m-1)*2)}:30`,gender,timeZone:'Asia/Shanghai',offset:'+08:00'});
births.push({id:'birth-leap-before',civil:'2023-04-05 12:00',gender:0,timeZone:'Asia/Shanghai',offset:'+08:00'},{id:'birth-leap-after',civil:'2023-04-06 12:00',gender:1,timeZone:'Asia/Shanghai',offset:'+08:00'},{id:'birth-latezi-newyear',civil:'2023-01-21 23:30',gender:1,timeZone:'America/New_York',offset:'-05:00'});
const samples=[];
const add=(birth,target,group)=>samples.push({id:`${birth.id}/${target}`,birth,target,group});
for(const birth of births.slice(0,24))for(let y=1984;y<2044;y++)for(const m of [1+((y-1984)%12),1+((y-1978)%12)])add(birth,`${y}-${pad(m)}-15 ${pad(((y-1984)%12)*2)}:30`,'60-year-cycle');
for(let day=0;day<60;day++)for(const h of [...Array.from({length:12},(_,i)=>i*2),23])add(births[0],`${new Date(Date.UTC(2024,0,1+day)).toISOString().slice(0,10)} ${pad(h)}:30`,'60-day-all-hours');
const boundaryDates=['2023-01-21','2023-01-22','2024-02-03','2024-02-04','2024-02-09','2024-02-10','2023-03-21','2023-03-22','2023-04-05','2023-04-06','2023-04-19','2023-04-20','2033-12-21','2033-12-22','2034-01-04','2034-01-05'];
for(const birth of [births[0],...births.slice(24)])for(const date of boundaryDates)for(const hour of ['00:00','00:59','01:00','22:59','23:00','23:59'])if(+date.slice(0,4)>=+birth.civil.slice(0,4))add(birth,`${date} ${hour}`,'calendar-boundary');
for(const birth of births.slice(0,24))for(let age=1;age<=123;age+=1)if(age<=7||age%10<=1)add(birth,`${1952+age-1}-06-15 12:00`,'age-boundary');
const alias={'魁':'天魁','钺':'天钺','昌':'文昌','曲':'文曲','禄':'禄存','羊':'擎羊','陀':'陀罗','马':'天马','鸾':'红鸾','喜':'天喜'};
function actual(h){
 const l=h.lunarDate; // Lunar calendar numeric expectations separately checked via independent target rule; parse product calendar from raw string.
 const values={'age.nominalAge':h.age.nominalAge,'calendar.solarDate':h.solarDate.split('-').map((x,i)=>i?pad(x):x).join('-')};
 values['age.index']=h.age.index;
 h.age.palaceNames.forEach((v,i)=>values[`age.palace.${B[(i+2)%12]}`]=v);
 for(const scope of ['decadal','yearly','monthly','daily','hourly']){
  const s=h[scope];values[`${scope}.index`]=s.index;values[`${scope}.stem`]=s.heavenlyStem;values[`${scope}.branch`]=s.earthlyBranch;
  s.palaceNames.forEach((v,i)=>values[`${scope}.palace.${B[(i+2)%12]}`]=v);
  s.mutagen.forEach((v,i)=>values[`${scope}.mutagen.${'禄权科忌'[i]}`]=v);
  s.stars.forEach((stars,i)=>stars.forEach(star=>values[`${scope}.star.${star.name==='年解'?'年解':alias[star.name.slice(-1)]}`]=B[(i+2)%12]));
  if(scope==='yearly')for(const k of ['suiqian12','jiangqian12'])s.yearlyDecStar[k].forEach((v,i)=>values[`yearly.${k}.${B[(i+2)%12]}`]=v);
 }
 return values;
}
const school={戊:['太阳','右弼'],庚:['天府','太阴'],壬:['天府','左辅']};
const rows=[],fieldStats={},groups={},coverage={};let currentBirth,store,base;
const counts={cases:0,fields:0,equal:0,schoolDifference:0,confirmedRuleMismatch:0,unresolved:0,domainCases:0,domainRejected:0,rawFortelPalaceCompared:0,rawFortelPalaceEqual:0,rawFortelPalaceDifference:0};
for(const sample of samples){
 if(currentBirth!==sample.birth.id){resetPlatform();setActivePinia(createPinia());store=useZiweiStore();store.pull({...sample.birth,timestamp:Date.parse(sample.birth.civil.replace(' ','T')+sample.birth.offset)});base=natal(sample.birth.civil,sample.birth.gender);currentBirth=sample.birth.id;}
 const pp=parts(sample.target,false);const target=new Date(pp.year,pp.month-1,pp.day,pp.hour,pp.minute);
 store.setTimelineSelection({mode:'monthly',date:target});
 const h=store.currentHoroscope,e=expected(base,sample.target);
 if(e.fields['age.nominalAge']<1){
   counts.cases++;counts.domainCases++;counts.fields++;
   const differences=h?[{field:'domain.accepted',expected:false,actual:true,classification:'invalid-nominal-age'}]:[];
   if(!h){counts.domainRejected++;counts.equal++;}else{counts.confirmedRuleMismatch++;}
   rows.push({sample,expected:{'domain.accepted':false},actual:{'domain.accepted':!!h},differences,rawFortelPalaceDifferences:[]});
   continue;
 }
 if(!h)throw Error(`Unexpected rejected valid fixture ${sample.id}`);
 const a=actual(h);
 // Numeric lunar conversion uses production's actual returned lunarDate, avoiding another shared calendar as oracle.
 const lunarText=h.lunarDate;const match=/^([〇零一二三四五六七八九\d]+)年(闰)?(.+)月(.+)$/.exec(lunarText);
 if(!match)throw Error(`Unexpected lunar format: ${lunarText}`);
 const months=['正','二','三','四','五','六','七','八','九','十','冬','腊'];
 const days=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
 const year=Number(match[1].replace(/[〇零一二三四五六七八九]/g,c=>c==='〇'?0:'零一二三四五六七八九'.indexOf(c)));
 Object.assign(a,{'calendar.lunarYear':year,'calendar.lunarMonth':months.indexOf(match[3])+1,'calendar.lunarDay':days.indexOf(match[4])+1,'calendar.isLeap':!!match[2]});
 assert.equal(Object.keys(a).length,189);
 assert.deepEqual(Object.keys(a).sort(),Object.keys(e.fields).sort());
 const differences=[];const late=pp.hour===23;
 for(const [field,value] of Object.entries(e.fields)){
  const scope=field.split('.')[0], stat=fieldStats[field]||={compared:0,equal:0,schoolDifference:0,confirmedRuleMismatch:0,unresolved:0};
  counts.fields++;stat.compared++;
  if(a[field]===value){counts.equal++;stat.equal++;continue;}
  const rule=school[e.fields[`${scope}.stem`]];
  const isSchool=field.endsWith('.mutagen.科')&&rule&&value===rule[0]&&a[field]===rule[1];
  const kind=isSchool?'schoolDifference':late?'confirmedRuleMismatch':'unresolved';
  counts[kind]++;stat[kind]++;differences.push({field,expected:value,actual:a[field],classification:isSchool?'documented-sihua-school':late?'late-zi-full-date-rule-violation':'unresolved'});
 }
 const rawDifferences=[];
 for(const [field,value]of Object.entries(e.rawFields)){counts.rawFortelPalaceCompared++;if(a[field]===value)counts.rawFortelPalaceEqual++;else{counts.rawFortelPalaceDifference++;rawDifferences.push({field,rawFortel:value,actual:a[field],classification:e.childhood?'childhood-convention':e.lunar.isLeapMonth?'leap-month-convention':'unresolved'});}}
 for(const scope of Object.keys(e.scope)){const c=coverage[scope]||={stems:new Set(),branches:new Set(),palaces:new Set()};c.stems.add(e.fields[`${scope}.stem`]);c.branches.add(e.fields[`${scope}.branch`]);c.palaces.add(e.fields[`${scope}.index`]);}
 const g=groups[sample.group]||={cases:0,identical:0,schoolOnly:0,mismatch:0};g.cases++;if(!differences.length)g.identical++;else if(differences.every(d=>d.classification==='documented-sihua-school'))g.schoolOnly++;else g.mismatch++;
 counts.cases++;rows.push({sample,expected:e.fields,actual:a,differences,rawFortelPalaceDifferences:rawDifferences});
 if(counts.cases%1000===0)console.log(JSON.stringify(counts));
}
for(const c of Object.values(coverage))for(const k of Object.keys(c))c[k]=[...c[k]].sort();
const hash=relative=>({file:relative,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')});
const jsFiles=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?jsFiles(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const manifest=['frontend-docker/src/store/ziwei.ts','frontend-docker/src/utils/ziweiCalculation.ts','frontend-docker/src/utils/chartTime.ts','frontend-docker/src/utils/ziweiHoroscope.ts','frontend-docker/src/utils/ziweiTimelineDates.ts','frontend-docker/src/pages/ziwei/components/Timeline.nvue','docs/algorithm-benchmark-2026-10-13/ziwei-flows/oracle.cjs','.local-dev/ziwei-benchmark/package/src/model/runtime.ts','.local-dev/ziwei-benchmark/package/src/model/minorStar.ts','.local-dev/ziwei-benchmark/package/src/model/destinyBoard.ts',...jsFiles('.local-dev/ziwei-benchmark/package/build'),...jsFiles('frontend-docker/node_modules/iztro/lib')].map(hash);
const summary={generatedAt:new Date().toISOString(),hostZone:Intl.DateTimeFormat().resolvedOptions().timeZone,counts,groups,coverage,fieldStats,manifest};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
fs.writeFileSync(path.join(out,'all-results.jsonl.gz'),zlib.gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')));
fs.writeFileSync(path.join(out,'differences.json'),JSON.stringify(rows.filter(r=>r.differences.some(d=>d.classification!=='documented-sihua-school')).map(({sample,differences,rawFortelPalaceDifferences})=>({sample,differences,rawFortelPalaceDifferences})),null,2));
fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify(samples,null,2));
console.log(JSON.stringify({counts,groups,coverage},null,2));
if(counts.unresolved||counts.confirmedRuleMismatch)process.exitCode=1;
