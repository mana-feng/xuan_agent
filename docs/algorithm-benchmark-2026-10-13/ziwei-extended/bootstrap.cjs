'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'../../..');
const ts=require(path.join(root,'frontend-docker/node_modules/typescript'));
Module._extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
const {calculateZiwei}=require(path.join(root,'frontend-docker/src/utils/ziweiCalculation.ts'));
const f=require(path.join(root,'.local-dev/ziwei-benchmark/package'));
const a='宮業財遷機陽陰貪門殺軍貞輔祿權鉞鈴馬羅廚虛龍鳳紅鸞壽臺誥貴傷長臨帶絕養將書歲氣喪貫弔華災驛廟閣蓋';
const b='宫业财迁机阳阴贪门杀军贞辅禄权钺铃马罗厨虚龙凤红鸾寿台诰贵伤长临带绝养将书岁气丧贯吊华灾驿庙阁盖';
const cn=value=>[...String(value)].map(c=>a.includes(c)?b[a.indexOf(c)]:c).join('');
const B='子丑寅卯辰巳午未申酉戌亥',mod=(x,n=12)=>(x%n+n)%n;
function makeBoard(sample){
 const [y,m,d,h]=sample.civil.match(/\d+/g).map(Number),date=new Date(Date.UTC(y,m-1,d+(h===23?1:0))),hour=h===23?0:h;
 const dateParts={year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),bornTimeHour:hour,configType:f.ConfigType.SKY,gender:sample.gender===1?f.Gender.F:f.Gender.M};
 let config;
 // sxtwl 2.0.6 independent solar-to-lunar values checked by calendar-1900.py.
 // Fortel's conversion starts 1900-01-31; its pure chart constructors have no
 // such range limit. Year stem/branch are direct sexagenary arithmetic.
 const early=require('./calendar-1900.json')[date.toISOString().slice(0,10)];
 if(early)config=new f.DestinyConfig({year:early.lunarYear,month:early.lunarMonth,day:early.lunarDay,isLeapMonth:early.isLeap,yearSky:f.Sky.get(mod(early.lunarYear-4,10)),yearGround:f.Ground.get(mod(early.lunarYear-4)),monthSky:f.Sky.get(early.monthSky),monthGround:f.Ground.get(early.monthGround),daySky:f.Sky.get(early.daySky),dayGround:f.Ground.get(early.dayGround),bornTimeGround:f.DayTimeGround.getByHour(hour),configType:f.ConfigType.SKY,gender:dateParts.gender});
 else config=f.DestinyConfigBuilder.withSolar(dateParts);
 return new f.DestinyBoard(config);
}
module.exports={fs,path,root,f,cn,B,mod,makeBoard,calculateZiwei};
