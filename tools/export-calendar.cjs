/* Build-time exporter only; never shipped or executed in Android. Source version is pinned. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/export-calendar.cjs <frontend checkout with npm ci>');
const {Solar, LunarYear, LunarUtil} = require(path.join(source,'node_modules/lunar-javascript'));
const version = require(path.join(source,'node_modules/lunar-javascript/package.json')).version;
if(version !== '1.7.7') throw new Error('Expected lunar-javascript 1.7.7');
const months = new Map(), terms = new Map();
const alias={DA_XUE:'大雪',DONG_ZHI:'冬至',XIAO_HAN:'小寒',DA_HAN:'大寒',LI_CHUN:'立春',YU_SHUI:'雨水',JING_ZHE:'惊蛰'};
for(let year=1899;year<=2101;year++) {
  for(const m of LunarYear.fromYear(year).getMonths()) {
    const date=Solar.fromJulianDay(m.getFirstJulianDay()).toYmd();
    months.set(date,['M',m.getYear(),m.getMonth(),m.getDayCount(),date].join('\t'));
  }
  for(const [key,s] of Object.entries(Solar.fromYmd(year,6,1).getLunar().getJieQiTable())) {
    const name=alias[key]||key, civil=s.toYmdHms();
    terms.set(civil,['T',name,civil].join('\t'));
  }
}
const out=path.resolve(__dirname,'../android-app/core/src/main/resources/calendar.tsv');
const body='# lunar-javascript@1.7.7 MIT; calendar data only; regenerate with tools/export-calendar.cjs\n'+[...months].sort().map(x=>x[1]).join('\n')+'\n'+[...terms].sort().map(x=>x[1]).join('\n')+'\n';
fs.writeFileSync(out,body);
const fixtures=[];
function freeze(civil) {
 const p=civil.split(/[- :]/).map(Number),s=Solar.fromYmdHms(...p),l=s.getLunar();
 for(const rule of ['midnight','zi']) {
 const e=l.getEightChar(); e.setSect(rule==='zi'?1:2);
 for(const gender of [0,1]) {
 const y=e.getYun(gender===0?1:0);
 fixtures.push([civil,rule,gender,e.getYear(),e.getMonth(),e.getDay(),e.getTime(),y.isForward(),y.getStartYear(),y.getStartMonth(),y.getStartDay(),y.getStartSolar().toYmdHms(),y.getDaYun().slice(1).map(d=>[d.getGanZhi(),d.getStartYear(),d.getStartAge()].join(',')).join(';')].join('\t'));
 }
 }
}
for(const year of [1900,1949,1991,2000,2023,2024,2099]) {
 for(const month of [1,2,3,6,9,12]) for(const hour of [0,12,23]) freeze(`${year}-${String(month).padStart(2,'0')}-15 ${String(hour).padStart(2,'0')}:30:00`);
 for(const [civil,line] of terms) if(civil.startsWith(year+'-')&&['立春','惊蛰','大雪','小寒'].includes(line.split('\t')[1])) {
 const p=civil.split(/[- :]/).map(Number);const date=new Date(Date.UTC(p[0],p[1]-1,...p.slice(2)));
 for(const delta of [-1,0,1]) freeze(new Date(+date+delta*1000).toISOString().slice(0,19).replace('T',' '));
 }
}
fs.writeFileSync(path.resolve(__dirname,'../android-app/core/src/test/resources/bazi-reference.tsv'),fixtures.join('\n')+'\n');
const staticData={hidden:LunarUtil.ZHI_HIDE_GAN,nayin:LunarUtil.NAYIN};
fs.writeFileSync(path.resolve(__dirname,'../android-app/core/src/main/resources/bazi-static.tsv'),Object.entries(staticData.hidden).map(([k,v])=>'H\t'+k+'\t'+v.join('')).concat(Object.entries(staticData.nayin).map(([k,v])=>'N\t'+k+'\t'+v)).join('\n'));
fs.writeFileSync(path.resolve(__dirname,'../docs/android/calendar-provenance.json'),JSON.stringify({source:'6tail/lunar-javascript',version,license:'MIT',sha256:crypto.createHash('sha256').update(body).digest('hex'),months:months.size,terms:terms.size,fixtureRows:fixtures.length,inputRange:[1900,2099],runtime:'Kotlin only; no chart snapshots or JS engine'},null,2));
fs.copyFileSync(path.join(source,'node_modules/lunar-javascript/LICENSE'),path.resolve(__dirname,'../android-app/core/src/main/resources/LICENSE-lunar-javascript.txt'));
console.log(JSON.stringify({months:months.size,terms:terms.size,fixtureRows:fixtures.length}));
