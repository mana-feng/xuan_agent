import { Solar } from 'lunar-javascript';
import {
	civilString,
	civilToTimestamp,
	parseCivil,
	zonedParts,
	type Disambiguation,
} from './chartTime';

export interface CalendarRules {
	dayDivide: 'midnight' | 'zi';
	yearDivide: 'lichun' | 'lunar'; // Only the year number for time casting; pillars always use solar terms.
	leapMonth: 'add-twelve' | 'same-month'; // Only time casting, not Bazi solar-term months.
}
export const DEFAULT_CALENDAR_RULES: CalendarRules = {
	dayDivide: 'midnight',
	yearDivide: 'lichun',
	leapMonth: 'add-twelve',
};
export interface CalendarContext {
	version: 1;
	module: 'bazi' | 'liuyao';
	engine: 'lunar-javascript@1.7.7';
	ruleVersion: string;
	timestamp: number;
	timeZone: string;
	civil: string;
	utcOffsetMinutes: number;
	rules: CalendarRules;
	source: 'new' | 'legacy-profile' | 'legacy-confirmed';
	replayMode?: 'snapshot';
	timePrecision?: 'minute';
}
export interface CalendarOptions {
	timeZone?: string;
	rules?: CalendarRules;
	calculation?: CalendarContext;
}
export function calendarRules(value: Partial<CalendarRules> = {}): CalendarRules {
	const rules = { ...DEFAULT_CALENDAR_RULES, ...value };
	if (
		!['midnight', 'zi'].includes(rules.dayDivide) ||
		!['lichun', 'lunar'].includes(rules.yearDivide) ||
		!['add-twelve', 'same-month'].includes(rules.leapMonth)
	)
		throw new Error('不支持的排盘规则');
	return rules;
}
function fixedOffset(zone: string): number | null {
	const m = /^UTC([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(zone);
	if (!m) return null;
	const n = Number(m[2]) * 60 + Number(m[3]) + Number(m[4] || 0) / 60;
	if (Number(m[3]) > 59 || Number(m[4] || 0) > 59 || n > 14 * 60) throw new Error('时区偏移无效');
	return n * (m[1] === '+' ? 1 : -1);
}
export function calendarCivil(timestamp: number, timeZone: string): string {
	const offset = fixedOffset(timeZone);
	if (offset === null) return civilString(zonedParts(timestamp, timeZone));
	return new Date(timestamp + offset * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
export function calendarTimestamp(
	civil: string,
	zone: string,
	choice: Disambiguation = 'reject'
): number {
	const p = parseCivil(civil),
		offset = fixedOffset(zone);
	return offset === null
		? civilToTimestamp(civil, zone, choice)
		: Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - offset * 60000;
}
export function resolveCalendar(
	timestamp: number,
	module: CalendarContext['module'],
	options: CalendarOptions = {}
): CalendarContext {
	if (!Number.isFinite(timestamp)) throw new Error('排盘时间无效');
	if (options.calculation) {
		const c = options.calculation;
		if (
			c.version !== 1 ||
			c.module !== module ||
			c.engine !== 'lunar-javascript@1.7.7' ||
			![`${module}-civil-v1`, `${module}-legacy-v0`].includes(c.ruleVersion)
		)
			throw new Error('该记录的排盘规则版本暂不支持，原记录未改动');
		if (
			!c.rules ||
			!c.rules.dayDivide ||
			!c.rules.yearDivide ||
			!c.rules.leapMonth ||
			typeof c.timeZone !== 'string' ||
			!c.timeZone ||
			!['new', 'legacy-profile', 'legacy-confirmed'].includes(c.source)
		)
			throw new Error('保存的排盘口径不完整，原记录未改动');
		if (
			(c.replayMode || c.timePrecision) &&
			(c.replayMode !== 'snapshot' || c.timePrecision !== 'minute' || c.source === 'new')
		)
			throw new Error('保存的原盘快照口径不完整');
		if (
			c.timestamp !== timestamp ||
			!Number.isFinite(c.utcOffsetMinutes) ||
			Math.abs(c.utcOffsetMinutes) > 840
		)
			throw new Error('保存的排盘时间信息不一致');
		const p = parseCivil(c.civil);
		if (
			Math.abs(
				Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
					c.utcOffsetMinutes * 60000 -
					timestamp
			) >= 1000
		)
			throw new Error('保存的钟表时间与时间戳不一致');
		return { ...c, rules: calendarRules(c.rules) };
	}
	const timeZone = options.timeZone || 'Asia/Shanghai';
	const civil = calendarCivil(timestamp, timeZone),
		p = parseCivil(civil);
	return {
		version: 1,
		module,
		engine: 'lunar-javascript@1.7.7',
		ruleVersion: `${module}-civil-v1`,
		timestamp,
		timeZone,
		civil,
		utcOffsetMinutes:
			(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
				Math.floor(timestamp / 1000) * 1000) /
			60000,
		rules: calendarRules(options.rules),
		source: 'new',
	};
}
export function calendarValues(context: CalendarContext) {
	const p = parseCivil(context.civil);
	const solar = Solar.fromYmdHms(p.year, p.month, p.day, p.hour, p.minute, p.second);
	const lunar = solar.getLunar(),
		eightChar = lunar.getEightChar();
	(eightChar as unknown as { setSect: (sect: number) => void }).setSect(
		context.rules.dayDivide === 'zi' ? 1 : 2
	);
	return { solar, lunar, eightChar };
}
export function legacyCalendar(
	timestamp: number,
	module: CalendarContext['module'],
	payload: any,
	confirmedZone?: string
): CalendarContext | null {
	const saved = payload?.calculation || payload?.user?.calculation;
	if (saved) return resolveCalendar(timestamp, module, { calculation: saved });
	const zone =
		confirmedZone ||
		(payload?.user?.timeZoneSource !== 'legacy-device' ? payload?.user?.timeZone : undefined) ||
		payload?.options?.timeZone;
	if (zone)
		return {
			...resolveCalendar(timestamp, module, { timeZone: zone }),
			source: 'legacy-confirmed',
			ruleVersion: `${module}-legacy-v0`,
		};
	const b = payload?.bazi;
	const civil =
		payload?.profile?.timeLabel ||
		b?.yangli ||
		(b?.solar?.year &&
			`${b.solar.year}-${String(b.solar.month).padStart(2, '0')}-${String(b.solar.day).padStart(2, '0')} ${b.solar.time}`);
	if (!civil) return null;
	// Minute labels cannot prove an offset: historical zones can include seconds.
	// Confirm the original zone rather than moving an old chart across a solar term.
	if (!/:\d{2}:\d{2}$/.test(String(civil))) return null;
	const p = parseCivil(String(civil).replace(/\//g, '-'));
	const offset =
		(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
			Math.floor(timestamp / 1000) * 1000) /
		60000;
	if (Math.abs(offset) > 840) throw new Error('旧记录钟表时间与时间戳不一致，请核对原记录');
	const seconds = Math.round(Math.abs(offset) * 60);
	const zoneName = `UTC${offset < 0 ? '-' : '+'}${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}${seconds % 60 ? ':' + String(seconds % 60).padStart(2, '0') : ''}`;
	return {
		...resolveCalendar(timestamp, module, { timeZone: zoneName }),
		source: 'legacy-profile',
		ruleVersion: `${module}-legacy-v0`,
	};
}
export function calendarRuleLabel(context: CalendarContext): string {
	const r = context.rules;
	return `${context.timeZone} · 钟表时间 · 日柱${r.dayDivide === 'zi' ? '23:00' : '00:00'}换日${context.module === 'liuyao' ? ` · 时间起卦年支按${r.yearDivide === 'lunar' ? '春节' : '立春'} · 闰月${r.leapMonth === 'add-twelve' ? '原月数加12' : '按原月数'}` : ' · 节气定年月，不按闰月分半'}${context.source === 'new' ? '' : ' · 旧版口径'}${context.replayMode === 'snapshot' ? ' · 原时间仅精确到分钟，显示保存的原盘快照' : ''}`;
}
