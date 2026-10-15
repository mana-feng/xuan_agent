import type { LiuyaoResultPayload } from '@/store/liuyao';
import { useLiuyaoStore } from '@/store/liuyao';
import { buildDisplayData, compileNajia } from './najiaCore';
import liuyaoService from './service';
import { resolveCalendar, calendarValues, type CalendarOptions } from '@/utils/calendarContext';

export type LiuyaoExecutionInput = CalendarOptions & {
	title?: string;
	gender?: string | number | null;
	date: Date;
	params: number[];
	methodLabel: string;
};

export type TimeLiuyaoExecutionInput = CalendarOptions & {
	title?: string;
	gender?: string | number | null;
	date?: Date;
};

function normalizeGenderLabel(value: LiuyaoExecutionInput['gender']) {
	const normalized = String(value ?? '').trim().toLowerCase();
	if (!normalized) return '未填写';
	if (normalized === '0' || normalized === '男' || normalized === 'male' || normalized === 'man') {
		return '男';
	}
	if (normalized === '1' || normalized === '女' || normalized === 'female' || normalized === 'woman') {
		return '女';
	}
	return String(value ?? '').trim() || '未填写';
}

function buildLiuyaoResultPayload(input: LiuyaoExecutionInput): LiuyaoResultPayload {
	const date = new Date(input.date);
	if (!Number.isFinite(date.getTime())) {
		throw new Error('时间参数无效，无法生成六爻盘');
	}

	const params = Array.isArray(input.params) ? input.params.map((value) => Number(value) || 0) : [];
	if (params.length !== 6) {
		throw new Error('六爻参数不足，无法生成盘面');
	}

	const calculation = resolveCalendar(date.getTime(), 'liuyao', input);
	const { solar, lunar, eightChar } = calendarValues(calculation);
	const dayGz = eightChar.getDay();
	const title = String(input.title || '').trim();
	const compiled = compileNajia(params, {
		gender: '',
		title,
		date,
		dayGz,
		guaci: true,
		solar,
		lunar,
		calculation,
	});
	const display = buildDisplayData(compiled);

	return {
		compiled,
		display,
		profile: {
			title: title || '起卦记录',
			method: input.methodLabel,
			gender: normalizeGenderLabel(input.gender),
			dayGanZhi: dayGz,
			timeLabel: calculation.civil.slice(0,16),
			focus: title || '未填写',
			note: `八字：${eightChar.getYear()} ${eightChar.getMonth()} ${eightChar.getDay()} ${eightChar.getTime()}`,
		},
		createdAt: Date.now(),
		castingAt: date.getTime(),
		calculation,
	};
}

export function executeLiuyaoChart(input: LiuyaoExecutionInput) {
	const payload = buildLiuyaoResultPayload(input);
	useLiuyaoStore().setResult(payload);
	return payload;
}

export function executeTimeLiuyaoChart(input: TimeLiuyaoExecutionInput = {}) {
	const date =
		input.date instanceof Date && Number.isFinite(input.date.getTime()) ? new Date(input.date.getTime()) : new Date();

	return executeLiuyaoChart({
		...input,
		title: input.title,
		gender: input.gender ?? '',
		date,
		params: liuyaoService.generateTimeParams(date, input),
		methodLabel: '时间起卦',
	});
}
