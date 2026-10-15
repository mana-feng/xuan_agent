const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { resetPlatform, loadPage } = require('./helpers/load-ai-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { saveAiConfig } = require('../src/config/aiConfig.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { useZiweiStore } = require('../src/store/ziwei.ts');
const { useAgentPage } = require('../src/features/agent/useAgentPage.ts');
const { extractAgentAction, extractChartPayloadFromText } = require('../src/features/agent/runtime.ts');
let platform; const originalFetch = global.fetch;
const baziInput = { timeZone: 'Asia/Shanghai', realname: '八字盘主甲', timestamp: new Date(1998, 7, 12, 9).getTime(), gender: 0, recordId: 11 };
const ziweiInput = { realname: '紫微盘主乙', timestamp: new Date(1996, 2, 21, 18, 30).getTime(), gender: 1, recordId: 22 };
beforeEach(() => { platform = resetPlatform(); setActivePinia(createPinia()); });
afterEach(() => { global.fetch = originalFetch; });
function configured() { saveAiConfig({ provider: 'custom', apiUrl: 'http://127.0.0.1:11439/v1/chat/completions', apiKey: '', model: 'fixture' }); }
function chat(from = 'bazi') {
  const page = loadPage('pages/chat/index.nvue', ['buildMessages', 'panelRef', 'sendToLLM']);
  platform.hooks.load.at(-1)({ from });
  return page;
}
function panel(history) {
  return { getMessages: () => history, setSending() {}, createWaitingMessage() { history.push({ role: 'assistant', status: 'waiting', text: '' }); },
    appendAssistant() {}, appendThinking() {}, finishStreaming() {} };
}
test('chat sends current input once after appending its waiting bubble', () => {
  const page = chat();
  page.panelRef.value = panel([{ id: 'm-1', role: 'assistant', status: 'ready', text: '欢迎' }, { role: 'user', status: 'ready', text: '你好' }, { role: 'assistant', status: 'waiting', text: '' }]);
  assert.deepEqual(page.buildMessages('你好'), [{ role: 'user', content: '你好' }]);
});
test('chat carries previous successful turns and excludes failed/in-progress replies', () => {
  const page = chat();
  page.panelRef.value = panel([{ role: 'user', text: '一问', status: 'ready' }, { role: 'assistant', text: '一答', status: 'ready' }, { role: 'assistant', text: '调用失败', status: 'error' }, { role: 'assistant', text: '半截', status: 'stream' }, { role: 'user', text: '二问', status: 'ready' }]);
  assert.deepEqual(page.buildMessages('二问'), [{ role: 'user', content: '一问' }, { role: 'assistant', content: '一答' }, { role: 'user', content: '二问' }]);
});
for (const [from, input, other, store] of [['bazi', baziInput, ziweiInput, useBaziStore], ['ziwei', ziweiInput, baziInput, useZiweiStore]]) {
  test(`${from} direct cold chat restores only its own chart and includes context on every turn`, () => {
    platform.storage.set('bazi_last_context', JSON.stringify(baziInput)); platform.storage.set('ziwei_last_context', JSON.stringify(ziweiInput));
    const page = chat(from);
    for (const question of ['盘主是谁', '接着说']) {
      const request = page.buildMessages(question);
      assert.equal(request[0].role, 'system'); assert.ok(request[0].content.includes(input.realname)); assert.ok(!request[0].content.includes(other.realname));
    }
    assert.equal(store().input.recordId, input.recordId);
  });
}
test('chat unload cancels the active request without publishing a late reply', async () => {
  configured(); const page = chat(); let requestSignal; let callbacks = 0;
  page.panelRef.value = { ...panel([{ role: 'user', text: '你好', status: 'ready' }]), appendAssistant() { callbacks++; } };
  global.fetch = (_, init) => { requestSignal = init.signal; return new Promise((resolve, reject) => { const timer = setTimeout(() => resolve(Response.json({ choices: [{ message: { content: 'late' } }] })), 150); init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }); }); };
  const pending = page.sendToLLM('你好');
  for (const callback of platform.hooks.unload) callback();
  assert.equal(requestSignal.aborted, true);
  await pending; assert.equal(callbacks, 0);
});
test('chat ignores duplicate submission while an earlier request is pending', async () => {
  configured(); const page = chat(); page.panelRef.value = panel([{ role: 'user', text: '你好', status: 'ready' }]);
  let requests = 0; const finishes = [];
  global.fetch = () => { requests++; return new Promise(resolve => finishes.push(() => resolve(Response.json({ choices: [{ message: { content: '答复' } }] })))); };
  const first = page.sendToLLM('你好'); const second = page.sendToLLM('你好');
  const count = requests; finishes.forEach(fn => fn()); await Promise.all([first, second]);
  assert.equal(count, 1);
});
test('Agent respects an explicit no-action response even if chart input is complete', () => {
  assert.deepEqual(extractAgentAction('先确认日期<!--AGENT_ACTION:{"type":"none"}-->', '男，1998-08-12 09:00，排八字').action, { type: 'none' });
});
test('Agent does not execute inferred actions after a malformed explicit action', () => {
  assert.deepEqual(extractAgentAction('<!--AGENT_ACTION:{invalid}-->', '男，1998-08-12 09:00，排八字').action, { type: 'none' });
  assert.deepEqual(extractAgentAction('<!--AGENT_ACTION:{"type":', '男，1998-08-12 09:00，排八字').action, { type: 'none' });
});
test('Agent navigation accepts only supported targets, excluding inherited object keys', () => {
  assert.deepEqual(extractAgentAction('<!--AGENT_ACTION:{"type":"navigate","target":"constructor"}-->', '你好').action, { type: 'none' });
});
const explicitOpenCases = [
  ['ziwei', '紫微', '请打开紫微排盘输入页，只需简短说明，不要立即排盘。', 'bazi', 'run_ziwei_chart'],
  ['bazi', '八字', '请带我去八字排盘输入页面，先不要排盘。', 'liuyao', 'run_bazi_chart'],
  ['liuyao', '六爻', '进入六爻输入页，我要自己填写。', 'ziwei', 'run_liuyao_chart'],
];
for (const [target, name, input, wrongTarget, executable] of explicitOpenCases) {
  test(`explicit ${target} input-page request rejects navigation to a different tool`, () => {
    const result = extractAgentAction(`推荐工具：错误工具。<!--AGENT_ACTION:${JSON.stringify({ type: 'navigate', target: wrongTarget, label: '错误入口' })}-->`, input);
    assert.equal(result.action.type, 'navigate'); assert.equal(result.action.target, target);
    assert.match(result.action.label, new RegExp(name)); assert.match(result.cleanText, /不一致|冲突/);
    assert.ok(!result.cleanText.includes('推荐工具：错误工具'));
  });
  test(`explicit ${target} input-page request cannot immediately execute a chart`, () => {
    const payload = executable === 'run_liuyao_chart' ? { title: '工作' } : { gender: 1, date: '1998-08-12', time: '09:00' };
    const result = extractAgentAction(`立即执行<!--AGENT_ACTION:${JSON.stringify({ type: executable, payload })}-->`, input);
    assert.equal(result.action.type, 'navigate'); assert.equal(result.action.target, target);
    assert.match(result.cleanText, /不一致|冲突/);
  });
}
test('explicit correct page navigation keeps the answer and uses a label matching the destination', () => {
  const result = extractAgentAction('请填写出生信息。<!--AGENT_ACTION:{"type":"navigate","target":"ziwei","label":"打开八字"}-->', '请打开紫微输入页');
  assert.equal(result.cleanText, '请填写出生信息。'); assert.match(result.action.label, /紫微/);
});
test('ambiguous tool selection keeps model recommendation behavior', () => {
  const reply = '推荐八字。<!--AGENT_ACTION:{"type":"navigate","target":"bazi","label":"打开八字"}-->';
  for (const input of ['帮我选盘，我应该打开紫微还是八字输入页？', '我想看命盘，请推荐适合的工具并打开对应页面。', '如果适合紫微，再打开紫微输入页；否则推荐其他工具。']) {
    assert.equal(extractAgentAction(reply, input).action.target, 'bazi', input);
    assert.equal(extractAgentAction(reply, input).cleanText, '推荐八字。', input);
  }
});
test('a negated page-opening request does not become an enforced target', () => {
  const result = extractAgentAction('无需操作<!--AGENT_ACTION:{"type":"none"}-->', '不要打开八字输入页。');
  assert.equal(result.action.type, 'none');
});
test('page-target validation still calls the model and offers the right manual route after a conflicting response', async () => {
  configured(); const bazi = useBaziStore(); const ziwei = useZiweiStore(); bazi.pull(baziInput);
  const agent = useAgentPage(); agent.initializePage(); let requests = 0; let request;
  global.fetch = async (_, init) => { requests++; request = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: '推荐工具：打开八字排盘页面。<!--AGENT_ACTION:{"type":"navigate","target":"bazi","label":"打开八字排盘"}-->' } }] }); };
  const input = '请打开紫微排盘输入页，只需简短说明，不要立即排盘。';
  agent.handleQuickPrompt(input);
  while (agent.sending.value) await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1); assert.equal(request.messages.at(-1).content, input);
  assert.equal(agent.pendingAction.value.target, 'ziwei'); assert.match(agent.messages.value.at(-1).text, /不一致|冲突/);
  assert.deepEqual(platform.routes, []); assert.equal(ziwei.input.timestamp, null); assert.equal(bazi.input.realname, baziInput.realname);
  agent.applyPendingAction(); assert.deepEqual(platform.routes, ['/pages/ziwei/index']);
});
test('Agent does not infer Gregorian birth data from a lunar or ambiguous date', () => {
  assert.equal(extractChartPayloadFromText('男，农历1998-08-12 09:00，排八字'), null);
  assert.equal(extractChartPayloadFromText('男，1998-08-12，大概9点，排八字'), null);
});
test('Agent does not mistake an unrelated number for a missing birth time', () => {
  assert.equal(extractChartPayloadFromText('男，1998-08-12出生，排八字，我今年18岁'), null);
});
test('Agent does not convert a missing colon-minute value into a confirmed birth time', () => {
  assert.equal(extractChartPayloadFromText('男，1998-08-12 9:??，排八字'), null);
});
test('Agent correctly understands 12 AM and 12 PM in Chinese date input', () => {
  assert.equal(extractChartPayloadFromText('女，1998-08-12 上午12点，排八字').time, '00:00');
  assert.equal(extractChartPayloadFromText('女，1998-08-12 中午12点，排八字').time, '12:00');
});
test('Agent refreshes saved settings state when returning from settings', () => {
  const agent = useAgentPage(); agent.initializePage(); assert.equal(agent.accessLabel.value, '未配置 AI');
  configured(); agent.initializePage(); assert.equal(agent.accessLabel.value, '已配置 AI');
});
test('Agent excludes failed replies from later request history', async () => {
  configured(); const agent = useAgentPage(); agent.initializePage();
  agent.messages.value.push({ id: 'e', role: 'assistant', text: '调用失败', status: 'error', time: '12:00' });
  let payload;
  global.fetch = async (_, init) => { payload = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: '推荐工具：八字<!--AGENT_ACTION:{"type":"none"}-->' } }] }); };
  agent.handleQuickPrompt('你好');
  while (agent.sending.value) await new Promise(resolve => setImmediate(resolve));
  assert.ok(payload.messages.every(item => item.content !== '调用失败'));
});
for (const [type, useStore] of [['run_bazi_chart', useBaziStore], ['run_ziwei_chart', useZiweiStore]]) {
  test(`Agent ${type} preserves the submitted identity in the generated chart`, async () => {
    configured(); const targetStore = useStore(); const agent = useAgentPage(); agent.initializePage();
    const action = { type, payload: { realname: '独立盘主', gender: 1, date: '1998-08-12', time: '09:00' } };
    global.fetch = async () => Response.json({ choices: [{ message: { content: `执行排盘<!--AGENT_ACTION:${JSON.stringify(action)}-->` } }] });
    agent.handleQuickPrompt('请用我的资料排盘');
    while (agent.sending.value) await new Promise(resolve => setImmediate(resolve));
    assert.equal(targetStore.input.realname, '独立盘主', JSON.stringify(agent.messages.value)); assert.equal(targetStore.input.gender, 1); assert.equal(targetStore.input.recordId, null);
    assert.equal(platform.routes.length, 1);
  });
}
test('Agent unload aborts a pending request', async () => {
  configured(); const agent = useAgentPage(); agent.initializePage(); let requestSignal;
  global.fetch = (_, init) => { requestSignal = init.signal; return new Promise((resolve, reject) => { const timer = setTimeout(() => resolve(Response.json({ choices: [{ message: { content: 'late' } }] })), 150); init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }); }); };
  agent.handleQuickPrompt('你好');
  for (const callback of platform.hooks.unload) callback();
  const aborted = requestSignal.aborted;
  // The original implementation has no lifecycle cleanup; do not leave a 5-minute request timer behind in RED.
  if (!aborted) { platform.hooks.unload.length = 0; }
  assert.equal(aborted, true);
  while (agent.sending.value) await new Promise(resolve => setImmediate(resolve));
});
