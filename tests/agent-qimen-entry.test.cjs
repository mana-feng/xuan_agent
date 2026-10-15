const test = require('node:test');
const assert = require('node:assert/strict');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { useAgentPage } = require('../src/features/agent/useAgentPage.ts');
const { toolCards, quickPrompts } = require('../src/features/agent/config.ts');
const {
  detectNamedTarget,
  extractAgentAction,
  inferAction,
  isExecutableAction,
} = require('../src/features/agent/runtime.ts');

test('the homepage Qimen card opens the manual chart form without an Agent request', () => {
  const platform = resetPlatform();
  setActivePinia(createPinia());
  const page = useAgentPage();
  const card = page.toolCards.find(item => item.target === 'qimen');

  assert.ok(card, 'Qimen must be available alongside the other homepage tools');
  page.openTarget(card.target);

  assert.deepEqual(platform.routes, ['/pages/qimen/index']);
  assert.equal(platform.requests.length, 0);
});

test('Qimen card and quick prompts resolve to manual navigation', () => {
  const card = toolCards.find(item => item.target === 'qimen');
  const quickPrompt = quickPrompts.find(item => item.label === '打开奇门');
  assert.ok(card, 'the Qimen card provides an Agent prompt');
  assert.ok(quickPrompt, 'Qimen has a dedicated quick prompt');

  for (const prompt of [card.prompt, quickPrompt.prompt]) {
    const action = inferAction(prompt);
    assert.equal(action.type, 'navigate');
    assert.equal(action.target, 'qimen');
    assert.equal(isExecutableAction(action), false);
  }
});

test('Agent navigation directives accept Qimen and supply a readable default label', () => {
  const result = extractAgentAction(
    '请先确认起局信息。<!--AGENT_ACTION:{"type":"navigate","target":"qimen"}-->',
    '请打开对应页面',
  );

  assert.equal(result.action.type, 'navigate');
  assert.equal(result.action.target, 'qimen');
  assert.equal(result.action.label, '打开奇门起局');
  assert.equal(result.cleanText, '请先确认起局信息。');
});

test('Qimen names are recognized before generic palace and divination terms', () => {
  for (const text of ['奇门遁甲', '奇门九宫', 'QIMEN', '用奇门看宫位并起卦']) {
    assert.equal(detectNamedTarget(text), 'qimen', text);
  }
});

test('Qimen stays manual even with birth data and an existing Ziwei palace context', () => {
  const action = inferAction(
    '男，1998-08-12 09:00，请用奇门看事业宫。',
    '',
    { hasZiweiAstrolabe: true },
  );

  assert.equal(action.type, 'navigate');
  assert.equal(action.target, 'qimen');
  assert.equal(isExecutableAction(action), false);
});

test('an explicit none action preserves clarification instead of inferring an action', () => {
  const reply = '请先补充想了解的问题。<!--AGENT_ACTION:{"type":"none"}-->';
  for (const prompt of ['请打开奇门', '男，1998-08-12 09:00，请排八字', '我想看事业宫']) {
    const result = extractAgentAction(reply, prompt, { hasZiweiAstrolabe: true });
    assert.deepEqual(result.action, { type: 'none' }, prompt);
    assert.equal(result.cleanText, '请先补充想了解的问题。');
  }
});

test('the choose-a-tool prompt stays in clarification when no action is supplied', () => {
  const prompt = quickPrompts.find(item => item.label === '帮我选盘').prompt;
  const result = extractAgentAction('请先告诉我你的具体问题，再判断适合的工具。', prompt);
  assert.deepEqual(result.action, { type: 'none' });
});

test('multiple named tools do not trigger a fallback or a cached palace action', () => {
  for (const prompt of ['八字还是奇门？', '六爻和奇门怎么选？', '紫微还是奇门看事业宫？']) {
    const result = extractAgentAction('请先说说你的问题。', prompt, { hasZiweiAstrolabe: true });
    assert.deepEqual(result.action, { type: 'none' }, prompt);
  }
});

test('a single requested tool takes precedence over other tools mentioned in reply prose', () => {
  for (const [name, target] of [['八字', 'bazi'], ['六爻', 'liuyao'], ['紫微', 'ziwei'], ['奇门', 'qimen']]) {
    const result = extractAgentAction('八字、六爻、紫微和奇门适用于不同问题。', `请打开${name}`);
    assert.equal(result.action.type, 'navigate', name);
    assert.equal(result.action.target, target, name);
  }
});

test('a valid navigation directive still resolves a multiple-tool choice', () => {
  const prompt = quickPrompts.find(item => item.label === '帮我选盘').prompt;
  const result = extractAgentAction(
    '推荐紫微。<!--AGENT_ACTION:{"type":"navigate","target":"ziwei"}-->',
    prompt,
  );
  assert.equal(result.action.type, 'navigate');
  assert.equal(result.action.target, 'ziwei');
});
