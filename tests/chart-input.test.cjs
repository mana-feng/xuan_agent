const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useYunStore } = require('../src/store/yun.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
const { buildBaziExportPayload } = require('../src/utils/baziExport.ts');
const { buildZiweiExportPayload } = require('../src/utils/ziweiExport.ts');

// Fixtures name their birth zone; CI and developer machines can use different host zones.
const first = { timeZone: 'Asia/Shanghai', realname: '甲', gender: 0, timestamp: Date.parse('2026-10-10T12:30:00+08:00'), recordId: 11 };
const second = { timeZone: 'Asia/Shanghai', realname: '乙', gender: 1, timestamp: Date.parse('2022-03-03T08:00:00+08:00'), recordId: 22 };
let platform;
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });

function runTimersNow(action) {
  const originalTimer = global.setTimeout;
  global.setTimeout = callback => { callback(); return 0; };
  try { return action(); } finally { global.setTimeout = originalTimer; }
}

test('Bazi export keeps the input that generated its pillars after a Ziwei chart', () => {
  const user = useUserStore();
  const bazi = useBaziStore();
  user.set(first); bazi.pull(first);
  user.set(second); useZiweiStore().pull(second);
  const payload = buildBaziExportPayload(user, bazi, useYunStore());
  assert.equal(payload.basic.name, '甲');
  assert.equal(payload.basic.gender, '男');
  assert.equal(payload.basic.birthTimestamp, first.timestamp);
  assert.equal(bazi.table[0].data.day, '元男');
});

test('Ziwei export keeps its own identity after a Bazi chart', () => {
  const user = useUserStore();
  const ziwei = useZiweiStore();
  user.set(second); ziwei.pull(second);
  user.set(first); useBaziStore().pull(first);
  const payload = buildZiweiExportPayload(user, ziwei);
  assert.equal(payload.profile.name, '乙');
  assert.equal(payload.profile.gender, '女');
  assert.equal(payload.profile.birthTimestamp, second.timestamp);
  assert.equal(payload.basicChart.gender, '女');
});

test('Bazi direct result restores the Bazi cache despite another module having a profile', () => {
  useUserStore().set(second);
  platform.storage.set('bazi_last_context', JSON.stringify(first));
  loadPage('pages/index/detail.nvue', ['getGenderLabel']);
  assert.equal(useBaziStore().solar.year, 2026);
  const payload = buildBaziExportPayload(useUserStore(), useBaziStore(), useYunStore());
  assert.equal(payload.basic.name, '甲');
});

test('Bazi result fully recalculates changed birth time and gender with an existing solar year', () => {
  useUserStore().set(first);
  const bazi = useBaziStore();
  bazi.pull(first);
  const page = loadPage('pages/index/detail.nvue', ['ensureBaziComputed']);
  bazi.$patch({ input: second });
  page.ensureBaziComputed();
  assert.equal(bazi.solar.year, 2022);
  assert.equal(bazi.yangli, '2022/03/03 08:00:00');
  assert.equal(bazi.table[0].data.day, '元女');
  assert.equal(useYunStore().original[0].getLunar().getSolar().getYear(), 2022);
});

test('Bazi edit opens its input page and carries the displayed chart identity', () => {
  const user = useUserStore();
  user.set(first); useBaziStore().pull(first);
  const page = loadPage('pages/index/detail.nvue', ['editBazi']);
  user.set(second); useZiweiStore().pull(second);
  const originalTimer = global.setTimeout;
  global.setTimeout = callback => { callback(); return 0; };
  try { page.editBazi(); } finally { global.setTimeout = originalTimer; }
  assert.equal(platform.routes.at(-1), '/pages/index/index');
  const edit = JSON.parse(platform.storage.get('edit_bazi_data'));
  assert.equal(edit.realname, '甲');
  assert.equal(edit.gender, 0);
  assert.equal(edit.timestamp, first.timestamp);
  assert.equal(edit.recordId, 11);
});

test('saving Bazi uses the displayed chart input and record instead of the latest other chart', async () => {
  const user = useUserStore();
  user.set(first); useBaziStore().pull(first);
  const page = loadPage('pages/index/detail.nvue', ['saveToAccount']);
  user.set(second); useZiweiStore().pull(second);
  user._hasAccessToken = true; platform.storage.set('access_token', 'test-token');
  page.saveToAccount();
  await Promise.resolve();
  assert.equal(platform.requests[0].url, '/records/bazi/11');
  assert.equal(platform.requests[0].data.name, '甲');
  assert.equal(platform.requests[0].data.gender, '0');
  assert.equal(platform.requests[0].data.birthDatetime, first.timestamp);
  assert.equal(platform.requests[0].data.rawPayload.user.realname, '甲');
});

test('saving Ziwei uses its displayed chart identity and record after Bazi input changes', async () => {
  const user = useUserStore();
  user.set(second); useZiweiStore().pull(second);
  const page = loadPage('pages/ziwei/result.nvue', ['saveToAccount']);
  user.set(first); useBaziStore().pull(first);
  user._hasAccessToken = true; platform.storage.set('access_token', 'test-token');
  await page.saveToAccount();
  assert.equal(platform.requests[0].url, '/records/ziwei/22');
  assert.equal(platform.requests[0].data.name, '乙');
  assert.equal(platform.requests[0].data.gender, '1');
  assert.equal(platform.requests[0].data.birthDatetime, second.timestamp);
  assert.equal(platform.requests[0].data.rawPayload.user.realname, '乙');
});

test('a Bazi save response cannot attach the previous chart record to a newly generated chart', async () => {
  const user = useUserStore();
  user.set(first); const bazi = useBaziStore(); bazi.pull(first);
  const page = loadPage('pages/index/detail.nvue', ['saveToAccount']);
  user._hasAccessToken = true; platform.storage.set('access_token', 'test-token');
  page.saveToAccount();
  bazi.pull(second);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(bazi.input.recordId, 22);
  assert.equal(JSON.parse(platform.storage.get('bazi_last_context')).recordId, 22);
});

test('a Ziwei save response cannot attach the previous chart record to a newly generated chart', async () => {
  const user = useUserStore();
  user.set(first); const ziwei = useZiweiStore(); ziwei.pull(first);
  const page = loadPage('pages/ziwei/result.nvue', ['saveToAccount']);
  user._hasAccessToken = true; platform.storage.set('access_token', 'test-token');
  const pendingSave = page.saveToAccount();
  ziwei.pull(second);
  await pendingSave;
  assert.equal(ziwei.input.recordId, 22);
  assert.equal(JSON.parse(platform.storage.get('ziwei_last_context')).recordId, 22);
});

test('an edited Bazi form keeps its record when the existing page is shown again', () => {
  platform.storage.set('edit_bazi_data', JSON.stringify({ ...first, isEdit: true }));
  const form = loadPage('pages/index/index.nvue', ['Sumbit', 'realname', 'gender', 'timestamp']);
  platform.hooks.load[0]({});
  platform.hooks.show[0]();
  platform.hooks.show[0]();
  assert.equal(form.realname.value, '甲');
  assert.equal(form.timestamp.value, first.timestamp);
  runTimersNow(() => form.Sumbit());
  assert.equal(useBaziStore().input.recordId, 11);
});

test('an edited Ziwei form keeps its record when the existing page is shown again', () => {
  platform.storage.set('edit_ziwei_data', JSON.stringify({ ...second, isEdit: true }));
  const form = loadPage('pages/ziwei/index.nvue', ['Submit', 'realname', 'gender', 'timestamp']);
  platform.hooks.load[0]({});
  platform.hooks.show[0]();
  platform.hooks.show[0]();
  assert.equal(form.realname.value, '乙');
  assert.equal(form.timestamp.value, second.timestamp);
  runTimersNow(() => form.Submit());
  assert.equal(useZiweiStore().input.recordId, 22);
});

test('changing only Bazi gender recalculates the gender-dependent chart rows', () => {
  const bazi = useBaziStore(); bazi.pull(first);
  const page = loadPage('pages/index/detail.nvue', ['ensureBaziComputed', 'getGenderLabel']);
  bazi.$patch({ input: { ...first, gender: 1 } });
  page.ensureBaziComputed();
  assert.equal(page.getGenderLabel(), '女');
  assert.equal(bazi.table[0].data.day, '元女');
  assert.equal(bazi.yangli, '2026/10/10 12:30:00');
});

test('Ziwei direct result restores only its own cached profile', () => {
  useUserStore().set(first);
  platform.storage.set('bazi_last_context', JSON.stringify(first));
  platform.storage.set('ziwei_last_context', JSON.stringify(second));
  const page = loadPage('pages/ziwei/result.nvue', ['summaryTiles']);
  assert.equal(page.summaryTiles.value[0].value, '乙');
  assert.equal(page.summaryTiles.value[1].value, '女');
  assert.equal(useZiweiStore().astrolabe.solarDate, '2022-03-03');
  assert.equal(useZiweiStore().input.recordId, 22);
});

test('changing only Ziwei gender recomputes its chart when the result page is shown', () => {
  const ziwei = useZiweiStore(); ziwei.pull(first);
  const page = loadPage('pages/ziwei/result.nvue', ['summaryTiles']);
  ziwei.$patch({ input: { ...first, gender: 1 } });
  platform.hooks.show[0]();
  assert.equal(page.summaryTiles.value[1].value, '女');
  assert.equal(ziwei.astrolabe.gender, '女');
  assert.equal(ziwei.astrolabe.solarDate, '2026-10-10');
});

test('Bazi chat sends the Bazi identity with its pillars after a Ziwei calculation', () => {
  const user = useUserStore(); user.set(first); useBaziStore().pull(first);
  user.set(second); useZiweiStore().pull(second);
  const page = loadPage('pages/chat/index.nvue', ['buildMessages']);
  platform.hooks.load[0]({ from: 'bazi' });
  const messages = page.buildMessages('请分析');
  assert.equal(messages[0].role, 'system');
  const profileLines = messages[0].content.split('\n').filter(line => /^\s*(name|gender|solarString):/.test(line)).join('\n');
  assert.match(profileLines, /name: "甲"/);
  assert.match(profileLines, /gender: "男"/);
  assert.match(profileLines, /solarString: "2026\/10\/10 12:30:00"/);
  assert.doesNotMatch(profileLines, /name: "乙"/);
});

test('Ziwei chat sends the Ziwei identity with its chart after a Bazi calculation', () => {
  const user = useUserStore(); user.set(second); useZiweiStore().pull(second);
  user.set(first); useBaziStore().pull(first);
  const page = loadPage('pages/chat/index.nvue', ['buildMessages']);
  platform.hooks.load[0]({ from: 'ziwei' });
  const messages = page.buildMessages('请分析');
  assert.equal(messages[0].role, 'system');
  const profileLines = messages[0].content.split('\n').filter(line => /^\s*(name|gender|solarDate):/.test(line)).join('\n');
  assert.match(profileLines, /name: "乙"/);
  assert.match(profileLines, /gender: "女"/);
  assert.match(profileLines, /solarDate: "2022-03-03"/);
  assert.doesNotMatch(profileLines, /name: "甲"/);
});

test('history replay rebuilds from record identity even when cached Bazi contains another input', () => {
  useUserStore().set(second); useZiweiStore().pull(second);
  const page = loadPage('pages/history/list.nvue', ['openChart']);
  runTimersNow(() => page.openChart({
    id: 63, title: '甲', gender: '0', birthDatetime: first.timestamp, createdAt: '',
    rawPayload: {
      user: first,
      bazi: { solar: { year: 2026 }, yangli: '2026/10/10 12:30:00', sizhu: { year: '丙午' }, yinli: '有效', xinzuo: '天秤', table: [{}], input: second },
    },
  }));
  assert.equal(useBaziStore().input.realname, '甲');
  assert.equal(useBaziStore().input.gender, 0);
  assert.equal(useBaziStore().input.timestamp, first.timestamp);
  assert.equal(useBaziStore().input.recordId, 63);
  assert.equal(useBaziStore().solar.year, 2026);
  assert.equal(useZiweiStore().input.realname, '乙');
});
