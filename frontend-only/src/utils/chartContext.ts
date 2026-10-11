export interface ChartInput {
	realname: string;
	gender: number;
	timestamp: number | null;
	recordId: number | null;
}

// Older local records stored milliseconds as text; Date(text) does not parse them.
export function chartTimestamp(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const timestamp = typeof value === 'number' ? value
		: typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value)
		: typeof value === 'string' ? new Date(value).getTime() : NaN;
	return Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null;
}

export function normalizeChartInput(data: Partial<ChartInput> = {}): ChartInput {
	return {
		realname: String(data.realname ?? ''),
		gender: Number(data.gender) === 1 ? 1 : 0,
		timestamp: chartTimestamp(data.timestamp),
		recordId: data.recordId == null ? null : Number(data.recordId),
	};
}

export function readChartContext(type: 'bazi' | 'ziwei'): ChartInput | null {
	try {
		const value = uni.getStorageSync(`${type}_last_context`);
		if (!value) return null;
		const input = normalizeChartInput(typeof value === 'string' ? JSON.parse(value) : value);
		return input.timestamp === null ? null : input;
	} catch { return null; }
}

export function writeChartContext(type: 'bazi' | 'ziwei', input: ChartInput) {
	try { uni.setStorageSync(`${type}_last_context`, JSON.stringify(input)); }
	catch (error) { console.warn('排盘恢复缓存写入失败', error); }
}
