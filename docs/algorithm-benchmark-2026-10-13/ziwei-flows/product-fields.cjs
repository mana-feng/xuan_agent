'use strict';
// Actual-side serialization only. Never used to derive expected values.
const B=[...'子丑寅卯辰巳午未申酉戌亥'];
const alias={'魁':'天魁','钺':'天钺','昌':'文昌','曲':'文曲','禄':'禄存','羊':'擎羊','陀':'陀罗','马':'天马','鸾':'红鸾','喜':'天喜'};
module.exports=function productFields(h){
 const a={'age.nominalAge':h.age.nominalAge,'age.index':h.age.index,'calendar.solarDate':h.solarDate.split('-').map((x,i)=>i?String(x).padStart(2,'0'):x).join('-')};
 h.age.palaceNames.forEach((v,i)=>a[`age.palace.${B[(i+2)%12]}`]=v);
 for(const scope of ['decadal','yearly','monthly','daily','hourly']){
  const s=h[scope];a[`${scope}.index`]=s.index;a[`${scope}.stem`]=s.heavenlyStem;a[`${scope}.branch`]=s.earthlyBranch;
  s.palaceNames.forEach((v,i)=>a[`${scope}.palace.${B[(i+2)%12]}`]=v);
  s.mutagen.forEach((v,i)=>a[`${scope}.mutagen.${'禄权科忌'[i]}`]=v);
  s.stars.forEach((stars,i)=>stars.forEach(star=>a[`${scope}.star.${star.name==='年解'?'年解':alias[star.name.slice(-1)]}`]=B[(i+2)%12]));
  if(scope==='yearly')for(const k of ['suiqian12','jiangqian12'])s.yearlyDecStar[k].forEach((v,i)=>a[`yearly.${k}.${B[(i+2)%12]}`]=v);
 }
 const match=/^([〇零一二三四五六七八九\d]+)年(闰)?(.+)月(.+)$/.exec(h.lunarDate);
 if(!match)throw Error(`Unexpected lunar format: ${h.lunarDate}`);
 const months=['正','二','三','四','五','六','七','八','九','十','冬','腊'];
 const days=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
 const year=Number(match[1].replace(/[〇零一二三四五六七八九]/g,c=>c==='〇'?0:'零一二三四五六七八九'.indexOf(c)));
 return Object.assign(a,{'calendar.lunarYear':year,'calendar.lunarMonth':months.indexOf(match[3])+1,'calendar.lunarDay':days.indexOf(match[4])+1,'calendar.isLeap':!!match[2]});
};
