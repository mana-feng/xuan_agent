const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const sourceRoot = path.resolve(__dirname, '../../src');
const dependencyRoot = fs.existsSync(path.resolve(__dirname, '../../node_modules/typescript'))
  ? path.resolve(__dirname, '../../node_modules') : path.resolve(__dirname, '../../../frontend-docker/node_modules');
const ts = require(path.join(dependencyRoot, 'typescript'));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let platform;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === 'qimen-engine') request = path.join(sourceRoot, '../vendor/qfdk-qimen/lib/qimen.js');
  if (request.startsWith('@/')) request = path.join(sourceRoot, request.slice(2));
  try { return originalResolve.call(this, request, parent, ...rest); }
  catch (error) {
    if (request.startsWith('.') || path.isAbsolute(request)) throw error;
    return originalResolve.call(this, path.join(dependencyRoot, request), parent, ...rest);
  }
};
Module._extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
Module._load = function(request, parent, isMain) {
  if (request.endsWith('.vue') || request.endsWith('.nvue')) return {};
  if (request === '@dcloudio/uni-app') return {
    onLoad: fn => platform.hooks.load.push(fn), onShow: fn => platform.hooks.show.push(fn),
    onUnload: fn => platform.hooks.unload.push(fn),
  };
  if (request === 'vue') return {
    ...originalLoad.call(this, request, parent, isMain),
    onMounted: fn => platform.hooks.mounted.push(fn),
    onUnmounted: fn => platform.hooks.unload.push(fn),
  };
  return originalLoad.call(this, request, parent, isMain);
};
function resetPlatform() {
  platform = { storage: new Map(), requests: [], routes: [], hooks: { load: [], show: [], mounted: [], unload: [] } };
  global.defineProps = () => platform.props || {};
  global.defineEmits = () => (...args) => { (platform.emits ||= []).push(args); };
  global.defineExpose = methods => { platform.exposed = methods; };
  global.uni = {
    getStorageSync: key => platform.storage.get(key),
    setStorageSync: (key, value) => platform.storage.set(key, value),
    removeStorageSync: key => platform.storage.delete(key),
    request: options => { platform.requests.push(options); options.success({ statusCode: 200, data: { choices: [{ message: { content: 'fallback' } }] } }); return { abort() {} }; },
    showLoading() {}, hideLoading() {}, showToast() {}, hideKeyboard() {},
    navigateTo: options => { platform.routes.push(options.url); options.success?.(); },
    reLaunch: options => { platform.routes.push(options.url); options.success?.(); },
  };
  return platform;
}
function loadPage(relative, exports) {
  const filename = path.join(sourceRoot, relative);
  const source = fs.readFileSync(filename, 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(ts.transpileModule(`${source}\nexport { ${exports.join(', ')} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}
module.exports = { resetPlatform, loadPage };
