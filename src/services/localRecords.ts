import { chartRecordKeys, readChartRecords, removeChartRecord, saveChartRecord, type ChartType } from '@/utils/localChartRecords';
import { chartTimestamp } from '@/utils/chartContext';

type Options = { method?: string; data?: Record<string, any> };
const fail = (message: string, code?: string) => Object.assign(new Error(message), { code });

/** Local record operations used by the shared result/history views. Never sends HTTP. */
export async function request(path: string, options: Options = {}): Promise<any> {
  const url = new URL(path, 'https://local.invalid');
  const match = /^\/records\/(bazi|ziwei|liuyao|qimen|charts)(?:\/(\d+))?$/.exec(url.pathname);
  if (!match) throw fail('不支持的本地记录操作');
  const type = (match[1] === 'charts' ? url.searchParams.get('type') : match[1]) as ChartType;
  if (!Object.prototype.hasOwnProperty.call(chartRecordKeys, type)) throw fail('未知排盘类型');
  const method = options.method || 'GET';
  const id = match[2] ? Number(match[2]) : null;
  const records = readChartRecords(type);
  if (method === 'GET') {
    const keyword = (url.searchParams.get('keyword') || '').toLocaleLowerCase();
    const gender = url.searchParams.get('gender');
    const list = records.filter(record => (!keyword || String(record.title || '').toLocaleLowerCase().includes(keyword)) &&
      (gender === null || gender === '' || String(record.gender) === gender));
    return { success: true, data: { list, total: list.length } };
  }
  if (id !== null && !records.some(record => Number(record.id) === id)) throw fail('该本地记录已不存在，请重新保存', 'NOT_FOUND');
  if (method === 'DELETE' && id !== null) {
    removeChartRecord(type, id);
    uni.$emit?.('localRecordsChanged');
    return { success: true, data: { id } };
  }
  if (method !== 'POST' && method !== 'PUT') throw fail('不支持的本地记录操作');
  const data = options.data || {};
  const previous = id === null ? undefined : records.find(record => Number(record.id) === id);
  const timestamp = chartTimestamp(data.birthDatetime);
  if (timestamp === null) throw fail('排盘时间无效，无法保存');
  const entry = saveChartRecord(type, {
    ...previous, id,
    title: String(data.name || '').trim() || '未命名',
    gender: data.gender ?? previous?.gender ?? null,
    birthDatetime: new Date(timestamp).toISOString(),
    createdAt: previous?.createdAt || new Date().toISOString(),
    rawPayload: data.rawPayload ?? previous?.rawPayload,
  });
  uni.$emit?.('localRecordsChanged');
  return { success: true, data: { id: entry.id, updated: id !== null } };
}
