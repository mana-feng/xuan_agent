const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');

test('flow-hour clocks retain all twelve branches across device DST transitions', () => {
  const { useYunStore } = require('../src/store/yun.ts');
  const originalTZ = process.env.TZ;
  try {
    for (const date of ['2024/03/10', '2024/11/03']) {
      const results = ['Asia/Shanghai', 'America/New_York', 'UTC'].map(host => {
        process.env.TZ = host;
        resetPlatform(); setActivePinia(createPinia());
        const store = useYunStore();
        store.day_list = [{date}]; store.day_index = 0;
        store.resolveLiuTime();
        const result = JSON.parse(JSON.stringify(store.time_list));
        assert.deepEqual(result.map(item => item.time), [23,1,3,5,7,9,11,13,15,17,19,21].map(hour => `${hour}:00`));
        assert.equal(result.map(item => item.zhi).join(''), '子丑寅卯辰巳午未申酉戌亥');
        return result;
      });
      assert.deepEqual(results[1],results[0]); assert.deepEqual(results[2],results[0]);
      if (date === '2024/11/03') assert.equal(results[0].map(item => item.ganzhi).join(' '), '戊子 己丑 庚寅 辛卯 壬辰 癸巳 甲午 乙未 丙申 丁酉 戊戌 己亥');
    }
  } finally {
    if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
  }
});

test('an empty childhood interval near a solar-term boundary does not break the month panel', async () => {
  const {Solar}=require('lunar-javascript');
  const {useYunStore}=require('../src/store/yun.ts');
  resetPlatform(); setActivePinia(createPinia());
  const yun=useYunStore();
  yun.original=Solar.fromYmdHms(2023,4,5,12,30,0).getLunar().getEightChar().getYun(1).getDaYun();
  assert.equal(yun.original[0].getLiuNian().length,0);
  await assert.doesNotReject(yun.resolveDaYun());
  assert.equal(yun.current_index,1);
  assert.ok(yun.year_list.length>0);
  await assert.doesNotReject(yun.resolveLiuMonth());
});
