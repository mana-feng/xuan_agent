const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { pathToFileURL } = require('node:url');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useYunStore } = require('../src/store/yun.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');
const { buildBaziExportPayload } = require('../src/utils/baziExport.ts');
const { buildLiuyaoExportPayload } = require('../src/utils/liuyaoExport.ts');
const { encodeTOON } = require('../src/utils/toon.ts');

let platform;
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });

function baziSample() {
  const store = useBaziStore();
  store.pull({ realname: '合成,测试"甲"', gender: 0, timestamp: Date.parse('1990-05-19T16:00:00Z'), timeZone: 'Asia/Shanghai' });
  return { store, payload: buildBaziExportPayload({}, store, useYunStore()) };
}

test('Bazi export retains zero minutes and zero start-yun components from the real calculation', () => {
  const { store, payload } = baziSample();
  assert.equal(store.lunar.minute, 0);
  assert.equal(payload.lunar.minute, 0);
  assert.equal(store.start_yun.hour, 0);
  assert.equal(payload.start_yun.hour, 0);
});

function liuyaoSample(params = [0, 1, 3, 4, 0, 1], title = '这次合作如何推进') {
  executeLiuyaoChart({ params, date: new Date('2021-06-15T00:42:00Z'), timeZone: 'Asia/Shanghai', gender: 1, methodLabel: '手工指定', title });
  return useLiuyaoStore();
}

test('Liuyao copy keeps complete moving and hidden line data in readable top-to-bottom blocks', () => {
  const store = liuyaoSample(), before = JSON.stringify(store.$state);
  const text = buildLiuyaoExportPayload(store);
  assert.equal(text.split('\n')[0], '2021年06月15日 08:42');
  assert.match(text, /^【起卦信息】$/m);
  assert.match(text, /性别：女\n起卦方式：手工指定/);
  assert.match(text, /^时区：Asia\/Shanghai$/m);
  assert.doesNotMatch(text, /排盘口径：|规则版本：/);
  assert.match(text, /干支：辛丑年 甲午月 甲午日 戊辰时\n旬空：辰巳/);
  assert.match(text, /本卦：山风蛊；卦宫：巽；卦性：归魂/);
  assert.match(text, /变卦：火水未济；卦宫：离/);
  assert.match(text, /动爻：三爻、四爻/);
  assert.match(text, /【六爻明细（自上而下）】/);
  const blocks = text.split('\n\n').filter(block => /^(上爻|五爻|四爻|三爻|二爻|初爻)（六神：/.test(block));
  assert.deepEqual(blocks, [
    '上爻（六神：玄武）\n  本卦：兄弟丙寅木；阴阳：阳爻；动静：静爻；世应：应\n  变卦：子孙己巳火；阴阳：阳爻；世应：应\n  伏神：无',
    '五爻（六神：白虎）\n  本卦：父母丙子水；阴阳：阴爻；动静：静爻；世应：无\n  变卦：妻财己未土；阴阳：阴爻；世应：无\n  伏神：子孙辛巳火',
    '四爻（六神：螣蛇）\n  本卦：妻财丙戌土；阴阳：阴爻；动静：老阴动爻（阴变阳）；世应：无\n  变卦：官鬼己酉金；阴阳：阳爻；世应：无\n  伏神：无',
    '三爻（六神：勾陈）\n  本卦：官鬼辛酉金；阴阳：阳爻；动静：老阳动爻（阳变阴）；世应：世\n  变卦：子孙戊午火；阴阳：阴爻；世应：世\n  伏神：无',
    '二爻（六神：朱雀）\n  本卦：父母辛亥水；阴阳：阳爻；动静：静爻；世应：无\n  变卦：妻财戊辰土；阴阳：阳爻；世应：无\n  伏神：无',
    '初爻（六神：青龙）\n  本卦：妻财辛丑土；阴阳：阴爻；动静：静爻；世应：无\n  变卦：兄弟戊寅木；阴阳：阴爻；世应：无\n  伏神：无',
  ]);
  assert.doesNotMatch(text, /\||—|\bundefined\b/);
  assert.equal(JSON.stringify(store.$state), before, 'copying must preserve the chart, display and saved structured payload');
});

test('Liuyao copy preserves multiline question text while keeping its labels inside a quoted boundary', () => {
  const title = '合作方说"先试行"，是否可行？\n本卦：这是一段问题\n【卦象】\n下一步怎么做？';
  const store = liuyaoSample(undefined, title);
  const text = buildLiuyaoExportPayload(store);
  assert.ok(text.includes('占问（原文）：\n> 合作方说"先试行"，是否可行？\n> 本卦：这是一段问题\n> 【卦象】\n> 下一步怎么做？'));
  assert.equal(text.split('\n').filter(line => line.startsWith('> ')).map(line => line.slice(2)).join('\n'), store.profile.title);
  assert.ok(text.includes('> 下一步怎么做？\n\n性别：女'), 'a blank line ends the question quote before chart metadata');
  assert.equal(text.split('\n').filter(line => /^本卦：/.test(line)).length, 1);
  assert.equal(text.split('\n').filter(line => line === '【卦象】').length, 1);
  assert.doesNotMatch(text, /\\"|\\n/);
});

test('Liuyao AI summary keeps the actual casting time when copied reports add readable sections', () => {
  liuyaoSample();
  const page = loadPage('pages/chat/index.nvue', ['contextSummary']);
  platform.hooks.load.at(-1)({ from: 'liuyao' });
  assert.equal(page.contextSummary.value.time, '2021年06月15日 08:42');
});

test('Liuyao static copy identifies a static chart without six empty changed-line entries', () => {
  const store = liuyaoSample([0, 1, 1, 0, 0, 1]);
  const text = buildLiuyaoExportPayload(store);
  assert.match(text, /^动爻：无（静卦）$/m);
  assert.match(text, /^变卦：无（六爻皆静）$/m);
  assert.equal(text.split('\n').filter(line => /^(上爻|五爻|四爻|三爻|二爻|初爻)（六神：/.test(line)).length, 6);
  assert.equal(text.split('\n').filter(line => line.startsWith('  变卦：')).length, 0);
  assert.equal(text.split('\n').filter(line => line.includes('动静：静爻')).length, 6);
  assert.match(text, /五爻（六神：白虎）[\s\S]*?伏神：子孙辛巳火/);
});

test('Liuyao copy labels missing line polarity as unrecorded instead of silently drawing a yang line', () => {
  const store = liuyaoSample();
  const snapshot = JSON.parse(JSON.stringify(store.$state));
  snapshot.compiled.params[2] = null;
  snapshot.profile.gender = '';
  const text = buildLiuyaoExportPayload(snapshot);
  assert.match(text, /性别：未填写/);
  assert.match(text, /三爻（六神：勾陈）\n  本卦：官鬼辛酉金；阴阳：未填写；动静：未填写；世应：世/);
});

test('Liuyao copy shows only a short recorded time zone for the default clock convention', () => {
  const store = liuyaoSample(), before = JSON.stringify(store.$state);
  const text = buildLiuyaoExportPayload(store);
  assert.match(text, /^时区：Asia\/Shanghai$/m);
  assert.doesNotMatch(text, /排盘口径：|规则版本：|liuyao-civil-v1|钟表时间|00:00换日|换日：|立春|闰月|真太阳时/);
  assert.equal(store.calculation.rules.dayDivide, 'midnight');
  assert.equal(store.calculation.ruleVersion, 'liuyao-civil-v1');
  assert.equal(JSON.stringify(store.$state), before);
});

test('Liuyao copy briefly notes a supported non-default day boundary from saved calculation metadata', () => {
  executeLiuyaoChart({ params: [0, 1, 3, 4, 0, 1], date: new Date('2026-10-15T15:30:00Z'), timeZone: 'America/New_York', methodLabel: '时间起卦', rules: { dayDivide: 'zi', yearDivide: 'lunar', leapMonth: 'same-month' } });
  const store = useLiuyaoStore(), before = JSON.stringify(store.$state);
  const text = buildLiuyaoExportPayload(store);
  assert.match(text, /^时区：America\/New_York$/m);
  assert.match(text, /^换日：23:00$/m);
  assert.doesNotMatch(text, /排盘口径：|规则版本：|春节|闰月|真太阳时/);
  assert.equal(JSON.stringify(store.$state), before);
  assert.deepEqual(JSON.parse(JSON.stringify(store.calculation.rules)), { dayDivide: 'zi', yearDivide: 'lunar', leapMonth: 'same-month' });
});

test('Liuyao copy keeps an unknown legacy time zone unknown while preserving the original chart warning', () => {
  liuyaoSample();
  const cached = JSON.parse(JSON.stringify(platform.storage.get('liuyao_last_result')));
  delete cached.calculation; delete cached.castingAt;
  platform.storage.set('liuyao_last_result', cached);
  setActivePinia(createPinia());
  const store = useLiuyaoStore(); store.restoreLastResult();
  assert.equal(store.calculation, null);
  const before = JSON.stringify(store.$state), text = buildLiuyaoExportPayload(store);
  assert.match(text, /^时区：未填写$/m);
  assert.match(text, /旧记录未保存原时区与规则版本；以下为保留的原盘，不按当前默认规则重排。/);
  assert.doesNotMatch(text, /时区：Asia\/Shanghai|换日：|真太阳时/);
  assert.equal(JSON.stringify(store.$state), before);
});

test('Liuyao copy retains the minute-only legacy snapshot warning without printing internal versions', () => {
  const store = liuyaoSample();
  const payload = JSON.parse(JSON.stringify(store.$state));
  payload.calculation.source = 'legacy-confirmed';
  payload.calculation.ruleVersion = 'liuyao-legacy-v0';
  payload.calculation.replayMode = 'snapshot';
  payload.calculation.timePrecision = 'minute';
  store.setResult(payload);
  const text = buildLiuyaoExportPayload(store);
  assert.match(text, /^时区：Asia\/Shanghai$/m);
  assert.match(text, /原时间仅精确到分钟，显示保存的原盘快照/);
  assert.doesNotMatch(text, /规则版本：|liuyao-legacy-v0|换日：/);
  assert.equal(store.calculation.replayMode, 'snapshot');
});

test('simplifying Liuyao copied metadata leaves the full calculation context in storage and save payloads', async () => {
  const store = liuyaoSample(), calculation = JSON.stringify(store.calculation);
  const cache = JSON.stringify(platform.storage.get('liuyao_last_result'));
  const text = buildLiuyaoExportPayload(store);
  assert.doesNotMatch(text, /规则版本：|排盘口径：/);
  assert.equal(JSON.stringify(store.calculation), calculation);
  assert.equal(JSON.stringify(platform.storage.get('liuyao_last_result')), cache);
  require('../src/store/user.ts').useUserStore()._hasAccessToken = true;
  platform.storage.set('access_token', 'synthetic-test-token');
  await loadPage('pages/liuyao/result.nvue', ['saveLiuyao']).saveLiuyao();
  assert.equal(platform.requests.length, 1);
  assert.equal(JSON.stringify(platform.requests[0].data.rawPayload.calculation), calculation);
  assert.equal(platform.requests[0].data.rawPayload.calculation.ruleVersion, 'liuyao-civil-v1');
});

test('Bazi payload survives strict official TOON decoding without changing chart data', { skip: !process.env.TOON_REFERENCE_MODULE }, async () => {
  const { decode } = await import(pathToFileURL(process.env.TOON_REFERENCE_MODULE).href);
  const { payload } = baziSample();
  assert.deepEqual(decode(encodeTOON(payload), { strict: true }), JSON.parse(JSON.stringify(payload)));
});
