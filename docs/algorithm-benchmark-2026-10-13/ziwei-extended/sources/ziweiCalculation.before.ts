import { astro } from 'iztro';
import { Solar } from 'lunar-javascript';
import { civilDate, civilString, deviceTimeZone, nextCivilDay, zonedParts } from './chartTime';
import type { ChartPullData } from './chartInput';

export const ZIWEI_RULES = {
	id: 'ziwei-civil-v1', engine: 'iztro@2.5.7',
	yearDivide: 'normal', ageDivide: 'normal', horoscopeDivide: 'normal',
	dayDivide: 'forward', algorithm: 'default', fixLeap: true,
	clock: 'civil', lateZi: '23:00 full next-day rollover',
} as const;

export function withZiweiConfig<T>(action: () => T): T {
	const previous = astro.getConfig();
	const { yearDivide, ageDivide, horoscopeDivide, dayDivide, algorithm } = previous;
	astro.config(ZIWEI_RULES);
	try { return action(); } finally { astro.config({ yearDivide, ageDivide, horoscopeDivide, dayDivide, algorithm }); }
}

export function calculateZiwei(input: ChartPullData) {
	const timeZone = input.timeZone || deviceTimeZone();
	const birth = zonedParts(input.timestamp, timeZone);
	if (birth.year < 1900 || birth.year > 2099) throw new Error('紫微排盘支持 1900—2099 年');
	const lateZiRollover = birth.hour === 23;
	// iztro 2.5.7 timeIndex=12 advances some day-based stars but leaves the
	// month/year (and leap-month soul palace) behind. Normalize the WHOLE date.
	const effective = lateZiRollover ? nextCivilDay(birth) : birth;
	const timeIndex = Math.floor((effective.hour + 1) / 2);
	const calculationDate = civilDate(effective);
	const lunar = Solar.fromYmdHms(effective.year, effective.month, effective.day, 0, 0, 0).getLunar();
	const chart = withZiweiConfig(() => astro.bySolar(calculationDate, timeIndex, Number(input.gender) === 1 ? '女' : '男', true, 'zh-CN'));
	return {
		chart,
		metadata: {
			...ZIWEI_RULES, timeZone, birthCivil: civilString(birth), calculationDate, timeIndex, lateZiRollover,
			lunar: { year: lunar.getYear(), month: Math.abs(lunar.getMonth()), day: lunar.getDay(), isLeap: lunar.getMonth() < 0 },
		},
	};
}
