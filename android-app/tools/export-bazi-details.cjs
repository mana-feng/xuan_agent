const fs=require('fs'),path=require('path'),crypto=require('crypto'),Module=require('module');
const source=process.argv[2]||'F:/github/xuan_agent/.local-dev/worktrees/frontend-sync';
const root=path.resolve(__dirname,'..'),filename=path.join(source,'src/libs/utils/bazi-enhanced.ts');
const ts=require(path.join(source,'node_modules/typescript'));
const original=fs.readFileSync(filename,'utf8');
const code=ts.transpileModule(original.replace("import config from '@/config/config';",'const config = {};'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const reference=new Module(filename,module);reference.filename=filename;reference.paths=Module._nodeModulePaths(path.dirname(filename));reference._compile(code,filename);
const ref=reference.exports,{Solar}=require(path.join(source,'node_modules/lunar-javascript'));
const GAN='甲乙丙丁戊己庚辛壬癸',ZHI='子丑寅卯辰巳午未申酉戌亥',gz=i=>GAN[((i%10)+10)%10]+ZHI[((i%12)+12)%12];
const cases=[];function add(pillars,gender,label){cases.push({pillars,gender,label});}
for(let day=0;day<60;day++)for(let month=0;month<12;month++)for(let gender=0;gender<2;gender++)add([gz(day*11+month*7),gz(month*5+day%5),gz(day),gz(day*7+month*5)],gender,'synthetic');
for(const day of ['乙丑','己巳','癸酉'])for(const hour of ['己巳','庚午','辛未'])for(let gender=0;gender<2;gender++)add(['甲子','丙寅',day,hour],gender,'金神');
for(const values of [['甲寅','乙巳','丙申','丁亥'],['甲辰','丙辰','戊辰','庚辰'],['乙丑','丁未','戊戌','己丑'],['甲申','丙子','戊辰','庚午'],['甲寅','乙卯','丙辰','丁巳']])for(let gender=0;gender<2;gender++)add(values,gender,'relation');
for(const civil of ['1900-01-01 00:00','1990-06-15 10:30','2023-04-05 23:30','2024-02-04 16:26','2024-02-09 23:30','2024-02-10 00:00','2099-12-31 23:30'])for(const sect of [1,2])for(let gender=0;gender<2;gender++){const [d,t]=civil.split(' '),[y,m,day]=d.split('-').map(Number),[h,min]=t.split(':').map(Number),bazi=Solar.fromYmdHms(y,m,day,h,min,0).getLunar().getEightChar();bazi.setSect(sect);add([bazi.getYear(),bazi.getMonth(),bazi.getDay(),bazi.getTime()],gender,civil+' sect'+sect);}
const seen=new Set(),lines=[];
for(const {pillars:p,gender,label}of cases){const z=p.map(s=>s[1]),o={};p.forEach((current,i)=>{o['shensha.'+i]=ref.calculateShenShaForGanZhi(p[2][0],current,z,p[0][1],p[1][1],p[2][1],p[3][1],p[0][0],gender,i===2,['year','month','day','time'][i]).join('|');o['shensha.'+i].split('|').filter(Boolean).forEach(s=>seen.add(s.split('(')[0]));});for(const [k,v]of Object.entries(ref.calculateGanZhiRelationsForList(p)))o['relations.'+k]=v.join('|');const diagram=ref.buildGanZhiDiagram(p,['年柱','月柱','日柱','时柱']);for(const type of ['ganEdges','zhiEdges'])o[type]=diagram[type].map(e=>[e.from,e.to,e.type,e.label].join(':')).join('|');lines.push([gender,...p,label,...Object.entries(o).map(([k,v])=>k+'='+v)].join('\t'));}
const dest=path.join(root,'core/src/test/resources/bazi-details-reference.tsv');fs.writeFileSync(dest,lines.join('\n')+'\n');const hash=s=>crypto.createHash('sha256').update(s).digest('hex');console.log(JSON.stringify({cases:cases.length,fixtureSha256:hash(fs.readFileSync(dest)),sourceSha256:hash(original),shenshaTags:[...seen].sort()},null,2));
