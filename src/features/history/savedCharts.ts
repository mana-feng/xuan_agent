import { chartTimestamp } from '@/utils/chartContext';
import { useBaziStore } from '@/store/bazi';
import { useZiweiStore } from '@/store/ziwei';
import { useLiuyaoStore } from '@/store/liuyao';
import { useQimenStore } from '@/store/qimen';
import { executeLiuyaoChart } from '@/features/liuyao/executor';
import { legacyCalendar } from '@/utils/calendarContext';

export type ChartType = 'bazi' | 'ziwei' | 'liuyao' | 'qimen';
export const chartTypes: ChartType[] = ['bazi', 'ziwei', 'liuyao', 'qimen'];
export const chartTypeLabels = { bazi: '八字', ziwei: '紫微斗数', liuyao: '六爻', qimen: '奇门遁甲' };

export interface ChartItem {
	id: number;
	type?: ChartType;
	title: string;
	gender?: string | null;
	birthDatetime: string;
	createdAt: string;
	createdAtLabel?: string;
	rawPayload?: any;
}

export function openSavedChart(item: ChartItem, originalTimeZone?: string): { needsTimeZone: true } | void {
	const bazi_store = useBaziStore();
	try {
		if (item.type === 'qimen') {
			const payload = item.rawPayload;
			if (payload?.module !== 'qimen' || payload?.version !== 1 || !payload.input) {
				throw new Error('该记录缺少有效的奇门起局参数');
			}
			const timestamp = chartTimestamp(item.birthDatetime) ?? NaN;
			if (!Number.isFinite(timestamp)) throw new Error('该记录缺少有效的起局时间');
			useQimenStore().pull({
				...payload.input,
				question: payload.input.question ?? item.title,
				timestamp,
				recordId: item.id,
			});
			uni.navigateTo({ url: '/pages/qimen/result' });
			return;
		}
		if (item.type === 'ziwei') {
			const input = item.rawPayload?.user || {};
			const timestamp = chartTimestamp(item.birthDatetime || input.timestamp) ?? NaN;
			if (!Number.isFinite(timestamp)) throw new Error('该记录缺少有效的出生时间');
			useZiweiStore().pull({
				...input,
				realname: input.realname === undefined ? item.title || '佚名' : input.realname,
				gender: Number(item.gender ?? input.gender) === 1 ? 1 : 0,
				timeZone: input.timeZone,
				timeZoneSource: input.timeZoneSource,
				ruleVersion: input.ruleVersion,
				timestamp,
				recordId: item.id,
			});
			uni.navigateTo({ url: '/pages/ziwei/result' });
			return;
		}
		if (item.type === 'liuyao') {
			const payload = item.rawPayload;
			const params = payload?.params || payload?.compiled?.params;
			if (
				!Array.isArray(params) ||
				params.length !== 6 ||
				!params.every((value) => [0, 1, 3, 4].includes(value))
			) {
				throw new Error('该记录缺少有效的卦爻参数');
			}
			const date = new Date(payload.options?.date || item.birthDatetime || payload.ts);
			if (!Number.isFinite(date.getTime())) throw new Error('该记录缺少有效的起卦时间');
			const calculation = legacyCalendar(date.getTime(), 'liuyao', payload, originalTimeZone);
			if (!calculation) return { needsTimeZone: true };
			if (calculation.replayMode === 'snapshot') {
				const snapshot = payload.snapshot;
				if (!snapshot?.compiled || !snapshot.display || !snapshot.profile || JSON.stringify(snapshot.compiled.params) !== JSON.stringify(params) || snapshot.profile.timeLabel !== calculation.civil.slice(0,16)) throw new Error('该记录缺少一致的原盘快照，原记录未改动');
				useLiuyaoStore().setResult({...snapshot,calculation,castingAt:date.getTime(),recordId:item.id});
				uni.navigateTo({url:'/pages/liuyao/result'});
				return;
			}
			executeLiuyaoChart({
				calculation,
				params,
				date,
				title: payload.profile?.title ?? payload.options?.title ?? item.title,
				gender: payload.options?.gender ?? payload.profile?.gender ?? item.gender,
				methodLabel: payload.profile?.method || '历史起卦',
			});
			const liuyao = useLiuyaoStore();
			// The display title can be a fallback; keep the original optional question
			// used by the chart's conversation identity.
			if (liuyao.profile && typeof payload.profile?.focus === 'string') {
				liuyao.profile.focus = payload.profile.focus;
			}
			liuyao.setRecordId(item.id);
			uni.navigateTo({ url: '/pages/liuyao/result' });
			return;
		}
		const payload = item.rawPayload || {};
		const input = payload.user || {};
		const timestamp = chartTimestamp(item.birthDatetime || input.timestamp) ?? NaN;
		if (!Number.isFinite(timestamp)) throw new Error('该记录缺少有效的出生时间');
		const calculation = legacyCalendar(timestamp, 'bazi', payload, originalTimeZone);
		if (!calculation) return { needsTimeZone: true };
		bazi_store.pull({
			...input,
				realname: input.realname === undefined ? item.title || '佚名' : input.realname,
			gender: Number(item.gender ?? input.gender) === 1 ? 1 : 0,
			timestamp,
			recordId: item.id,
			calculation,
		});
		uni.navigateTo({ url: '/pages/index/detail' });
	} catch (e: any) {
		uni.hideLoading();
		uni.showToast({
			title: '打开排盘记录失败：' + (e?.message || '未知错误'),
			icon: 'none',
			duration: 2000,
		});
	}
}
