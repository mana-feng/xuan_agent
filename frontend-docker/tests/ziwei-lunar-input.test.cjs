const {test}=require('node:test');const assert=require('node:assert/strict');
const {resetPlatform,loadPage}=require('./helpers/load-source.cjs');
const {createPinia,setActivePinia}=require('pinia');
const {lunarCivilToSolar}=require('../src/utils/ziweiCalendarInput.ts');
test('explicit leap second month is distinct from ordinary second month',()=>{
  assert.equal(lunarCivilToSolar('2023-02-15','23:00',true),'2023-04-05 23:00');
  assert.equal(lunarCivilToSolar('2023-02-16','00:00',true),'2023-04-06 00:00');
  assert.equal(lunarCivilToSolar('2023-02-15','23:00',false),'2023-03-06 23:00');
  assert.throws(()=>lunarCivilToSolar('2023-03-01','12:00',true),/农历/);
  assert.throws(()=>lunarCivilToSolar('2023-02-30','12:00',true),/农历/);
});
test('formal lunar editor preserves leap month and late Zi through confirmation',()=>{
  resetPlatform();setActivePinia(createPinia());
  const p=loadPage('pages/ziwei/index.nvue',['model','timeZone','birthDateDraft','birthClockDraft','birthLeapDraft','applyBirthEditor','timestamp']);
  p.model.value=1;p.timeZone.value='Asia/Shanghai';p.birthDateDraft.value='2023-02-15';p.birthClockDraft.value='23:00';p.birthLeapDraft.value=true;p.applyBirthEditor();
  assert.equal(p.timestamp.value,Date.parse('2023-04-05T15:00:00Z'));
});
