const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sourceRoot = path.resolve(__dirname, '../../src');
const resolve = Module._resolveFilename;
const load = Module._load;
let platform;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(this, request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, parent, ...rest);
};
function compile(source, filename) {
  return ts.transpileModule(source.replace(/import\.meta/g, '({ env: {} })'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
  }).outputText;
}
Module._extensions['.ts'] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename);
Module._load = function (request, parent, isMain) {
  if (request.endsWith('.vue') || request.endsWith('.nvue')) return {};
  if (request === '@dcloudio/uni-app') return {
    onLoad: callback => platform.hooks.load.push(callback),
    onShow: callback => platform.hooks.show.push(callback),
  };
  if (request === 'vue') return { ...load.call(this, request, parent, isMain), onMounted() {}, onUnmounted() {} };
  return load.call(this, request, parent, isMain);
};
function resetPlatform(storage = new Map()) {
  platform = { hooks: { load: [], show: [] }, routes: [], toasts: [], timers: [], storage };
  global.setTimeout = callback => { platform.timers.push(callback); return platform.timers.length; };
  global.clearTimeout = () => {};
  global.uni = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    removeStorageSync: key => storage.delete(key), showToast: value => platform.toasts.push(value),
    showLoading() {}, hideLoading() {}, hideKeyboard() {},
    navigateTo: value => platform.routes.push(value.url), reLaunch: value => platform.routes.push(value.url),
    redirectTo: value => platform.routes.push(value.url),
  };
  platform.flushTimers = () => platform.timers.splice(0).forEach(callback => callback());
  return platform;
}
function loadPage(relativePath, exports) {
  const filename = path.join(sourceRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const pageModule = new Module(filename, module);
  pageModule.filename = filename;
  pageModule.paths = Module._nodeModulePaths(path.dirname(filename));
  pageModule._compile(compile(`${source}\nexport { ${exports.join(', ')} };`, filename + '.ts'), filename);
  return pageModule.exports;
}
module.exports = { resetPlatform, loadPage };
