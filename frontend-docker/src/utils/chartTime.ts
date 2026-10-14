/** Civil clock time is always interpreted in an explicit IANA zone, never the host zone. */
export type Disambiguation = 'reject' | 'earlier' | 'later';
export interface CivilParts { year: number; month: number; day: number; hour: number; minute: number; second: number }
const formatters = new Map<string, Intl.DateTimeFormat>();
const pad = (value: number) => String(value).padStart(2, '0');

export function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatter(timeZone: string) {
	if (typeof timeZone !== 'string' || !timeZone) throw new Error('请选择有效的 IANA 时区');
	if (!formatters.has(timeZone)) {
		try {
			formatters.set(timeZone, new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
				timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
				hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
			}));
		} catch { throw new Error(`不支持的时区：${timeZone}`); }
	}
	return formatters.get(timeZone)!;
}

export function zonedParts(timestamp: number, timeZone: string): CivilParts {
	if (!Number.isFinite(timestamp)) throw new Error('时间无效');
	const parts = formatter(timeZone).formatToParts(new Date(timestamp));
	const result: any = {};
	for (const part of parts) if (part.type !== 'literal') result[part.type] = Number(part.value);
	return result;
}

export function civilDate(parts: CivilParts): string {
	return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
export function civilString(parts: CivilParts): string {
	return `${civilDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}
const civilNumber = (p: CivilParts) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

export function parseCivil(text: string): CivilParts {
	const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/.exec(text.trim());
	if (!match) throw new Error('日期格式应为 YYYY-MM-DD HH:mm');
	const [, y, m, d, h, mi = '0', s = '0'] = match;
	const p = { year: +y, month: +m, day: +d, hour: +h, minute: +mi, second: +s };
	const date = new Date(civilNumber(p));
	if (p.year < 1900 || p.year > 2099 || date.getUTCFullYear() !== p.year || date.getUTCMonth() + 1 !== p.month || date.getUTCDate() !== p.day || p.hour > 23 || p.minute > 59 || p.second > 59) {
		throw new Error('日期无效，支持 1900—2099 年');
	}
	return p;
}

export function civilToTimestamp(text: string, timeZone: string, choice: Disambiguation = 'reject'): number {
	const civil = parseCivil(text), local = civilNumber(civil);
	// Sample both sides of an offset transition, then round-trip every candidate.
	const offsets = new Set<number>();
	for (let hours = -36; hours <= 36; hours += 6) {
		const probe = local + hours * 3600000;
		offsets.add(civilNumber(zonedParts(probe, timeZone)) - probe);
	}
	const candidates = [...offsets].map(offset => local - offset)
		.filter(value => civilString(zonedParts(value, timeZone)) === civilString(civil)).sort((a, b) => a - b);
	if (!candidates.length) throw new Error('该时区的此时刻不存在（夏令时跳时），请重新选择');
	if (candidates.length > 1 && choice === 'reject') throw new Error('此时刻因夏令时结束而重复，请选择较早或较晚的一次');
	return choice === 'later' ? candidates[candidates.length - 1] : candidates[0];
}

export function nextCivilDay(parts: CivilParts): CivilParts {
	const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
	return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0, second: 0 };
}
