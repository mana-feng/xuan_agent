const fs=require('fs'),path=require('path'),Module=require('module');
// Usage: node export-bazi-web.cjs [baseline repository] [dependency repository]
const native=path.resolve(__dirname,'..');
const root=process.argv[2]||path.resolve(native,'..');
const deps=path.join(process.argv[3]||root,'node_modules');
const ts=require(deps+'/typescript');
const configSource=fs.readFileSync(root+'/src/config/config.ts','utf8');
const configMod=new Module(root+'/src/config/config.ts');
configMod._compile(ts.transpileModule(configSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,configMod.filename||'config.js');
const source=fs.readFileSync(root+'/src/libs/utils/bazi-enhanced.ts','utf8').replace("import config from '@/config/config';",'const config='+JSON.stringify(configMod.exports.default)+';').replace("import { Solar } from 'lunar-javascript';",'');
const ref=new Module(root+'/src/libs/utils/bazi-enhanced.ts');ref._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,'bazi.js');
const {Solar}=require(deps+'/lunar-javascript'),lines=[];
for(let year of [1900,1990,2024,2099])for(let month=1;month<=12;month++)for(let day of [2,15,28]){
 const solar=Solar.fromYmdHms(year,month,day,23,30,0),b=solar.getLunar().getEightChar();
 const shishen={month:configMod.exports.tiangan[b.getDayGan()][b.getMonthGan()]};
 const a=ref.exports.enhanceBaziAnalysis(b,solar,shishen);
 const p=[b.getYear(),b.getMonth(),b.getDay(),b.getTime()];
 const extras=['甲子','乙丑','丙寅'];
 const stars=extras.map(g=>ref.exports.calculateShenShaForGanZhi(p[2][0],g,p.map(s=>s[1]),p[0][1],p[1][1],p[2][1],p[3][1],p[0][0]).join('|'));
 const diagram=ref.exports.buildGanZhiDiagram([...p,...extras],['年柱','月柱','日柱','时柱','大运','流年','流月'],{showKe:false});
 lines.push([solar.toYmdHms().slice(0,16),a.geju.type,a.geju.description,a.rizhuQiangruo.level,a.rizhuQiangruo.description,Object.entries(a.wuxingWangshuai).map(([k,v])=>k+':'+v).join('|'),...stars,...['ganEdges','zhiEdges'].map(k=>diagram[k].map(e=>[e.from,e.to,e.type,e.label].join(':')).join('|'))].join('\t'));
}
fs.writeFileSync(native+'/core/src/test/resources/bazi-web-reference.tsv',lines.join('\n')+'\n');const hash=s=>require('crypto').createHash('sha256').update(s).digest('hex');console.log(JSON.stringify({cases:lines.length,sourceSha256:hash(fs.readFileSync(root+'/src/libs/utils/bazi-enhanced.ts')),fixtureSha256:hash(lines.join('\n')+'\n')},null,2));
