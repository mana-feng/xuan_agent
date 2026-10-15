import { Lunar, Solar } from 'lunar-javascript';

/** The chart's solarDate already includes the configured late-Zi birth rollover. */
export function getZiweiBirthLunarYear(astrolabe: { solarDate?: string } | null | undefined): number | null {
	const values = astrolabe?.solarDate?.split('-').map(Number);
	if (!values || values.length !== 3 || values.some(value => !Number.isFinite(value))) return null;
	try { return Solar.fromYmd(values[0], values[1], values[2]).getLunar().getYear(); }
	catch { return null; }
}

export function getZiweiLunarYearStart(lunarYear: number): Date | null {
	if (!Number.isInteger(lunarYear)) return null;
	try {
		const solar = Lunar.fromYmd(lunarYear, 1, 1).getSolar();
		return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
	} catch { return null; }
}

/** Nominal age changes at lunar new year, whose Gregorian date changes each year. */
export function getZiweiDateForNominalAge(astrolabe: { solarDate?: string } | null | undefined, age: number): Date | null {
	const birthYear = getZiweiBirthLunarYear(astrolabe);
	if (birthYear === null || !Number.isInteger(age) || age < 1) return null;
	return getZiweiLunarYearStart(birthYear + age - 1);
}
