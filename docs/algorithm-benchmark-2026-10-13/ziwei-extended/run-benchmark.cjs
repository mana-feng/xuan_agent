'use strict';
const {fs,path,root,f,cn,B,mod,makeBoard,calculateZiwei}=require('./bootstrap.cjs');
const primary=require('./primary-rules.cjs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {once}=require('node:events');
const all=JSON.parse(fs.readFileSync(path.join(__dirname,'../ziwei/inputs.json'),'utf8'));
const samples=process.env.BENCHMARK_PREVIEW?all.filter((s,i)=>i%41===0||!['sexagenary-grid','lunar-day-grid'].includes(s.category)):all;
const stats={},rawStats={},examples={},brightnessCells={},unresolved=[],early=[],groups={};
let compared=0,checks=0,equal=0,brightnessDifferences=0;
const normalizePalace=n=>({'事业':'官禄','交友':'仆役'}[cn(n)]||cn(n));
const aliases={boshi12:{蜚廉:'飞廉'},suiqian12:{太岁:'岁建',岁破:'大耗'}};
const pad=x=>String(x).padStart(2,'0');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const productionHashes=Object.fromEntries(['ziweiCalculation.ts','chartTime.ts'].map(n=>[n,hash(path.join(root,'frontend-docker/src/utils',n))]));
const outputPrefix=process.env.BENCHMARK_PREVIEW?'preview-':process.env.BENCHMARK_RUN?process.env.BENCHMARK_RUN+'-':'';
function extractFortel(board){
 const raw={soul:cn(board.destinyMaster),body:cn(board.bodyMaster)},starKinds={};
 for(const c of board.cells){
  const b=cn(c.ground);
  for(const [key,value] of [['changsheng12',c.lifeStage],['boshi12',c.scholarStar],['jiangqian12',c.leaderStar],['suiqian12',c.yearGodStar]])raw[`${key}.${b}`]=cn(value);
  for(const star of [...c.minorStars,...c.miniStars]){
   const name=star===f.MiniStar.MINI_STAR_DISSOLVE?'年解':cn(star.displayName);
   (raw['star.'+name]||=[]).push(b);starKinds[name]=c.minorStars.includes(star)?'minor':'adjective';
  }
 }
 for(const v of Object.values(raw))if(Array.isArray(v))v.sort();
 return {raw,starKinds};
}
function extractProduction(chart){
 const raw={soul:chart.soul,body:chart.body};
 for(const p of chart.palaces){
  const b=p.earthlyBranch;
  for(const key of ['changsheng12','boshi12','jiangqian12','suiqian12'])raw[`${key}.${b}`]=p[key];
  for(const star of [...p.minorStars,...p.adjectiveStars,...p.majorStars.filter(s=>s.type!=='major')])(raw['star.'+star.name]||=[]).push(b);
 }
 for(const v of Object.values(raw))if(Array.isArray(v))v.sort();return raw;
}
function rawClassification(key){
 if(key==='soul')return 'Fortel-uses-year-branch;primary-text-uses-soul-palace';
 if(/^star\.(天伤|天使)$/.test(key))return 'Fortel-swaps-for-yin-male-yang-female;primary-text-fixes-palaces';
 if(key==='star.旬空')return 'two-palace-pair-versus-year-polarity-single-palace';
 if(/^star\.(截空|截路|空亡)$/.test(key))return 'same-pair-two-Fortel-copies-versus-two-product-names';
 if(/^star\.(大耗|劫煞)$/.test(key))return 'Fortel-adjective-present;product-default-repertoire-omits';
 if(/^star\.(华盖|天德)$/.test(key))return 'Fortel-deity-only;product-also-lists-as-adjective';
 if(key.startsWith('boshi12.'))return 'alias-蜚廉-飞廉';
 if(key.startsWith('suiqian12.'))return 'alias-太岁-岁建-or-岁破-大耗';
 return 'UNRESOLVED';
}
async function main(){
 const started=Date.now();const dest=fs.createWriteStream(path.join(__dirname,outputPrefix+'all-results.jsonl.gz')),gzip=zlib.createGzip({level:6});gzip.pipe(dest);
 for(const sample of samples){
  const {chart,metadata}=calculateZiwei(sample),board=makeBoard(sample),{raw:expectedRaw,starKinds}=extractFortel(board),actualRaw=extractProduction(chart),cfg=board.config;
  const record={sample,fortel:expectedRaw,actual:actualRaw,rawDifferences:[],independentChecks:{},checkDifferences:[]};
  const add=(field,expected,actual,source='Fortel1.3.4',allowed=null)=>{
   checks++;const ok=JSON.stringify(expected)===JSON.stringify(actual);if(ok)equal++;
   const s=stats[field]||={compared:0,equal:0,different:0,source};s.compared++;s[ok?'equal':'different']++;
   record.independentChecks[field]={expected,actual};
   if(!ok){const diff={field,expected,actual,classification:allowed||'UNRESOLVED'};record.checkDifferences.push(diff);examples[field]||={sample,...diff};if(!allowed)unresolved.push({sample,...diff});}
  };
  for(const key of new Set([...Object.keys(expectedRaw),...Object.keys(actualRaw)])){
   const e=expectedRaw[key]??null,a=actualRaw[key]??null,ok=JSON.stringify(e)===JSON.stringify(a),s=rawStats[key]||={compared:0,equal:0,different:0};s.compared++;s[ok?'equal':'different']++;
   if(!ok){const diff={field:key,expected:e,actual:a,classification:rawClassification(key)};record.rawDifferences.push(diff);examples['raw.'+key]||={sample,...diff};if(diff.classification==='UNRESOLVED')unresolved.push({sample,...diff});}
  }
  const soulBranch=cn(board.getCellByTemple(f.Temple.TEMPLE_DESTINY).ground),bodyBranch=cn(board.getCellByTemple(f.Temple.TEMPLE_BODY).ground);
  add('soul',primary.soul[B.indexOf(soulBranch)],chart.soul,'Quanshu-vol2-安命主');add('body',expectedRaw.body,chart.body);
  for(const [key,e] of Object.entries(expectedRaw)){
   if(!key.startsWith('star.'))continue;const name=key.slice(5);
   if(['天伤','天使','旬空','截空','大耗','劫煞'].includes(name))continue;
   add(`${starKinds[name]}.${name}`,e,actualRaw[key]);
  }
  for(const [star,temple] of [['天伤','仆役'],['天使','疾厄']]){
   const cell=board.cells.find(c=>c.temples.some(t=>normalizePalace(t)===temple));
   add('adjective.'+star,[cn(cell.ground)],actualRaw['star.'+star],'Quanshu-vol2-安天伤天使诀');
  }
  // Keep both original positions. This check validates their paired placement,
  // not the product-specific naming or the omission of the second 旬空 label.
  add('empty-pair.截路空亡',expectedRaw['star.截空'],[...actualRaw['star.截路'],...actualRaw['star.空亡']].sort(),'Fortel+Quanshu-vol2-安截路空亡诀');
  const selectedEmpty=expectedRaw['star.旬空'].filter(b=>B.indexOf(b)%2===cfg.yearGround.index%2);
  add('empty-selection.旬空',selectedEmpty,actualRaw['star.旬空'],'Fortel-pair+WangXingdong-2023-original-teaching');
  for(const [name,kind] of [['华盖','leaderStar'],['天德','yearGodStar']])add('adjective.'+name,board.cells.filter(c=>cn(c[kind])===name).map(c=>cn(c.ground)),actualRaw['star.'+name],'Fortel-deity-placement');
  const ages=primary.ages(cfg.yearGround.index,sample.gender);
  for(const p of chart.palaces){
   const b=p.earthlyBranch,cell=board.cells.find(c=>cn(c.ground)===b);
   for(const key of ['changsheng12','boshi12','jiangqian12','suiqian12'])add(`${key}.${b}`,aliases[key]?.[expectedRaw[`${key}.${b}`]]||expectedRaw[`${key}.${b}`],p[key]);
   for(let i=0;i<10;i++)add(`ages.${b}.${i}`,ages[b][i],p.ages[i],'Quanshu-vol2-安小限诀');
   add(`isBodyPalace.${b}`,b===bodyBranch,p.isBodyPalace);
   add(`isOriginalPalace.${b}`,b===B[[10,9,8,7,6,5,4,3,2,11][cfg.yearSky.index]],p.isOriginalPalace,'goch.tw/article/info/45-original-teacher-table');
   add(`decadalStem.${b}`,cn(cell.sky),p.decadal.heavenlyStem);add(`decadalBranch.${b}`,cn(cell.ground),p.decadal.earthlyBranch);
   for(const star of [...p.majorStars,...p.minorStars])if(star.brightness){
    const key=star.name+'.'+b,e=primary.brightness[key];
    const allowed=['太阳.酉','太阴.酉','七杀.酉'].includes(key)?'primary-table-disagreement;unresolved-provenance-of-production-choice':null;
    add('brightness.'+key,e,star.brightness,'Quanshu-vol2-branch-ordered-table',allowed);
    const c=brightnessCells[key]||={expected:e,actualValues:[],cases:0};c.cases++;if(!c.actualValues.includes(star.brightness))c.actualValues.push(star.brightness);
    if(e!==star.brightness)brightnessDifferences++;
   }
  }
  const digits='〇一二三四五六七八九',months=['正','二','三','四','五','六','七','八','九','十','冬','腊'],days=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  add('lunarDate',[...String(cfg.year)].map(n=>digits[+n]).join('')+'年'+(cfg.isLeapMonth?'闰':'')+months[cfg.month-1]+'月'+days[cfg.day-1],chart.lunarDate,'Fortel-lunar+literal-Chinese-number-format');
  add('gender',sample.gender===1?'女':'男',chart.gender,'input');
  add('zodiac',[...'鼠牛虎兔龙蛇马羊猴鸡狗猪'][cfg.yearGround.index],chart.zodiac,'Fortel-year-branch+traditional-zodiac-mapping');
  const [y,m,d,h]=sample.civil.match(/\d+/g).map(Number),civilDate=new Date(Date.UTC(y,m-1,d+(h===23?1:0))),hour=h===23?0:h,hourIndex=Math.floor((hour+1)/2);
  // Re-run all 81 fields from the original independent core comparison on the
  // CURRENT production module, in addition to the new display-field checks.
  if(process.env.BENCHMARK_RUN==='after'){
   const core=(key,e,a,allowed)=>add('core81.'+key,e,a,'Fortel1.3.4+fixture-civil',allowed);
   core('input.birthCivil',sample.civil,metadata.birthCivil);core('input.calculationDate',civilDate.toISOString().slice(0,10),metadata.calculationDate);core('input.timeIndex',hourIndex,metadata.timeIndex);core('input.lateZiRollover',h===23,metadata.lateZiRollover);
   for(const [k,v] of Object.entries({year:cfg.year,month:cfg.month,day:cfg.day,isLeap:cfg.isLeapMonth}))core('lunar.'+k,v,metadata.lunar[k]);
   core('soul',soulBranch,chart.earthlyBranchOfSoulPalace);core('body',bodyBranch,chart.earthlyBranchOfBodyPalace);core('fiveClass',cn(board.element),chart.fiveElementsClass);
   for(const p of chart.palaces){const c=board.cells.find(c=>cn(c.ground)===p.earthlyBranch),b=p.earthlyBranch;core('palace.'+b+'.name',normalizePalace(c.temples.find(t=>cn(t)!=='身宫')),p.name);core('palace.'+b+'.stem',cn(c.sky),p.heavenlyStem);core('decadal.'+b+'.start',c.ageStart,p.decadal.range[0]);core('decadal.'+b+'.end',c.ageEnd,p.decadal.range[1]);for(const star of c.majorStars){const n=cn(star);core('major.'+n,b,chart.palaces.find(p=>p.majorStars.some(s=>s.name===n))?.earthlyBranch);}}
   for(const [kind,star] of board.bornStarDerivativeMap){const name=cn(star),k=cn(kind),cell=board.cells.find(c=>[...c.majorStars,...c.minorStars].some(s=>cn(s)===name)),actual=chart.palaces.flatMap(p=>[...p.majorStars,...p.minorStars].filter(s=>s.mutagen===k).map(s=>({name:s.name,branch:p.earthlyBranch})))[0],variant={戊:['太阳','右弼'],庚:['天府','太阴'],壬:['天府','左辅']}[cn(cfg.yearSky)],allowed=k==='科'&&variant&&name===variant[0]&&actual?.name===variant[1]?'documented-sihua-school-difference':null;core('sihua.'+k+'.star',name,actual?.name,allowed);core('sihua.'+k+'.branch',cn(cell.ground),actual?.branch,allowed);}
  }
  add('solarDate',civilDate.toISOString().slice(0,10),chart.solarDate,'fixture-civil+declared-23-rollover');
  add('time',hourIndex===0?'早子时':B[hourIndex]+'时',chart.time,'literal-hour-branch-definition');
  add('timeRange',hourIndex===0?'00:00~01:00':pad(hourIndex*2-1)+':00~'+pad(hourIndex*2+1)+':00',chart.timeRange,'literal-two-hour-interval');
  if(civilDate.getUTCFullYear()===1900&&civilDate.getUTCMonth()===0&&civilDate.getUTCDate()<31){
   for(const [k,v] of Object.entries({year:cfg.year,month:cfg.month,day:cfg.day,isLeap:cfg.isLeapMonth}))add('early.lunar.'+k,v,metadata.lunar[k],'sxtwl2.0.6');
   add('early.fiveClass',cn(board.element),chart.fiveElementsClass);
   for(const p of chart.palaces){const c=board.cells.find(c=>cn(c.ground)===p.earthlyBranch);add('early.palace.'+p.earthlyBranch,normalizePalace(c.temples.find(t=>cn(t)!=='身宫')),p.name);add('early.stem.'+p.earthlyBranch,cn(c.sky),p.heavenlyStem);add('early.range.'+p.earthlyBranch,[c.ageStart,c.ageEnd],p.decadal.range);for(const star of c.majorStars){const n=cn(star);add('early.major.'+n,p.earthlyBranch,chart.palaces.find(p=>p.majorStars.some(s=>s.name===n))?.earthlyBranch);}}
   add('early.soulPalace',soulBranch,chart.earthlyBranchOfSoulPalace);add('early.bodyPalace',bodyBranch,chart.earthlyBranchOfBodyPalace);early.push(record);
   for(const [kind,star] of board.bornStarDerivativeMap){const name=cn(star),actual=chart.palaces.flatMap(p=>[...p.majorStars,...p.minorStars].filter(s=>s.mutagen===cn(kind)).map(s=>({name:s.name,branch:p.earthlyBranch})));const cell=board.cells.find(c=>[...c.majorStars,...c.minorStars].some(s=>cn(s)===name));add('early.sihua.'+cn(kind),[{name,branch:cn(cell.ground)}],actual);}
  }
  compared++;const g=groups[sample.category]||={cases:0,rawDifferences:0,checkDifferences:0};g.cases++;g.rawDifferences+=record.rawDifferences.length;g.checkDifferences+=record.checkDifferences.length;
  if(!gzip.write(JSON.stringify(record)+'\n'))await once(gzip,'drain');
  if(compared%2000===0)console.log(JSON.stringify({compared,checks,equal,unresolved:unresolved.length}));
 }
 gzip.end();await once(dest,'finish');
 const summary={generatedAt:new Date().toISOString(),durationMs:Date.now()-started,cases:compared,checks,equal,brightnessDifferences,unresolved:unresolved.length,groups,stats,rawStats,brightnessCells,source:primary.source,productionHashes,sourceHashes:{fortelBuild:hash(path.join(root,'.local-dev/ziwei-benchmark/package/build/main.js')),primaryRules:hash(path.join(__dirname,'primary-rules.cjs')),calendar1900:hash(path.join(__dirname,'calendar-1900.json'))}};
 const prefix=outputPrefix;
 for(const [name,value] of Object.entries({summary,examples,unresolved,'early-1900':early}))fs.writeFileSync(path.join(__dirname,prefix+name+'.json'),JSON.stringify(value,null,2)+'\n');
 console.log(JSON.stringify({cases:compared,checks,equal,brightnessDifferences,unresolved:unresolved.length,durationMs:summary.durationMs,brightnessCellCoverage:Object.keys(brightnessCells).length},null,2));
 if(unresolved.length)process.exitCode=2;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
