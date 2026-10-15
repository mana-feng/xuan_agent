import { QIMEN_RULES } from './qimenCalculation';
import type { QimenInput } from '@/store/qimen';

export function buildQimenExportPayload(store: { input: QimenInput; chart: any }) {
  if (!store.chart || store.input.timestamp === null) throw new Error('请先完成奇门起局');
  // Copy the computed plate and its clock policy into every AI request.
  return JSON.parse(JSON.stringify({ module: 'qimen', version: 1, input: store.input, rules: QIMEN_RULES, chart: store.chart }));
}
