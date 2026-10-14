import { useBaziStore } from '@/store/bazi';
import { useZiweiStore } from '@/store/ziwei';
import { useLiuyaoStore } from '@/store/liuyao';
import { useQimenStore } from '@/store/qimen';
import { executeLiuyaoChart } from '@/features/liuyao/executor';

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

export function openSavedChart(item: ChartItem) {
	const bazi_store = useBaziStore();
	try {
		if (item.type === 'qimen') {
			const payload = item.rawPayload;
			if (payload?.module !== 'qimen' || payload?.version !== 1 || !payload.input) {
				throw new Error('该记录缺少有效的奇门起局参数');
			}
			const timestamp = new Date(item.birthDatetime).getTime();
			if (!Number.isFinite(timestamp)) throw new Error('该记录缺少有效的起局时间');
			useQimenStore().pull({
				...payload.input,
				question: item.title,
				timestamp,
				recordId: item.id,
			});
			uni.navigateTo({ url: '/pages/qimen/result' });
			return;
		}
		if (item.type === 'ziwei') {
			const input = item.rawPayload?.user || {};
			const timestamp = new Date(item.birthDatetime || input.timestamp).getTime();
			if (!Number.isFinite(timestamp)) throw new Error('该记录缺少有效的出生时间');
			useZiweiStore().pull({
				realname: item.title || input.realname || '佚名',
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
			executeLiuyaoChart({
				params,
				date,
				title: payload.options?.title || payload.profile?.title || item.title,
				gender: payload.options?.gender ?? payload.profile?.gender ?? item.gender,
				methodLabel: payload.profile?.method || '历史起卦',
			});
			useLiuyaoStore().setRecordId(item.id);
			uni.navigateTo({ url: '/pages/liuyao/result' });
			return;
		}
		let useRawPayload = false;
		if (item.rawPayload && item.rawPayload.user && item.rawPayload.bazi) {
			const u = item.rawPayload.user;
			const b = item.rawPayload.bazi;

			if (
				u.timestamp &&
				u.gender !== undefined &&
				u.gender !== null &&
				b.solar &&
				b.solar.year &&
				b.sizhu &&
				b.sizhu.year &&
				b.yinli &&
				b.xinzuo &&
				b.table &&
				Array.isArray(b.table) &&
				b.table.length > 0
			) {
				// 统一标准：0=男，1=女（数字）
				// rawPayload 中存储的是数字，直接使用
				let rawPayloadGender: number;
				if (u.gender === null || u.gender === undefined) {
					rawPayloadGender = 0;
				} else {
					rawPayloadGender = typeof u.gender === 'string' ? parseInt(u.gender) : u.gender;
				}

				// 数据库存储为字符串：'0'=男，'1'=女，转换为前端标准：0=男，1=女
				let dbGender: number;
				if (item.gender === null || item.gender === undefined) {
					dbGender = 0;
				} else if (typeof item.gender === 'string') {
					dbGender = item.gender === '0' ? 0 : item.gender === '1' ? 1 : 0;
				} else {
					dbGender = item.gender === 0 ? 0 : item.gender === 1 ? 1 : 0;
				}

				let dbTimestamp: number;
				if (typeof item.birthDatetime === 'string') {
					const date = new Date(item.birthDatetime);
					dbTimestamp = date.getTime();
				} else if (typeof item.birthDatetime === 'number') {
					dbTimestamp = item.birthDatetime;
				} else {
					dbTimestamp = 0;
				}

				const timestampDiff = Math.abs((u.timestamp || 0) - dbTimestamp);
				if (rawPayloadGender === dbGender && timestampDiff < 1000) {
					useRawPayload = true;
				}
			}
		}

		if (useRawPayload) {
			const u = item.rawPayload.user;
			bazi_store.pull({
				realname: u.realname || item.title || '佚名',
				gender: u.gender,
				timestamp: u.timestamp,
				recordId: item.id, // 设置记录ID
			});

			setTimeout(() => {
				uni.navigateTo({
					url: '/pages/index/detail',
				});
			}, 100);
			return;
		}

		if (!item.birthDatetime) {
			uni.showToast({
				title: '该记录缺少出生时间数据',
				icon: 'none',
				duration: 2000,
			});
			return;
		}

		let timestamp: number;
		if (typeof item.birthDatetime === 'string') {
			const date = new Date(item.birthDatetime);
			timestamp = date.getTime();
			if (isNaN(timestamp)) {
				uni.showToast({
					title: '出生时间格式错误，无法解析',
					icon: 'none',
					duration: 2000,
				});
				return;
			}
		} else if (typeof item.birthDatetime === 'number') {
			timestamp = item.birthDatetime;
			if (isNaN(timestamp) || timestamp <= 0) {
				uni.showToast({
					title: '出生时间无效',
					icon: 'none',
					duration: 2000,
				});
				return;
			}
		} else {
			uni.showToast({
				title: '出生时间格式错误',
				icon: 'none',
				duration: 2000,
			});
			return;
		}

		// 数据库存储为字符串：'0'=男，'1'=女，转换为前端标准：0=男，1=女
		let gender: number;
		if (item.gender === null || item.gender === undefined) {
			gender = 0;
		} else if (typeof item.gender === 'string') {
			gender = item.gender === '0' ? 0 : item.gender === '1' ? 1 : 0;
		} else {
			gender = item.gender === 0 ? 0 : item.gender === 1 ? 1 : 0;
		}

		uni.showLoading({
			title: '排盘中，请稍后！',
		});

		try {
			bazi_store.pull({
				realname: item.title || '佚名',
				timestamp: timestamp,
				gender: gender,
				recordId: item.id,
			});
		} catch (pullError: any) {
			uni.hideLoading();
			uni.showToast({
				title: '排盘计算失败：' + (pullError?.message || '未知错误'),
				icon: 'none',
				duration: 2000,
			});
			return;
		}

		setTimeout(() => {
			uni.hideLoading();
			if (!bazi_store.solar || !bazi_store.solar.year) {
				uni.showToast({
					title: '排盘数据不完整，请重试',
					icon: 'none',
					duration: 2000,
				});
				return;
			}
			uni.navigateTo({
				url: '/pages/index/detail',
			});
		}, 200);
	} catch (e: any) {
		uni.hideLoading();
		uni.showToast({
			title: '打开排盘记录失败：' + (e?.message || '未知错误'),
			icon: 'none',
			duration: 2000,
		});
	}
}
