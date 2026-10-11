import { getPersistentItem, setPersistentItem } from './persistentStorage';

export type ChartType = 'bazi' | 'ziwei' | 'liuyao';
export const chartRecordKeys: Record<ChartType, string> = {
	bazi: 'local_chart_records', ziwei: 'local_ziwei_records', liuyao: 'local_liuyao_records',
};

export function readChartRecords(type: ChartType): any[] {
	const value = getPersistentItem<any[]>(chartRecordKeys[type], { permanent: true });
	if (value === null) return [];
	if (!Array.isArray(value)) throw new Error('本地记录格式无效，请先备份后检查');
	return value;
}

export function saveChartRecord(type: ChartType, entry: any) {
	const records = readChartRecords(type);
	const index = entry.id == null ? -1 : records.findIndex(record => record.id === entry.id);
	let id = entry.id;
	if (id == null) {
		id = Date.now();
		while (records.some(record => record.id === id)) id++;
	}
	const saved = { ...entry, type, id, createdAt: index >= 0 ? records[index].createdAt : entry.createdAt };
	if (index >= 0) records[index] = saved;
	else records.unshift(saved);
	// User-saved records remain until explicitly deleted; do not truncate old charts.
	setPersistentItem(chartRecordKeys[type], records, 0);
	return saved;
}

export function removeChartRecord(type: ChartType, id: number) {
	setPersistentItem(chartRecordKeys[type], readChartRecords(type).filter(record => record.id !== id), 0);
}
