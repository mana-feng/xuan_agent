const assert=require('node:assert/strict');
const {test,beforeEach}=require('node:test');
const {resetPlatform,loadPage}=require('./helpers/load-source.cjs');
const {createPinia,setActivePinia}=require('pinia');
const {useZiweiStore}=require('../src/store/ziwei.ts');
const {useUserStore}=require('../src/store/user.ts');
const {openSavedChart}=require('../src/features/history/savedCharts.ts');
const {buildZiweiExportPayload}=require('../src/utils/ziweiExport.ts');
const {civilToTimestamp}=require('../src/utils/chartTime.ts');
let platform;
beforeEach(()=>{platform=resetPlatform();setActivePinia(createPinia());});

test('saved chart / edit / cache / export preserve birth zone and rule metadata',async()=>{
  const store=useZiweiStore();const timestamp=civilToTimestamp('2023-04-05 23:00','America/New_York');
  store.pull({realname:'边界校验',gender:1,timestamp,timeZone:'America/New_York'});
  useUserStore()._hasAccessToken=true;platform.storage.set('access_token','test-token');
  const page=loadPage('pages/ziwei/result.nvue',['saveToAccount','editZiwei']);
  await page.saveToAccount();
  const data=platform.requests.at(-1).data;
  assert.equal(data.rawPayload.user.timeZone,'America/New_York');
  assert.equal(data.rawPayload.user.ruleVersion,'ziwei-civil-v1');
  store.$reset();openSavedChart({id:91,type:'ziwei',title:'边界校验',birthDatetime:new Date(timestamp).toISOString(),gender:'1',rawPayload:data.rawPayload});
  assert.equal(store.calculation.calculationDate,'2023-04-06');
  assert.equal(store.calculation.birthCivil,'2023-04-05 23:00:00');
  assert.equal(store.calculation.timeZone,'America/New_York');
  const payload=buildZiweiExportPayload(useUserStore(),store);
  assert.equal(payload.profile.timeZone,'America/New_York');
  assert.equal(payload.calculation.lateZiRollover,true);
  const timer=global.setTimeout;global.setTimeout=cb=>{cb();return 0;};try{page.editZiwei();}finally{global.setTimeout=timer;}
  assert.equal(JSON.parse(platform.storage.get('edit_ziwei_data')).timeZone,'America/New_York');
  const form=loadPage('pages/ziwei/index.nvue',['timeZone','timestamp']);platform.hooks.load.at(-1)({});
  assert.equal(form.timeZone.value,'America/New_York');assert.equal(form.timestamp.value,timestamp);
  store.$reset();store.restoreInput();store.ensureComputed();assert.equal(store.calculation.timeZone,'America/New_York');
});

test('legacy records are marked unconfirmed instead of guessing a birth location',()=>{
  const store=useZiweiStore();store.pull({gender:0,timestamp:Date.parse('2003-03-21T10:00:00Z')});
  assert.equal(store.input.timeZoneSource,'legacy-device');assert.ok(store.input.timeZone);
});

test('zone-only change invalidates the calculation cache',()=>{
  const store=useZiweiStore();store.pull({gender:1,timestamp:Date.parse('2003-03-21T16:30:00Z'),timeZone:'Asia/Shanghai'});
  assert.equal(store.calculation.birthCivil,'2003-03-22 00:30:00');
  store.input.timeZone='America/New_York';store.ensureComputed();
  assert.equal(store.calculation.birthCivil,'2003-03-21 11:30:00');
});

test('horoscope timeline stays on selected civil day for an overseas birth zone',()=>{
  const store=useZiweiStore();store.pull({gender:1,timestamp:Date.parse('2003-03-21T10:00:00Z'),timeZone:'America/New_York'});
  const date=new Date(2026,5,15);const expected=store.astrolabe.horoscope(date);
  store.setTimelineSelection({mode:'monthly',date});
  assert.equal(store.currentHoroscope.solarDate,expected.solarDate);
  assert.equal(store.currentHoroscope.monthly.index,expected.monthly.index);
});

test('civil editor honors chosen zone and does not normalize DST gaps',()=>{
  const page=loadPage('pages/ziwei/index.nvue',['timeZone','timestamp','birthDateDraft','birthClockDraft','applyBirthEditor','overlapChoice']);
  page.timeZone.value='America/New_York';
  page.birthDateDraft.value='2024-03-10';page.birthClockDraft.value='02:30';page.applyBirthEditor();assert.equal(page.timestamp.value,null);
  page.birthDateDraft.value='2023-04-05';page.birthClockDraft.value='23:00';page.applyBirthEditor();assert.equal(page.timestamp.value,civilToTimestamp('2023-04-05 23:00','America/New_York'));
  page.overlapChoice.value='later';page.birthDateDraft.value='2024-11-03';page.birthClockDraft.value='01:30';page.applyBirthEditor();assert.equal(page.timestamp.value,Date.parse('2024-11-03T06:30:00Z'));
});

test('changing DST occurrence updates an already confirmed timestamp before submit',()=>{
  const page=loadPage('pages/ziwei/index.nvue',['timeZone','timestamp','birthDateDraft','birthClockDraft','applyBirthEditor','overlapChoice','changeOverlapChoice']);
  page.timeZone.value='America/New_York';page.overlapChoice.value='earlier';
  page.birthDateDraft.value='2024-11-03';page.birthClockDraft.value='01:30';page.applyBirthEditor();
  assert.equal(page.timestamp.value,Date.parse('2024-11-03T05:30:00Z'));
  page.changeOverlapChoice('later');
  assert.equal(page.overlapChoice.value,'later');assert.equal(page.timestamp.value,Date.parse('2024-11-03T06:30:00Z'));
  page.changeOverlapChoice('reject');
  assert.equal(page.overlapChoice.value,'later');assert.equal(page.timestamp.value,Date.parse('2024-11-03T06:30:00Z'));
  assert.match(platform.toasts.at(-1).title,/重复/);
});

test('runtime late Zi rolls the whole lunar year/month/day forward across New Year',()=>{
  const store=useZiweiStore();store.pull({gender:0,timestamp:Date.parse('1952-01-15T00:30:00+08:00'),timeZone:'Asia/Shanghai'});
  store.setTimelineSelection({mode:'daily',date:new Date(2024,1,9,23,0)});
  const h=store.currentHoroscope;
  assert.equal(h.solarDate,'2024-2-10');
  assert.equal(h.yearly.heavenlyStem+h.yearly.earthlyBranch,'甲辰');
  assert.equal(h.monthly.heavenlyStem+h.monthly.earthlyBranch,'丙寅');
  assert.equal(h.daily.index,3);assert.equal(h.hourly.index,3);
  const payload=buildZiweiExportPayload(store.input,store);
  assert.equal(payload.newSchoolChart.scopes.yearly.heavenlyStem,'甲');
});

test('pre-birth lunar years do not produce a fabricated decadal chart',()=>{
  const store=useZiweiStore();store.pull({gender:0,timestamp:Date.parse('2023-04-05T12:00:00+08:00'),timeZone:'Asia/Shanghai'});
  store.setTimelineSelection({mode:'yearly',date:new Date(2023,0,21)});
  assert.equal(store.currentHoroscope,null);
  store.setTimelineSelection({mode:'yearly',date:new Date(2023,0,22)});
  assert.equal(store.currentHoroscope.age.nominalAge,1);
});

test('exported scope focus stays on the same physical palace as the visible selection',()=>{
  const store=useZiweiStore();store.pull({gender:1,timestamp:Date.parse('2003-03-21T10:00:00+08:00'),timeZone:'Asia/Shanghai'});
  store.setTimelineSelection({mode:'yearly',date:new Date(2026,5,15)});store.focusPalaceIndex=0;
  const payload=buildZiweiExportPayload(store.input,store);
  assert.equal(payload.newSchoolChart.focus.surrounded.scope.target.index,0);
});

test('exported decadal anchors have their stated nominal ages across Lunar New Year',()=>{
  const store=useZiweiStore();store.pull({gender:0,timestamp:Date.parse('2003-03-21T12:00:00+08:00'),timeZone:'Asia/Shanghai'});
  store.setTimelineSelection({mode:'yearly',date:new Date(2020,0,25)});
  const payload=buildZiweiExportPayload(store.input,store);
  for(const row of payload.newSchoolChart.allDecadalCharts){
    assert.equal(row.cs.a.na,row.range[0],`decade ${row.range[0]}`);
    assert.equal(row.cs.d.i,row.palaceIndex);
  }
  const year=payload.newSchoolChart.yearlyRangeCharts.charts.find(row=>row.y===2015);
  assert.equal(year.g,'乙未');assert.equal(year.cs.a.na,13);
});
