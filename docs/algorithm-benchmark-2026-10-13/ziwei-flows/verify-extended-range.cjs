'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root,f,natal,expected}=require('./oracle.cjs');
const calendar=require('./sxtwl-calendar.cjs');
const productFields=require('./product-fields.cjs');
const {resetPlatform}=require(path.join(root,'frontend-docker/tests/helpers/load-source.cjs'));
const {calculateZiwei}=require(path.join(root,'frontend-docker/src/utils/ziweiCalculation.ts'));
const {calculateZiweiHoroscope}=require(path.join(root,'frontend-docker/src/utils/ziweiHoroscope.ts'));
const {getZiweiDateForNominalAge}=require(path.join(root,'frontend-docker/src/utils/ziweiTimelineDates.ts'));
resetPlatform();
const civil=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fromSolar=s=>new Date(s.solarYear,s.solarMonth-1,s.solarDay);
const school={'戊':['太阳','右弼'],'庚':['天府','太阴'],'壬':['天府','左辅']};
const rows=[],issues=[],counts={births:0,decadeStarts:0,lastDecadeFinalDays:0,afterLastDecade:0,fields:0,equal:0,schoolDifferences:0,rejected:0,skipped:0};
function compare(chart,birth,sample,date){
 const h=calculateZiweiHoroscope(chart,date),e=expected(birth,`${civil(date)} 0:00`,calendar);
 assert.ok(h,`Unexpected null ${JSON.stringify(sample)}`);
 const actual=productFields(h),differences=[];
 assert.equal(Object.keys(actual).length,189);assert.deepEqual(Object.keys(actual).sort(),Object.keys(e.fields).sort());
 for(const [field,value]of Object.entries(e.fields)){
  counts.fields++;
  if(actual[field]===value){counts.equal++;continue;}
  const pair=school[e.fields[`${field.split('.')[0]}.stem`]];
  const known=field.endsWith('.mutagen.科')&&pair&&pair[0]===value&&pair[1]===actual[field];
  if(known)counts.schoolDifferences++;
  const difference={field,expected:value,actual:actual[field],classification:known?'documented-sihua-school':'unresolved'};
  differences.push(difference);if(!known)issues.push({sample,...difference});
 }
 rows.push({sample,date:civil(date),expected:e.fields,actual,differences});
}
for(const birthCivil of ['1900-01-01 12:00','1900-12-31 23:30','2099-01-01 00:30','2099-12-31 23:30'])for(const gender of [0,1]){
 counts.births++;
 const birth=natal(birthCivil,gender,calendar);
 const {chart}=calculateZiwei({gender,timestamp:Date.parse(birthCivil.replace(' ','T')+':00Z'),timeZone:'UTC'});
 const decades=[...chart.palaces].sort((a,b)=>a.decadal.range[0]-b.decadal.range[0]);
 assert.equal(decades.length,12);
 for(const palace of decades){
  const age=palace.decadal.range[0],date=getZiweiDateForNominalAge(chart,age);
  const independent=fromSolar(calendar.lunar2solar(birth.config.year+age-1,1,1,false));
  const sample={birth:birthCivil,gender,kind:'decade-start',age};
  if(civil(date)!==civil(independent))issues.push({sample,field:'selection.date',expected:civil(independent),actual:civil(date)});
  counts.decadeStarts++;compare(chart,birth,sample,date);
 }
 const lastAge=decades.at(-1).decadal.range[1],next=fromSolar(calendar.lunar2solar(birth.config.year+lastAge,1,1,false));
 const end=new Date(next.getFullYear(),next.getMonth(),next.getDate()-1);
 counts.lastDecadeFinalDays++;compare(chart,birth,{birth:birthCivil,gender,kind:'last-decade-final-day',age:lastAge},end);
 counts.afterLastDecade++;counts.fields++;
 const h=calculateZiweiHoroscope(chart,next),ok=h===null;
 if(ok){counts.rejected++;counts.equal++;}else issues.push({birth:birthCivil,gender,field:'after-last-decade',expected:null,actual:h.decadal});
 rows.push({sample:{birth:birthCivil,gender,kind:'after-last-decade',age:lastAge+1},date:civil(next),expected:{rejected:true},actual:{rejected:ok},differences:ok?[]:[{field:'rejected',expected:true,actual:ok}]});
}
const manifest=['docs/algorithm-benchmark-2026-10-13/ziwei-flows/sxtwl-calendar.py','docs/algorithm-benchmark-2026-10-13/ziwei-flows/sxtwl-calendar.cjs','.local-dev/qimen-benchmark/python-deps/sxtwl.py','.local-dev/qimen-benchmark/python-deps/_sxtwl.cp312-win_amd64.pyd'].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
const result={reference:'sxtwl 2.0.6 calendar injected through unmodified Fortel official calendar parameter; matched-rule oracle',counts,manifest,issues,rows};
fs.writeFileSync(path.join(__dirname,'extended-range-results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({counts,issues:issues.length,firstIssues:issues.slice(0,6)},null,2));
if(issues.length)process.exitCode=1;
