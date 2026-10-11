// Verify only the exact browser-produced paths supplied in the adjacent manifest.
// This reads disk files; it does not exercise a browser or a download backend.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const manifestPath = path.resolve(process.argv[2] || path.join(__dirname, 'native-download-manifest.json'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const evidenceRoot = path.dirname(manifestPath);

function splitCells(row) {
  const cells = [];
  let start = 0, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; assert.ok(depth >= 0, 'unbalanced table value'); }
    else if (c === ',' && depth === 0) { cells.push(row.slice(start, i)); start = i + 1; }
  }
  assert.equal(quoted, false, 'unterminated quoted table value');
  assert.equal(depth, 0, 'unbalanced nested table value');
  cells.push(row.slice(start));
  return cells;
}

function decodeTableValue(value) {
  if (value === '') return null;
  if (/^[\[{\"]/.test(value) || /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(value)) return JSON.parse(value);
  return value;
}

function decodeRepositoryToon(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  let cursor = 0;
  const indentation = line => line.match(/^ */)[0].length;
  function object(level, prefix) {
    const result = {};
    while (cursor < lines.length && indentation(lines[cursor]) >= level) {
      const line = lines[cursor];
      assert.equal(indentation(line), level, `unexpected indentation at line ${cursor + 1}`);
      const table = line.slice(level).match(/^([^\[\]:]+)\[(\d+)\]\{([^}]+)\}:$/);
      if (table) {
        const key = table[1], expectedRows = Number(table[2]), columns = table[3].split(',');
        const headerLine = cursor + 1;
        assert.equal(new Set(columns).size, columns.length, `duplicate columns at ${headerLine}`);
        cursor++;
        result[key] = [];
        for (let i = 0; i < expectedRows; i++) {
          assert.ok(cursor < lines.length, `truncated table at ${headerLine}`);
          assert.equal(indentation(lines[cursor]), level + 2, `row indentation at ${cursor + 1}`);
          const cells = splitCells(lines[cursor].slice(level + 2));
          assert.equal(cells.length, columns.length, `column count at ${cursor + 1}`);
          result[key].push(Object.fromEntries(columns.map((column, j) => [column, decodeTableValue(cells[j])])));
          cursor++;
        }
        tables.push({path: [...prefix, key].join('.'), headerLine, declaredRows: expectedRows, actualRows: result[key].length, columns: columns.length});
        continue;
      }
      const field = line.slice(level).match(/^([^:]+):(?: (.*))?$/);
      assert.ok(field, `unrecognized field at line ${cursor + 1}`);
      const key = field[1];
      assert.ok(!Object.hasOwn(result, key), `duplicate key ${[...prefix, key].join('.')}`);
      cursor++;
      if (field[2] !== undefined) result[key] = JSON.parse(field[2]);
      else if (lines[cursor]?.startsWith(' '.repeat(level + 2) + '-')) {
        result[key] = [];
        while (cursor < lines.length && indentation(lines[cursor]) === level + 2 && lines[cursor].slice(level + 2).startsWith('-')) {
          const item = lines[cursor++].slice(level + 2);
          result[key].push(item === '-' ? object(level + 4, [...prefix, key]) : JSON.parse(item.slice(2)));
        }
      } else result[key] = object(level + 2, [...prefix, key]);
    }
    return result;
  }
  const data = object(0, []);
  assert.equal(cursor, lines.length, 'all lines consumed');
  return {data, tables, lineCount: lines.length};
}

const results = [];
for (const entry of manifest.files) {
  const result = {type: entry.type, sourcePath: entry.path, provenance: entry.provenance, checks: []};
  const check = (name, fn) => {
    try { fn(); result.checks.push({name, passed:true}); }
    catch (error) { result.checks.push({name, passed:false, error:error.message}); }
  };
  try {
    const bytes = fs.readFileSync(entry.path);
    const stat = fs.statSync(entry.path);
    const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    result.file = {basename:path.basename(entry.path), bytes:bytes.length, sha256:hash, mtime:stat.mtime.toISOString(), birthtime:stat.birthtime.toISOString(), utf8Strict:true, bom:bytes.subarray(0, 3).equals(Buffer.from([0xef,0xbb,0xbf]))};
    check('nonempty regular disk file', () => { assert.ok(stat.isFile()); assert.ok(bytes.length > 0); });
    check('browser filename including duplicate suffix', () => assert.equal(path.basename(entry.path), entry.filename));
    check('observed disk size', () => assert.equal(bytes.length, entry.bytes));
    check('no decoding replacement or invalid serializer markers', () => assert.doesNotMatch(text, /\uFFFD|\[object Object\]|:\s*undefined(?:\n|$)/));
    const parsed = decodeRepositoryToon(text);
    const data = parsed.data;
    result.lineCount = parsed.lineCount;
    result.tables = parsed.tables;
    check('all TOON fields and table rows decode completely', () => assert.ok(parsed.tables.length > 0));
    const profile = entry.type === 'bazi' ? data.basic : data.profile;
    result.profile = profile;
    result.exportTime = data.meta.exportTime;
    check('chart name and gender match native page', () => { assert.equal(profile.name, entry.expected.name); assert.equal(profile.gender, entry.expected.gender); });
    check('other chart name is absent', () => assert.ok(!text.includes(entry.expected.otherName)));
    check('birth timestamp and ISO agree', () => assert.equal(new Date(profile.birthTimestamp).toISOString(), profile.solar || profile.birthSolarISO));
    const localBirth = new Date(profile.birthTimestamp + 8 * 60 * 60 * 1000).toISOString();
    result.birthTimeSingapore = localBirth.slice(0,-1) + '+08:00';
    check('birth minute matches page and generated filename', () => {
      assert.equal(localBirth.slice(0, 16), entry.expected.birthLocalMinute);
      const minuteKey = localBirth.slice(0,16).replace(/[-:T]/g, '');
      assert.equal(entry.filename.replace(/ \(\d+\)(?=\.toon$)/, ''), `${entry.type}-${minuteKey}.toon`);
    });
    if (entry.expected.birthLocalSecond) check('birth second matches native page', () => assert.equal(localBirth.slice(0,19),entry.expected.birthLocalSecond));
    check('metadata export time belongs to observed download minute', () => {
      assert.equal(data.meta.exportTime.slice(0,16), entry.expected.exportUtcMinute);
      assert.ok(stat.mtime.getTime() >= Date.parse(data.meta.exportTime));
      assert.ok(stat.mtime.getTime() - Date.parse(data.meta.exportTime) < 10000);
    });
    if (entry.type === 'ziwei') {
      const chart = data.basicChart, school = data.newSchoolChart;
      result.chart = {gender:chart.gender, solarDate:chart.solarDate, chineseDate:chart.chineseDate, time:chart.time, soul:chart.soul, body:chart.body, fiveElementsClass:chart.fiveElementsClass};
      result.selection = school.selection;
      result.focus = school.focus;
      result.yearlyRange = {...school.yearlyRangeCharts, charts:undefined};
      check('ziwei module and page chart facts', () => {
        assert.equal(data.meta.module,'ziwei');
        for (const [key, value] of Object.entries(entry.expected.chart)) assert.equal(chart[key], value);
      });
      check('12 unique palaces and body palace', () => {
        assert.equal(chart.palaces.length,12);
        assert.deepEqual(chart.palaces.map(p=>p.index).sort((a,b)=>a-b), Array.from({length:12},(_,i)=>i));
        assert.equal(new Set(chart.palaces.map(p=>p.earthlyBranch)).size,12);
        assert.equal(chart.palaces.filter(p=>p.isBodyPalace).length,1);
        assert.equal(chart.palaces.filter(p=>p.isOriginalPalace).length,1);
      });
      check('12 decadal timeline rows and 12 complete charts', () => {
        assert.equal(school.timeline.decadal.length,12);
        assert.equal(school.allDecadalCharts.length,12);
        assert.ok(school.allDecadalCharts.every(d=>d.cs && d.cs.d && d.cs.a && d.cs.y));
        assert.ok(school.timeline.decadal.every((d,i,a)=>i===0 || d.range[0] > a[i-1].range[0]));
      });
      check('yearly range count, continuous years and compact scopes', () => {
        const range = school.yearlyRangeCharts;
        assert.equal(range.totalYears,range.charts.length);
        assert.equal(range.totalYears,range.endYear-range.startYear+1);
        assert.equal(range.startYear,Math.max(range.requestedStartYear,range.minStartYearByDecadal));
        assert.ok(range.charts.every((v,i)=>v.y===range.startYear+i && v.cs && v.cs.d && v.cs.a && v.cs.y));
      });
      check('focus palace and native three-direction relationships', () => {
        assert.equal(school.focus.palace.displayName,entry.expected.focus);
        assert.equal(school.focus.surrounded.natal.target.index,school.focus.palace.index);
        for (const key of ['target','opposite','wealth','career']) {
          const p = school.focus.surrounded.natal[key];
          assert.equal(chart.palaces[p.index].displayName,p.displayName);
        }
      });
    } else {
      result.chart = {sizhu:data.sizhu, solar:data.solar, start_yun:data.start_yun, currentDayunIndex:data.currentDayunIndex, currentLiunianIndex:data.currentLiunianIndex, liunianRange:data.liunianRange};
      check('bazi four pillars match native page', () => assert.deepEqual(Object.values(data.sizhu),entry.expected.sizhu));
      check('four pillars agree with stems and branches', () => {
        for (const k of ['year','month','day','time']) assert.equal(data.sizhu[k],data.tiangan[k]+data.dizhi[k]);
      });
      check('nonempty decadal and annual charts, indices and year count', () => {
        assert.ok(data.dayun.length > 0); assert.ok(data.liunian.length > 0);
        assert.equal(data.liunianRange.totalYears,data.liunian.length);
        assert.equal(data.liunianRange.dayunIndices.length,data.dayun.length);
        assert.ok(data.dayun.every((d,i)=>d.index===i));
        assert.ok(data.liunian.every((d,i,a)=>d.index===i && d.dayunIndex>=0 && d.dayunIndex<data.dayun.length && (i===0 || d.year>=a[i-1].year)));
        assert.ok(data.currentDayunIndex>=0 && data.currentDayunIndex<data.dayun.length);
        assert.ok(data.currentLiunianIndex>=0 && data.currentLiunianIndex<data.liunian.length);
      });
    }
    const copyPath = path.join(evidenceRoot, 'native-files', path.basename(entry.path));
    fs.mkdirSync(path.dirname(copyPath), {recursive:true});
    if (fs.existsSync(copyPath)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(copyPath)).digest('hex'),hash,'existing evidence basename must have identical content');
    else fs.copyFileSync(entry.path,copyPath,fs.constants.COPYFILE_EXCL);
    result.evidenceCopy = copyPath;
    check('evidence copy is byte identical', () => assert.ok(fs.readFileSync(copyPath).equals(bytes)));
  } catch(error) {
    result.checks.push({name:'read/decode/copy execution',passed:false,error:error.message});
  }
  result.passed = result.checks.every(c=>c.passed);
  results.push(result);
}
const report = {verifiedAt:new Date().toISOString(),method:'Exact supplied source paths only; read from disk, fatal UTF-8 decoder, structural decoding for this repository encoder, page expectation checks, SHA-256 and byte-identical evidence copy.',boundary:'Browser actions and page expectations are supplied by the parent agent. This script does not itself establish browser click provenance, validate standardized TOON interoperability, or independently prove astrology calculations.',files:results};
fs.writeFileSync(path.join(evidenceRoot,'native-download-content-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({type:r.type,path:r.sourcePath,passed:r.passed,bytes:r.file?.bytes,sha256:r.file?.sha256,lineCount:r.lineCount,tables:r.tables?.length,checks:r.checks.length,failures:r.checks.filter(c=>!c.passed)})),null,2));
if (results.some(r=>!r.passed)) process.exitCode = 1;
