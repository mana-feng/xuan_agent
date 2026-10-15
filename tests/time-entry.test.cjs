const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');

test('Bazi lunar input converts a leap month and retains the entered minute', () => {
  resetPlatform(); setActivePinia(createPinia());
  const page = loadPage('pages/index/index.nvue', ['model', 'timestamp', 'confirmBirthTime']);
  page.model.value = 1;
  assert.equal(typeof page.confirmBirthTime, 'function');
  page.confirmBirthTime({ date: '2023-02-15', clock: '23:05', leap: true });
  const expected = new Date(2023, 3, 5, 23, 5, 0).getTime();
  assert.equal(page.timestamp.value, expected);
});

test('both birth pages preserve the earliest supported solar date through a lunar editor round trip', () => {
  for (const chart of ['index', 'ziwei']) {
    resetPlatform(); setActivePinia(createPinia());
    const page = loadPage(`pages/${chart}/index.nvue`, ['model', 'timestamp', 'SelectTime', 'confirmBirthTime', 'birthDateDraft', 'birthClockDraft', 'birthLeapDraft']);
    page.confirmBirthTime({ date: '1900-01-01', clock: '00:05', leap: false });
    const original = page.timestamp.value; assert.equal(typeof original, 'number');
    page.model.value = 1; page.SelectTime();
    assert.equal(page.birthDateDraft.value, '1899-12-01');
    assert.equal(page.birthClockDraft.value, '00:05');
    page.confirmBirthTime({ date: page.birthDateDraft.value, clock: page.birthClockDraft.value, leap: page.birthLeapDraft.value });
    assert.equal(page.timestamp.value, original, `${chart} must keep the original instant`);
  }
});

test('Qimen time editor cancellation retains live-now mode and confirmation supplies the chosen civil time', () => {
  resetPlatform(); setActivePinia(createPinia());
  const page = loadPage('pages/qimen/index.nvue', ['timeMode', 'civil', 'editTime', 'timeEditorOpen', 'confirmTime']);
  page.editTime();
  assert.equal(page.timeEditorOpen.value, true);
  assert.equal(page.timeMode.value, 'now');
  page.timeEditorOpen.value = false;
  assert.equal(page.civil.value, '');
  page.editTime(); page.confirmTime({ date: '1991-06-15', clock: '00:05', leap: false });
  assert.equal(page.civil.value, '1991-06-15T00:05');
  assert.equal(page.timeMode.value, 'custom'); assert.equal(page.timeEditorOpen.value, false);
});

test('Qimen reports an invalid custom zone before opening a time editor', () => {
  resetPlatform(); setActivePinia(createPinia());
  const page = loadPage('pages/qimen/index.nvue', ['timeZone', 'editTime', 'timeEditorOpen', 'formError']);
  page.timeZone.value = 'Invalid/Zone';
  assert.doesNotThrow(() => page.editTime());
  assert.equal(page.timeEditorOpen.value, false); assert.match(page.formError.value, /时区/);
});
