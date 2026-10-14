'use strict';
const {fs,path,root,f,cn,B,mod,makeBoard,calculateZiwei}=require('./bootstrap.cjs');
const all=JSON.parse(fs.readFileSync(path.join(__dirname,'../ziwei/inputs.json'),'utf8'));
const samples=all.filter((s,i)=>i%41===0||!['sexagenary-grid','lunar-day-grid'].includes(s.category));
const stats={},examples={},names={actual:[],expected:[]};
for(const sample of samples){
 const actual=calculateZiwei(sample).chart,board=makeBoard(sample),expected={},prod={};
 expected.soul=cn(board.destinyMaster);expected.body=cn(board.bodyMaster);prod.soul=actual.soul;prod.body=actual.body;
 for(const cell of board.cells){
  const branch=cn(cell.ground);
  for(const [name,value] of [['changsheng12',cell.lifeStage],['boshi12',cell.scholarStar],['jiangqian12',cell.leaderStar],['suiqian12',cell.yearGodStar]])expected[`${name}.${branch}`]=cn(value);
  for(const s of [...cell.minorStars,...cell.miniStars]){
   let n=cn(s.displayName);if(s===f.MiniStar.MINI_STAR_DISSOLVE)n='年解';
   const key='star.'+n;(expected[key]||=[]).push(branch);
  }
 }
 for(const p of actual.palaces){
  const branch=p.earthlyBranch;
  for(const name of ['changsheng12','boshi12','jiangqian12','suiqian12'])prod[`${name}.${branch}`]=p[name];
  for(const star of [...p.minorStars,...p.adjectiveStars,...p.majorStars.filter(s=>s.type!=='major')]){const key='star.'+star.name;(prod[key]||=[]).push(branch);}
 }
 for(const key of new Set([...Object.keys(expected),...Object.keys(prod)])){
  if(Array.isArray(expected[key]))expected[key].sort();if(Array.isArray(prod[key]))prod[key].sort();
  const s=stats[key]||={total:0,equal:0};s.total++;if(JSON.stringify(expected[key])===JSON.stringify(prod[key]))s.equal++;else if(!examples[key])examples[key]={sample,expected:expected[key]??null,actual:prod[key]??null};
 }
 names.actual=[...new Set([...names.actual,...Object.keys(prod).filter(k=>k.startsWith('star.'))])];names.expected=[...new Set([...names.expected,...Object.keys(expected).filter(k=>k.startsWith('star.'))])];
}
fs.writeFileSync(path.join(__dirname,'preview.json'),JSON.stringify({samples:samples.length,stats,examples,names},null,2));
console.log(JSON.stringify({samples:samples.length,mismatches:Object.entries(stats).filter(([,v])=>v.equal<v.total).map(([field,v])=>({field,...v,example:examples[field]}))},null,2));
