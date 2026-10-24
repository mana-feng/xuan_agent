const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTheme(saved) {
  const storage = new Map([['xuan-ui-palette', saved]]);
  global.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) };
  const filename = path.resolve(__dirname, '../src/features/workbench/theme.ts');
  const fresh = new Module(filename, module);
  fresh.filename = filename;
  fresh.paths = Module._nodeModulePaths(path.dirname(filename));
  fresh._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
  return { theme: fresh.exports.useWorkbenchTheme(), storage };
}

test('removed lake preference migrates to the retained default palette', () => {
  const { theme, storage } = loadTheme('lake');
  assert.deepEqual(theme.palettes.map(item => item.id), ['aurora', 'sunset']);
  assert.equal(theme.palette.value, 'aurora');
  assert.equal(theme.paletteName.value, '青蓝流光');
  assert.equal(storage.get('xuan-ui-palette'), 'aurora');
});

test('existing amber choice survives and only the two remaining choices can be selected', () => {
  const { theme, storage } = loadTheme('sunset');
  assert.equal(theme.palette.value, 'sunset');
  theme.changePalette(0);
  assert.equal(storage.get('xuan-ui-palette'), 'aurora');
  theme.changePalette(1);
  assert.equal(storage.get('xuan-ui-palette'), 'sunset');
  theme.changePalette(2);
  assert.equal(theme.palette.value, 'sunset');
  assert.equal(storage.get('xuan-ui-palette'), 'sunset');
});
