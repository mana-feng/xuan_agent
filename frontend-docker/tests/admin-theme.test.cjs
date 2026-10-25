const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTheme(saved) {
  const storage = new Map([['xuan-admin-palette', saved]]);
  global.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) };
  const filename = path.resolve(__dirname, '../../backend-docker/admin-ui/src/features/admin/theme.ts');
  const fresh = new Module(filename, module);
  fresh.filename = filename;
  fresh.paths = Module._nodeModulePaths(path.dirname(filename));
  fresh._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
  return { theme: fresh.exports.useAdminTheme(), storage };
}

test('admin removed palette preference migrates to the retained default', () => {
  const { theme, storage } = loadTheme('lake');
  assert.deepEqual(theme.palettes.map(item => item.id), ['aurora', 'sunset']);
  assert.equal(theme.palette.value, 'aurora');
  assert.equal(theme.paletteName.value, '青蓝流光');
  assert.equal(storage.get('xuan-admin-palette'), 'aurora');
});

test('admin amber preference survives and removed palette cannot be selected again', () => {
  const { theme, storage } = loadTheme('sunset');
  assert.equal(theme.palette.value, 'sunset');
  theme.selectPalette('aurora');
  assert.equal(storage.get('xuan-admin-palette'), 'aurora');
  theme.selectPalette('sunset');
  theme.selectPalette('lake');
  assert.equal(theme.palette.value, 'sunset');
  assert.equal(storage.get('xuan-admin-palette'), 'sunset');
});
