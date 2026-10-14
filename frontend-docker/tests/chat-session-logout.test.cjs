const test = require('node:test');
const assert = require('node:assert/strict');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useUserStore } = require('../src/store/user.ts');
const { getAccessToken } = require('../src/utils/tokenStore.ts');

test('logout immediately invalidates local account and token while remote revocation is pending', async () => {
  const platform = resetPlatform(); setActivePinia(createPinia());
  const user = useUserStore(); user.setAuth({ email: 'logout@example.test', access_token: 'simulation-token' });
  let complete; platform.respond = () => new Promise(resolve => complete = resolve);
  const pending = user.logout();
  try {
    assert.equal(user.isLoggedIn, false); assert.equal(user.email, null); assert.equal(Boolean(getAccessToken()), false);
    assert.equal(platform.storage.has('user_info'), false);
  } finally {
    await new Promise(resolve => setImmediate(resolve));
    complete?.({ success: true }); await pending;
  }
});
