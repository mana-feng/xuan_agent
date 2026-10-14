'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--child')){
 const zones=['UTC','Asia/Shanghai','America/New_York','Europe/London','Asia/Kathmandu','Australia/Lord_Howe','America/Sao_Paulo'];
 const runs=zones.map(timeZone=>JSON.parse(cp.execFileSync(process.execPath,[__filename,'--child'],{env:{...process.env,TZ:timeZone},encoding:'utf8'})));
 const result={cases:runs.reduce((a,r)=>a+r.cases,0),fields:runs.reduce((a,r)=>a+r.fields,0),differences:runs.flatMap(r=>r.differences),runs};
 fs.writeFileSync(path.join(__dirname,'timezone-results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({cases:result.cases,fields:result.fields,differences:result.differences.length,zones},null,2));
 process.exit(result.differences.length?1:0);
}
const {root,natal,expected,parts}=require('./oracle.cjs');
const productFields=require('./product-fields.cjs');
const {resetPlatform}=require(path.join(root,'frontend-docker/tests/helpers/load-source.cjs'));
const {createPinia,setActivePinia}=require(path.join(root,'frontend-docker/node_modules/pinia'));
const {useZiweiStore}=require(path.join(root,'frontend-docker/src/store/ziwei.ts'));
const targets=['2023-04-05 23:00','2023-04-06 00:00','2024-02-09 23:00','2024-02-10 00:00','2024-03-10 01:30','2024-03-10 03:30','2024-11-03 01:30','2024-11-03 02:30','2018-11-03 23:30'];
const result={hostZone:Intl.DateTimeFormat().resolvedOptions().timeZone,cases:0,fields:0,schoolDifferences:0,differences:[]};
const school={戊:['太阳','右弼'],庚:['天府','太阴'],壬:['天府','左辅']};
for(const birthZone of ['Asia/Shanghai','America/New_York']){
 resetPlatform();setActivePinia(createPinia());const store=useZiweiStore();
 store.pull({gender:0,timeZone:birthZone,timestamp:Date.parse(`2003-03-21T12:00:00${birthZone==='Asia/Shanghai'?'+08:00':'-05:00'}`)});
 const base=natal('2003-03-21 12:00',0);
 for(const target of targets){
  const p=parts(target,false),date=new Date(p.year,p.month-1,p.day,p.hour,p.minute);store.setTimelineSelection({mode:'monthly',date});
  const h=store.currentHoroscope,e=expected(base,target).fields,a=productFields(h);result.cases++;
  for(const [field,value] of Object.entries(e)){
   const actual=a[field],scope=field.split('.')[0],variant=school[e[`${scope}.stem`]];
   result.fields++;if(actual===value)continue;
   if(field.endsWith('.mutagen.科')&&variant&&value===variant[0]&&actual===variant[1]){result.schoolDifferences++;continue;}
   result.differences.push({hostZone:result.hostZone,birthZone,target,field,expected:value,actual});
  }
 }
}
console.log(JSON.stringify(result));
