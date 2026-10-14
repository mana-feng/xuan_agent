'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n),'utf8'));
const before=read('summary.json'),after=read('after-summary.json'),v=read('after-verification.json'),bv=read('verification.json'),source=read('source-notes.json'),examples=read('examples.json');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>n.toLocaleString('en-US');
const list=prefix=>Object.keys(after.stats).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));
const brightnessStars=[...new Set(list('brightness.').map(k=>k.split('.')[0]))];
const inventory=[
 {display:'宫名、宫干支、命宫/身宫、五行局、14主星位置、大限、出生四化',fields:'core81.*',rule:'Fortel原81字段重新执行。四化保留戊/庚/壬化科规则差异。',count:v.groups.core81.compared,status:'全部已比较；10,180字段为已声明四化差异'},
 {display:'14辅星位置',fields:list('minor.'),rule:'独立Fortel1.3.4 npm原始位置；辛魁午钺寅有2021教师原文旁证。',count:v.groups.minor.compared,status:'一致'},
 {display:'35杂曜位置',fields:list('adjective.'),rule:'Fortel；天伤/天使另用《全书》固定仆役/疾厄；华盖/天德由Fortel将前/岁前位置复核。',count:v.groups.adjective.compared,status:'按明确规则一致'},
 {display:'截路、空亡、旬空（另3杂曜）',fields:['empty-pair.截路空亡','empty-selection.旬空'],rule:'古籍两支空亡+Fortel两支原值；旬空取同阴阳正空。截路/空亡命名拆分另做36,866项显示约定检查。',count:v.groups['empty-pair'].compared+v.groups['empty-selection'].compared,status:'位置与已声明显示约定一致；原始成对差异保留'},
 {display:'星曜亮度',fields:brightnessStars,rule:'《全书》卷二末尾按地支列出的7级表，手工转录原分组。20星共232可达格。',count:v.groups.brightness.compared,status:'修复后全一致；修复前3747处命中3个错误格'},
 {display:'命主 / 身主',fields:['soul','body'],rule:'命主独立古籍命宫对照表；身主Fortel年支对照。',count:v.groups.soul.compared+v.groups.body.compared,status:'一致；Fortel原始命主差异保留'},
 {display:'长生 / 博士 / 将前 / 岁前十二神',fields:['changsheng12.*','boshi12.*','jiangqian12.*','suiqian12.*'],rule:'Fortel四组12宫原值。博士蜚廉→飞廉、岁前太岁→岁建、岁破→大耗只做有记录的同位别名映射。',count:['changsheng12','boshi12','jiangqian12','suiqian12'].reduce((n,k)=>n+v.groups[k].compared,0),status:'位置一致；别名原值保留'},
 {display:'小限年龄',fields:'ages.地支.0..9（每盘120个年龄）',rule:'独立实现古籍三合年起点、男顺女逆，逐项比较1..120。',count:v.groups.ages.compared,status:'全部一致'},
 {display:'身宫标记',fields:'isBodyPalace.*',rule:'Fortel身宫位置逐宫转换12布尔值。',count:v.groups.isBodyPalace.compared,status:'全部一致'},
 {display:'来因宫（额外导出字段）',fields:'isOriginalPalace.*',rule:'教师原文十干表，子丑不取。',count:v.groups.isOriginalPalace.compared,status:'全部一致'},
 {display:'大限干支（额外导出字段）',fields:['decadalStem.*','decadalBranch.*'],rule:'Fortel宫干支逐宫复核。',count:v.groups.decadalStem.compared+v.groups.decadalBranch.compared,status:'全部一致'},
 {display:'阴历文字 / 性别 / 生肖 / 排盘日期 / 时辰 / 时段',fields:['lunarDate','gender','zodiac','solarDate','time','timeRange'],rule:'Fortel农历、年支；独立汉字格式表与输入民用时刻。23时全日进位。',count:['lunarDate','gender','zodiac','solarDate','time','timeRange'].reduce((n,k)=>n+v.groups[k].compared,0),status:'全部一致'},
 {display:'原不支持的1900年初3输入',fields:'early.*（61字段/盘；另含上述376项）',rule:'sxtwl2.0.6给历法，Fortel纯构造器排盘。完整重复比较主星、宫位、大限、四化及历法。',count:v.groups.early.compared,status:'全部一致；不再归为基准不支持'},
 {display:'姓名、无星提示、日期标题、晚子提示',fields:'输入/显示派生',rule:'姓名是input.realname回显；无星提示由已核验星列表是否为空决定；标题出生日期/晚子状态由core81输入元数据核验。',count:0,status:'非新增星术算法；本包不冒充浏览器渲染测试'},
 {display:'未显示亮度的辅星',fields:['左辅','右弼','天魁','天钺','禄存','天马','地空','地劫'],rule:'产品明确不展示这8星亮度。古表的禄存值没有被伪造为空值“相等”；其余星也不假定无亮度等于平。',count:0,status:'显示范围决定；无显示数值可作计算比对'},
];
fs.writeFileSync(path.join(__dirname,'field-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
const table=(heads,rows)=>`<div class="scroll"><table><thead><tr>${heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(Array.isArray(c)?c.join('、'):c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const rawRows=Object.entries(after.rawStats).filter(([,s])=>s.different).map(([k,s])=>{const e=examples['raw.'+k];return[k,num(s.different),JSON.stringify(e?.expected),JSON.stringify(e?.actual),e?.classification];});
const differences=source.confirmedUpstreamDefect.fixes.map(f=>{const k='brightness.'+f.star+'.'+f.branch;return[f.star+' '+f.branch,f.old,f.primaryText,num(before.stats[k].different),num(after.stats[k].different),examples[k]?.sample.id];});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>紫微本命完整字段独立基准</title><style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;color:#19252b;background:#f3f5f6;margin:0;line-height:1.65}main{max-width:1180px;margin:auto;padding:32px}h1{font-size:28px}h2{margin-top:34px}p{max-width:1060px}a{color:#126173}table{border-collapse:collapse;background:white;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:10px;border:1px solid #d5dfe1}th{background:#e8eef0}.scroll{overflow:auto}.cards{display:flex;flex-wrap:wrap;gap:15px}.card{background:white;padding:16px;min-width:190px;border-left:4px solid #298570}.card b{display:block;font-size:25px}.note{padding:16px;background:#fff3d9;border-left:4px solid #bc842c}code{overflow-wrap:anywhere}details{margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><main>
<h1>紫微本命：完整显示字段的独立复核</h1><p>执行时间 ${esc(after.generatedAt)}。18,433个输入，每盘295个扩展检查 + 81个核心检查，另给原3个1900年初输入各61项补充。独立基准来自Fortel1.3.4、《紫微斗数全书》固定版本、教师原始安星表及sxtwl2.0.6。生产库没有生成任何golden。</p>
<div class="cards"><div class="card"><b>${num(after.cases)}</b>修复前后完整样本</div><div class="card"><b>${num(after.checks)}</b>修复后字段比较</div><div class="card"><b>232 / 232</b>可达亮度格覆盖</div><div class="card"><b>${after.unresolved}</b>未解释位置/计算差异</div></div>
<p class="note">修复后仍保留${num(after.checks-after.equal)}个四化字段差异：戊化科太阳/右弼、庚天府/太阴、壬天府/左辅。它们是原已声明的规则差异，不计作“全部一致”。Fortel原始命主、空曜、星曜目录及神煞名称差异也仍在gzip记录中；有外部依据的规则复核单独列出。</p>
<h2>发现并修复的实际错误</h2><p>旧iztro2.5.7在酉宫有三个亮度错误，完整样本命中${num(before.brightnessDifferences)}次。古籍独立表首先揭示差异；上游<a href="${source.confirmedUpstreamDefect.release}">v2.6.1发布说明</a>和<a href="${source.confirmedUpstreamDefect.issue}">issue270</a>证实属于已修复旧数据。产品现在仅补正这三格；本基准重新运行验证，亮度差异归零。</p>${table(['字段','修复前','独立表/修复后','修复前次数','修复后差异','首个真实输入'],differences)}
<h2>逐字段覆盖</h2>${table(['页面字段','具体字段/名称','独立依据和规则','字段数','结论'],inventory.map(x=>[x.display,x.fields,x.rule,num(x.count),x.status]))}
<h2>原始Fortel差异完整保留</h2><p>这些差异没有通过改写Fortel输出、删除样本或回填产品结果消失。正向复核另存 independentChecks；rawDifferences始终保留两边值。下面每行有全部次数，详细输入在examples.json与完整gzip中。</p><details><summary>展开原始差异字段（${rawRows.length}类字段）</summary>${table(['原字段','差异次数','首例Fortel','首例产品','原因'],rawRows)}</details>
<h2>三例历法边界补证</h2><p>Fortel自带历法始于1900-01-31。通过独立天文历库sxtwl执行得出1900-01-01为己亥十二月初一、1900-01-02为初二、1900-01-30为三十，再将独立结果送入Fortel纯排盘构造器。此路径不读取产品农历。三输入连同晚子换日都已执行；补充${num(v.early)}项全一致，原81字段也全部重测。</p>
<h2>来源与复现</h2><p><a href="source-notes.json">来源与拒绝候选记录</a> · <a href="primary-rules.cjs">手抄古籍规则</a> · <a href="calendar-1900.json">独立早期历法</a> · <a href="field-inventory.json">字段清单</a> · <a href="after-summary.json">修复后统计</a> · <a href="summary.json">修复前统计</a> · <a href="after-verification.json">完整流校验结果</a> · <a href="reproduce.ps1">复现脚本</a></p>
<p>Fortel为MIT独立实现，npm包SHA256 ${source.independentEngine.npmSha256}。其声明Git版本的辛年魁钺两值与npm包不同，并且会影响本命；本报告使用被固定hash的npm包，已明确披露，未混用Git源构造虚假等价证据。经典原文固定版本：<a href="${source.primaryText.url}">Wikisource oldid1963110</a>。本报告核对算法与选定规则，不验证占卜解释的预测效力，也不声称所有流派规则唯一。</p>
<p>修复前脚本最初在运行结束才读取生产源hash，恰遇并行修复，因此该结束时hash不代表已载入的旧模块。原始统计完整保存在<a href="raw-summary-end-time-hash.json">原始summary（结束时hash不可用）</a>，没有修改任何比较结果。<a href="corrected-run-manifest.json">纠正说明</a>用<a href="sources/ziweiCalculation.before.ts">运行中保存的旧源码</a>及预运行相同hash固定真实旧版；修复后脚本已在启动时采集hash。</p><details><summary>生产文件与规则哈希</summary><pre>${esc(JSON.stringify({before:before.productionHashes,after:after.productionHashes,independent:after.sourceHashes},null,2))}</pre></details>
<p>完整原始记录：all-results.jsonl.gz（修复前）与after-all-results.jsonl.gz（修复后）。校验器逐行重算字段统计，并断言每盘295/376项、原始差异不丢失、3个早期输入补证和全部232亮度格。</p></main></html>`;
fs.writeFileSync(path.join(__dirname,'report.html'),html);
fs.writeFileSync(path.join(__dirname,'README.txt'),`紫微本命扩展独立基准\n\n修复前 ${before.cases}例 / ${before.checks}字段 / ${before.brightnessDifferences}亮度差异（3格）\n修复后 ${after.cases}例 / ${after.checks}字段 / ${after.brightnessDifferences}亮度差异 / ${after.unresolved}未知计算差异\n保留四化差异 ${after.checks-after.equal}字段。原始Fortel差异另保留${v.rawDifferences}字段，不算作原始全一致。\n每盘295扩展+81核心；3个1900年初输入各额外61字段，sxtwl补充历法。\n可达亮度232/232格。全部字段与来源请打开report.html、field-inventory.json、source-notes.json。\n运行reproduce.ps1复验当前产品；修复前记录保留作审计历史。\n`);
console.log('Wrote report.html, README.txt, field-inventory.json');
