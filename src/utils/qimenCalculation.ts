import * as engine from 'qimen-engine';
import { Solar } from 'lunar-javascript';
import { civilString, zonedParts } from './chartTime';

export const QIMEN_RULES = {
	id: 'qimen-chai-bu-v1', engine: 'qfdk/qimen',
	commit: '1d0d1c5b39755e67525a11e68bab9b73baae1937', patch: 'xuan-1',
	method: '时家转盘·符头拆补', clock: '北京时间 UTC+08:00',
	dayDivide: '23:00', solarTerms: 'exact', center: '中五寄坤二，天禽随芮',
} as const;

export function calculateQimen(input: { timestamp: number; timeZone: string }) {
	const entered = zonedParts(input.timestamp, input.timeZone);
	// Calendrical solar terms in lunar-javascript use Beijing UTC+8. Use a fixed
	// UTC+8 calendar clock (not historical Shanghai DST), explicitly shown in UI.
	const date = new Date(input.timestamp + 8 * 3600000);
	const parts = { year: date.getUTCFullYear(), month: date.getUTCMonth()+1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
	if (parts.year < 1900 || parts.year > 2099) throw new Error('奇门排盘支持 1900—2099 年');
	const result = engine.calculate(Solar.fromYmdHms(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second), { method: '时家' });
	if (!result || result.error) throw new Error(result?.message || '奇门排盘失败');
	for (const key of ['diPan', 'tianPan', 'jiuXing', 'baMen', 'baShen']) {
		for (const palace of [1,2,3,4,6,7,8,9]) if (!result[key]?.[palace]) throw new Error(`奇门盘数据不完整：${key}/${palace}`);
	}
	// Keep calculation data; the library's automatic fortune text is not used.
	const { analysis, jiuGongAnalysis, geju, ...chart } = result;
	return { ...chart, metadata: { ...QIMEN_RULES, inputZone: input.timeZone, inputCivil: civilString(entered), calculationCivil: civilString(parts), timestamp: input.timestamp } };
}
