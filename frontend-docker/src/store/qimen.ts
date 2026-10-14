import { defineStore } from 'pinia';
import { calculateQimen, QIMEN_RULES } from '@/utils/qimenCalculation';

export interface QimenInput {
  question: string;
  timestamp: number | null;
  timeZone: string;
  recordId: number | null;
  ruleVersion: string;
}
type QimenPull = Omit<QimenInput, 'ruleVersion' | 'recordId'> & Partial<Pick<QimenInput, 'ruleVersion' | 'recordId'>>;
const key = 'qimen_last_context';
const emptyInput = (): QimenInput => ({ question: '', timestamp: null, timeZone: 'Asia/Shanghai', recordId: null, ruleVersion: QIMEN_RULES.id });

export const useQimenStore = defineStore('qimen', {
  state: () => ({ input: emptyInput(), chart: null as ReturnType<typeof calculateQimen> | null, error: '' }),
  actions: {
    persistInput() {
      try { uni.setStorageSync(key, JSON.stringify(this.input)); } catch { /* In-memory chart remains usable. */ }
    },
    restoreInput() {
      if (this.input.timestamp !== null) return;
      try {
        const raw = uni.getStorageSync(key);
        if (!raw) return;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        this.pull(data);
      } catch (error: any) { this.error = error?.message || '无法恢复上次起局，请重新起局'; }
    },
    ensureComputed() {
      if (this.chart || this.input.timestamp === null) return;
      try { this.pull(this.input); } catch { /* pull exposes the actionable error. */ }
    },
    pull(data: QimenPull) {
      try {
        if (typeof data?.timestamp !== 'number' || !Number.isFinite(data.timestamp)) throw new Error('请选择有效的起局时间');
        if (data.ruleVersion && data.ruleVersion !== QIMEN_RULES.id) throw new Error('此记录的排盘规则版本不受支持，请重新起局');
        const input: QimenInput = {
          question: String(data.question || '').trim().slice(0, 100), timestamp: data.timestamp,
          timeZone: data.timeZone, ruleVersion: QIMEN_RULES.id,
          recordId: Number.isSafeInteger(data.recordId) && Number(data.recordId) > 0 ? Number(data.recordId) : null,
        };
        const chart = calculateQimen({ timestamp: data.timestamp, timeZone: input.timeZone });
        this.input = input; this.chart = chart; this.error = ''; this.persistInput();
      } catch (error: any) {
        this.chart = null; this.error = error?.message || '起局失败，请核对时间'; throw error;
      }
    },
  },
});
