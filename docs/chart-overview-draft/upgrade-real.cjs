// One-time source migration retained to make the fixture replacement reviewable.
const fs = require('node:fs');
const filename = require('node:path').join(__dirname,'index.html');
let s=fs.readFileSync(filename,'utf8');
const replace=(a,b)=>{if(!s.includes(a))throw new Error('Missing anchor: '+a.slice(0,70));s=s.replace(a,b)};
replace('  <script>','  <script src="engines.js"></script>\n  <script>');
replace('// Standalone visual fixtures only. No requests, account storage, or chart algorithms.','// Real local calculations. No account requests or mock fallback.');
replace('紫微十二宫 / 奇门九宫 · 模拟数据','紫微十二宫 / 奇门九宫 · 真实算法');
replace('界面设计草稿 · 所有数据为示意','真实算法预览 · 固定规则版本');
replace('模拟数据仅用于检视排版，不代表真实排盘结果','规则与版本随盘展示 · 本页不保存个人信息');
replace('<span class="draft-pill">UI 草稿</span>','<span class="draft-pill">真实排盘</span>');
replace('        <section class="record-strip"',`        <form id="calculation-form" class="calculation-form">
          <label><span id="date-label">出生钟表时间</span><input id="civil-input" type="datetime-local" step="60" value="2003-03-21T18:00" min="1900-01-01T00:00" max="2099-12-30T23:59" required></label>
          <label>输入时区<select id="zone-input"><option>Asia/Shanghai</option><option>Asia/Singapore</option><option>America/New_York</option><option>America/Los_Angeles</option><option>Europe/London</option><option>Asia/Tokyo</option><option>UTC</option></select></label>
          <label id="gender-field">性别<select id="gender-input"><option value="1">女</option><option value="0">男</option></select></label>
          <label>夏令时重复时刻<select id="overlap-input"><option value="reject">提醒我选择</option><option value="earlier">较早的一次</option><option value="later">较晚的一次</option></select></label>
          <button class="btn-primary" type="submit">重新排盘</button><button id="load-boundary" type="button">载入边界案例</button>
          <p class="rule-note" id="rule-note" role="status" aria-live="polite"></p>
        </form>
        <section class="record-strip"`);
replace('  </style>',`    .calculation-form{display:flex;flex-wrap:wrap;gap:12px;align-items:end;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}.calculation-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;min-width:0}.calculation-form input,.calculation-form select{min-height:39px;max-width:100%;border:1px solid var(--line);border-radius:7px;background:var(--paper);padding:7px;font:12px var(--sans);color:var(--ink)}.calculation-form button{min-height:39px;font-size:12px}.rule-note{flex-basis:100%;font-size:11px;line-height:1.8;color:var(--muted);overflow-wrap:anywhere}.rule-note.error{color:#a13232}@media(max-width:520px){.calculation-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:12px;gap:10px}.calculation-form label:first-child,.rule-note{grid-column:1/-1}.calculation-form input{width:100%}.calculation-form select{width:100%}}
  </style>`);
const start=s.indexOf('      const ziwei = [');const end=s.indexOf("      let chart = 'ziwei'",start);
if(start<0||end<0)throw Error('fixture anchors');
s=s.slice(0,start)+`      let ziwei=[],qimen=[],ziweiResult,qimenResult;
      const profiles={ziwei:{civil:'2003-03-21T18:00',zone:'Asia/Shanghai',gender:'1',overlap:'reject'},qimen:{civil:'2026-06-05T16:52',zone:'Asia/Shanghai',gender:'1',overlap:'reject'}};
      const valid={ziwei:false,qimen:false};
      const branchOrder=['巳','午','未','申','酉','戌','亥','子','丑','寅','卯','辰'];
      const palaceOrder=[4,9,2,3,5,7,8,1,6];
      const palaceNames={1:['坎一宫','北','水'],2:['坤二宫','西南','土'],3:['震三宫','东','木'],4:['巽四宫','东南','木'],5:['中五宫','中','土'],6:['乾六宫','西北','金'],7:['兑七宫','西','金'],8:['艮八宫','东北','土'],9:['离九宫','南','火']};
      function compute(type) {
        const profile=profiles[type],timestamp=ChartAlgorithms.civilToTimestamp(profile.civil,profile.zone,profile.overlap);
        if(type==='ziwei') {
          ziweiResult=ChartAlgorithms.calculateZiwei({timestamp,timeZone:profile.zone,gender:Number(profile.gender)});
          ziwei=branchOrder.map(branch=>{const p=ziweiResult.chart.palaces.find(p=>p.earthlyBranch===branch);return {name:p.name==='仆役'?'交友':p.name,branch:p.heavenlyStem+p.earthlyBranch,stars:p.majorStars.map(s=>[s.name,s.brightness||'',s.mutagen||'']),minor:p.minorStars.map(s=>s.name+(s.mutagen?'化'+s.mutagen:'')),other:p.adjectiveStars.map(s=>s.name),age:p.decadal.range.join('–'),life:p.changsheng12,body:p.isBodyPalace,gods:[p.boshi12,p.jiangqian12,p.suiqian12],ages:p.ages};});
        } else {
          qimenResult=ChartAlgorithms.calculateQimen({timestamp,timeZone:profile.zone});
          const r=qimenResult;
          qimen=palaceOrder.map(n=>({name:palaceNames[n][0],dir:palaceNames[n][1],element:palaceNames[n][2],spirit:r.baShen[n]||'—',star:r.jiuXing[n]||'—',door:r.baMen[n]||'—',heaven:n===5?'—':r.tianPan[n],earth:r.diPan[n],hidden:r.anGan[n],lodged:r.jiuXing[n]==='禽芮'?r.diPan[5]:'',mark:[r.kongWangGong.includes(String(n))?'旬空':'',r.maStar.gong===String(n)?'驿马':'',r.jiuXing[n]==='禽芮'?'天禽随芮':''].filter(Boolean).join(' · '),note:'时家转盘 · 符头拆补 · 中五寄坤二'}));
        }
        valid[type]=true;
      }
      function ruleText() {return chart==='ziwei' ? 'iztro 2.5.7 · 民用钟表时 · 23 点完整换日 · 闰月 1—15 日按本月、16 日起按下月 · 正月初一换年。'+(ziweiResult?.metadata.lateZiRollover?'此盘按 '+ziweiResult.metadata.calculationDate+' 子时排盘，出生时刻仍保留。':'') : 'qfdk/qimen 1d0d1c5 + xuan-1 · 时家转盘 · 符头拆补 · 精确交节 · 23 点换日 · 统一北京时间 UTC+08:00 起局。';}
      function syncForm(){const p=profiles[chart];$('civil-input').value=p.civil;$('zone-input').value=p.zone;$('gender-input').value=p.gender;$('overlap-input').value=p.overlap;$('gender-field').hidden=chart!=='ziwei';$('date-label').textContent=chart==='ziwei'?'出生钟表时间':'起局钟表时间';$('rule-note').textContent=ruleText();$('rule-note').classList.remove('error');}
`+s.slice(end);
replace("const current = selected[chart], data", "if(!valid[chart]){$('chart-body').innerHTML='<p style=\"padding:24px\">请修正输入后重新排盘。</p>';return;}\n        const current = selected[chart], data");
replace("else if(i===4) inner += '<span class=\"center-seal\">五</span><span class=\"center-eyebrow\">CENTRAL PALACE</span><p>天禽 · 壬<br>寄坤二宫</p>';", "else if(i===4) inner += `<span class=\"center-seal\">五</span><span class=\"center-eyebrow\">CENTRAL PALACE</span><p>地盘 · ${p.earth}<br>天禽随芮转宫</p>`;");
replace('<h2>林知予 <small style="font:11px var(--sans)">女</small></h2><div class="center-meta">2003.03.21 · 酉时<br>火六局 · 命主破军</div>','<h2>校验命盘 <small style="font:11px var(--sans)">${ziweiResult.chart.gender}</small></h2><div class="center-meta">${ziweiResult.metadata.birthCivil.slice(0,10)} · ${ziweiResult.chart.time}<br>${ziweiResult.chart.fiveElementsClass} · 命主${ziweiResult.chart.soul}</div>');
replace('南上北下 · 寄宫、旬空与驿马均为模拟标记','南上北下 · 寄宫、旬空与驿马由算法计算');
replace("Array.from({length:10},(_,n)=>((9-i+12)%12||12)+12*n).join('、')","p.ages.join('、')");
replace('固定主次层级，完整信息按组阅读。<br>本页数据为 UI 演示夹具。','${ruleText()}');
replace('时家奇门 · 九宫布局示意','时家奇门 · 真实排盘结果');
replace('<dt>宫位五行</dt><dd>${p.element}</dd>','<dt>暗干</dt><dd>${p.hidden}</dd>${p.lodged?`<dt>天禽寄干</dt><dd>${p.lodged}</dd>`:""}<dt>宫位五行</dt><dd>${p.element}</dd>');
replace('此处只演示九宫信息布局，未接入奇门排盘算法。','${ruleText()}');
replace('        const data=chart===',`        if(!valid[chart]){$('inspector').textContent='暂无有效盘面';$('selection-label').textContent='暂无有效盘面';$('open-detail').disabled=true;return;} $('open-detail').disabled=false;
        const data=chart===`);
const fieldsStart=s.indexOf('        const fields=isZiwei?');const fieldsEnd=s.indexOf("        document.querySelectorAll('[data-chart]')",fieldsStart);
s=s.slice(0,fieldsStart)+`        const fields=!valid[chart]?[]:isZiwei?[['性别',ziweiResult.chart.gender],['出生钟表时',ziweiResult.metadata.birthCivil.slice(0,16)],['时区',ziweiResult.metadata.timeZone],['五行局',ziweiResult.chart.fiveElementsClass]]:[['北京时间',qimenResult.metadata.calculationCivil.slice(0,16)],['局式',qimenResult.juShu.fullName],['值符',qimenResult.zhiFuXing+' · '+qimenResult.zhiFuGong+'宫'],['值使',qimenResult.zhiShiMen+' · '+qimenResult.zhiShiGong+'宫']];
        $('record-strip').innerHTML=fields.map(f=>\`<div class="record-item"><span>\${f[0]}</span><strong>\${f[1]}</strong></div>\`).join('')+(valid[chart]?'<span class="sample">真实计算</span>':'');
        if(!isZiwei&&valid[chart])$('record-strip').innerHTML+=\`<div class="record-item"><span>四柱</span><strong>\${Object.values(qimenResult.siZhu).join(' · ')}</strong></div>\`;
`+s.slice(fieldsEnd);
replace("chart=type.dataset.chart;annotations=false;render();", "chart=type.dataset.chart;annotations=false;syncForm();render();");
replace('      render();\n    }',`      $('calculation-form').onsubmit=e=>{e.preventDefault();profiles[chart]={civil:$('civil-input').value,zone:$('zone-input').value,gender:$('gender-input').value,overlap:$('overlap-input').value};try{compute(chart);$('rule-note').textContent=ruleText();$('rule-note').classList.remove('error');}catch(error){valid[chart]=false;$('rule-note').textContent=error.message;$('rule-note').classList.add('error');}render();};
      $('calculation-form').oninput=()=>{$('rule-note').textContent='输入已修改，点击“重新排盘”更新下方结果。';};
      $('load-boundary').onclick=()=>{$('civil-input').value=chart==='ziwei'?'2023-04-05T23:00':'2026-06-21T16:24';$('zone-input').value='Asia/Shanghai';$('calculation-form').requestSubmit();};
      try{compute('ziwei');compute('qimen');}catch(error){$('rule-note').textContent=error.message;}
      syncForm();render();
    }`);
fs.writeFileSync(filename,s,'utf8');
