'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const summary = read('summary.json');
const inputs = read('inputs.json');
const rows = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'all-results.jsonl.gz'))).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
const unresolved = read('unresolved.json');
const unsupported = read('unsupported.json');
const compared = rows.filter(r => r.expected);
assert.equal(rows.length, inputs.length);
assert.equal(new Set(inputs.map(s => s.id)).size, inputs.length, 'Input IDs must be unique');
assert.deepEqual(rows.map(r => r.sample), inputs, 'Every result must preserve its matched input');
assert.equal(compared.length, summary.counts.comparedCases);
assert.equal(rows.length - compared.length, unsupported.length);
assert.equal(unsupported.length, summary.counts.baselineUnsupportedCases);
assert.equal(unresolved.length, summary.counts.unresolvedCases);
let equal = 0, school = 0, unknown = 0;
for (const row of compared) {
  assert.equal(Object.keys(row.expected).length, 81);
  const differences = Object.keys(row.expected).filter(k => row.expected[k] !== row.actual[k]);
  assert.deepEqual(differences.sort(), row.differences.map(d => d.field).sort());
  equal += 81 - differences.length;
  for (const difference of row.differences) {
    assert.equal(difference.expected, row.expected[difference.field]);
    assert.equal(difference.actual, row.actual[difference.field]);
    if (difference.classification === 'documented-school-difference') school++;
    else unknown++;
  }
}
assert.equal(compared.length * 81, summary.counts.fields);
assert.equal(equal, summary.counts.equalFields);
assert.equal(school, summary.counts.schoolDifferenceFields);
assert.equal(unknown, summary.counts.unresolvedFields);
for (const [file, hash] of Object.entries(summary.provenance.production.fileHashes)) {
  const current = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../..', file))).digest('hex');
  assert.equal(current, hash, 'Production file changed since benchmark: ' + file);
}
assert.equal(summary.provenance.independentEngine.sourceHashes.length, 25);
assert.deepEqual(summary.provenance.independentEngine.sourceHashes.filter(s => s.packageLfSha256 !== s.gitSourceLfSha256).map(s => s.file), ['src/model/minorStar.ts']);
assert.equal(summary.lunarDayClassCoverage.length, 150);
const published = read('published-reference.json');
const publishedRun = compared.find(r => r.sample.id === published.sampleId);
for (const [field, value] of Object.entries(published.fields)) assert.equal(publishedRun.expected[field], value, 'Fortel run must match the author-published literal chart: ' + field);
console.log(JSON.stringify({ verified: true, cases: rows.length, comparedCases: compared.length, fields: compared.length * 81, equal, school, unknown, unsupported: unsupported.length, publishedLiteralFields: Object.keys(published.fields).length }, null, 2));
