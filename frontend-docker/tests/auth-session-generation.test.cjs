const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { build } = require('esbuild');
const { createPinia, setActivePinia } = require('pinia');
let code;
test.before(async () => {
  code = (await build({ absWorkingDir: path.resolve(__dirname, '..'),
    stdin: { contents: "export { request, refreshAccessToken } from './src/services/api/index'; export { useUserStore } from './src/store/user'; export { getAccessToken } from './src/utils/tokenStore';", resolveDir: path.resolve(__dirname, '..'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, external: ['vue', 'pinia'],
    define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://test.local","VITE_API_SIGNATURE_ENABLED":"false","DEV":false}' },
  })).outputFiles[0].text;
});
function setup() {
  setActivePinia(createPinia()); const storage = new Map(); const requests = []; const routes = [];
  global.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), request: options => requests.push(options), showToast() {}, reLaunch: value => routes.push(value.url) };
  const instance = new Module(__filename, module); instance.filename = __filename; instance.paths = module.paths; instance._compile(code, __filename);
  const api = instance.exports; const user = api.useUserStore(); user.setAuth({ email: 'alice@example.test', access_token: 'alice-simulation' });
  return { ...api, user, requests, routes };
}
async function getRequest(f, ending) {
  for (let i = 0; i < 30; i++) { const match = f.requests.find(request => request.url.endsWith(ending)); if (match) return match; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail(`missing boundary request ${ending}`);
}

test('a late refresh success cannot sign the user back in after logout', async () => {
  const f = setup(); const refresh = f.refreshAccessToken(); const checked = assert.rejects(refresh);
  const response = await getRequest(f, '/refresh'); const logout = f.user.logout();
  response.success({ statusCode: 200, data: { access_token: 'late-simulation' } }); await checked;
  (await getRequest(f, '/logout')).success({ statusCode: 200, data: { success: true } }); await logout;
  assert.equal(f.user.isLoggedIn, false); assert.equal(f.getAccessToken(), null);
});

for (const success of [true, false]) test(`old refresh ${success ? 'success' : 'failure'} cannot replace or clear a newly signed-in account`, async () => {
  const f = setup(); const refresh = f.refreshAccessToken(); const checked = assert.rejects(refresh);
  const response = await getRequest(f, '/refresh'); const logout = f.user.logout();
  f.user.setAuth({ email: 'bob@example.test', access_token: 'bob-simulation' });
  response.success({ statusCode: success ? 200 : 401, data: success ? { access_token: 'late-simulation' } : {} }); await checked;
  (await getRequest(f, '/logout')).success({ statusCode: 200, data: { success: true } }); await logout;
  assert.equal(f.user.email, 'bob@example.test'); assert.equal(f.user.isLoggedIn, true); assert.equal(f.getAccessToken(), 'bob-simulation');
});

for (const success of [true, false]) test(`a protected request cannot clear the new login after its old refresh ${success ? 'succeeds' : 'fails'}`, async () => {
  const f = setup(); const pending = f.request('/api/protected', { needAuth: true }); const checked = assert.rejects(pending);
  (await getRequest(f, '/protected')).success({ statusCode: 401, data: {} });
  const response = await getRequest(f, '/refresh');
  f.user.setAuth({ email: 'bob@example.test', access_token: 'bob-simulation' });
  response.success({ statusCode: success ? 200 : 401, data: success ? { access_token: 'late-simulation' } : {} }); await checked;
  assert.equal(f.getAccessToken(), 'bob-simulation'); assert.equal(f.user.isLoggedIn, true); assert.deepEqual(f.routes, []);
});

test('a repeated 401 invalidates reactive login state as well as tokens', async () => {
  const f = setup(); assert.equal(f.user.isLoggedIn, true);
  const pending = f.request('/api/protected', { needAuth: true }); const checked = assert.rejects(pending);
  (await getRequest(f, '/protected')).success({ statusCode: 401, data: {} });
  (await getRequest(f, '/refresh')).success({ statusCode: 200, data: { access_token: 'refreshed-simulation' } });
  for (let i = 0; i < 30 && f.requests.filter(request => request.url.endsWith('/protected')).length < 2; i++) await new Promise(resolve => setImmediate(resolve));
  f.requests.filter(request => request.url.endsWith('/protected'))[1].success({ statusCode: 401, data: {} });
  await checked; assert.equal(f.getAccessToken(), null); assert.equal(f.user.isLoggedIn, false); assert.equal(f.user._hasAccessToken, false);
});
