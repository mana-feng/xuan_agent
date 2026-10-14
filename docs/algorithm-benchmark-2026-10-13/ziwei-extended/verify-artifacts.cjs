'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),readline=require('node:readline');
const primary=require('./primary-rules.cjs');
async function verify(prefix,perCase){
 const summary=JSON.parse(fs.readFileSync(path.join(__dirname,prefix+'summary.json'),'utf8'));
 let cases=0,checks=0,equal=0,differences=0,rawDifferences=0,core81=0,early=0,emptyNameChecks=0;
 const keys=new Set(),inputIds=new Set(),mutagens={},groups={};
 const stream=fs.createReadStream(path.join(__dirname,prefix+'all-results.jsonl.gz')).pipe(zlib.createGunzip());
 for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
  if(!line)continue;const row=JSON.parse(line);cases++;assert(!inputIds.has(row.sample.id));inputIds.add(row.sample.id);
  let rowCount=0,rowEarly=0,rowDiffs=0;
  for(const [field,{expected,actual}] of Object.entries(row.independentChecks)){
   rowCount++;checks++;keys.add(field);if(field.startsWith('early.')){rowEarly++;early++;}if(field.startsWith('core81.'))core81++;
   const group=field.startsWith('core81.')?'core81':field.split('.')[0];groups[group]||={compared:0,equal:0,different:0};groups[group].compared++;
   if(JSON.stringify(expected)===JSON.stringify(actual)){equal++;groups[group].equal++;}else{differences++;rowDiffs++;groups[group].different++;assert(row.checkDifferences.some(d=>d.field===field));}
  }
  assert.equal(rowCount-rowEarly,perCase);assert.equal(row.checkDifferences.length,rowDiffs);
  for(const d of row.checkDifferences){assert.notEqual(d.classification,'UNRESOLVED');if(prefix==='after-')assert.equal(d.classification,'documented-sihua-school-difference');mutagens[d.classification]=(mutagens[d.classification]||0)+1;}
  rawDifferences+=row.rawDifferences.length;assert(row.rawDifferences.every(d=>d.classification!=='UNRESOLVED'));
  // Label routing is a display convention, not a new astronomical oracle:
  // old paired 截路空亡 is split first/even branch -> 截路, second/odd -> 空亡.
  const pair=row.fortel['star.截空'];for(const [name,parity] of [['截路',0],['空亡',1]]){assert.deepEqual(row.actual['star.'+name],pair.filter(b=>primary.branches.indexOf(b)%2===parity));emptyNameChecks++;}
 }
 assert.equal(cases,18433);assert.equal(checks,summary.checks);assert.equal(equal,summary.equal);assert.equal(differences,checks-equal);assert.equal(summary.unresolved,0);assert.equal(early,183);assert.equal(Object.keys(summary.brightnessCells).length,232);
 assert.equal(Object.keys(summary.stats).filter(k=>k.startsWith('minor.')).length,14);assert.equal(Object.keys(summary.stats).filter(k=>k.startsWith('adjective.')).length,35);
 if(prefix==='after-'){assert.equal(summary.brightnessDifferences,0);assert.equal(core81,18433*81);assert.equal(Object.keys(summary.stats).filter(k=>k.startsWith('core81.')).length,81);}
 const result={cases,checks,equal,differences,rawDifferences,core81,early,emptyLabelPolicyChecks:emptyNameChecks,uniqueComparedFields:keys.size,differenceClassifications:mutagens,groups};
 fs.writeFileSync(path.join(__dirname,prefix+'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(prefix||'before',JSON.stringify(result));return result;
}
(async()=>{await verify('',295);await verify('after-',376);console.log('PASS: full gzip streams, all case IDs, per-case fields, independent counts, raw differences, three early-date closures, 232 brightness cells.');})().catch(e=>{console.error(e);process.exitCode=1;});
