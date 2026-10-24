const fs=require('fs');
const root='F:/github/xuan_agent/.local-dev/worktrees/frontend-sync/node_modules/';
const {astro,star,util}=require(root+'iztro');
astro.config({yearDivide:'normal',ageDivide:'normal',horoscopeDivide:'normal',dayDivide:'forward',algorithm:'default'});
const natalCases=[['1952-01-15',0,0],['1990-06-15',5,0],['2023-04-05',6,1],['1900-01-01',0,1]];
const targets=['1900-02-01 00:00','2023-04-05 22:59','2023-04-05 23:00','2023-04-06 00:00','2024-02-09 22:59','2024-02-09 23:00','2024-02-10 00:00','2026-10-25 14:30','2075-01-01 00:00','2099-12-31 22:59'];
for(let y=2020;y<=2031;y++)for(let month=1;month<=12;month++)targets.push(y+'-'+String(month).padStart(2,'0')+'-17 13:30');
const rows=[];
for(const [birth,ti,gender] of natalCases)for(const target of targets){
 let d=new Date(target.replace(' ','T')+':00Z');const h=d.getUTCHours(),time=h===23?0:Math.floor((h+1)/2);if(h===23)d.setUTCDate(d.getUTCDate()+1);
 const c=astro.bySolar(birth,ti,gender?'女':'男',true,'zh-CN');let v=c.horoscope(d.toISOString().slice(0,10)+' 00:00:00',time);
 if(v.age.nominalAge<1||v.decadal.index<0)continue;
 if(v.age.index<0){const age=(v.age.nominalAge-1)%120+1;const p=c.palaces.find(p=>p.ages.includes(age));v.age.index=p.index;v.age.heavenlyStem=p.heavenlyStem;v.age.earthlyBranch=p.earthlyBranch;v.age.mutagen=util.getMutagensByHeavenlyStem(p.heavenlyStem);}
 const hourStem='甲乙丙丁戊己庚辛壬癸'[('甲乙丙丁戊己庚辛壬癸'.indexOf(v.daily.heavenlyStem)%5*2+time)%10];
 v.hourly={...v.hourly,index:(v.daily.index+time)%12,heavenlyStem:hourStem,earthlyBranch:'子丑寅卯辰巳午未申酉戌亥'[time],mutagen:util.getMutagensByHeavenlyStem(hourStem),stars:star.getHoroscopeStar(hourStem,'子丑寅卯辰巳午未申酉戌亥'[time],'hourly')};
 const fields=[birth+' '+String(Math.max(ti*2-1,0)).padStart(2,'0')+':30',gender,target,v.age.nominalAge];
 for(const scope of ['decadal','age','yearly','monthly','daily','hourly']){const s=v[scope];fields.push(scope+'='+s.index+','+s.heavenlyStem+s.earthlyBranch);fields.push(scope+'.mutagens='+s.mutagen.join(','));if(s.stars)fields.push(scope+'.stars='+s.stars.map(p=>p.map(s=>s.name).join(',')).join('|'));}
 fields.push('yearly.deities='+v.yearly.yearlyDecStar.jiangqian12.map((s,i)=>s+','+v.yearly.yearlyDecStar.suiqian12[i]).join('|'));
 rows.push(fields.join('\t'));
}
fs.writeFileSync('android-app/core/src/test/resources/ziwei-flow-reference.tsv',rows.join('\n')+'\n');console.log(rows.length);
