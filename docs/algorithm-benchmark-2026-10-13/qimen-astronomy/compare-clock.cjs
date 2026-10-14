const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../..');
const req=createRequire(path.join(root,'frontend-docker/package.json'));
const {Solar,ShouXingUtil}=req('lunar-javascript');
require(path.join(root,'frontend-docker/tests/helpers/load-source.cjs'));
const {calculateQimen}=require(path.join(root,'frontend-docker/src/utils/qimenCalculation.ts'));
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'jpl-de440s-year-samples.json'),'utf8'));
const seconds=86400;
function jdFromIso(iso){return Date.parse(iso)/86400000+2440587.5;}
const rows=source.rows.map(r=>{
  const table=Solar.fromYmd(r.year,6,1).getLunar().getJieQiTable();
  const term=table[r.term==='冬至'?'DONG_ZHI':r.term];
  const roundedCivil=term.toYmdHms();
  const rawCivilJd=ShouXingUtil.qiAccurate2(term.getJulianDay()-2451545)+2451545;
  // Recover TT using the same dtT conversion that qiAccurate subtracts.
  let recoveredTT=rawCivilJd-8/24;
  for(let i=0;i<3;i++) recoveredTT=rawCivilJd-8/24+ShouXingUtil.dtT(recoveredTT-2451545);
  const productDeltaT=ShouXingUtil.dtT(recoveredTT-2451545)*seconds;
  const rawUtcJd=rawCivilJd-8/24;
  const utcJd=jdFromIso(r.utcOrAssumedUtc);
  return {...r,productRoundedCivil:roundedCivil,productRawCivilJD:rawCivilJd,productRecoveredTT:recoveredTT,
    productDeltaTSeconds:productDeltaT,productAstronomyTTErrorSeconds:(recoveredTT-r.jdTT)*seconds,
    productVsUt1ModelSeconds:(rawUtcJd-r.jdUT1)*seconds,
    productVsUtcOrAssumedUtcRawSeconds:(rawUtcJd-utcJd)*seconds,
    productVsUtcOrAssumedUtcRoundedSeconds:(Date.parse(roundedCivil.replace(' ','T')+'+08:00')-Date.parse(r.utcOrAssumedUtc))/1000};
});
fs.writeFileSync(path.join(__dirname,'time-scale-comparison.json'),JSON.stringify({lunarVersion:req('lunar-javascript/package.json').version,
  caution:'Pre-1960 UTC is undefined; future UTC assumes no new leap seconds. UT1 uses the saved Skyfield historical/predicted deltaT model. TT residual isolates solar/nutation model error.',rows},null,2)+'\n');

const jpl=JSON.parse(fs.readFileSync(path.join(__dirname,'jpl-de440s-2026.json'),'utf8'));
const termNames=['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
const fixtures=[];
for(const row of jpl.rows){
  for(const offset of [-3,3]){
    const timestamp=Date.parse(row.utc)+offset*1000;
    const actual=calculateQimen({timestamp,timeZone:'Asia/Shanghai'});
    const termIndex=termNames.indexOf(row.term);
    const expected=offset<0?termNames[(termIndex+23)%24]:row.term;
    fixtures.push({id:row.term+(offset<0?'-before':'-after'),jplUtc:row.utc,jplOffsetSeconds:offset,timestamp,
      expectedTerm:expected,actualTerm:actual.juShu.jieQiName,equal:actual.juShu.jieQiName===expected,
      calculationCivil:actual.metadata.calculationCivil,juShu:actual.juShu,siZhu:actual.siZhu});
  }
}
fs.writeFileSync(path.join(__dirname,'jpl-boundary-fixtures.json'),JSON.stringify({toleranceSeconds:3,note:'2026 only; fixtures derive from JPL, not the product calendar.',rows:fixtures},null,2)+'\n');
console.log(JSON.stringify({boundaryFixtures:fixtures.length,equal:fixtures.filter(x=>x.equal).length,sampledTerms:rows.length}));
