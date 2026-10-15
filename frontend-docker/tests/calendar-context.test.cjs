const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');
const { timeQiGua } = require('../src/features/liuyao/qiGua.ts');
const { openSavedChart } = require('../src/features/history/savedCharts.ts');
const originalTZ = process.env.TZ;
let platform;
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); process.env.TZ = 'Asia/Shanghai'; });
afterEach(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; });
const timestamp = Date.parse('2026-10-15T16:30:00Z');
const params = [1, 0, 3, 0, 1, 4];
const defaults = { dayDivide: 'midnight', yearDivide: 'lichun', leapMonth: 'add-twelve' };

test('Bazi uses the declared birth zone on every host, including all derived table fields', () => {
  const rows = ['Asia/Shanghai', 'America/New_York', 'UTC'].map(host => {
    process.env.TZ = host;
    const store = useBaziStore(); store.pull({ timestamp, gender: 0, timeZone: 'Asia/Shanghai' });
    return JSON.parse(JSON.stringify({ pillars: store.sizhu, civil: store.yangli, table: store.table, yun: store.start_yun }));
  });
  assert.deepEqual(rows[1], rows[0]); assert.deepEqual(rows[2], rows[0]);
  assert.equal(rows[0].pillars.day, '癸亥');
});

test('Liuyao date, profile, six gods and void branches use the declared zone', () => {
  const rows = ['Asia/Shanghai', 'America/New_York', 'UTC'].map(host => {
    process.env.TZ = host;
    const result = executeLiuyaoChart({ date: new Date(timestamp), timeZone: 'Asia/Shanghai', params, title: '时区', methodLabel: '手工指定' });
    return JSON.parse(JSON.stringify({ day: result.compiled.dayGz, calendar: result.compiled.lunar, gods: result.compiled.god6, profile: result.profile }));
  });
  assert.deepEqual(rows[1], rows[0]); assert.deepEqual(rows[2], rows[0]);
  assert.equal(rows[0].day, '癸亥');
});

test('Bazi freezes its exact rules, civil time and zone in the persisted input', () => {
  const store = useBaziStore(); store.pull({ timestamp, gender: 0, timeZone: 'America/New_York' });
  const saved = JSON.parse(platform.storage.get('bazi_last_context'));
  assert.equal(saved.calculation.civil, '2026-10-15 12:30:00');
  assert.equal(saved.calculation.timeZone, 'America/New_York');
  assert.deepEqual(saved.calculation.rules, defaults);
  process.env.TZ = 'Asia/Tokyo'; setActivePinia(createPinia());
  const restored = useBaziStore(); restored.restoreInput(); restored.ensureComputed();
  assert.equal(restored.yangli, '2026/10/15 12:30:00');
});

test('both day boundaries are explicit, and day pillar and void branches agree', () => {
  const date = new Date('2026-10-13T23:30:00+08:00');
  const midnight = executeLiuyaoChart({ date, timeZone: 'Asia/Shanghai', params, methodLabel: '手工指定', rules: defaults });
  const zi = executeLiuyaoChart({ date, timeZone: 'Asia/Shanghai', params, methodLabel: '手工指定', rules: { ...defaults, dayDivide: 'zi' } });
  assert.notEqual(midnight.compiled.dayGz, zi.compiled.dayGz);
  const { xkong } = require('../src/features/liuyao/najiaCore.ts');
  assert.equal(zi.compiled.lunar.xkong, xkong(zi.compiled.dayGz));
});

test('Liuyao time casting explicitly supports both leap-month conventions', () => {
  const date = new Date('2023-03-22T12:00:00+08:00');
  assert.deepEqual(timeQiGua(date, { timeZone: 'Asia/Shanghai', rules: defaults }), [1,3,0,1,0,1]);
  assert.deepEqual(timeQiGua(date, { timeZone: 'Asia/Shanghai', rules: { ...defaults, leapMonth: 'same-month' } }), [0,3,0,0,0,1]);
});

test('Liuyao time casting separates lunar-year and LiChun-year conventions', () => {
  const date = new Date('2024-02-05T12:00:00+08:00');
  assert.notDeepEqual(timeQiGua(date, { timeZone: 'Asia/Shanghai', rules: defaults }), timeQiGua(date, { timeZone: 'Asia/Shanghai', rules: { ...defaults, yearDivide: 'lunar' } }));
});

test('an old local Bazi cache with only a timestamp is never silently recalculated', () => {
  platform.storage.set('bazi_last_context', JSON.stringify({timestamp,gender:0,recordId:5}));
  process.env.TZ = 'America/New_York';
  const store = useBaziStore(); store.restoreInput(); store.ensureComputed();
  assert.equal(store.legacyNeedsTimeZone,true);
  assert.equal(store.sizhu.day,null);
  assert.equal(JSON.parse(platform.storage.get('bazi_last_context')).calculation,undefined);
});

test('historical second-resolution zone offsets survive save and replay', () => {
  const {calendarTimestamp} = require('../src/utils/calendarContext.ts');
  const time = calendarTimestamp('1900-01-01 00:30:01','Asia/Shanghai');
  const store=useBaziStore();store.pull({timestamp:time,gender:0,timeZone:'Asia/Shanghai'});
  const saved=JSON.parse(JSON.stringify(store.input));
  store.pull(saved);
  assert.equal(store.yangli,'1900/01/01 00:30:01');
});

test('minute-only legacy labels require the original zone instead of guessing its offset', () => {
  const {legacyCalendar} = require('../src/utils/calendarContext.ts');
  const payload={profile:{timeLabel:'2026-10-16 00:30'}};
  const timestamp=Date.parse('2026-10-15T16:30:56Z');
  assert.equal(legacyCalendar(timestamp,'liuyao',payload),null);
  const c=legacyCalendar(timestamp,'liuyao',payload,'Asia/Shanghai');
  assert.equal(c.civil,'2026-10-16 00:30:56');
});

test('23:00 lunar-date rollover never advances the LiChun year before the actual term', () => {
  const actual=timeQiGua(new Date('2024-02-03T23:30:00+08:00'),{timeZone:'Asia/Shanghai',rules:{...defaults,dayDivide:'zi'}});
  assert.deepEqual(actual,[1,1,0,1,1,3]);
});

test('local Liuyao cache validates engine versions and instant consistency before mutating state', () => {
  executeLiuyaoChart({date:new Date(timestamp),timeZone:'Asia/Shanghai',params,methodLabel:'手工指定'});
  const cached=JSON.parse(JSON.stringify(platform.storage.get('liuyao_last_result')));
  cached.calculation.ruleVersion='liuyao-future-v99';cached.calculation.timestamp+=3600000;
  platform.storage.set('liuyao_last_result',cached);setActivePinia(createPinia());
  useLiuyaoStore().restoreLastResult();
  assert.equal(useLiuyaoStore().compiled,null);
  assert.equal(platform.storage.get('liuyao_last_result').calculation.ruleVersion,'liuyao-future-v99');
});

test('an unsupported Bazi cache is reported without crashing or overwriting the saved record', () => {
  const store=useBaziStore();store.pull({timestamp,gender:0,timeZone:'Asia/Shanghai'});
  const cached=JSON.parse(platform.storage.get('bazi_last_context'));
  cached.calculation.ruleVersion='bazi-future-v99';
  const raw=JSON.stringify(cached);platform.storage.set('bazi_last_context',raw);setActivePinia(createPinia());
  assert.doesNotThrow(()=>useBaziStore().restoreInput());
  useBaziStore().persistInput();
  assert.equal(platform.storage.get('bazi_last_context'),raw);
  assert.equal(useBaziStore().input.timestamp,null);
});
