import type { ToolCall } from './toolProtocol';
import { buildLiuyaoExportPayload } from '@/utils/liuyaoExport';

type ChartStores = {
  bazi: any;
  liuyao: any;
  ziwei: any;
  qimen: any;
};

const MAX_RESULT_CHARS = 16000;

function safeJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === 'function' || typeof item === 'symbol') return undefined;
    return item;
  }));
}
function chartIdentity(input: any) {
  return {
    recordId: input?.recordId ?? null,
    timestamp: input?.timestamp ?? null,
    timeZone: input?.timeZone ?? null,
    ruleVersion: input?.ruleVersion ?? input?.calculation?.ruleVersion ?? null,
    calculation: input?.calculation ? {
      civil: input.calculation.civil ?? null,
      timeZone: input.calculation.timeZone ?? null,
      ruleVersion: input.calculation.ruleVersion ?? null,
      rules: input.calculation.rules ?? null,
    } : null,
  };
}
function getBazi(store: any) {
  if (!store?.sizhu?.year || store?.input?.timestamp == null || store?.legacyNeedsTimeZone) return null;
  return {
    module: 'bazi', version: 1, identity: chartIdentity(store.input),
    chart: {
      sizhu: store.sizhu,
      tiangan: store.tiangan,
      dizhi: store.dizhi,
      canggan: store.canggan,
      zhuxing: store.zhuxing,
      wuxing: store.wuxing,
      yinli: store.yinli,
      yangli: store.yangli,
    },
  };
}
function getLiuyao(store: any) {
  if (!store?.compiled || !store?.display || !store?.profile || store?.legacyNeedsTimeZone) return null;
  const chart = store.compiled;
  return {
    module: 'liuyao', version: 1,
    identity: {
      recordId: store.recordId ?? null,
      timestamp: store.castingAt ?? null,
      timeZone: store.calculation?.timeZone ?? null,
      ruleVersion: store.calculation?.ruleVersion ?? null,
      rules: store.calculation?.rules ?? null,
    },
    question: store.profile.title,
    method: store.profile.method,
    readableDetails: buildLiuyaoExportPayload(store),
    chart: {
      dayGanZhi: store.profile.dayGanZhi,
      params: chart.params,
      lunar: { gz: chart.lunar?.gz, xkong: chart.lunar?.xkong },
      main: chart.ben ?? chart.main ?? chart.gua ?? null,
      changed: chart.bian ?? null,
    },
  };
}
function getZiwei(store: any) {
  if (!store?.astrolabe || store?.input?.timestamp == null) return null;
  const chart = store.astrolabe;
  const palaces = Array.isArray(chart.palaces) ? chart.palaces : [];
  return {
    module: 'ziwei', version: 1, identity: chartIdentity(store.input),
    calculation: store.calculation,
    chart: {
      soul: chart.soul,
      body: chart.body,
      fiveElementsClass: chart.fiveElementsClass,
      lunarDate: chart.lunarDate,
      solarDate: chart.solarDate,
      palaces: palaces.map((p: any) => ({
        index: p.index, name: p.name, heavenlyStem: p.heavenlyStem,
        earthlyBranch: p.earthlyBranch, isBodyPalace: p.isBodyPalace,
        majorStars: (p.majorStars || []).map((s: any) => ({ name: s.name, brightness: s.brightness, mutagen: s.mutagen })),
        minorStars: (p.minorStars || []).map((s: any) => ({ name: s.name, brightness: s.brightness, mutagen: s.mutagen })),
      })),
    },
    focusPalaceIndex: store.focusPalaceIndex ?? null,
    viewMode: store.viewMode,
  };
}
function getQimen(store: any) {
  if (!store?.chart || store?.input?.timestamp == null) return null;
  const chart = store.chart;
  return {
    module: 'qimen', version: 1,
    identity: chartIdentity(store.input),
    question: store.input.question,
    metadata: chart.metadata,
    chart: Object.fromEntries(
      ['basicInfo', 'siZhu', 'juShu', 'xunShou', 'diPan', 'tianPan', 'jiuXing', 'baMen', 'baShen', 'anGan', 'zhiFuGong', 'zhiFuXing', 'zhiShiGong', 'zhiShiMen', 'kongWangGong', 'maStar']
        .filter(key => chart[key] !== undefined).map(key => [key, chart[key]])
    ),
  };
}

export function getStructuredChartContext(stores: ChartStores, target: 'all' | 'bazi' | 'liuyao' | 'ziwei' | 'qimen' = 'all') {
  const snapshots: Record<string, unknown> = {
    bazi: getBazi(stores.bazi),
    liuyao: getLiuyao(stores.liuyao),
    ziwei: getZiwei(stores.ziwei),
    qimen: getQimen(stores.qimen),
  };
  const selected = target === 'all' ? snapshots : { [target]: snapshots[target] };
  const available = Object.fromEntries(Object.entries(selected).filter(([, snapshot]) => snapshot !== null));
  const serialized = JSON.stringify(safeJson(available));
  if (serialized.length > MAX_RESULT_CHARS) {
    return {
      version: 1, truncated: true, availableModules: Object.keys(available),
      message: '结构化盘面超过上下文限制。请缩小目标到某一类排盘。',
    };
  }
  return { version: 1, truncated: false, charts: JSON.parse(serialized) };
}

export function resultForTool(call: ToolCall, stores: ChartStores) {
  const target = call.name === 'get_chart_context' ? call.args.target : 'all';
  return getStructuredChartContext(stores, target);
}
