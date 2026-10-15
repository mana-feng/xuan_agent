<template>
	<view class="recent-explorations">
		<view class="recent-heading">
			<h2>
				最近的探索
				<text class="recent-caption">RECENT EXPLORATIONS</text>
			</h2>
			<button v-bind="h5Button(goHistory)" class="text-button" @tap="goHistory">查看全部 →</button>
		</view>
		<view v-if="loading" class="recent-state" role="status">
			<text>正在读取最近记录…</text>
		</view>
		<view v-else-if="error" class="recent-state" role="alert">
			<text>{{ error }}</text>
			<button v-bind="h5Button(refreshRecords)" class="text-button" @tap="refreshRecords">
				重新加载
			</button>
		</view>
		<view v-else-if="!records.length" class="recent-state">
			<text>还没有保存记录。完成排盘后，点击「保存到本机」即可在这里回顾。</text>
		</view>
		<view v-else class="recent-records">
			<button
				v-bind="h5Button(() => openRecord(record))"
				v-for="record in records"
				:key="record.type + ':' + record.id"
				class="recent-row"
				:aria-label="'打开' + (record.title || '未命名命盘')"
				@tap="openRecord(record)"
			>
				<text class="record-symbol" aria-hidden="true">
					{{ record.type === 'qimen' ? '▦' : record.type === 'liuyao' ? '☷' : record.type === 'ziwei' ? '✦' : '八' }}
				</text>
				<view class="record-main">
					<text class="record-name">{{ record.title || '未命名命盘' }}</text>
					<text class="record-subtitle">
						{{ chartTypeLabels[record.type || 'bazi'] }} · {{ birthLabel(record) }}
					</text>
				</view>
				<text class="record-type">{{ chartTypeLabels[record.type || 'bazi'] }}</text>
				<text class="record-date">{{ dateLabel(record.createdAt) }}</text>
				<text class="record-arrow" aria-hidden="true">›</text>
			</button>
		</view>
	</view>
	<LegacyZoneDialog v-if="pendingLegacyChart" @close="pendingLegacyChart = null" @confirm="confirmLegacyZone" />
</template>

<script lang="ts" setup>
import { chartTimestamp } from '@/utils/chartContext';
import { h5Button } from '@/utils/keyboard';
import { ref, computed, watch, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useUserStore } from '@/store/user';
import { request } from '@/services/localRecords';
import { formatQimenHistoryTime } from '@/features/history/formatQimenHistoryTime';
import { formatCalendarHistoryTime } from '@/features/history/formatCalendarHistoryTime';
import LegacyZoneDialog from '@/components/form/LegacyZoneDialog.vue';
import {
	chartTypes,
	chartTypeLabels,
	openSavedChart,
	type ChartItem,
} from '@/features/history/savedCharts';

const userStore = useUserStore();
const isLoggedIn = computed(() => userStore.isLoggedIn);
const records = ref<ChartItem[]>([]);
const loading = ref(false);
const error = ref('');
const pendingLegacyChart = ref<ChartItem | null>(null);
function confirmLegacyZone(zone: string) {
	const item = pendingLegacyChart.value;
	if (!item) return;
	if (!openSavedChart(item, zone)?.needsTimeZone) pendingLegacyChart.value = null;
}
let requestVersion = 0;

async function refreshRecords() {
	if (!isLoggedIn.value) {
		requestVersion++;
		records.value = [];
		loading.value = false;
		error.value = '';
		return;
	}
	if (loading.value) return;
	const version = ++requestVersion;
	loading.value = true;
	error.value = '';
	try {
		const lists = await Promise.all(
			chartTypes.map(async (type) => {
				const response = await request(
					`/records/charts?type=${type}&sortBy=created_at&sortOrder=DESC`,
					{ method: 'GET', }
				);
				if (response.success === false) throw new Error(response.error || '暂时无法读取最近记录');
				const data = response.data || response;
				const list = Array.isArray(data) ? data : data.list || [];
				return list.map((item: ChartItem) => ({ ...item, type }));
			})
		);
		if (version !== requestVersion || !isLoggedIn.value) return;
		records.value = lists
			.flat()
			.sort(
				(a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0)
			)
			.slice(0, 3);
	} catch (cause: any) {
		if (version !== requestVersion) return;
		records.value = [];
		error.value = cause?.error || cause?.message || '暂时无法读取最近记录';
	} finally {
		if (version === requestVersion) loading.value = false;
	}
}

function openRecord(record: ChartItem) {
	if (openSavedChart(record)?.needsTimeZone) pendingLegacyChart.value = record;
}
function goHistory() {
	uni.navigateTo({ url: '/pages/history/list' });
}

function dateLabel(value: string) {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return '';
	return `${date.getMonth() + 1} / ${date.getDate()}`;
}
function birthLabel(record: ChartItem) {
	if (record.type === 'qimen') return formatQimenHistoryTime(record.birthDatetime) || '起局记录';
	const savedTime = formatCalendarHistoryTime(record);
	if (savedTime !== null) return savedTime;
	const date = new Date(chartTimestamp(record.birthDatetime) ?? NaN);
	if (!Number.isFinite(date.getTime())) return record.type === 'liuyao' ? '起卦记录' : '命盘记录';
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
watch(isLoggedIn, refreshRecords);
onMounted(refreshRecords);
onShow(refreshRecords);
</script>

<style scoped>
.recent-explorations {
	display: block;
	color: var(--x-body);
	font-family: var(--x-sans);
	min-width: 0;
}
.recent-records {
	display: block;
}
.recent-heading {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 15px;
	margin-bottom: 10px;
}
.recent-heading h2 {
	margin: 0;
	color: var(--x-ink);
	font-family: var(--x-serif);
	font-weight: 500;
	font-size: 21px;
}
.recent-caption {
	font-family: var(--x-sans);
	font-size: 9px;
	color: var(--x-muted);
	letter-spacing: 0.08em;
	margin-left: 12px;
}
.text-button,
.recent-row {
	margin: 0;
	border: 0;
	padding: 0;
	background: transparent;
	color: inherit;
	line-height: 1.5;
	border-radius: 0;
	font: inherit;
	cursor: pointer;
}
button::after {
	border: 0;
}
button:focus-visible {
	outline: 2px solid var(--x-accent);
	outline-offset: 3px;
}
.text-button {
	flex-shrink: 0;
	color: var(--x-accent);
	font-size: 11px;
	white-space: nowrap;
}
.recent-row {
	display: grid;
	grid-template-columns: 40px minmax(0, 1fr) 72px 68px 12px;
	gap: 17px;
	align-items: center;
	width: 100%;
	padding: 18px 0;
	border-bottom: 1px solid var(--x-line);
	text-align: left;
}
.recent-row:last-child {
	border-bottom: 0;
}
.recent-row:hover .record-name {
	color: var(--x-accent);
}
.record-symbol {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border: 1px solid var(--x-line);
	border-radius: 10px;
	background: var(--x-tint);
	color: var(--x-accent);
	font-size: 18px;
}
.record-main {
	display: flex;
	flex-direction: column;
	min-width: 0;
	gap: 5px;
}
.record-name {
	font-size: 13px;
	font-weight: 600;
	color: var(--x-ink);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.record-subtitle,
.record-type,
.record-date {
	color: var(--x-muted);
	font-size: 10px;
}
.record-date {
	text-align: right;
}
.record-arrow {
	color: var(--x-muted);
	font-size: 20px;
}
.recent-state {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	min-height: 92px;
	font-size: 12px;
	color: var(--x-muted);
	line-height: 1.8;
	padding: 12px 0;
}
@media (max-width: 600px) {
	.recent-heading h2 {
		font-size: 19px;
	}
	.recent-caption {
		display: none;
	}
	.recent-row {
		grid-template-columns: 32px minmax(0, 1fr) 54px 12px;
		gap: 10px;
	}
	.record-symbol {
		width: 30px;
		height: 30px;
	}
	.record-type {
		display: none;
	}
	.recent-state {
		flex-wrap: wrap;
	}
}
</style>
