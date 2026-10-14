// Run the actual application adapter, not a benchmark reimplementation.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const {createRequire} = require('node:module');
const productRequire = createRequire(path.join(root, 'frontend-docker/package.json'));
const {Solar} = productRequire('lunar-javascript');
require(path.join(root, 'frontend-docker/tests/helpers/load-source.cjs'));
const {calculateQimen, QIMEN_RULES} = require(path.join(root, 'frontend-docker/src/utils/qimenCalculation.ts'));
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'inputs.json'), 'utf8'));
const rows = cases.map(c => {
  try {
    const timestamp = Date.parse(c.civil.replace(' ', 'T') + ':00+08:00');
    return {id:c.id, raw:calculateQimen({timestamp, timeZone:'Asia/Shanghai'})};
  } catch (e) { return {id:c.id, error:String(e.stack || e)}; }
});
fs.writeFileSync(path.join(__dirname, 'product-output.json'), JSON.stringify({rules:QIMEN_RULES, rows}, null, 2) + '\n');
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, 'solar-term-anchors.json'), 'utf8'));
const termNames = ['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
const table = Solar.fromYmd(2026,6,1).getLunar().getJieQiTable();
const termRows = anchors.map(a => {
  const term = termNames[a.sxtwlIndex];
  // getJieQiTable()['冬至'] refers to the previous year in this table.
  const calendarKey = a.sxtwlIndex === 0 ? 'DONG_ZHI' : term;
  const lunarJavascript = table[calendarKey].toYmdHms();
  if (lunarJavascript.slice(0,10) !== a.civilSecond.slice(0,10)) throw new Error('Solar-term year/date mismatch');
  const deltaSeconds = (Date.parse(lunarJavascript.replace(' ','T')+'+08:00') - Date.parse(a.civilSecond.replace(' ','T')+'+08:00')) / 1000;
  return {...a,term,lunarJavascript,deltaSeconds};
});
fs.writeFileSync(path.join(__dirname, 'calendar-term-differences.json'), JSON.stringify({lunarJavascriptVersion:productRequire('lunar-javascript/package.json').version,rows:termRows},null,2)+'\n');
console.log(JSON.stringify({productCases:rows.length, errors:rows.filter(x=>x.error).length}));
