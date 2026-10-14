const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// This loader transpiles TypeScript. The calculators use the real installed
// iztro/lunar libraries and vendored Qimen engine, with no algorithm mocks.
require('../../frontend-docker/tests/helpers/load-source.cjs');
const { astro } = require('../../frontend-docker/node_modules/iztro');
const { civilToTimestamp } = require('../../frontend-docker/src/utils/chartTime.ts');
const { calculateZiwei, withZiweiConfig, ZIWEI_RULES } = require('../../frontend-docker/src/utils/ziweiCalculation.ts');
const { calculateQimen, QIMEN_RULES } = require('../../frontend-docker/src/utils/qimenCalculation.ts');
const input = (civil, timeZone='Asia/Shanghai') => ({timestamp:civilToTimestamp(civil,timeZone),timeZone,gender:1});
const summarize = c => ({soul:c.earthlyBranchOfSoulPalace,body:c.earthlyBranchOfBodyPalace,fiveElements:c.fiveElementsClass,lunarDate:c.lunarDate,majorStars:c.palaces.map(p=>({palace:p.name,branch:p.earthlyBranch,stars:p.majorStars.map(s=>({name:s.name,mutagen:s.mutagen}))}))});
const ziwei = ['2023-04-05','2023-04-06','2023-04-19','2023-01-21','2023-02-19'].map(date=>{
  const previous = withZiweiConfig(()=>astro.bySolar(date,12,'女',true,'zh-CN'));
  const actual = calculateZiwei(input(date+' 23:00'));
  const next = calculateZiwei(input(actual.metadata.calculationDate+' 00:00'));
  return {civil:date+' 23:00',before:summarize(previous),after:summarize(actual.chart),metadata:actual.metadata,allPalacesEqualNextMidnight:JSON.stringify(actual.chart.palaces)===JSON.stringify(next.chart.palaces)};
});
const qimen = ['2026-06-05 16:52','2026-06-05 23:47','2026-06-05 23:49','2026-06-21 16:24','2026-06-21 16:26','2023-01-21 23:00','2023-01-22 00:00'].map(civil=>calculateQimen(input(civil)));
fs.writeFileSync(path.join(__dirname,'real-results.json'),JSON.stringify({generatedAt:new Date().toISOString(),ziweiRules:ZIWEI_RULES,qimenRules:QIMEN_RULES,ziwei,qimen},null,2)+'\n');
const vendor = path.resolve(__dirname,'../../frontend-docker/vendor/qfdk-qimen');
const hashes = fs.readdirSync(path.join(vendor,'lib')).filter(f=>f.endsWith('.js')).map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(vendor,'lib',file))).digest('hex')}));
fs.writeFileSync(path.join(__dirname,'patched-sha256.json'),JSON.stringify(hashes,null,2)+'\n');
console.log(`Saved ${ziwei.length} Ziwei before/after cases, ${qimen.length} full real Qimen results, and ${hashes.length} source hashes.`);
