const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/load-source.cjs');
const { buildGanZhiDiagram } = require('../src/libs/utils/bazi-enhanced.ts');

const diagram = list => buildGanZhiDiagram(list, list.map((_, i) => `柱${i + 1}`), { showKe: false });

test('repeating one branch cannot create half-combinations, while self-punishment stays visible', () => {
  for (const list of [['甲午', '丙午', '戊午'], ['甲辰', '丙辰'], ['乙酉', '丁酉'], ['乙亥', '丁亥']]) {
    const result = diagram(list);
    assert.deepEqual(result.zhiEdges.filter(edge => edge.type === 'banHe'), [], list.join(' '));
    assert.ok(result.zhiEdges.some(edge => edge.type === 'xing'), `keep self-punishment: ${list.join(' ')}`);
    assert.equal(result.nodes.length, list.length, 'same-character branches retain separate pillar identities');
  }
});

test('distinct half-combinations and coexisting relations remain on the same endpoint pair', () => {
  for (const [list, element] of [[['甲午', '壬戌'], '火'], [['乙巳', '辛酉'], '金']]) {
    const result = diagram(list);
    assert.ok(result.zhiEdges.some(edge => edge.type === 'banHe' && edge.label === `半合${element}`));
  }
  assert.deepEqual(diagram(['乙巳', '辛酉']).zhiEdges.map(edge => edge.type).sort(), ['anHe', 'banHe']);
  assert.deepEqual(diagram(['乙巳', '庚申']).zhiEdges.map(edge => edge.type).sort(), ['po', 'xing', 'zhiHe']);
});

test('each actual visible relation type has a short basic explanation independent of a sample chart', () => {
  const { getGanZhiRelationDescription: describe } = require('../src/libs/utils/ganzhi-relation-description.ts');
  const cases = [
    { list: ['甲子', '己丑'], kind: 'gan', type: 'ganHe', term: /五合/ },
    { list: ['甲子', '庚午'], kind: 'gan', type: 'ganChong', term: /相冲/ },
    { list: ['甲子', '己丑'], kind: 'zhi', type: 'zhiHe', term: /六合/ },
    { list: ['甲子', '庚午'], kind: 'zhi', type: 'chong', term: /相冲/ },
    { list: ['甲子', '乙卯'], kind: 'zhi', type: 'xing', term: /相刑/ },
    { list: ['甲寅', '丙午', '戊戌'], kind: 'zhi', type: 'sanHe', term: /三合/ },
    { list: ['甲午', '壬戌'], kind: 'zhi', type: 'banHe', term: /半合/ },
    { list: ['甲寅', '乙卯', '戊辰'], kind: 'zhi', type: 'sanHui', term: /三会/ },
    { list: ['乙酉', '戊戌'], kind: 'zhi', type: 'hai', term: /相害/ },
    { list: ['甲子', '乙酉'], kind: 'zhi', type: 'po', term: /相破/ },
    { list: ['甲午', '乙亥'], kind: 'zhi', type: 'anHe', term: /暗合.*藏.*天干/ },
  ];
  for (const item of cases) {
    const data = diagram(item.list);
    const edge = data[item.kind + 'Edges'].find(e => e.type === item.type);
    assert.ok(edge, `real detector emits ${item.type}`);
    const before = JSON.stringify(edge);
    const result = describe(edge, item.kind, { from: data.nodes[edge.from][item.kind], to: data.nodes[edge.to][item.kind] });
    assert.match(result, item.term);
    assert.ok(result.length > 5 && result.length < 100);
    assert.ok(result.split(/[。！？]/).filter(Boolean).length <= 2);
    assert.doesNotMatch(result, /原局|大运|流年|十神|旺衰|评分|偏财|正官|必然|吉凶|AI/);
    assert.equal(JSON.stringify(edge), before, 'description never rewrites a detected relation');
  }
});

test('self-punishment is explained by its actual repeated endpoints and never inferred from arbitrary repeats', () => {
  const { getGanZhiRelationDescription: describe } = require('../src/libs/utils/ganzhi-relation-description.ts');
  for (const branch of ['辰', '午', '酉', '亥']) {
    assert.match(describe({ type: 'xing', label: '刑' }, 'zhi', { from: branch, to: branch }), /自刑/);
  }
  assert.match(describe({ type: 'xing', label: '刑' }, 'zhi'), /相刑/);
  assert.doesNotMatch(describe({ type: 'xing', label: '刑' }, 'zhi', { from: '子', to: '子' }), /自刑/);
  assert.doesNotMatch(describe({ type: 'xing', label: '刑' }, 'zhi', { from: '子', to: '卯' }), /自刑/);
});

test('combination labels do not claim completed transformation and unsupported types are handled explicitly', () => {
  const { getGanZhiRelationDescription: describe } = require('../src/libs/utils/ganzhi-relation-description.ts');
  assert.match(describe({ type: 'ganHe', label: '合化水' }, 'gan'), /不等于.*合化|不.*已.*化/);
  assert.match(describe({ type: 'zhiHe', label: '合' }, 'zhi'), /不.*成化|不.*已.*化/);
  for (const kind of ['gan', 'zhi']) assert.match(describe({ type: 'future-type', label: '未支持' }, kind), /暂无/);
  assert.match(describe({ type: 'ganKe', label: '克' }, 'gan'), /相克/);
  assert.match(describe({ type: 'zhiKe', label: '克' }, 'zhi'), /相克/);
});

test('two real local birth charts supply all four to seven live nodes and safe explanations without user storage', async () => {
  const { resetPlatform } = require('./helpers/load-source.cjs');
  const { createPinia, setActivePinia } = require('pinia');
  const { useBaziStore } = require('../src/store/bazi.ts');
  const { useYunStore } = require('../src/store/yun.ts');
  const { civilToTimestamp } = require('../src/utils/chartTime.ts');
  const { getGanZhiRelationDescription: describe } = require('../src/libs/utils/ganzhi-relation-description.ts');
  const outcomes = [];
  for (const birth of ['1990-06-15 09:00', '1990-01-01 09:00']) {
    const platform = resetPlatform(); setActivePinia(createPinia());
    const bazi = useBaziStore(), yun = useYunStore();
    bazi.pull({ realname: '隔离测试', gender: 0, timestamp: civilToTimestamp(birth, 'Asia/Shanghai'), timeZone: 'Asia/Shanghai' });
    yun.markManualSelection();
    yun.current_index = yun.original.findIndex(d => d.getLiuNian().some(y => y.getYear() === 2026));
    assert.ok(yun.current_index >= 0);
    await yun.resolveLiuYear();
    yun.year_index = yun.year_list.findIndex(y => y.year === 2026);
    await yun.resolveLiuMonth();
    yun.month_index = 8; // Fixed observation selection: 寒露, never device today.
    const values = ['year', 'month', 'day', 'time'].map(key => bazi.sizhu[key]).concat(
      yun.dayun_list[yun.current_index].ganzhi, yun.year_list[yun.year_index].ganzhi, yun.month_list[yun.month_index].ganzhi);
    const labels = ['年柱', '月柱', '日柱', '时柱', '大运', '流年', '流月'];
    for (const count of [4, 5, 6, 7]) {
      const before = JSON.stringify({ input: bazi.input, sizhu: bazi.sizhu, values });
      const data = buildGanZhiDiagram(values.slice(0, count), labels.slice(0, count), { showKe: false });
      assert.deepEqual(data.nodes.map(n => n.key), values.slice(0, count));
      assert.deepEqual(data.nodes.map(n => n.label), labels.slice(0, count));
      for (const kind of ['gan', 'zhi']) for (const edge of data[kind + 'Edges']) {
        const from = data.nodes[edge.from][kind], to = data.nodes[edge.to][kind];
        assert.ok(edge.type !== 'ganKe' && edge.type !== 'zhiKe', 'retain actual UI filter');
        if (edge.type === 'banHe') assert.notEqual(from, to);
        assert.doesNotMatch(describe(edge, kind, { from, to }), /暂无/);
      }
      assert.equal(JSON.stringify({ input: bazi.input, sizhu: bazi.sizhu, values }), before);
    }
    outcomes.push(values);
    assert.equal(platform.requests.length, 0);
    assert.ok(platform.storage.has('bazi_last_context'), 'engine writes only the isolated Map');
  }
  assert.notDeepEqual(outcomes[0], outcomes[1], 'the second chart must actually change the live data');
});
