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

test('reloading a history-created Bazi input keeps its encrypted conversation identity', () => {
  const {resolveCalendar}=require('../src/utils/calendarContext.ts');
  const {identityToken}=require('../src/chat/sessionSnapshot.ts');
  const calculation=resolveCalendar(timestamp,'bazi',{timeZone:'Asia/Shanghai'});
  const store=useBaziStore();store.pull({timestamp,gender:0,realname:'历史对话',recordId:71,calculation});
  const identity=input=>{const {recordId,...chart}=input;return identityToken({account:'test@example.test',chartType:'bazi',recordId,chart});};
  const before=identity(store.input);
  assert.equal(store.input.timeZoneSource,undefined);
  setActivePinia(createPinia());const restored=useBaziStore();restored.restoreInput();restored.ensureComputed();
  assert.equal(identity(restored.input),before);
});

test('modern Bazi history restores saved rules rather than the new-page defaults', () => {
  const store = useBaziStore();
  store.pull({ timestamp: Date.parse('2026-10-15T23:30:00+08:00'), gender: 0, timeZone: 'Asia/Shanghai', rules: { ...defaults, dayDivide: 'zi' } });
  const input = JSON.parse(JSON.stringify(store.input));
  process.env.TZ = 'America/New_York';
  openSavedChart({ id: 61, type: 'bazi', title: '保存口径', gender: '0', birthDatetime: new Date(input.timestamp).toISOString(), rawPayload: { lite: true, user: input } });
  assert.equal(store.sizhu.day, '癸亥');
  assert.equal(store.input.calculation.rules.dayDivide, 'zi');
});

test('legacy Bazi without a zone or civil snapshot asks for original zone instead of silently recomputing', () => {
  const store = useBaziStore(); store.pull({ timestamp, gender: 0, timeZone: 'Asia/Shanghai' });
  const before = JSON.stringify(store.input);
  const item = { id: 62, type: 'bazi', title: '旧记录', gender: '0', birthDatetime: new Date(timestamp).toISOString(), rawPayload: { lite: true, user: { timestamp, gender: 0 } } };
  assert.equal(openSavedChart(item)?.needsTimeZone, true);
  assert.equal(JSON.stringify(store.input), before);
  process.env.TZ = 'UTC'; openSavedChart(item, 'Asia/Shanghai');
  assert.equal(store.sizhu.day, '癸亥');
  assert.equal(store.input.calculation.source, 'legacy-confirmed');
  assert.equal(store.input.calculation.rules.dayDivide, 'midnight');
});

test('legacy Liuyao recovers original civil time and keeps saved params without time recasting', () => {
  process.env.TZ = 'America/New_York';
  openSavedChart({ id: 63, type: 'liuyao', title: '旧卦', birthDatetime: new Date(timestamp).toISOString(), rawPayload: { params, ts: timestamp, profile: { title: '旧卦', timeLabel: '2026-10-16 00:30:00', method: '时间起卦' }, options: { date: new Date(timestamp).toISOString() } } });
  const store = useLiuyaoStore();
  assert.equal(store.profile.timeLabel, '2026-10-16 00:30');
  assert.deepEqual([...store.compiled.params], params);
  assert.equal(store.calculation.source, 'legacy-profile');
});

test('Liuyao saved payload includes frozen context, and reopening survives a host zone change', async () => {
  const { useUserStore } = require('../src/store/user.ts');
  useUserStore()._hasAccessToken = true; platform.storage.set('access_token', 'test-token');
  executeLiuyaoChart({ date: new Date(timestamp), timeZone: 'Asia/Shanghai', rules: { ...defaults, dayDivide: 'zi', leapMonth: 'same-month' }, params, methodLabel: '时间起卦' });
  await loadPage('pages/liuyao/result.nvue', ['saveLiuyao']).saveLiuyao();
  const rawPayload = platform.requests[0].data.rawPayload;
  assert.equal(rawPayload.calculation.rules.leapMonth, 'same-month');
  process.env.TZ = 'UTC';
  openSavedChart({ id: 64, type: 'liuyao', title: '重开', birthDatetime: new Date(timestamp).toISOString(), rawPayload });
  assert.deepEqual(useLiuyaoStore().calculation, rawPayload.calculation);
});

test('an old local Liuyao cache without its instant preserves the chart and waits for its original zone', async () => {
  executeLiuyaoChart({date:new Date(timestamp),timeZone:'Asia/Shanghai',params,methodLabel:'手工指定'});
  const cached = JSON.parse(JSON.stringify(platform.storage.get('liuyao_last_result')));
  delete cached.castingAt; delete cached.calculation;
  platform.storage.set('liuyao_last_result',cached);
  process.env.TZ = 'America/New_York'; setActivePinia(createPinia());
  const store = useLiuyaoStore(); store.restoreLastResult();
  assert.equal(store.legacyNeedsTimeZone,true); assert.equal(store.castingAt,null);
  assert.equal(store.compiled.dayGz,cached.compiled.dayGz);
  const { useUserStore } = require('../src/store/user.ts'); useUserStore()._hasAccessToken=true;
  const page = loadPage('pages/liuyao/result.nvue',['confirmLegacyLiuyaoZone','saveLiuyao']);
  await page.saveLiuyao(); assert.equal(platform.requests.length,0);
  page.confirmLegacyLiuyaoZone('Asia/Shanghai');
  assert.equal(store.castingAt,timestamp); assert.equal(store.legacyNeedsTimeZone,false);
  assert.equal(store.compiled.dayGz,cached.compiled.dayGz);
});

test('unsupported saved engine or rule versions are rejected without overwriting a current chart', () => {
  const store = useBaziStore(); store.pull({timestamp,gender:0,timeZone:'Asia/Shanghai'});
  const before = JSON.stringify(store.input);
  const input = JSON.parse(before); input.calculation.ruleVersion='bazi-future-v99';
  openSavedChart({id:65,type:'bazi',title:'未知规则',birthDatetime:new Date(timestamp).toISOString(),rawPayload:{user:input}});
  assert.equal(JSON.stringify(store.input),before);
  assert.match(platform.toasts.at(-1).title,/规则版本/);
});

test('Bazi and Liuyao exports carry the frozen calculation convention into AI context', async () => {
  const { useYunStore } = require('../src/store/yun.ts');
  const { buildBaziExportPayload } = require('../src/utils/baziExport.ts');
  const { buildLiuyaoExportPayload } = require('../src/utils/liuyaoExport.ts');
  const store = useBaziStore(); store.pull({timestamp,gender:0,timeZone:'America/New_York'});
  assert.equal(buildBaziExportPayload({},store,useYunStore()).meta.calculation.timeZone,'America/New_York');
  executeLiuyaoChart({date:new Date(timestamp),timeZone:'America/New_York',params,methodLabel:'手工指定'});
  require('../src/store/user.ts').useUserStore()._hasAccessToken = true;
  platform.storage.set('access_token', 'synthetic-test-token');
  await loadPage('pages/liuyao/result.nvue', ['saveLiuyao']).saveLiuyao();
  const rawPayload = JSON.parse(JSON.stringify(platform.requests[0].data.rawPayload));
  openSavedChart({ id: 79, type: 'liuyao', title: '保存口径的导出', birthDatetime: new Date(timestamp).toISOString(), rawPayload });
  const liuyao = useLiuyaoStore(), text = buildLiuyaoExportPayload(liuyao);
  assert.equal(liuyao.recordId, 79);
  assert.deepEqual(JSON.parse(JSON.stringify(liuyao.calculation)), rawPayload.calculation);
  assert.match(text, /^时区：America\/New_York$/m);
  assert.doesNotMatch(text, /排盘口径：|规则版本：|换日：/);
  assert.equal(liuyao.calculation.rules.dayDivide, 'midnight');
  assert.equal(liuyao.calculation.ruleVersion, 'liuyao-civil-v1');
});

test('historical minute-only history cannot guess a second offset across LiChun', () => {
  const {calendarTimestamp}=require('../src/utils/calendarContext.ts');
  const instant=calendarTimestamp('1900-02-04 13:51:30','Asia/Shanghai');
  const original=executeLiuyaoChart({date:new Date(instant),timeZone:'Asia/Shanghai',params,methodLabel:'手工指定'});
  const expected=JSON.parse(JSON.stringify(original.compiled.lunar.gz));
  const item={id:67,type:'liuyao',title:'历史交节边界',birthDatetime:new Date(instant).toISOString(),rawPayload:{params,profile:{timeLabel:'1900-02-04 13:51'},options:{date:new Date(instant).toISOString()}}};
  assert.equal(openSavedChart(item)?.needsTimeZone,true);
  openSavedChart(item,'Asia/Shanghai');
  assert.deepEqual(useLiuyaoStore().compiled.lunar.gz,expected);
});

test('history list uses the saved chart clock and identifies unknown legacy zones', () => {
  const {formatBirth}=loadPage('pages/history/list.nvue',['formatBirth']);
  const store=useBaziStore();store.pull({timestamp,gender:0,timeZone:'America/New_York'});
  const item={id:68,type:'bazi',title:'原时区',birthDatetime:new Date(timestamp).toISOString(),rawPayload:{user:JSON.parse(JSON.stringify(store.input))}};
  process.env.TZ='Asia/Tokyo';
  assert.match(formatBirth(item),/2026-10-15 12:30.*America\/New_York/);
  delete item.rawPayload.user.calculation;delete item.rawPayload.user.timeZone;
  assert.match(formatBirth(item),/原时区待确认.*UTC/);
});

test('recent explorations also confirms unknown legacy zones and displays the saved clock', () => {
  const recent=loadPage('components/history/RecentExplorations.vue',['openRecord','pendingLegacyChart','confirmLegacyZone','birthLabel']);
  const item={id:69,type:'bazi',title:'旧最近记录',birthDatetime:new Date(timestamp).toISOString(),rawPayload:{lite:true,user:{timestamp,gender:0}}};
  recent.openRecord(item);
  assert.equal(recent.pendingLegacyChart.value.id,69);assert.equal(platform.routes.length,0);
  recent.confirmLegacyZone('America/New_York');
  assert.equal(useBaziStore().input.calculation.timeZone,'America/New_York');
  item.rawPayload.user=JSON.parse(JSON.stringify(useBaziStore().input));
  assert.match(recent.birthLabel(item),/2026-10-15 12:30.*America\/New_York/);
});

test('minute-only legacy cache preserves its original solar-term side after save and reopen', async () => {
  const original=executeLiuyaoChart({date:new Date('2024-02-04T16:27:08+08:00'),timeZone:'Asia/Shanghai',params,methodLabel:'手工指定'});
  const cached=JSON.parse(JSON.stringify(platform.storage.get('liuyao_last_result')));
  delete cached.castingAt; delete cached.calculation;
  platform.storage.set('liuyao_last_result',cached); setActivePinia(createPinia()); useLiuyaoStore().restoreLastResult();
  const {useUserStore}=require('../src/store/user.ts');useUserStore()._hasAccessToken=true; platform.storage.set('access_token','test-token');
  const page=loadPage('pages/liuyao/result.nvue',['confirmLegacyLiuyaoZone','saveLiuyao']);
  page.confirmLegacyLiuyaoZone('Asia/Shanghai'); await page.saveLiuyao();
  const rawPayload=platform.requests[0].data.rawPayload;
  openSavedChart({id:66,type:'liuyao',title:'旧交节盘',birthDatetime:platform.requests[0].data.birthDatetime,rawPayload});
  assert.deepEqual(useLiuyaoStore().compiled.lunar.gz,original.compiled.lunar.gz);
  assert.equal(useLiuyaoStore().calculation.timePrecision,'minute');
});
