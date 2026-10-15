import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import { star, util } from 'iztro';
import { withZiweiConfig } from './ziweiCalculation';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

/** Timeline Date values represent the selected civil clock, not the birth-zone instant. */
export function calculateZiweiHoroscope(astrolabe: Pick<IFunctionalAstrolabe, 'horoscope' | 'palaces'>, date: Date) {
	if (!Number.isFinite(date.getTime())) return null;
	const lateZi = date.getHours() === 23;
	// Use UTC only for civil date arithmetic. A string keeps the normalized early
	// Zi hour independent of a device zone's historical midnight DST gap.
	const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + (lateZi ? 1 : 0)));
	const hour = lateZi ? 0 : date.getHours();
	const civil = `${day.getUTCFullYear()}-${day.getUTCMonth() + 1}-${day.getUTCDate()} ${hour}:${date.getMinutes()}:${date.getSeconds()}`;
	const timeIndex = Math.floor((hour + 1) / 2);
	const result = withZiweiConfig(() => astrolabe.horoscope(civil, timeIndex));
	// iztro emits index -1 and untranslated default stems outside its age domain.
	// Never present that fallback as a calculated decadal chart.
	if (result.age.nominalAge < 1 || result.decadal.index < 0) return null;
	// iztro's stored age lists stop at 120 although the final decadal can extend
	// beyond it. Xiaoxian is cyclic: reuse the same palace after each 12 years.
	if (result.age.index < 0) {
		const cyclicAge = (result.age.nominalAge - 1) % 120 + 1;
		const palace = astrolabe.palaces.find(item => item.ages.includes(cyclicAge));
		if (!palace) return null;
		result.age.index = palace.index;
		result.age.heavenlyStem = palace.heavenlyStem;
		result.age.earthlyBranch = palace.earthlyBranch;
		result.age.palaceNames = palaceNamesFromSoul(result.daily.palaceNames, result.daily.index, palace.index);
		result.age.mutagen = withZiweiConfig(() => util.getMutagensByHeavenlyStem(palace.heavenlyStem));
	}
	// iztro uses `timeIndex || inferredIndex`, so explicit zero is lost at a
	// device midnight DST gap. Derive the complete hourly scope from the civil
	// hour and daily scope: five-rat stem progression, one palace per hour.
	// Rule sources: docs/algorithm-benchmark-2026-10-13/ziwei-flows/sources.json.
	const dayStem = STEMS.findIndex(stem => stem === result.daily.heavenlyStem);
	const hourlyStem = STEMS[(dayStem % 5 * 2 + timeIndex) % 10];
	const hourlyBranch = BRANCHES[timeIndex];
	const hourlyIndex = (result.daily.index + timeIndex) % 12;
	result.hourly = {
		...result.hourly,
		index: hourlyIndex,
		heavenlyStem: hourlyStem,
		earthlyBranch: hourlyBranch,
		palaceNames: palaceNamesFromSoul(result.daily.palaceNames, result.daily.index, hourlyIndex),
		mutagen: withZiweiConfig(() => util.getMutagensByHeavenlyStem(hourlyStem)),
		stars: withZiweiConfig(() => star.getHoroscopeStar(hourlyStem, hourlyBranch, 'hourly')),
	};
	return result;
}

function palaceNamesFromSoul<T>(names: T[], from: number, to: number): T[] {
	return names.map((_, index) => names[(index + from - to + 12) % 12]);
}
