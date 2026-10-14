/* Independent Fortel / production Ziwei comparison. No generated iztro goldens. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const cache = path.join(root, '.local-dev/ziwei-benchmark');
const fortelDir = process.env.FORTEL_BENCHMARK_DIR || path.join(cache, 'package');
const f = require(fortelDir);
const ts = require(path.join(root, 'frontend-docker/node_modules/typescript'));
// Compile the real utility modules only. No test API, Vue, or business mocks.
Module._extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const { calculateZiwei } = require(path.join(root, 'frontend-docker/src/utils/ziweiCalculation.ts'));
const pkg = require(path.join(fortelDir, 'package.json'));
assert.equal(pkg.version, '1.3.4');
const normalizeMap = Object.fromEntries(Array.from('宮業財遷機陽陰貪門殺軍貞輔祿權').map((c, i) => [c, Array.from('宫业财迁机阳阴贪门杀军贞辅禄权')[i]]));
const cn = value => String(value).replace(/[宮業財遷機陽陰貪門殺軍貞輔祿權]/g, c => normalizeMap[c]);
const palaceName = name => ({ '事业': '官禄', '交友': '仆役' }[cn(name)] || cn(name));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const normalizedHash = file => crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const pad = n => String(n).padStart(2, '0');
const cases = [];
const add = (id, category, civil, timeZone = 'Asia/Hong_Kong', offset = '+08:00', gender = 1) => {
  cases.push({ id, category, civil: civil.length === 16 ? civil + ':00' : civil, timeZone, timestamp: Date.parse(civil.replace(' ', 'T') + offset), gender });
};
// A full sexagenary cycle, every solar month, all 12 hours and both genders.
// The rotating day avoids repeatedly testing a narrow set of lunar days.
for (let y = 1984; y <= 2043; y++) for (let m = 1; m <= 12; m++) for (let h = 0; h < 24; h += 2) for (const gender of [0, 1]) {
  const d = [1, 8, 15, 16, 22, 28][(y - 1984 + m - 1) % 6];
  const civil = `${y}-${pad(m)}-${pad(d)} ${pad(h)}:30`;
  add(`cycle-${y}-${m}-${h}-${gender}`, 'sexagenary-grid', civil, undefined, undefined, gender);
}
// Thirty consecutive dates are picked from the independent calendar. Coverage is
// checked below for all 30 lunar days x all five bureaus, not assumed from count.
for (let d = 0; d < 30; d++) for (let h = 0; h < 24; h += 2) for (const gender of [0, 1]) {
  const date = new Date(Date.UTC(2023, 0, 22 + d)).toISOString().slice(0, 10);
  add(`lunar-day-${d + 1}-${h}-${gender}`, 'lunar-day-grid', `${date} ${pad(h)}:30`, undefined, undefined, gender);
}
for (const date of ['2020-06-06', '2020-06-07', '2023-03-21', '2023-03-22', '2023-04-05', '2023-04-06', '2023-04-19', '2023-04-20', '2033-12-21', '2033-12-22', '2034-01-04', '2034-01-05']) {
  for (const hour of ['00:30', '02:30', '04:30', '06:30', '08:30', '10:30', '12:30', '14:30', '16:30', '18:30', '20:30', '22:30', '23:00']) for (const gender of [0, 1]) {
    add(`leap-${date}-${hour}-${gender}`, 'leap-boundary', `${date} ${hour}`, undefined, undefined, gender);
  }
}
for (const date of ['2023-01-21', '2023-01-22', '2024-02-03', '2024-02-04', '2024-02-09', '2024-02-10', '2023-02-19', '2023-02-20']) {
  for (const hour of ['00:59', '01:00', '22:59', '23:00', '23:59']) for (const gender of [0, 1]) {
    add(`year-hour-${date}-${hour}-${gender}`, 'year-hour-boundary', `${date} ${hour}`, undefined, undefined, gender);
  }
}
const zoneCases = [
  ['Shanghai-DST', '1991-07-01 12:00', 'Asia/Shanghai', '+09:00'],
  ['Shanghai-winter', '1991-01-01 12:00', 'Asia/Shanghai', '+08:00'],
  ['NY-fold-earlier', '2024-11-03 01:30', 'America/New_York', '-04:00'],
  ['NY-fold-later', '2024-11-03 01:30', 'America/New_York', '-05:00'],
  ['NY-DST-before', '2024-03-10 01:59', 'America/New_York', '-05:00'],
  ['NY-DST-after', '2024-03-10 03:00', 'America/New_York', '-04:00'],
  ['NY-lateZi', '2023-04-05 23:30', 'America/New_York', '-04:00'],
  ['London-summer', '2024-07-01 23:30', 'Europe/London', '+01:00'],
  ['London-winter', '2024-01-01 00:30', 'Europe/London', '+00:00'],
  ['Kathmandu-quarter-hour', '2024-07-01 23:30', 'Asia/Kathmandu', '+05:45'],
  ['Lord-Howe-half-hour-DST', '2024-01-01 23:30', 'Australia/Lord_Howe', '+11:00'],
  ['Lord-Howe-half-hour-standard', '2024-07-01 23:30', 'Australia/Lord_Howe', '+10:30'],
  ['Auckland-next-date', '2024-02-10 00:30', 'Pacific/Auckland', '+13:00'],
  ['Honolulu-previous-date', '2024-02-09 23:30', 'Pacific/Honolulu', '-10:00'],
];
for (const [id, civil, zone, offset] of zoneCases) for (const gender of [0, 1]) add(`${id}-${gender}`, 'timezone-fixture', civil, zone, offset, gender);
for (const date of ['1900-01-01', '1900-01-30', '1900-01-31', '1900-02-01', '2099-12-30', '2099-12-31']) {
  // UTC fixtures avoid undocumented historical local offsets at range edges.
  for (const hour of ['00:30', '23:30']) add(`range-${date}-${hour}`, 'supported-range', `${date} ${hour}`, 'UTC', '+00:00');
}
add('published-fortel-example', 'published-example', '1952-04-09 03:00', 'Asia/Shanghai', '+08:00');

// This adapter deliberately reads ONLY the declared fixture civil fields. It
// does not call production date parsing, lunar conversion or iztro utilities.
function baseline(sample) {
  const [y, m, d, h, minute, second] = sample.civil.match(/\d+/g).map(Number);
  const next = h === 23;
  const date = new Date(Date.UTC(y, m - 1, d + (next ? 1 : 0)));
  const hour = next ? 0 : h;
  const config = f.DestinyConfigBuilder.withSolar({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), bornTimeHour: hour, configType: f.ConfigType.SKY, gender: sample.gender === 1 ? f.Gender.F : f.Gender.M });
  const board = new f.DestinyBoard(config);
  const json = JSON.parse(JSON.stringify(board));
  const fields = {
    'input.birthCivil': sample.civil, 'input.calculationDate': date.toISOString().slice(0, 10),
    'input.timeIndex': Math.floor((hour + 1) / 2), 'input.lateZiRollover': next,
    'lunar.year': config.year, 'lunar.month': config.month, 'lunar.day': config.day, 'lunar.isLeap': config.isLeapMonth,
    'core.soul': cn(board.getCellByTemple(f.Temple.TEMPLE_DESTINY).ground),
    'core.body': cn(board.getCellByTemple(f.Temple.TEMPLE_BODY).ground), 'core.fiveClass': cn(board.element),
  };
  const starBranches = {};
  for (const c of json.cells) {
    const branch = cn(c.ground);
    fields[`palace.${branch}.name`] = palaceName(c.temples.find(t => t !== '身宮'));
    fields[`palace.${branch}.stem`] = cn(c.sky);
    fields[`decadal.${branch}.start`] = c.ageStart;
    fields[`decadal.${branch}.end`] = c.ageEnd;
    for (const star of [...c.majorStars, ...c.minorStars]) starBranches[cn(star)] = branch;
    for (const star of c.majorStars) fields[`major.${cn(star)}`] = branch;
  }
  for (const [kind, star] of Object.entries(json.bornStarDerivativeMap)) {
    fields[`sihua.${cn(kind)}.star`] = cn(star);
    fields[`sihua.${cn(kind)}.branch`] = starBranches[cn(star)];
  }
  return { fields, yearStem: cn(config.yearSky), lunarDay: config.day, fiveClass: cn(board.element), raw: json };
}
function production(sample) {
  const { chart, metadata } = calculateZiwei(sample);
  const fields = {
    'input.birthCivil': metadata.birthCivil, 'input.calculationDate': metadata.calculationDate,
    'input.timeIndex': metadata.timeIndex, 'input.lateZiRollover': metadata.lateZiRollover,
    ...Object.fromEntries(Object.entries(metadata.lunar).map(([k, v]) => [`lunar.${k}`, v])),
    'core.soul': chart.earthlyBranchOfSoulPalace, 'core.body': chart.earthlyBranchOfBodyPalace, 'core.fiveClass': chart.fiveElementsClass,
  };
  for (const p of chart.palaces) {
    const branch = p.earthlyBranch;
    fields[`palace.${branch}.name`] = p.name; fields[`palace.${branch}.stem`] = p.heavenlyStem;
    fields[`decadal.${branch}.start`] = p.decadal.range[0]; fields[`decadal.${branch}.end`] = p.decadal.range[1];
    for (const star of p.majorStars.filter(s => s.type === 'major')) fields[`major.${star.name}`] = branch;
    for (const star of [...p.majorStars, ...p.minorStars]) if (star.mutagen) {
      fields[`sihua.${star.mutagen}.star`] = star.name; fields[`sihua.${star.mutagen}.branch`] = branch;
    }
  }
  return { fields, metadata };
}
// Source-inspected school differences declared BEFORE comparing any case.
const schoolDifference = { 戊: { fortel: '太阳', iztro: '右弼' }, 庚: { fortel: '天府', iztro: '太阴' }, 壬: { fortel: '天府', iztro: '左辅' } };
const counts = { cases: cases.length, comparedCases: 0, rawIdenticalCases: 0, schoolDifferenceCases: 0, unresolvedCases: 0, baselineUnsupportedCases: 0, fields: 0, equalFields: 0, schoolDifferenceFields: 0, unresolvedFields: 0 };
const groups = {}, fieldGroups = {}, rows = [], unresolved = [], unsupported = [], selected = [], coverage = new Set();
const began = Date.now();
for (const sample of cases) {
  const actual = production(sample);
  let expected;
  try { expected = baseline(sample); } catch (error) {
    counts.baselineUnsupportedCases++;
    unsupported.push({ sample, actual: actual.fields, error: error.message });
    rows.push({ sample, status: 'baseline-unsupported', actual: actual.fields, error: error.message });
    continue;
  }
  counts.comparedCases++;
  coverage.add(`${expected.fiveClass}/${expected.lunarDay}`);
  const g = groups[sample.category] ||= { cases: 0, rawIdentical: 0, schoolOnly: 0, unresolved: 0 }; g.cases++;
  assert.equal(Object.keys(expected.fields).length, 81);
  assert.deepEqual(Object.keys(actual.fields).sort(), Object.keys(expected.fields).sort());
  const differences = [];
  const lunarMismatch = ['year', 'month', 'day', 'isLeap'].some(k => actual.fields[`lunar.${k}`] !== expected.fields[`lunar.${k}`]);
  for (const [field, value] of Object.entries(expected.fields)) {
    counts.fields++;
    const fg = fieldGroups[field.split('.')[0]] ||= { compared: 0, equal: 0, schoolDifference: 0, unresolved: 0 }; fg.compared++;
    if (actual.fields[field] === value) { counts.equalFields++; fg.equal++; continue; }
    const rule = schoolDifference[expected.yearStem];
    const known = !lunarMismatch && field.startsWith('sihua.科.') && rule && expected.fields['sihua.科.star'] === rule.fortel && actual.fields['sihua.科.star'] === rule.iztro;
    const classification = known ? 'documented-school-difference' : lunarMismatch ? 'calendar-disagreement-needs-third-source' : 'unresolved';
    if (known) { counts.schoolDifferenceFields++; fg.schoolDifference++; }
    else { counts.unresolvedFields++; fg.unresolved++; }
    differences.push({ field, expected: value, actual: actual.fields[field], classification });
  }
  const hasUnresolved = differences.some(d => d.classification !== 'documented-school-difference');
  if (!differences.length) { counts.rawIdenticalCases++; g.rawIdentical++; }
  else if (hasUnresolved) { counts.unresolvedCases++; g.unresolved++; unresolved.push({ sample, expected: expected.fields, actual: actual.fields, differences }); }
  else { counts.schoolDifferenceCases++; g.schoolOnly++; }
  const row = { sample, yearStem: expected.yearStem, expected: expected.fields, actual: actual.fields, differences };
  rows.push(row);
  if (!['sexagenary-grid', 'lunar-day-grid'].includes(sample.category) || (selected.filter(s => s.sample.category === sample.category).length < 3)) selected.push(row);
  if (counts.comparedCases % 2000 === 0) {
    console.log(`Compared ${counts.comparedCases}/${cases.length}; unresolved cases ${counts.unresolvedCases}`);
    fs.writeFileSync(path.join(cache, 'checkpoint.json'), JSON.stringify({ counts, groups, fieldGroups, rows, unresolved, unsupported, selected, coverage: [...coverage] }));
  }
}
const sourceDir = path.join(cache, 'source/fortel-ziweidoushu-39584e11ad9ddb124bd4b337a3b148c2f0b25611');
const sourceHashes = [];
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
if (fs.existsSync(sourceDir)) for (const file of walk(path.join(fortelDir, 'src'))) {
  const relative = path.relative(fortelDir, file);
  const sourceFile = path.join(sourceDir, relative);
  sourceHashes.push({ file: relative.replaceAll('\\', '/'), packageSha256: hash(file), gitSourceSha256: fs.existsSync(sourceFile) ? hash(sourceFile) : null, packageLfSha256: normalizedHash(file), gitSourceLfSha256: fs.existsSync(sourceFile) ? normalizedHash(sourceFile) : null });
}
const provenance = {
  independentEngine: { package: pkg.name, version: pkg.version, license: pkg.license, source: 'https://github.com/airicyu/fortel-ziweidoushu', revision: '39584e11ad9ddb124bd4b337a3b148c2f0b25611', tarball: 'https://registry.npmjs.org/fortel-ziweidoushu/-/fortel-ziweidoushu-1.3.4.tgz', tarballSha256: hash(path.join(cache, 'fortel.tgz')), sourceZipSha256: hash(path.join(cache, 'fortel-source.zip')), runtimeDependencies: pkg.dependencies, calendarSource: 'src/calendar/jjonline/js-calendar-converter/calendar.js', sourceHashes },
  production: { rule: 'ziwei-civil-v1', engine: require(path.join(root, 'frontend-docker/node_modules/iztro/package.json')).version, lunar: require(path.join(root, 'frontend-docker/node_modules/lunar-javascript/package.json')).version,
    fileHashes: Object.fromEntries(['frontend-docker/src/utils/ziweiCalculation.ts', 'frontend-docker/src/utils/chartTime.ts'].map(file => [file, hash(path.join(root, file))])) },
  runtime: { node: process.version, platform: process.platform, hostTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzdata: process.versions.tz },
};
provenance.independentEngine.sourceDifferences = sourceHashes.filter(s => s.packageLfSha256 !== s.gitSourceLfSha256);
provenance.independentEngine.sourceDifferenceExplanation = '24/25 source files match after CRLF-to-LF normalization. src/model/minorStar.ts differs in two Xin-year Tiankui/Tianyue entries. Natal evalGround also calls evalRuntimeGround, so these affect natal as well as runtime charts. These two stars were outside the 81 fields compared here. The extended natal benchmark explicitly tests the pinned npm values and discloses the Git/npm distinction. The executed npm artifact is pinned independently by SHA-256; its gitHead is not represented as a byte-identical source tree.';
const summary = { generatedAt: new Date().toISOString(), durationMs: Date.now() - began, counts, groups, fieldGroups, fieldsPerComparedCase: 81, schoolDifference, lunarDayClassCoverage: [...coverage].sort(), provenance, limitations: [
  'Agreement between two implementations is corroboration, not an authoritative proof of every Ziwei tradition.',
  'Fortel receives fixture-declared local civil date/hour; the benchmark independently applies the stated 23:00 full next-day policy. Fortel itself does not supply IANA conversion or the production late-Zi policy.',
  'Timezone inputs use explicit UTC offsets; production local time is checked against the declared civil fixture. No production date converter is used to create benchmark inputs.',
  'Three year-stem fame-star differences are retained raw; neither engine was configured or patched to hide them.',
  'Minor stars (except four-transformation star location), brightness, flow-year/month/day/hour charts, and astrological interpretations are outside this comparison.',
] };
const write = (name, value) => fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n');
write('summary.json', summary); write('inputs.json', cases); write('selected-fixtures.json', selected); write('unresolved.json', unresolved); write('unsupported.json', unsupported);
fs.writeFileSync(path.join(__dirname, 'all-results.jsonl.gz'), zlib.gzipSync(rows.map(row => JSON.stringify(row)).join('\n') + '\n', { level: 9 }));
console.log(JSON.stringify({ counts, groups, fieldGroups, durationMs: summary.durationMs, lunarDayClassCoverage: coverage.size }, null, 2));
assert.deepEqual(provenance.independentEngine.sourceDifferences.map(s => s.file), ['src/model/minorStar.ts'], 'Unexpected source differences; inspect saved artifacts');
assert.equal(coverage.size, 150, 'Must cover each of 30 lunar days for each of five classes');
if (counts.unresolvedCases) process.exitCode = 2;
