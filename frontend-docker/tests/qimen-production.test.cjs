const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
let platform;
const instant = Date.parse('2025-12-31T16:00:00Z');
const input = { question: '新项目如何安排', timestamp: instant, timeZone: 'Asia/Shanghai', recordId: null };
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });
function store() { return require('../src/store/qimen.ts').useQimenStore(); }
function login() { require('../src/store/user.ts').useUserStore()._hasAccessToken = true; platform.storage.set('access_token','test-token'); }
test('Qimen result and AI export use the golden real chart and explicit clock', () => {
  const q = store(); q.pull(input);
  assert.equal(q.chart.juShu.number, '4');
  assert.equal(q.chart.zhiFuXing, '天芮');
  assert.equal(q.chart.metadata.calculationCivil, '2026-01-01 00:00:00');
  const payload = require('../src/utils/qimenExport.ts').buildQimenExportPayload(q);
  assert.equal(payload.input.question, input.question);
  assert.equal(payload.chart.zhiShiGong, '7');
  assert.equal(payload.rules.id, 'qimen-chai-bu-v1');
});
test('same instant in another zone yields identical palaces and survives reload with saved identity', () => {
  const q = store(); q.pull(input); const original = JSON.stringify(q.chart.tianPan);
  q.pull({ ...input, timeZone: 'America/New_York', recordId: 27 });
  assert.equal(JSON.stringify(q.chart.tianPan), original);
  setActivePinia(createPinia()); const restored = store(); restored.restoreInput(); restored.ensureComputed();
  assert.equal(restored.input.recordId,27); assert.equal(restored.input.timeZone,'America/New_York');
  assert.equal(restored.chart.metadata.inputCivil,'2025-12-31 11:00:00');
  assert.equal(JSON.stringify(restored.chart.tianPan),original);
});
test('invalid dates, timezone and incompatible rule version never reuse a stale chart', () => {
  for (const invalid of [{timestamp:NaN},{timeZone:'bad/zone'},{ruleVersion:'unknown'}]) {
    const q=store(); q.pull(input); assert.throws(()=>q.pull({...input,...invalid})); assert.equal(q.chart,null);
  }
});
test('save creates then updates one record with the actual snapshot, no duplicate on concurrent clicks', async () => {
  login(); const q=store(); q.pull(input);
  const page=loadPage('pages/qimen/result.nvue',['saveToAccount']);
  await Promise.all([page.saveToAccount(),page.saveToAccount()]); await page.saveToAccount();
  assert.deepEqual(platform.requests.map(r=>[r.method,r.url]),[['POST','/api/qimen'],['PUT','/api/qimen/91']]);
  const saved=platform.requests[0].data;
  assert.equal(saved.birthDatetime,instant); assert.equal(saved.rawPayload.input.timeZone,input.timeZone);
  assert.deepEqual(saved.rawPayload.snapshot.diPan,JSON.parse(JSON.stringify(q.chart.diPan)));
  const { sanitizeRequestData } = require('../src/utils/api-signature.ts');
  assert.deepEqual(sanitizeRequestData(saved).rawPayload, saved.rawPayload, 'real API transport must preserve the Qimen contract');
});
test('failed save leaves a retryable error without inventing a saved identity', async () => {
  login(); store().pull(input); platform.respond=async()=>({success:false,error:'服务暂不可用'});
  const page=loadPage('pages/qimen/result.nvue',['saveToAccount','saveError']); await page.saveToAccount();
  assert.equal(store().input.recordId,null); assert.match(page.saveError.value,/服务暂不可用/);
  assert.equal(platform.toasts.some(t=>t.icon==='success'),false);
});
test('pending save cannot attach its record ID to a different chart', async () => {
  login(); const q=store(); q.pull(input); let resolve;
  platform.respond=()=>new Promise(r=>resolve=r);
  const page=loadPage('pages/qimen/result.nvue',['saveToAccount']); const pending=page.saveToAccount();
  q.pull({...input,timestamp:instant+86400000}); resolve({success:true,data:{id:91}}); await pending;
  assert.equal(q.input.recordId,null);
});
test('input rejects nonexistent DST time and accepts an explicitly disambiguated repeated time', () => {
  const page=loadPage('pages/qimen/index.nvue',['submit','question','civil','timeZone','timeMode','disambiguation','formError']);
  page.question.value='测试时区'; page.timeMode.value='custom'; page.timeZone.value='America/New_York';
  page.civil.value='2026-03-08T02:30'; page.submit(); assert.match(page.formError.value,/不存在/); assert.equal(platform.routes.length,0);
  page.civil.value='2026-11-01T01:30'; page.submit(); assert.match(page.formError.value,/重复/);
  page.disambiguation.value='later'; page.submit(); assert.equal(store().input.timestamp,Date.parse('2026-11-01T06:30:00Z'));
  assert.equal(platform.routes.at(-1),'/pages/qimen/result');
});
