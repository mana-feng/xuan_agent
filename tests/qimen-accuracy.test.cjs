const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./helpers/load-source.cjs');
const { Solar }=require('lunar-javascript');
const {civilToTimestamp}=require('../src/utils/chartTime.ts');
const {calculateQimen}=require('../src/utils/qimenCalculation.ts');
const calc = civil => calculateQimen({timestamp:civilToTimestamp(civil,'Asia/Shanghai'),timeZone:'Asia/Shanghai'});

test('manual benchmark: 2026-06-05 16:52 BEFORE Mangzhong = yang five, JiaShen, fixed plates',()=>{
  const p=calc('2026-06-05 16:52');
  assert.deepEqual([p.juShu.type,p.juShu.number,p.juShu.yuan,p.siZhu.time],['yang','5','上元','甲申']);
  assert.equal(p.juShu.jieQiName,'小满');
  const ground={'1':'癸','2':'丁','3':'丙','4':'乙','5':'戊','6':'己','7':'庚','8':'辛','9':'壬'};
  assert.deepEqual(p.diPan,ground); assert.deepEqual(p.tianPan,ground);
  assert.equal(p.zhiFuGong,'7'); assert.equal(p.zhiShiGong,'7');
  assert.equal(p.jiuXing['7'],'天柱');assert.equal(p.baMen['7'],'惊门');
});

test('solar terms change at the instant, not midnight (summer/winter solstice)',()=>{
  for (const [name,before,after] of [['夏至','yang','yin'],['冬至','yin','yang']]) {
    const term=Solar.fromYmd(2026,6,1).getLunar().getJieQiTable()[name];
    const stamp=civilToTimestamp(term.toYmdHms(),'Asia/Shanghai');
    const a=calculateQimen({timestamp:stamp-1000,timeZone:'Asia/Shanghai'}),b=calculateQimen({timestamp:stamp,timeZone:'Asia/Shanghai'});
    assert.equal(a.juShu.type,before);assert.equal(b.juShu.type,after);assert.equal(b.juShu.jieQiName,name);
  }
});

test('late Zi day and FuTou use next day consistently',()=>{
  const a=calc('2023-01-21 23:00'),b=calc('2023-01-22 00:00');
  for(const key of ['siZhu','juShu','diPan','tianPan','jiuXing','baMen','baShen'])assert.deepEqual(a[key],b[key]);
});

test('middle-palace XunShou counts ZhiShi from 5 before lodging to 2',()=>{
  // Independently derive ZhiShi number from the raw XunShou palace, no upstream helper.
  const stems='甲乙丙丁戊己庚辛壬癸';let count=0;
  for(let day=1;day<=30;day++)for(let hour=0;hour<24;hour+=2){
    const p=calc(`2026-06-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:00`);
    if(p.diPan['5']!==p.xunShou)continue;
    const step=stems.indexOf(p.siZhu.time[0]);const raw=((4+(p.juShu.type==='yang'?step:-step))%9+9)%9+1;
    assert.equal(p.zhiShiGong,String(raw===5?2:raw));count++;
  }
  assert.ok(count>10);
});

test('same instant gives same Beijing Qimen result in every input zone',()=>{
  const timestamp=Date.parse('2026-06-05T08:52:00Z');
  const a=calculateQimen({timestamp,timeZone:'Asia/Shanghai'}),b=calculateQimen({timestamp,timeZone:'America/New_York'});
  for(const key of ['siZhu','juShu','diPan','tianPan','jiuXing','baMen','baShen'])assert.deepEqual(a[key],b[key]);
  assert.equal(b.metadata.calculationCivil,'2026-06-05 16:52:00');
});

test('HKO independent minute anchors for 2026 Mangzhong and summer solstice',()=>{
  // HKO Almanac 2026 (Hong Kong time): June 5 23:48; June 21 16:25.
  assert.equal(calc('2026-06-05 23:47').juShu.jieQiName,'小满');
  assert.equal(calc('2026-06-05 23:49').juShu.jieQiName,'芒种');
  assert.equal(calc('2026-06-21 16:24').juShu.type,'yang');
  assert.equal(calc('2026-06-21 16:26').juShu.type,'yin');
});

test('1440 real charts cover all 18 Yin/Yang Ju and complete rotating plates',()=>{
  const seen=new Set();const stems='乙丙丁戊己庚辛壬癸'.split('').sort();
  for(let month=1;month<=12;month++)for(let day=1;day<=28;day+=3)for(let hour=0;hour<24;hour+=2){
    const p=calc(`2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:00`);
    seen.add(p.juShu.formatCode);
    assert.deepEqual(Object.values(p.diPan).sort(),stems);
    assert.deepEqual(Object.values(p.tianPan).sort(),stems);
    assert.equal(new Set(Object.values(p.baMen).filter(Boolean)).size,8);
    assert.equal(new Set(Object.values(p.baShen).filter(Boolean)).size,8);
    assert.equal(p.baShen[p.zhiFuGong],'值符');assert.equal(p.baMen[p.zhiShiGong],p.zhiShiMen);
    assert.ok(p.jiuXing[p.zhiFuGong]===p.zhiFuXing||(p.jiuXing[p.zhiFuGong]==='禽芮'&&p.zhiFuXing==='天芮'));
  }
  assert.equal(seen.size,18);
});
