const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useZiweiStore } = require('../src/store/ziwei.ts');

beforeEach(() => { resetPlatform(); setActivePinia(createPinia()); });

function setup(mode) {
  const store = useZiweiStore();
  store.pull({ gender: 1, timestamp: Date.parse('2003-03-21T10:00:00+08:00'), timeZone: 'Asia/Shanghai' });
  store.setTimelineSelection({ mode, date: new Date(2026, 5, 15, 12) });
  const page = loadPage('pages/ziwei/result.nvue', ['boardCells', 'highlightedIndices', 'openCellZoom', 'zoomedCell', 'handleCellClick']);
  return { store, page };
}

test('all four selected-scope transformations remain attached to their natal star locations', () => {
  for (const mode of ['decadal', 'yearly', 'monthly', 'daily']) {
    const { store, page } = setup(mode);
    const stars = store.currentHoroscope[mode].mutagen;
    const actual = page.boardCells.value.flatMap(cell => Object.entries(cell.scopeMutagens).flatMap(([star, tags]) => tags.map(tag => ({ star, index: cell.original.index, label: tag.label.slice(-1) }))));
    const expected = stars.map((star, i) => ({ star, index: store.astrolabe.palaces.find(p => [...p.majorStars, ...p.minorStars].some(s => s.name === star)).index, label: ['禄', '权', '科', '忌'][i] }));
    assert.deepEqual(actual.sort((a,b) => a.label.localeCompare(b.label)), expected.sort((a,b) => a.label.localeCompare(b.label)), mode);
  }
});

test('three-harmony and opposite-palace highlights surround the clicked physical palace in every scope', () => {
  for (const mode of ['origin', 'decadal', 'yearly', 'monthly', 'daily']) {
    const { store, page } = setup(mode);
    for (let index = 0; index < 12; index++) {
      store.focusPalaceIndex = index;
      const expected = [index, (index + 4) % 12, (index + 6) % 12, (index + 8) % 12].sort((a,b) => a-b);
      assert.deepEqual([...page.highlightedIndices.value].sort((a,b) => a-b), expected, `${mode}/${index}`);
    }
  }
});

test('opening palace details uses the focused cell after flying-transformation data updates', () => {
  const { store, page } = setup('yearly');
  const originalCell = page.boardCells.value.find(cell => cell.original.name === '命宫');
  page.openCellZoom(originalCell);
  const updatedCell = page.boardCells.value.find(cell => cell.original.index === store.focusPalaceIndex);
  assert.deepEqual(page.zoomedCell.value.flyMutagens, updatedCell.flyMutagens);
});
