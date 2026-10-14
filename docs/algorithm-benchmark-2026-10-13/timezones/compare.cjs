'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'../../..');
const ts=require(path.join(root,'frontend-docker/node_modules/typescript'));
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {civilToTimestamp,civilString,zonedParts}=require(path.join(root,'frontend-docker/src/utils/chartTime.ts'));
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'inputs.json'),'utf8'));
const differences=[];let checked=0,roundTrips=0;
for(const row of rows){
  for(const choice of ['reject','earlier','later']){
    let actual,error;try{actual=civilToTimestamp(row.civil,row.timeZone,choice);}catch(e){error=e.message;}
    const expectedError=!row.candidates.length || (row.candidates.length===2 && choice==='reject');
    const expected=choice==='later'?row.candidates.at(-1):row.candidates[0];
    const equal=expectedError ? Boolean(error) : !error && actual===expected;
    if(!equal) differences.push({...row,choice,expectedError,expected,actual,error});checked++;
  }
  for(const stamp of row.candidates){
    const actual=civilString(zonedParts(stamp,row.timeZone));
    if(actual!==row.civil) differences.push({...row,kind:'round-trip',timestamp:stamp,actual});roundTrips++;
  }
}
const summary={cases:rows.length,disambiguationChecks:checked,roundTrips,differences:differences.length,node:process.version,tzdata:process.versions.tz,icu:process.versions.icu,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'frontend-docker/src/utils/chartTime.ts'))).digest('hex')};
fs.writeFileSync(path.join(__dirname,'differences.json'),JSON.stringify(differences,null,2));
fs.writeFileSync(path.join(__dirname,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));if(differences.length) process.exitCode=2;
