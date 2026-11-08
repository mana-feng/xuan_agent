const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/load-source.cjs');
const { parseToolReply, TOOL_CATALOG } = require('../src/features/agent/toolProtocol.ts');
const { runToolLoop, MAX_TOOL_CALLS } = require('../src/features/agent/toolLoop.ts');
const { getStructuredChartContext } = require('../src/features/agent/chartContext.ts');

function action(type, payload) {
  return '<!--AGENT_ACTION:' + JSON.stringify({ type, payload }) + '-->';
}
const birth = { date: '1998-08-12', time: '09:00', gender: 0, timeZone: 'Asia/Shanghai' };

test('registry exposes only supported tools and validates birth chart action', () => {
  assert.equal(TOOL_CATALOG.length, 6);
  const parsed = parseToolReply('正在排盘\n' + action('run_bazi_chart', birth));
  assert.equal(parsed.kind, 'call');
  assert.equal(parsed.call.name, 'run_bazi_chart');
  assert.deepEqual(parsed.call.args, { ...birth, realname: '' });
});

test('no directive means no fallback inferred execution', () => {
  assert.deepEqual(parseToolReply('请打开八字页面'), { kind: 'final', text: '请打开八字页面' });
  assert.equal(parseToolReply('完成<!--AGENT_ACTION:{"type":"none"}-->').kind, 'final');
});

test('malformed, duplicate and out-of-policy tool directives are rejected', () => {
  for (const reply of [
    '<!--AGENT_ACTION:{invalid json}-->',
    action('delete_all_charts', {}),
    action('run_ziwei_chart', { ...birth, gender: 'unknown' }),
    action('run_bazi_chart', { ...birth, date: '2026-02-30' }),
    action('run_bazi_chart', { ...birth, timeZone: 'Mars/Olympus' }),
    action('focus_ziwei_palace', { palace: '不存在宫' }),
    action('navigate', { target: 'admin' }),
    action('get_chart_context', { target: 'secrets' }),
    action('get_chart_context', { target: 'all' }) + action('get_chart_context', { target: 'all' }),
  ]) {
    assert.equal(parseToolReply(reply).kind, 'invalid', reply);
  }
});

test('agent executes tool and feeds result back to the model for final reasoning', async () => {
  const requests = [];
  const executed = [];
  const replies = [
    action('run_bazi_chart', birth),
    '依据计算后的四柱结构解释结果。',
  ];
  const outcome = await runToolLoop({
    messages: [{ role: 'user', content: '帮我排八字并解读' }],
    askModel: async messages => {
      requests.push(messages);
      return replies.shift();
    },
    execute: async call => {
      executed.push(call.name);
      return { ok: true, name: call.name, data: { version: 1, charts: { bazi: { sizhu: ['甲', '乙', '丙', '丁'] } } } };
    },
  });
  assert.equal(outcome.finish, 'completed');
  assert.deepEqual(executed, ['run_bazi_chart']);
  assert.equal(requests.length, 2);
  assert.match(requests[1].at(-1).content, /tool_result/);
  assert.match(requests[1].at(-1).content, /甲/);
  assert.equal(outcome.trace.length, 1);
});

test('agent supports two different tools before completing', async () => {
  const replies = [
    action('get_chart_context', { target: 'bazi' }),
    action('get_chart_context', { target: 'ziwei' }),
    '已经完成了两个盘的比较。',
  ];
  const result = await runToolLoop({
    messages: [],
    askModel: async () => replies.shift(),
    execute: async call => ({ ok: true, name: call.name, data: { target: call.args.target } }),
  });
  assert.equal(result.finish, 'completed');
  assert.equal(result.trace.length, 2);
});

test('duplicate tool calls stop the loop without executing a second time', async () => {
  let times = 0;
  const result = await runToolLoop({
    messages: [],
    askModel: async () => action('get_chart_context', { target: 'bazi' }),
    execute: async call => { times++; return { ok: true, name: call.name }; },
  });
  assert.equal(times, 1);
  assert.equal(result.finish, 'limit');
  assert.match(result.text, /重复/);
});

test('tool loop is bounded even if model requests different tools forever', async () => {
  let count = 0;
  const result = await runToolLoop({
    messages: [],
    askModel: async () => action('get_chart_context', { target: ['bazi','ziwei','liuyao','qimen'][count++] }),
    execute: async call => ({ ok: true, name: call.name }),
  });
  assert.equal(result.trace.length, MAX_TOOL_CALLS);
  assert.equal(result.finish, 'limit');
});

test('tool errors can be explained by the model without changing the result into success', async () => {
  const messages = [];
  const replies = [action('get_chart_context', { target: 'all' }), '当前无盘面，请先提供信息。'];
  const result = await runToolLoop({
    messages: [],
    askModel: async context => { messages.push(context); return replies.shift(); },
    execute: async () => { throw new Error('No chart available'); },
  });
  assert.equal(result.finish, 'completed');
  assert.equal(result.trace[0].result.ok, false);
  assert.match(messages[1].at(-1).content, /No chart available/);
});

test('structured context includes chart identity, full four pillars and existing Ziwei palaces', () => {
  const stores = {
    bazi: {
      input: { timestamp: 1710000000000, timeZone: 'Asia/Shanghai', ruleVersion: 'bazi-civil-v1', recordId: 17 },
      sizhu: { year: '甲子', month: '乙丑', day: '丙寅', time: '丁卯' },
      tiangan: {}, dizhi: {}, canggan: {}, zhuxing: {}, wuxing: {},
      legacyNeedsTimeZone: false,
    },
    liuyao: null,
    ziwei: {
      input: { timestamp: 1710000000000, timeZone: 'Asia/Shanghai' },
      astrolabe: { soul: '命主', palaces: [{ index: 0, name: '命', majorStars: [{ name: '紫微', brightness: '旺' }] }] },
      viewMode: 'origin',
    },
    qimen: null,
  };
  const result = getStructuredChartContext(stores, 'all');
  assert.equal(result.truncated, false);
  assert.equal(result.charts.bazi.identity.recordId, 17);
  assert.equal(result.charts.bazi.chart.sizhu.day, '丙寅');
  assert.equal(result.charts.ziwei.chart.palaces[0].majorStars[0].name, '紫微');
  assert.equal(getStructuredChartContext(stores, 'qimen').charts.qimen, undefined);
});
