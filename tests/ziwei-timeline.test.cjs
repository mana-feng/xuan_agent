const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { reactive } = require('vue');
const { calculateZiwei } = require('../src/utils/ziweiCalculation.ts');
beforeEach(resetPlatform);

function timeline(date, mode = 'monthly', birthCivil = '2023-04-05T23:00:00+08:00') {
  const file = path.resolve(__dirname, '../src/pages/ziwei/components/Timeline.nvue');
  const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
  const compiled = compileScript(descriptor, { id: 'timeline-regression' });
  const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  const load = Module._load;
  Module._load = function(request, ...args) {
    const value = load.call(this, request, ...args);
    return request === 'vue' ? { ...value, onBeforeUnmount() {} } : value;
  };
  try { mod._compile(ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file); }
  finally { Module._load = load; }
  const { chart } = calculateZiwei({ gender: 0, timestamp: Date.parse(birthCivil), timeZone: 'Asia/Shanghai' });
  const props = reactive({ astrolabe: chart, viewMode: mode, targetDate: date });
  const events = [];
  const state = mod.exports.default.setup(props, { expose() {}, emit(...args) { events.push(args); } });
  return { props, state, events };
}

test('regular and leap months sharing a stem/branch are distinct selections', () => {
  // 2033 leap 11 starts Dec 22; regular 11 starts Nov 22.
  const { props, state } = timeline(new Date(2033, 11, 22));
  assert.equal(state.monthList.value.length, 13);
  assert.deepEqual(state.monthList.value.filter(state.isCurrentMonth).map(m => m.monthKey), [-11]);
  assert.equal(state.currentMonthId.value, state.monthList.value.find(m => m.monthKey === -11).id);
  const regular = state.monthList.value.find(m => m.monthKey === 11);
  state.selectMonth(regular);
  props.targetDate = new Date(2033, 10, 22);
  assert.deepEqual(state.monthList.value.filter(state.isCurrentMonth).map(m => m.monthKey), [11]);
});

test('reselecting the same month returns to the yearly layer but its leap counterpart does not', () => {
  const { state, events } = timeline(new Date(2033, 11, 22));
  state.selectMonth(state.monthList.value.find(m => m.monthKey === 11));
  assert.equal(events.at(-1)[1].mode, 'monthly');
  state.selectMonth(state.monthList.value.find(m => m.monthKey === -11));
  assert.equal(events.at(-1)[1].mode, 'yearly');
});

test('year rows anchor nominal ages to lunar years across changing new-year dates', () => {
  const { state } = timeline(new Date(2020, 0, 25), 'monthly', '2003-03-21T12:00:00+08:00');
  // Independent Fortel calendar: lunar 2015 begins 2015-02-19. Age 13 for lunar birth year 2003.
  const row = state.yearList.value.find(item => item.age === 13);
  assert.equal(row.year, 2015);
  assert.deepEqual([row.date.getFullYear(), row.date.getMonth() + 1, row.date.getDate()], [2015, 2, 19]);
});

test('selecting a decade reaches its starting nominal age even near the lunar new year', () => {
  const { state, events } = timeline(new Date(2020, 0, 25), 'monthly', '2003-03-21T12:00:00+08:00');
  const decade = state.sortedDecades.value.find(item => item.range[0] === 3);
  state.selectDecade(decade);
  const selected = events.at(-1)[1];
  assert.equal(selected.mode, 'decadal');
  assert.deepEqual([selected.date.getFullYear(), selected.date.getMonth() + 1, selected.date.getDate()], [2005, 2, 9]);
});

test('late Zi moves the active year and month across lunar new year without a stale date cache', () => {
  const { props, state } = timeline(new Date(2024, 1, 9, 22, 30), 'monthly', '2003-03-21T12:00:00+08:00');
  assert.equal(state.currentHoroscope.value.age.nominalAge, 21);
  assert.deepEqual(state.monthList.value.filter(state.isCurrentMonth).map(item => item.monthKey), [12]);
  props.targetDate = new Date(2024, 1, 9, 23, 30);
  assert.equal(state.currentHoroscope.value.age.nominalAge, 22);
  assert.equal(state.activeYearItem.value.ganZhi, '甲辰');
  const active = state.monthList.value.filter(state.isCurrentMonth);
  assert.deepEqual(active.map(item => item.monthKey), [1]);
  assert.equal(active[0].ganZhi, '丙寅');
});

test('late Zi selects the leap month from its effective calendar day', () => {
  const { props, state } = timeline(new Date(2033, 11, 21, 22, 30));
  assert.deepEqual(state.monthList.value.filter(state.isCurrentMonth).map(item => item.monthKey), [11]);
  props.targetDate = new Date(2033, 11, 21, 23, 30);
  assert.deepEqual(state.monthList.value.filter(state.isCurrentMonth).map(item => item.monthKey), [-11]);
  assert.equal(state.currentMonthId.value, state.monthList.value.find(item => item.monthKey === -11).id);
});

test('the active leap-month row displays the current half-month stem and branch', () => {
  const { props, state } = timeline(new Date(2023, 3, 6, 12), 'monthly', '2003-03-21T12:00:00+08:00');
  const active = state.monthList.value.find(state.isCurrentMonth);
  assert.equal(active.monthKey, -2);
  // Before the fix the template binds the static first-day anchor directly.
  const display = item => state.monthGanZhi ? state.monthGanZhi(item) : item.ganZhi;
  assert.equal(display(active), '丙辰');
  const regular = state.monthList.value.find(item => item.monthKey === 2);
  assert.equal(display(regular), '乙卯');
  props.targetDate = new Date(2023, 3, 5, 12);
  assert.equal(display(state.monthList.value.find(state.isCurrentMonth)), '乙卯');
});
