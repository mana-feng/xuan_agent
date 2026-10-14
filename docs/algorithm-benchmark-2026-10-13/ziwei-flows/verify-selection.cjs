'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {root,f,parts,natal,expected}=require('./oracle.cjs');
const extendedCalendar=require('./sxtwl-calendar.cjs');
const ts=require(path.join(root,'frontend-docker/node_modules/typescript'));
const {parse,compileScript}=require(path.join(root,'frontend-docker/node_modules/@vue/compiler-sfc'));
const {resetPlatform}=require(path.join(root,'frontend-docker/tests/helpers/load-source.cjs'));
const {reactive}=require(path.join(root,'frontend-docker/node_modules/vue'));
const {calculateZiwei}=require(path.join(root,'frontend-docker/src/utils/ziweiCalculation.ts'));
const file=path.join(root,'frontend-docker/src/pages/ziwei/components/Timeline.nvue');
const {descriptor}=parse(fs.readFileSync(file,'utf8'),{filename:file});
const compiled=compileScript(descriptor,{id:'independent-flow-selection'});
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
const orig=Module._load;Module._load=function(request,...args){const v=orig.call(this,request,...args);return request==='vue'?{...v,onBeforeUnmount(){}}:v;};
try{mod._compile(ts.transpileModule(compiled.content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);}finally{Module._load=orig;}
resetPlatform();
const birth=natal('2003-03-21 12:00',0),{chart}=calculateZiwei({gender:0,timestamp:Date.parse('2003-03-21T12:00:00+08:00'),timeZone:'Asia/Shanghai'});
const props=reactive({astrolabe:chart,viewMode:'monthly',targetDate:new Date(2023,0,25)}),events=[];
const state=mod.exports.default.setup(props,{expose(){},emit(...args){events.push(args);}});
const issues=[],counts={targets:0,yearRows:0,yearRowsMatchingIndependentAge:0,decadeSelections:0,decadeSelectionsInRange:0,monthRows:0,monthRowsMatchingIndependentDate:0,activeMonths:0,activeMonthsUnique:0};
const decadeReferences={fortel:0,sxtwl:0,skipped:0};
const civil=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const lunar=date=>(date.getFullYear()>2100?extendedCalendar:f.defaultCalendar).solar2lunar(date.getFullYear(),date.getMonth()+1,date.getDate());
for(let y=2020;y<=2035;y++)for(const [m,d]of [[1,15],[1,25],[2,4],[2,10],[2,20],[4,5],[4,6],[12,22]]){
 props.targetDate=new Date(y,m-1,d);counts.targets++;
 for(const row of state.yearList.value){counts.yearRows++;const l=lunar(row.date),age=l.lunarYear-birth.config.year+1;if(age===row.age)counts.yearRowsMatchingIndependentAge++;else issues.push({kind:'year-row-age',target:civil(props.targetDate),row:{year:row.year,age:row.age,date:civil(row.date)},expectedAge:age});}
 for(const dec of state.sortedDecades.value){
  // Fortel calendar ends 2100; sxtwl independently checks the remaining choices.
  const before=events.length;state.selectDecade(dec);const event=events[events.length-1];if(events.length===before)throw Error('No selection event');
  const date=event[1].date;decadeReferences[date.getFullYear()>2100?'sxtwl':'fortel']++;
  counts.decadeSelections++;const l=lunar(date),age=l.lunarYear-birth.config.year+1;
  if(age>=dec.range[0]&&age<=dec.range[1])counts.decadeSelectionsInRange++;else issues.push({kind:'decade-selection',target:civil(props.targetDate),range:dec.range,selected:civil(date),expectedAge:age});
 }
 for(const row of state.monthList.value){counts.monthRows++;const l=lunar(row.startDate);const want=f.defaultCalendar.lunar2solar(l.lunarYear,Math.abs(row.monthKey),1,row.monthKey<0);const expected=`${want.solarYear}-${String(want.solarMonth).padStart(2,'0')}-${String(want.solarDay).padStart(2,'0')}`;if(civil(row.startDate)===expected)counts.monthRowsMatchingIndependentDate++;else issues.push({kind:'month-row-date',target:civil(props.targetDate),monthKey:row.monthKey,actual:civil(row.startDate),expected});}
 counts.activeMonths++;const active=state.monthList.value.filter(state.isCurrentMonth);const selectedLunar=lunar(props.targetDate);const wantedMonth=selectedLunar.isLeapMonth?-selectedLunar.lunarMonth:selectedLunar.lunarMonth;
 if(active.length===1&&active[0].monthKey===wantedMonth)counts.activeMonthsUnique++;else issues.push({kind:'active-month',target:civil(props.targetDate),actual:active.map(x=>x.monthKey),expected:wantedMonth});
}
const boundaries=[];
for(const day of ['2024-02-09','2023-03-21','2023-04-04','2023-04-05','2033-12-21','2034-01-19'])for(const hour of [22,23,0]){
 const [y,m,d]=day.split('-').map(Number);const date=new Date(y,m-1,d+(hour===0?1:0),hour,30);props.targetDate=date;
 const target=`${civil(date)} ${hour}:30`,want=expected(birth,target),h=state.currentHoroscope.value;
 const active=state.monthList.value.filter(state.isCurrentMonth),month=want.lunar.isLeapMonth?-want.lunar.lunarMonth:want.lunar.lunarMonth;
 const expectedFields={age:want.fields['age.nominalAge'],year:want.lunar.lunarYear,month,yearStem:want.fields['yearly.stem'],yearBranch:want.fields['yearly.branch'],monthStem:want.fields['monthly.stem'],monthBranch:want.fields['monthly.branch'],displayedMonthGanZhi:want.fields['monthly.stem']+want.fields['monthly.branch'],dayIndex:want.fields['daily.index'],hourIndex:want.fields['hourly.index']};
 const actual={age:h?.age.nominalAge,year:state.activeYearItem.value?.year,month:active.length===1?active[0].monthKey:null,yearStem:h?.yearly.heavenlyStem,yearBranch:h?.yearly.earthlyBranch,monthStem:h?.monthly.heavenlyStem,monthBranch:h?.monthly.earthlyBranch,displayedMonthGanZhi:active.length===1?state.monthGanZhi(active[0]):null,dayIndex:h?.daily.index,hourIndex:h?.hourly.index};
 const differences=Object.keys(expectedFields).filter(k=>expectedFields[k]!==actual[k]).map(field=>({field,expected:expectedFields[field],actual:actual[field]}));
 boundaries.push({target,expected:expectedFields,actual,differences});
 if(differences.length)issues.push({kind:'late-zi-selection-boundary',target,differences});
}
fs.writeFileSync(path.join(__dirname,'selection-results.json'),JSON.stringify({counts,decadeReferences,boundaryCases:boundaries.length,boundaryFields:boundaries.length*10,boundaries,issues,limitations:[]},null,2));
console.log(JSON.stringify({counts,decadeReferences,boundaryCases:boundaries.length,boundaryFields:boundaries.length*10,issues:issues.length,firstIssues:issues.slice(0,6)},null,2));
if(issues.length)process.exitCode=1;
