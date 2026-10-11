/** Each chart owns the exact birth profile used for its calculation. */
export interface ChartInput {
	realname: string | null;
	gender: number; // 0: male, 1: female
	timestamp: number | null;
	recordId: number | null;
}

export interface ChartPullData {
	realname?: string | null;
	gender: number;
	timestamp: number;
	recordId?: number | null;
}

export function emptyChartInput(): ChartInput {
	return { realname: null, gender: 0, timestamp: null, recordId: null };
}

export function snapshotChartInput(data: ChartPullData): ChartInput & { timestamp: number } {
	const timestamp = Number(data.timestamp);
	if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
		throw new Error('出生时间无效');
	}
	return {
		realname: data.realname ?? null,
		gender: Number(data.gender) === 1 ? 1 : 0,
		timestamp,
		recordId: data.recordId ?? null,
	};
}

export function chartCalculationKey(input: ChartInput): string {
	return input.timestamp === null ? '' : `${input.timestamp}:${input.gender}`;
}

export function readChartInput(key: string): ChartInput | null {
	try {
		const raw = uni.getStorageSync(key);
		if (!raw) return null;
		const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
		if (data?.timestamp === null || data?.timestamp === undefined) return null;
		return snapshotChartInput(data);
	} catch {
		return null;
	}
}

export function persistChartInput(key: string, input: ChartInput): void {
	if (input.timestamp === null) return;
	try {
		uni.setStorageSync(key, JSON.stringify(input));
	} catch {
		// The chart remains usable when persistent storage is unavailable.
	}
}
