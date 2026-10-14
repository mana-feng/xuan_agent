'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n),'utf8')),write=(n,v)=>fs.writeFileSync(path.join(__dirname,n),JSON.stringify(v,null,2)+'\n'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rawName='raw-summary-end-time-hash.json';
if(!fs.existsSync(path.join(__dirname,rawName)))fs.copyFileSync(path.join(__dirname,'summary.json'),path.join(__dirname,rawName));
const raw=read(rawName),preview=read('preview-summary.json'),after=read('after-summary.json'),beforeHash=hash(path.join(__dirname,'sources/ziweiCalculation.before.ts'));
assert.equal(beforeHash,preview.productionHashes['ziweiCalculation.ts']);
const manifest={
 correction:'The first full-run script originally hashed source files at COMPLETION. Root patched the production file during that running process; the loaded CommonJS module kept the old calculation, but the end-time hash read the new file. The raw summary is preserved separately and explicitly invalid as a description of the loaded before module. No result fields or counts were changed.',
 rawSummary:rawName,rawResults:'all-results.jsonl.gz',
 loadedBeforeSource:'sources/ziweiCalculation.before.ts',loadedBeforeSourceSha256:beforeHash,
 corroboration:'The pre-run873-case preview records the identical source hash. The before source was copied during the full run before root patched it; it matches that preview. The complete before run retained all3747 original brightness errors, whereas the after process sees zero.',
 executionStartApproximateDerivedFromDuration:new Date(Date.parse(raw.generatedAt)-raw.durationMs).toISOString(),
 originalEndTimeHash:raw.productionHashes['ziweiCalculation.ts'],
 afterStartTimeHash:after.productionHashes['ziweiCalculation.ts'],
 afterHashCapture:'Captured immediately at module startup; the after process independently re-executed376 fields per input.',
};
write('corrected-run-manifest.json',manifest);
const corrected={...raw,productionHashes:{...raw.productionHashes,'ziweiCalculation.ts':beforeHash},hashCaptureCorrection:'corrected-run-manifest.json'};write('summary.json',corrected);
const current=path.resolve(__dirname,'../../../frontend-docker/src/utils/ziweiCalculation.ts');assert.equal(hash(current),after.productionHashes['ziweiCalculation.ts'],'Current production changed since after benchmark; rerun required');
const sources=read('source-notes.json');sources.confirmedUpstreamDefect.localSource='sources/iztro261-stars.ts';assert.equal(hash(path.join(__dirname,sources.confirmedUpstreamDefect.localSource)),sources.confirmedUpstreamDefect.sourceSha256);write('source-notes.json',sources);
// Correct only the narrative of the older core report. Its original source
// hashes and counts remain historical; the current81-field rerun is in after.
const old=read('../ziwei/summary.json');old.provenance.independentEngine.sourceDifferenceExplanation='24/25 source files match after CRLF-to-LF normalization. Two Xin-year Tiankui/Tianyue entries differ between npm and declared Git source. Natal evalGround calls evalRuntimeGround, so this affects natal charts too, but these stars were outside the81 compared fields. The extended benchmark tests the pinned npm values explicitly. The Git source is not represented as byte-identical to npm.';
old.extendedFollowup='../ziwei-extended/report.html: all current81 core fields re-executed plus295 additional checks; the3 early1900 baseline gaps are closed using sxtwl and Fortel pure configuration.';write('../ziwei/summary.json',old);
console.log(JSON.stringify(manifest,null,2));
