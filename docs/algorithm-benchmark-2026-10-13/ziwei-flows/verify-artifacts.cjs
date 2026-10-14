'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const read=file=>JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));
const s=read('summary.json'),inventory=read('field-inventory.json'),selection=read('selection-results.json'),zones=read('timezone-results.json');
const extended=read('extended-range-results.json');
assert.equal(extended.issues.length,0);assert.equal(extended.counts.skipped,0);
assert.equal(extended.counts.decadeStarts,96);assert.equal(extended.counts.rejected,8);
for(const entry of [...s.manifest,...extended.manifest])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../..',entry.file))).digest('hex'),entry.sha256,`Source changed since benchmark: ${entry.file}`);
const rows=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'all-results.jsonl.gz'))).toString().split('\n').map(JSON.parse);
assert.equal(rows.length,s.counts.cases);
assert.equal(inventory.groups.reduce((n,g)=>n+g.total,0),189);
assert.equal(Object.keys(s.fieldStats).length,189);
assert.equal(s.counts.fields,(s.counts.cases-s.counts.domainCases)*189+s.counts.domainCases);
assert.equal(s.counts.fields,s.counts.equal+s.counts.schoolDifference+s.counts.confirmedRuleMismatch+s.counts.unresolved);
assert.equal(s.counts.unresolved,0);assert.equal(s.counts.confirmedRuleMismatch,0);
assert.equal(s.counts.domainCases,s.counts.domainRejected);
assert.equal(selection.issues.length,0);assert.equal(zones.differences.length,0);
assert.equal(selection.boundaryCases,18);assert.equal(selection.boundaryFields,180);
assert.equal(selection.decadeReferences.skipped,0);
assert.ok(selection.boundaries.every(row=>row.differences.length===0));
for(const c of Object.values(s.coverage)){assert.equal(c.stems.length,10);assert.equal(c.branches.length,12);assert.equal(c.palaces.length,12);}
const rawClasses={};
for(const row of rows){
 assert.deepEqual(Object.keys(row.expected).sort(),Object.keys(row.actual).sort());
 assert.equal(row.differences.length,Object.keys(row.expected).filter(k=>row.expected[k]!==row.actual[k]).length);
 for(const d of row.differences)assert.equal(d.classification,'documented-sihua-school');
 for(const d of row.rawFortelPalaceDifferences){assert.ok(['leap-month-convention','childhood-convention'].includes(d.classification));rawClasses[d.classification]=(rawClasses[d.classification]||0)+1;}
}
console.log(JSON.stringify({verified:true,cases:rows.length,normalFields:189,fieldComparisons:s.counts.fields,rawClasses,timezoneCases:zones.cases,timezoneFields:zones.fields,selection:selection.counts},null,2));
