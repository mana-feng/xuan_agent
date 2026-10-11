import { defineStore } from 'pinia';

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
	compiled: any;
	display: any;
	profile: LiuyaoProfile;
	createdAt: number;
	castingAt?: number;
	recordId?: number | null;
}

interface State {
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
		return { compiled, display, profile, createdAt, castingAt: data.castingAt, recordId: data.recordId } as LiuyaoResultPayload;
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
		compiled: null,
		display: null,
		profile: null,
		createdAt: null,
		castingAt: null,
		recordId: null
	}),
	actions: {
		setResult(payload: LiuyaoResultPayload) {
			this.compiled = payload.compiled;
			this.display = payload.display;
			this.profile = payload.profile;
			this.createdAt = payload.createdAt;
			// Older local caches only kept the chosen time in the displayed profile.
			const profileTime = new Date(payload.profile.timeLabel.replace(/-/g, '/')).getTime();
			this.castingAt = payload.castingAt ?? (Number.isFinite(profileTime) ? profileTime : payload.createdAt);
			this.recordId = payload.recordId ?? null;
			this.persistResult();
		},
		setRecordId(recordId: number) {
			this.recordId = recordId;
			this.persistResult();
		},
		persistResult() {
			if (!this.compiled || !this.display || !this.profile || this.createdAt === null) return;
			writeLastResult({
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
			this.setResult(cached);
		},
		clear() {
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
