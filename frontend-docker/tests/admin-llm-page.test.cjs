const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function load() {
  const pending = [], writes = [], toasts = [], mod = { exports: {} };
  let modalResolve;
  const filename = path.resolve(__dirname, '../../backend-docker/admin-ui/src/pages/admin/llm-config.nvue');
  const source = fs.readFileSync(filename, 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const output = ts.transpileModule(source + '\nexport {currentScope,form,modelHistory,loading,loadConfig,loadModelHistory,switchScope,handleSave,deleteModel};', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  global.uni = { showToast: value => toasts.push(value), showModal: () => new Promise(resolve => { modalResolve = resolve; }) };
  const request = (url, options) => {
    if (options.method === 'GET') return new Promise((resolve, reject) => pending.push({ url, resolve, reject }));
    writes.push({ url, data: { ...options.data } }); return Promise.resolve({});
  };
  new Function('require', 'module', 'exports', output)(name => {
    if (name === 'vue') return { ...require('vue'), onMounted() {} };
    if (name === '@/store/user') return { useUserStore: () => ({ isAdmin: true }) };
    if (name === '@/services/api/index') return { request };
    throw new Error(name);
  }, mod, mod.exports);
  return { ...mod.exports, pending, writes, toasts, confirm: () => modalResolve({ confirm: true }) };
}
const cfg = model => ({ provider: 'ollama', model, baseUrl: 'http://local.test' });
test('late Chat config cannot overwrite an already loaded Agent form or loading state', async () => {
  const p = load(), old = p.loadConfig(); p.switchScope('agent');
  p.pending[1].resolve({ data: cfg('agent') }); await tick();
  p.pending[2].resolve({ data: [] }); await tick();
  p.pending[0].resolve({ data: cfg('chat') }); await tick();
  if (p.pending[3]) p.pending[3].resolve({ data: [] });
  await old;
  assert.equal(p.form.model, 'agent'); assert.equal(p.loading.value, false);
});
test('late model-history failure cannot erase the newly selected scope history', async () => {
  const p = load(), old = p.loadModelHistory(); p.switchScope('agent');
  p.pending[1].resolve({ data: cfg('agent') }); await tick();
  p.pending[2].resolve({ data: [{ id: 2, scope: 'agent' }] }); await tick();
  p.pending[0].reject(new Error('old request')); await old;
  assert.equal(p.modelHistory.value[0]?.id, 2);
});
test('saving is blocked until the current scope has finished loading', async () => {
  const p = load(), loading = p.loadConfig();
  const save = p.handleSave(); await tick(); assert.equal(p.writes.length, 0); await save;
  p.pending[0].resolve({ data: cfg('chat') }); await tick(); p.pending[1].resolve({ data: [] }); await loading;
});
test('deletion confirmation preserves the originally selected model scope', async () => {
  const p = load(), deletion = p.deleteModel(7); p.switchScope('agent'); p.confirm(); await tick();
  assert.match(p.writes[0].url, /scope=chat$/); assert.equal(p.writes[0].data.scope, 'chat');
  // Finishing an operation for an inactive scope must not reload the active form.
  await deletion; assert.equal(p.pending.length, 1);
});
