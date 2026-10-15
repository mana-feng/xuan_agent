/** Qimen calculation uses fixed UTC+08:00, including dates during Shanghai DST. */
export function formatQimenHistoryTime(value: string): string {
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) return '';
	const beijing = new Date(timestamp + 8 * 60 * 60 * 1000);
	if (!Number.isFinite(beijing.getTime())) return '';
	return `北京时间：${beijing.toISOString().slice(0, 16).replace('T', ' ')}`;
}
