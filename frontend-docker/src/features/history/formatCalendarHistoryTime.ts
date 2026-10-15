import { legacyCalendar } from '@/utils/calendarContext';
import type { ChartItem } from './savedCharts';

/** Saved chart clocks must not change when the viewing device changes zone. */
export function formatCalendarHistoryTime(item: ChartItem): string | null {
	if (item.type && item.type !== 'bazi' && item.type !== 'liuyao') return null;
	try {
		const timestamp = new Date(item.birthDatetime).getTime();
		if (!Number.isFinite(timestamp)) return '排盘时间待核对';
		const context = legacyCalendar(timestamp, item.type === 'liuyao' ? 'liuyao' : 'bazi', item.rawPayload);
		if (context) return `${context.civil.slice(0, 16)} · ${context.timeZone}`;
		const recorded = item.rawPayload?.profile?.timeLabel;
		return recorded ? `${recorded} · 原时区待确认` : `原时区待确认 · UTC ${new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')}`;
	} catch {
		return '排盘口径待核对';
	}
}
