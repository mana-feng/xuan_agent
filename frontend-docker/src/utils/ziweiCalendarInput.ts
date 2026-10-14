import { Lunar } from 'lunar-javascript';
import { parseCivil } from './chartTime';

/** Signed lunar month is explicit; never let a date picker normalize leap months. */
export function lunarCivilToSolar(date: string, clock: string, leap: boolean): string {
	const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(date.trim());
	if (!match) throw new Error('农历日期格式应为 YYYY-MM-DD');
	const [, year, month, day] = match;
	if (+year < 1900 || +year > 2099 || +month < 1 || +month > 12 || +day < 1 || +day > 30) throw new Error('农历日期无效');
	try {
		const lunar = Lunar.fromYmd(+year, leap ? -Number(month) : Number(month), +day);
		const result = `${lunar.getSolar().toYmd()} ${clock.trim()}`;
		parseCivil(result);
		return result;
	} catch { throw new Error('农历日期或时间无效，请核对闰月、天数和 HH:mm 时间'); }
}
