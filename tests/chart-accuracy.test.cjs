const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
require('./helpers/load-source.cjs');
const { civilToTimestamp, zonedParts } = require('../src/utils/chartTime.ts');
const { calculateZiwei } = require('../src/utils/ziweiCalculation.ts');

const input = (civil, timeZone = 'Asia/Shanghai') => ({ timestamp: civilToTimestamp(civil, timeZone), timeZone, gender: 1 });
const slim = chart => JSON.parse(JSON.stringify(chart.palaces));

test('You-palace brightness matches the original table and upstream 2.6.1 correction', () => {
  for (const [day, name, expected] of [[3, '七杀', '旺'], [16, '太阴', '旺'], [24, '太阳', '平']]) {
    const { chart } = calculateZiwei(input(`2003-03-${String(day).padStart(2, '0')} 00:30`));
    const palace = chart.palaces.find(p => p.earthlyBranch === '酉');
    assert.equal(palace.majorStars.find(s => s.name === name).brightness, expected, name);
  }
});

test('explicit birth zone ignores host time zone (including historical DST)', () => {
  for (const zone of ['UTC','Asia/Shanghai','America/New_York']) {
    const code = `require('./tests/helpers/load-source.cjs');const {calculateZiwei}=require('./src/utils/ziweiCalculation.ts');const a=calculateZiwei({timestamp:Date.parse('2003-03-21T10:00:00Z'),gender:1,timeZone:'Asia/Shanghai'});console.log(JSON.stringify([a.chart.earthlyBranchOfSoulPalace,a.metadata.birthCivil,a.chart.fiveElementsClass]));`;
    const run = spawnSync(process.execPath,['-e',code],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,TZ:zone},encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.deepEqual(JSON.parse(run.stdout),['午','2003-03-21 18:00:00','火六局']);
  }
});

test('invalid civil dates and DST gaps are rejected; folds require explicit choice', () => {
  assert.throws(()=>civilToTimestamp('2023-02-30 12:00','Asia/Shanghai'),/日期/);
  assert.throws(()=>civilToTimestamp('2024-03-10 02:30','America/New_York'),/不存在/);
  assert.throws(()=>civilToTimestamp('2024-11-03 01:30','America/New_York'),/重复/);
  const early=civilToTimestamp('2024-11-03 01:30','America/New_York','earlier');
  const late=civilToTimestamp('2024-11-03 01:30','America/New_York','later');
  assert.equal(late-early,3600000);
  assert.equal(new Date(early).toISOString(),'2024-11-03T05:30:00.000Z');
  assert.equal(zonedParts(early,'America/New_York').hour,1);
  assert.throws(()=>zonedParts(early,'Mars/Olympus'),/时区/);
});

// HKO 2023 calendar: Apr 5 = leap 2/15, Apr 6 = leap 2/16,
// Apr 19 = leap 2/29, Apr 20 = 3/1, Jan 21 = previous year's 12/30.
for (const [before,after] of [['2023-04-05','2023-04-06'],['2023-04-06','2023-04-07'],['2023-04-19','2023-04-20'],['2023-01-21','2023-01-22'],['2023-02-19','2023-02-20']]) {
  test(`23:00 full next-day rollover ${before} -> ${after}`, () => {
    const a=calculateZiwei(input(`${before} 23:00`)),b=calculateZiwei(input(`${after} 00:00`));
    assert.deepEqual(slim(a.chart),slim(b.chart));
    assert.equal(a.metadata.calculationDate,after);
    assert.equal(a.metadata.birthCivil,`${before} 23:00:00`);
    assert.equal(a.metadata.lateZiRollover,true);
  });
}

test('manual soul/body formula and HKO lunar dates at leap month split', () => {
  for (const [date,month,day,leap,soul,body] of [
    ['2023-03-21',2,30,false,'卯','卯'],['2023-03-22',2,1,true,'卯','卯'],
    ['2023-04-05',2,15,true,'卯','卯'],['2023-04-06',2,16,true,'辰','辰'],
    ['2023-04-19',2,29,true,'辰','辰'],['2023-04-20',3,1,false,'辰','辰'],
  ]) {
    const {chart,metadata}=calculateZiwei(input(`${date} 00:30`));
    assert.deepEqual([metadata.lunar.month,metadata.lunar.day,metadata.lunar.isLeap],[month,day,leap]);
    assert.equal(chart.earthlyBranchOfSoulPalace,soul);
    assert.equal(chart.earthlyBranchOfBodyPalace,body);
  }
});

test('hour boundary mapping 22:59 / 23 / 00:59 / 01', () => {
  const cases=[['2023-03-21 22:59',11,'2023-03-21'],['2023-03-21 23:00',0,'2023-03-22'],['2023-03-22 00:59',0,'2023-03-22'],['2023-03-22 01:00',1,'2023-03-22']];
  for (const [civil,index,date] of cases) {
    const a=calculateZiwei(input(civil));
    assert.equal(a.metadata.timeIndex,index); assert.equal(a.metadata.calculationDate,date);
  }
});

test('manual fourteen-star placement on first lunar day (water two class)', () => {
  const {chart}=calculateZiwei(input('2023-01-22 00:30'));
  assert.equal(chart.fiveElementsClass,'水二局');
  // 初一补一得二，商一；奇数补数逆退一宫，紫微在丑。天府与紫微寅申镜像。
  // From 安紫微/天府诸星诀; literal expected branches do not call iztro helpers.
  const expected={紫微:'丑',天机:'子',太阳:'戌',武曲:'酉',天同:'申',廉贞:'巳',天府:'卯',太阴:'辰',贪狼:'巳',巨门:'午',天相:'未',天梁:'申',七杀:'酉',破军:'丑'};
  for(const [star,branch] of Object.entries(expected))assert.equal(chart.palaces.find(p=>p.majorStars.some(s=>s.name===star)).earthlyBranch,branch);
  const changed=Object.fromEntries(chart.palaces.flatMap(p=>p.majorStars.filter(s=>s.mutagen).map(s=>[s.name,s.mutagen])));
  assert.deepEqual(changed,{太阴:'科',贪狼:'忌',巨门:'权',破军:'禄'});
});

test('birth zone historical daylight offsets are applied (Shanghai 1991)', () => {
  const summer=civilToTimestamp('1991-07-01 12:00','Asia/Shanghai');
  const winter=civilToTimestamp('1991-01-01 12:00','Asia/Shanghai');
  assert.equal(new Date(summer).toISOString(),'1991-07-01T03:00:00.000Z');
  assert.equal(new Date(winter).toISOString(),'1991-01-01T04:00:00.000Z');
});
