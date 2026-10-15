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

test('Bazi editor rejects nonexistent DST time and switches between repeated occurrences', () => {
  const page = loadPage('pages/index/index.nvue',['timeZone','overlapChoice','confirmBirthTime','timestamp','birthEditorError','Sumbit']);
  page.timeZone.value = 'America/New_York';
  page.confirmBirthTime({date:'2024-03-10',clock:'02:30',leap:false});
  assert.match(page.birthEditorError.value,/不存在/); assert.equal(page.timestamp.value,null);
  page.confirmBirthTime({date:'2024-11-03',clock:'01:30',leap:false});
  assert.match(page.birthEditorError.value,/重复/);
  page.overlapChoice.value='earlier';
  page.confirmBirthTime({date:'2024-11-03',clock:'01:30',leap:false});
  assert.equal(page.timestamp.value,Date.parse('2024-11-03T01:30:00-04:00'));
});
