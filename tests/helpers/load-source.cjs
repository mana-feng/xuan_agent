const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '../../src');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let platform = { hooks: { load: [], show: [] }, requests: [] };

Module._resolveFilename = function (request, parent, ...rest) {
  const resolved = request === 'qimen-engine' ? path.join(sourceRoot, '../vendor/qfdk-qimen/lib/qimen.js') : request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request;
  return originalResolve.call(this, resolved, parent, ...rest);
};
Module._extensions['.ts'] = (module, filename) => {
  // Vite injects import.meta.env in the application; tests use an empty environment.
  const source = fs.readFileSync(filename, 'utf8').replace(/import\.meta/g, '({ env: {} })');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
Module._load = function (request, parent, isMain) {
  if (request.endsWith('.vue') || request.endsWith('.nvue')) return {};
  if (request === '@dcloudio/uni-app') return {
    onLoad: callback => platform.hooks.load.push(callback),
    onShow: callback => platform.hooks.show.push(callback),
    onHide() {},
  };
  if (request === 'vue') return {
    ...originalLoad.call(this, request, parent, isMain),
    // A page script's data logic runs without mounting native UI in Node.
    onMounted() {}, onUnmounted() {},
  };
  if (request === '@/services/localRecords') {
    const local = originalLoad.call(this, request, parent, isMain);
    return { request: async (url, options) => { platform.requests.push({url, ...options}); return local.request(url, options); } };
  }
  if (request === '@/services/api/index') return {
    request: async (url, options) => {
      platform.requests.push({ url, ...options });
      if (platform.respond) return platform.respond(url, options);
      return { success: true, data: { id: 91 } };
    },
  };
  return originalLoad.call(this, request, parent, isMain);
};

function resetPlatform() {
  platform = { hooks: { load: [], show: [] }, requests: [], routes: [], toasts: [], storage: new Map() };
  global.uni = {
    getStorageSync: key => platform.storage.get(key),
    setStorageSync: (key, value) => platform.storage.set(key, value),
    removeStorageSync: key => platform.storage.delete(key),
    showToast: value => platform.toasts.push(value),
    showLoading() {}, hideLoading() {}, hideKeyboard() {},
    reLaunch: value => platform.routes.push(value.url),
    navigateTo: value => platform.routes.push(value.url),
    redirectTo: value => platform.routes.push(value.url),
  };
  return platform;
}

function loadPage(relativePath, exports) {
  const filename = path.join(sourceRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const pageModule = new Module(filename, module);
  pageModule.filename = filename;
  pageModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const compiled = ts.transpileModule(`${source}\nexport { ${exports.join(', ')} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename + '.ts',
  }).outputText;
  pageModule._compile(compiled, filename);
  return pageModule.exports;
}

module.exports = { resetPlatform, loadPage };
