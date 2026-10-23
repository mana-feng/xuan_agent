const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { pathToFileURL } = require('node:url');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useYunStore } = require('../src/store/yun.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { executeLiuyaoChart } = require('../src/features/liuyao/executor.ts');
const { buildBaziExportPayload } = require('../src/utils/baziExport.ts');
const { buildLiuyaoExportPayload } = require('../src/utils/liuyaoExport.ts');
const { encodeTOON } = require('../src/utils/toon.ts');

beforeEach(() => { resetPlatform(); setActivePinia(createPinia()); });

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

test('Liuyao copied chart identifies the real casting method, gender and top-to-bottom line positions', () => {
  executeLiuyaoChart({ params: [0, 1, 3, 4, 0, 1], date: new Date('2021-06-15T00:42:00Z'), timeZone: 'Asia/Shanghai', gender: 1, methodLabel: '手工指定', title: '合成,测试"甲"\n本卦：这是一段问题' });
  const text = buildLiuyaoExportPayload(useLiuyaoStore());
  assert.ok(text.includes('性别：女'));
  assert.ok(text.includes('起卦方式："手工指定"'));
  assert.ok(text.includes('占问： "合成,测试\\"甲\\"\\n本卦：这是一段问题"'));
  const rows = text.split('\n').filter(line => /^ (上爻|五爻|四爻|三爻|二爻|初爻) /.test(line));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(line => line.trim().split(/\s+/)[0]), ['上爻', '五爻', '四爻', '三爻', '二爻', '初爻']);
  const cells = rows.map(row => row.trim().split('|').map(cell => cell.trim()));
  assert.deepEqual(cells[2].slice(4), ['--', 'x', '—', '官鬼己酉金', '—', '—']); // Fourth line: old yin -> yang.
  assert.deepEqual(cells[3].slice(4), ['—', 'o', '世', '子孙戊午火', '--', '世']); // Third line: old yang -> yin.
  assert.equal(cells[1][2], '子孙辛巳火'); // Hidden spirit remains attached to the fifth line.
  assert.equal(text.split('\n').filter(line => /^ 本卦：/.test(line)).length, 1);
});

test('Bazi payload survives strict official TOON decoding without changing chart data', { skip: !process.env.TOON_REFERENCE_MODULE }, async () => {
  const { decode } = await import(pathToFileURL(process.env.TOON_REFERENCE_MODULE).href);
  const { payload } = baziSample();
  assert.deepEqual(decode(encodeTOON(payload), { strict: true }), JSON.parse(JSON.stringify(payload)));
});
