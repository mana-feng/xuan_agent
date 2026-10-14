'use strict';
// The expected side imports Fortel only. Never import iztro/lunar-lite or product helpers here.
const path = require('node:path');
const root=path.resolve(__dirname,'../../..');
const f=require(path.join(root,'.local-dev/ziwei-benchmark/package'));
const B=[...'子丑寅卯辰巳午未申酉戌亥'], S=[...'甲乙丙丁戊己庚辛壬癸'];
const P=['命宫','兄弟','夫妻','子女','财帛','疾厄','迁移','仆役','官禄','田宅','福德','父母'];
const mod=(x,n=12)=>(x%n+n)%n;
const map=Object.fromEntries(Array.from('宮業財遷機陽陰貪門殺軍貞輔祿權鉞陀羅馬紅鸞歲龍喪將驛華災弔').map((c,i)=>[c,Array.from('宫业财迁机阳阴贪门杀军贞辅禄权钺陀罗马红鸾岁龙丧将驿华灾吊')[i]]));
const cn=v=>String(v).replace(/[宮業財遷機陽陰貪門殺軍貞輔祿權鉞陀羅馬紅鸞歲龍喪將驛華災弔]/g,c=>map[c]).replaceAll('氣','气').replaceAll('貫','贯').replaceAll('蓋','盖');
const palaceName=v=>({'事业':'官禄','交友':'仆役'}[cn(v)]||cn(v));
function parts(civil,rollLate=true){
  let [y,m,d,h=0,mi=0]=civil.match(/\d+/g).map(Number);
  const late=rollLate&&h===23;
  const date=new Date(Date.UTC(y,m-1,d+(late?1:0)));
  return {year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour:late?0:h,minute:mi,date:date.toISOString().slice(0,10),late};
}
function natal(civil,gender,calendar=f.defaultCalendar){
  const p=parts(civil); const config=f.DestinyConfigBuilder.withSolar({year:p.year,month:p.month,day:p.day,bornTimeHour:p.hour,gender:gender?f.Gender.F:f.Gender.M,configType:f.ConfigType.SKY,calendar});
  const board=new f.DestinyBoard(config);
  return {config,board};
}
function expected(birth,target,calendar=f.defaultCalendar){
  const p=parts(target); const l=calendar.solar2lunar(p.year,p.month,p.day);
  const age=l.lunarYear-birth.config.year+1;
  const current=birth.board.cells.find(c=>age>=c.ageStart&&age<=c.ageEnd);
  // Explicit childhood convention (not Fortel's modulo-age implementation).
  const childNames=['命宫','财帛','疾厄','夫妻','福德','官禄'];
  const childhood=!current&&age>=1&&age<=6;
  const dec=current||(childhood?birth.board.cells.find(c=>c.temples.some(t=>palaceName(t)===childNames[age-1])):null);
  const yS=mod(l.lunarYear-4,10),yB=mod(l.lunarYear-4);
  const m=l.lunarMonth+(l.isLeapMonth&&l.lunarDay>15?1:0);
  const mS=mod((yS%5)*2+2+m-1,10),mB=mod(m+1);
  const dS=l.daySky.index,dB=l.dayGround.index,hB=mod(Math.floor((p.hour+1)/2));
  const hS=mod((dS%5)*2+hB,10);
  // Dou-jun: year branch -> reverse birth lunar month -> forward birth hour;
  // then one palace per target lunar month/day/hour. See sources.json.
  const mSoul=mod(yB-birth.config.getLogicalMonth()+birth.config.bornTimeGround.ground.index+m);
  const dSoul=mod(mSoul+l.lunarDay-1),hSoul=mod(dSoul+hB);
  const scope={decadal:[dec?.ground.index??10,dec?.sky.index??0,dec?.ground.index??0],yearly:[yB,yS,yB],monthly:[mSoul,mS,mB],daily:[dSoul,dS,dB],hourly:[hSoul,hS,hB]};
  const fields={'age.nominalAge':age,'calendar.solarDate':p.date,'calendar.lunarYear':l.lunarYear,'calendar.lunarMonth':l.lunarMonth,'calendar.lunarDay':l.lunarDay,'calendar.isLeap':l.isLeapMonth};
  // Published xiaoxian start table; male forward / female backward, repeating every 12 years.
  const ageSoul=mod([10,7,4,1][birth.config.yearGround.index%4]+(age-1)*(birth.config.gender===f.Gender.M?1:-1));
  fields['age.index']=mod(ageSoul-2);
  for(let b=0;b<12;b++)fields[`age.palace.${B[b]}`]=P[mod(ageSoul-b)];
  for(const [name,[soul,stem,branch]] of Object.entries(scope)){
    fields[`${name}.index`]=mod(soul-2); fields[`${name}.stem`]=S[stem];fields[`${name}.branch`]=B[branch];
    for(let b=0;b<12;b++)fields[`${name}.palace.${B[b]}`]=P[mod(soul-b)];
    // Raw Fortel mutagen table deliberately retained, including its 3 known school differences.
    for(const [kind,star] of f.Runtime.getDerivativeMapOf(f.Sky.get(stem)))fields[`${name}.mutagen.${cn(kind)}`]=cn(star);
    for(const [star,ground] of f.Runtime.getRuntimeStarsLocation(f.Sky.get(stem)))fields[`${name}.star.${cn(star)}`]=cn(ground);
    const fake={config:{yearGround:f.Ground.get(branch)}};
    fields[`${name}.star.天马`]=cn(f.MinorStar.minorStarPlacers.get(f.MinorStar.MINOR_STAR_PEGASUS).evalGround(fake));
    for(const [star,label] of [[f.MiniStar.MINI_STAR_FESTIVE,'红鸾'],[f.MiniStar.MINI_STAR_HAPPINESS,'天喜']])fields[`${name}.star.${label}`]=cn(f.MiniStar.miniStarPlacers.get(star).evalGround(fake));
    if(name==='yearly'){
      fields[`${name}.star.年解`]=cn(f.MiniStar.miniStarPlacers.get(f.MiniStar.MINI_STAR_DISSOLVE).evalGround(fake));
      for(const [kind,stars] of [['suiqian12',f.MiniStar.twelveYearGodStars],['jiangqian12',f.MiniStar.twelveLeaderStars]])for(const star of stars){
        const b=cn(f.MiniStar.miniStarPlacers.get(star).evalGround(fake));
        fields[`yearly.${kind}.${b}`]=({'太岁':'岁建','岁破':'大耗'}[cn(star)]||cn(star));
      }
    }
  }
  // Secondary raw API comparison: no patched inputs or methods, no profile adjustments.
  const raw=birth.board.getRuntimContext({lunarYear:l.lunarYear,lunarMonth:l.lunarMonth,lunarDay:l.lunarDay,leap:l.isLeapMonth,calendar});
  const rawFields={};
  for(const [prod,key] of [['decadal','tenYear'],['yearly','year'],['monthly','month'],['daily','day']])rawFields[`${prod}.index`]=mod(raw[key].cellGround.index-2);
  return {fields,rawFields,lunar:l,scope,childhood};
}
module.exports={root,f,B,S,P,mod,cn,parts,natal,expected};
