const {test}=require('node:test');const assert=require('node:assert/strict');
const {resetPlatform,loadPage}=require('./helpers/load-source.cjs');
const {createPinia,setActivePinia}=require('pinia');
const {lunarCivilToSolar}=require('../src/utils/ziweiCalendarInput.ts');
test('lunar boundary year is accepted only when its converted solar date is supported',()=>{
  assert.equal(lunarCivilToSolar('1899-12-01','00:05',false),'1900-01-01 00:05');
  assert.throws(()=>lunarCivilToSolar('1899-11-30','00:05',false),/农历/);
  assert.equal(lunarCivilToSolar('2099-11-20','23:59',false),'2099-12-31 23:59');
  assert.throws(()=>lunarCivilToSolar('2099-11-21','00:00',false),/农历/);
});
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
