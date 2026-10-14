const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('../../frontend-docker/node_modules/typescript');
const vue = require('../../frontend-docker/node_modules/vue');

// Exercise the real admin page script. Only the API/platform boundary and mount
// hook are replaced, so the submitted update is observable without a browser.
function loadEditor() {
  const filename = path.resolve(__dirname, '../admin-ui/src/pages/admin/records.nvue');
  const source = fs.readFileSync(filename, 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const compiled = ts.transpileModule(`${source}\nexport { handleEditRecord, handleCreateRecord, handleSubmitRecord, recordForm, recordFormError, chartTypeFilter };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: filename + '.ts',
  }).outputText;
  const calls = [];
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'uni', compiled)(name => {
    if (name === 'vue') return { ...vue, onMounted() {} };
    if (name === '@/store/user') return { useUserStore: () => ({ isAdmin: true }) };
    if (name === '@/services/api/admin') return {
      updateChartRecord: async (id, data) => { calls.push({ method: 'PUT', id, data }); return { success: true }; },
      createChartRecord: async data => { calls.push({ method: 'POST', data }); return { success: true }; },
      getChartRecordList: async () => ({ success: true, data: { list: [], totalPages: 0 } }),
    };
    throw new Error(`Unexpected page dependency: ${name}`);
  }, module, module.exports, { showToast() {} });
  return { ...module.exports, calls };
}

const record = {
  id: 7, chartType: 'qimen', userId: 41, userEmail: 'fixture@example.test', name: '原问题',
  gender: null, birthDatetime: '2026-10-13T04:30:00.000Z', calendarType: 'solar', createdAt: '2026-10-13T05:00:00.000Z',
};

test('admin qimen title edit retains null gender and never clears its saved input or snapshot', async () => {
  const page = loadEditor();
  page.handleEditRecord(record);
  assert.equal(page.recordForm.value.gender, null);
  page.recordForm.value.name = '管理端备注标题';
  await page.handleSubmitRecord();
  assert.equal(page.calls.length, 1);
  assert.deepEqual(page.calls[0], { method: 'PUT', id: 7, data: { type: 'qimen', userId: 41, name: '管理端备注标题' } });
});

test('admin qimen owner edit cannot change chart type, calculation time, calendar, gender or payload', async () => {
  const page = loadEditor();
  page.handleEditRecord(record);
  Object.assign(page.recordForm.value, { userId: 42, type: 'bazi', gender: '0', birthDatetime: '2030-01-01', calendarType: 'lunar' });
  await page.handleSubmitRecord();
  assert.deepEqual(page.calls[0], { method: 'PUT', id: 7, data: { type: 'qimen', userId: 42, name: '原问题' } });
});

test('admin qimen creation directs users to the real calculator without creating an unrecoverable record', async () => {
  const page = loadEditor();
  page.chartTypeFilter.value = 'qimen';
  page.handleCreateRecord();
  Object.assign(page.recordForm.value, { userId: 41, name: '待计算', birthDatetime: record.birthDatetime });
  await page.handleSubmitRecord();
  assert.equal(page.calls.length, 0);
  assert.match(page.recordFormError.value, /奇门.*起局/);
});

test('admin birth-chart input changes still invalidate stale calculation payloads', async () => {
  const page = loadEditor();
  page.handleEditRecord({ ...record, chartType: 'bazi', gender: '0' });
  page.recordForm.value.birthDatetime = '2000-01-01T00:00:00.000Z';
  await page.handleSubmitRecord();
  assert.equal(page.calls[0].data.rawPayload, null);
  assert.equal(page.calls[0].data.birthDatetime, '2000-01-01T00:00:00.000Z');
});
