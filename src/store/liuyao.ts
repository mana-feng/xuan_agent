import { defineStore } from 'pinia';
import { legacyCalendar, resolveCalendar, type CalendarContext } from '@/utils/calendarContext';

export interface LiuyaoProfile {
	title: string;
	method: string;
	gender: string;
	dayGanZhi: string;
	timeLabel: string;
	focus: string;
	note?: string;
}

export interface LiuyaoResultPayload {
	calculation?: CalendarContext;
	compiled: any;
	display: any;
	profile: LiuyaoProfile;
	createdAt: number;
	castingAt?: number;
	recordId?: number | null;
}

interface State {
	legacyNeedsTimeZone: boolean;
	calculation: CalendarContext | null;
	compiled: any | null;
	display: any | null;
	profile: LiuyaoProfile | null;
	createdAt: number | null;
	castingAt: number | null;
	recordId: number | null;
}

const LIUYAO_LAST_RESULT_KEY = 'liuyao_last_result';

function readLastResult(): LiuyaoResultPayload | null {
	try {
		const data = uni.getStorageSync(LIUYAO_LAST_RESULT_KEY);
		if (!data) return null;
		if (typeof data !== 'object') return null;
		const compiled = (data as any).compiled;
		const display = (data as any).display;
		const profile = (data as any).profile;
		const createdAt = (data as any).createdAt;
		if (!compiled || !display || !profile || !createdAt) return null;
		return { compiled, display, profile, createdAt, castingAt: data.castingAt, recordId: data.recordId, calculation: data.calculation } as LiuyaoResultPayload;
	} catch (e) {
		return null;
	}
}

function writeLastResult(payload: LiuyaoResultPayload) {
	try {
		uni.setStorageSync(LIUYAO_LAST_RESULT_KEY, payload);
	} catch (e) {
		void e;
	}
}

function clearLastResult() {
	try {
		uni.removeStorageSync(LIUYAO_LAST_RESULT_KEY);
	} catch (e) {
		void e;
	}
}

export const useLiuyaoStore = defineStore('liuyao', {
	state: (): State => ({
		legacyNeedsTimeZone: false,
		calculation: null,
		compiled: null,
		display: null,
		profile: null,
		createdAt: null,
		castingAt: null,
		recordId: null
	}),
	actions: {
		setResult(payload: LiuyaoResultPayload) {
			const castingAt = payload.castingAt ?? payload.calculation?.timestamp;
			const calculation = payload.calculation ? resolveCalendar(castingAt!, 'liuyao', {calculation:payload.calculation}) : castingAt !== undefined ? legacyCalendar(castingAt, 'liuyao', payload) : null;
			this.calculation = calculation;
			this.legacyNeedsTimeZone = !this.calculation;
			this.compiled = payload.compiled;
			this.display = payload.display;
			this.profile = payload.profile;
			this.createdAt = payload.createdAt;
			// A wall-clock string alone cannot recover the original instant without its zone.
			this.castingAt = castingAt ?? null;
			this.recordId = payload.recordId ?? null;
			this.persistResult();
		},
		setRecordId(recordId: number) {
			this.recordId = recordId;
			this.persistResult();
		},
		persistResult() {
			if (this.legacyNeedsTimeZone) return;
			if (!this.compiled || !this.display || !this.profile || this.createdAt === null) return;
			writeLastResult({
				calculation: this.calculation ?? undefined,
				compiled: this.compiled,
				display: this.display,
				profile: this.profile,
				createdAt: this.createdAt,
				castingAt: this.castingAt ?? undefined,
				recordId: this.recordId
			});
		},
		restoreLastResult() {
			if (this.compiled && this.display && this.profile && this.createdAt) return;
			const cached = readLastResult();
			if (!cached) return;
			try { this.setResult(cached); } catch (error:any) { uni.showToast({title:error.message || '旧缓存口径无效，原数据未改动',icon:'none'}); }
		},
		clear() {
			this.legacyNeedsTimeZone = false;
			this.calculation = null;
			this.compiled = null;
			this.display = null;
			this.profile = null;
			this.createdAt = null;
			this.castingAt = null;
			this.recordId = null;
			clearLastResult();
		}
	}
});
