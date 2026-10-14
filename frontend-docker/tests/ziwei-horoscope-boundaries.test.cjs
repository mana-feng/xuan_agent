const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { calculateZiwei } = require('../src/utils/ziweiCalculation.ts');
const { calculateZiweiHoroscope } = require('../src/utils/ziweiHoroscope.ts');
beforeEach(resetPlatform);

test('xiaoxian continues its twelve-year cycle after age 120 without changing nominal age', () => {
  for (const gender of [0, 1]) {
    const { chart } = calculateZiwei({ gender, timestamp: Date.parse('1952-01-15T00:30:00+08:00'), timeZone: 'Asia/Shanghai' });
    const h = calculateZiweiHoroscope(chart, new Date(2071, 5, 15, 12));
    // Lunar birth year Xin Mao: Hai-Mao-Wei group starts Xiaoxian at Chou.
    // Age 121 has completed ten full cycles, for both genders.
    assert.equal(h.age.nominalAge, 121);
    assert.equal(h.age.index, 11);
    assert.equal(h.age.palaceNames[11], '命宫');
    assert.equal(h.age.earthlyBranch, '丑');
    assert.equal(h.age.heavenlyStem, chart.palaces[11].heavenlyStem);
  }
});

test('late Zi remains Zi when the following device midnight is skipped by DST', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    const { chart } = calculateZiwei({ gender: 0, timestamp: Date.parse('2003-03-21T12:00:00+08:00'), timeZone: 'Asia/Shanghai' });
    const h = calculateZiweiHoroscope(chart, new Date(2018, 10, 3, 23, 30));
    // Independent Fortel calendar gives Geng Zi day on 2018-11-04.
    // Five-rat progression: Geng day begins Bing Zi hour.
    assert.equal(h.solarDate, '2018-11-4');
    assert.equal(h.hourly.earthlyBranch, '子');
    assert.equal(h.hourly.heavenlyStem, '丙');
    assert.equal(h.hourly.index, h.daily.index);
    assert.deepEqual(h.hourly.mutagen, ['天同', '天机', '文昌', '廉贞']);
    assert.ok(h.hourly.stars[3].some(star => star.name === '时禄')); // Bing stem Lu Cun at Si.
    assert.equal(h.palace('命宫', 'hourly').index, h.daily.index);
    const transformed = chart.palaces.find(palace => palace.majorStars.some(star => star.name === '天同'));
    assert.equal(h.hasHoroscopeMutagen(h.hourly.palaceNames[transformed.index], 'hourly', '禄'), true);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
