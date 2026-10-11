const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-ai-source.cjs');
const { getAiConfig, saveAiConfig, hasAiConfig } = require('../src/config/aiConfig.ts');
let platform;
beforeEach(() => { platform = resetPlatform(); });
const local = { provider: 'custom', apiUrl: 'http://127.0.0.1:11439/v1/chat/completions', apiKey: '', model: 'qwen3.8:latest' };
test('corrupt or structurally invalid stored settings are not treated as configured', () => {
  for (const raw of ['{', '{}', '[]', 'null', JSON.stringify({ ...local, provider: 'unknown' }), JSON.stringify({ ...local, model: ' ' }), JSON.stringify({ ...local, apiUrl: 'javascript:alert(1)' })]) {
    platform.storage.set('xuanxue_ai_config', raw);
    assert.equal(hasAiConfig(), false, raw); assert.equal(getAiConfig(), null, raw);
  }
});
test('settings save trims values and persists a local endpoint without a key', () => {
  const page = loadPage('pages/settings/index.vue', ['config', 'saveConfig', 'statusType']);
  page.config.value = { ...local, apiUrl: ` ${local.apiUrl} `, model: ' qwen3.8:latest ' };
  page.saveConfig(); assert.equal(page.statusType.value, 'success'); assert.deepEqual(getAiConfig(), local);
});
test('invalid save cannot overwrite a valid configuration', () => {
  saveAiConfig(local);
  assert.throws(() => saveAiConfig({ ...local, apiUrl: 'ftp://example.test' }), /地址|HTTP/);
  assert.deepEqual(getAiConfig(), local);
});
test('changing provider clears a key intended for the previous provider', () => {
  const page = loadPage('pages/settings/index.vue', ['config', 'onProviderChange']);
  page.config.value = { ...local, provider: 'openai', apiKey: 'old-provider-key' };
  page.onProviderChange({ detail: { value: 1 } }); assert.equal(page.config.value.apiKey, '');
});
test('settings storage failure is displayed without claiming a successful save', () => {
  const page = loadPage('pages/settings/index.vue', ['config', 'saveConfig', 'statusType', 'statusMsg']);
  page.config.value = { ...local, apiKey: 'fixture-key' };
  global.uni.setStorageSync = () => { throw new Error('storage quota exceeded'); };
  assert.doesNotThrow(() => page.saveConfig()); assert.equal(page.statusType.value, 'error'); assert.match(page.statusMsg.value, /保存|存储/);
});
