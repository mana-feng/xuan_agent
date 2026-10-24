const fs=require('fs'),path=require('path'),crypto=require('crypto');
const source=process.argv[2]||'F:/github/xuan_agent/.local-dev/worktrees/frontend-sync';
const root=path.resolve(__dirname,'..'),pkg=path.join(source,'node_modules/iztro');
const {astro}=require(pkg),data=require(path.join(pkg,'lib/data')),{t,setLanguage}=require(path.join(pkg,'lib/i18n')),utils=require(path.join(pkg,'lib/utils'));
if(require(path.join(pkg,'package.json')).version!=='2.5.7')throw Error('Expected iztro 2.5.7');
setLanguage('zh-CN');astro.config({yearDivide:'normal',ageDivide:'normal',horoscopeDivide:'normal',dayDivide:'forward',algorithm:'default'});
const q=JSON.stringify,starKeys=Object.keys(require(path.join(pkg,'lib/data/stars')).STARS_INFO);
if(process.argv.includes('--rules')){
 const lines=['// Generated iztro 2.5.7 static rules (MIT); see docs/android/ziwei-port.md.','package com.xuan.core','','internal object ZiweiRules {','    val brightness = mapOf('];
 starKeys.forEach((k,i)=>{const n=t(k),v=Array.from({length:12},(_,p)=>p===7&&['太阳','太阴','七杀'].includes(n)?({太阳:'平',太阴:'旺',七杀:'旺'})[n]:utils.getBrightness(n,p)||'');lines.push('        '+q(n)+' to listOf('+v.map(q).join(', ')+')'+(i<starKeys.length-1?',':''));});
 lines.push('    )','    val transformations = listOf('+data.HEAVENLY_STEMS.map(k=>'listOf('+data.heavenlyStems[k].mutagen.map(s=>q(t(s))).join(', ')+')').join(', ')+')');
 for(const [key,values]of Object.entries({palaceNames:data.PALACES.map(k=>t(k)),soulStars:data.EARTHLY_BRANCHES.map(k=>t(data.earthlyBranches[k].soul)),bodyStars:data.EARTHLY_BRANCHES.map(k=>t(data.earthlyBranches[k].body))}))lines.push('    val '+key+' = listOf('+values.map(q).join(', ')+')');
 lines.push('}');fs.writeFileSync(path.join(root,'core/src/main/kotlin/com/xuan/core/ZiweiRules.kt'),lines.join('\n')+'\n');
}
const cases=[];function add(civil,gender=0){if(!cases.some(c=>c.civil===civil&&c.gender===gender))cases.push({civil,gender});}
for(let h=0;h<24;h++)add(`1990-06-15T${String(h).padStart(2,'0')}:30:00`,h%2);
for(let y=1984;y<1996;y++)for(let g=0;g<2;g++)add(`${y}-08-16T10:30:00`,g);
for(const s of ['1900-02-01T00:30:00','2099-12-31T23:30:00','2023-03-22T00:30:00','2023-04-05T22:59:00','2023-04-05T23:00:00','2023-04-06T00:00:00','2023-04-19T23:00:00','2024-02-09T22:59:00','2024-02-09T23:00:00','2024-02-10T00:00:00','2024-02-03T23:30:00','2024-12-31T23:30:00'])for(let g=0;g<2;g++)add(s,g);
for(let m=1;m<=12;m++)add(`2025-${String(m).padStart(2,'0')}-20T14:00:00`,m%2);
for(let i=0;i<72;i++)add(`${1910+i*2}-${String(1+i%12).padStart(2,'0')}-${String(1+i%27).padStart(2,'0')}T${String(i%24).padStart(2,'0')}:15:00`,i%2);
const lines=[],fmt=ss=>ss.map(s=>[s.name,s.brightness||'',s.mutagen||''].join(':')).join(',');
for(const {civil,gender}of cases){const dt=new Date(civil+'Z'),h=dt.getUTCHours();if(h===23)dt.setUTCDate(dt.getUTCDate()+1);const date=dt.toISOString().slice(0,10),ti=h===23?0:Math.floor((h+1)/2),chart=astro.bySolar(date,ti,gender===1?'女':'男',true,'zh-CN');
 for(const p of chart.palaces)if(p.earthlyBranch==='酉')for(const s of p.majorStars)if(['太阳','太阴','七杀'].includes(s.name))s.brightness={太阳:'平',太阴:'旺',七杀:'旺'}[s.name];
 const o={soulPalace:chart.earthlyBranchOfSoulPalace,bodyPalace:chart.earthlyBranchOfBodyPalace,soul:chart.soul,body:chart.body,fiveElementsClass:chart.fiveElementsClass,calculationDate:date,timeIndex:String(ti),lateZiRollover:String(h===23)};
 for(const p of chart.palaces){const k=`palace.${p.index}.`;Object.assign(o,{[k+'name']:p.name,[k+'stemBranch']:p.heavenlyStem+p.earthlyBranch,[k+'isBody']:String(p.isBodyPalace),[k+'isOriginal']:String(p.isOriginalPalace),[k+'majorStars']:fmt(p.majorStars),[k+'minorStars']:fmt(p.minorStars),[k+'adjectiveStars']:fmt(p.adjectiveStars),[k+'changsheng']:p.changsheng12,[k+'boshi']:p.boshi12,[k+'jiangqian']:p.jiangqian12,[k+'suiqian']:p.suiqian12,[k+'decadal']:p.decadal.range.join(','),[k+'ages']:p.ages.join(',')});}
 lines.push([civil,gender,...Object.entries(o).map(([k,v])=>k+'='+v)].join('\t'));
}
const dest=path.join(root,'core/src/test/resources/ziwei-reference.tsv');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,lines.join('\n')+'\n');console.log(JSON.stringify({cases:cases.length,sha256:crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex'),rulesWritten:process.argv.includes('--rules')}));
