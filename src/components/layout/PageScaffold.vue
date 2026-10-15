<template>
	<view class="app-shell x-workbench" :data-palette="palette">
		<WorkbenchNav />
		<view class="app-main">
			<view class="page-shell">
				<view class="page-card" :class="cardClass">
					<view v-if="hasHero" class="page-title-wrapper">
						<view class="page-title-text">
							<h1 v-if="props.title" class="page-title">{{ props.title }}</h1>
							<p v-if="props.subtitle" class="page-subtitle">{{ props.subtitle }}</p>
						</view>
						<view v-if="props.tag || $slots['header-extra']" class="page-title-extra">
							<slot name="header-extra">
								<text v-if="props.tag" class="page-eyebrow">{{ props.tag }}</text>
							</slot>
						</view>
					</view>

					<view class="page-card__body">
						<slot />
					</view>

					<view v-if="$slots.footer" class="page-card__footer">
						<slot name="footer" />
					</view>
				</view>
			</view>
		</view>

		<AnnouncementDialog v-if="showAnnouncementModal" :announcements="announcementList" :loading="annLoading" :error="annError" @close="closeAnnouncements" @retry="refreshAnnouncements" />
	</view>
</template>

<script lang="ts" setup>
import { ref, computed, useSlots, onMounted, onUnmounted } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import WorkbenchNav from '@/components/shell/WorkbenchNav.vue';
import AnnouncementDialog from '@/components/layout/AnnouncementDialog.vue';
import { useWorkbenchTheme } from '@/features/workbench/theme';
const { palette } = useWorkbenchTheme();
import { fetchAnnouncementMeta, fetchAnnouncements, type Announcement, type AnnouncementMeta } from '@/services/announcements';

const props = defineProps<{
	title?: string;
	subtitle?: string;
	tag?: string;
	cardClass?: string | string[] | Record<string, boolean>;
}>();

const slots = useSlots();
const hasHero = computed(() => !!(props.title || props.subtitle || props.tag || slots['header-extra']));
const cardClass = computed(() => props.cardClass);

// 公告相关
const ANN_CACHE_KEY = 'announcements_cache_v1';
const showAnnouncementModal = ref(false);
const announcementList = ref<Announcement[]>([]);
const annLoading = ref(false);
const annError = ref('');

function loadAnnouncementCache() {
	try {
		const cacheStr = uni.getStorageSync(ANN_CACHE_KEY);
		if (!cacheStr) return null;
		return JSON.parse(cacheStr);
	} catch (e) {
		return null;
	}
}

function saveAnnouncementCache(payload: { signature: string; list: Announcement[] }) {
	try {
		uni.setStorageSync(ANN_CACHE_KEY, JSON.stringify(payload));
	} catch (e) {
		// ignore
	}
}

function buildSignature(meta: AnnouncementMeta[]) {
	return meta.map((m) => `${m.id}-${m.updatedAt || ''}`).join('|');
}

async function refreshAnnouncements() {
	annError.value = '';
	annLoading.value = true;
	try {
		const metaRes = await fetchAnnouncementMeta();
		const metaList = (metaRes.data?.meta || []) as AnnouncementMeta[];
		const newSig = buildSignature(metaList);
		const cache = loadAnnouncementCache();
		if (cache && cache.signature === newSig) {
			announcementList.value = cache.list || [];
			return;
		}
		const fullRes = await fetchAnnouncements();
		const list = (fullRes.data?.list || []) as Announcement[];
		announcementList.value = list;
		saveAnnouncementCache({ signature: newSig, list });
	} catch (e: any) {
		annError.value = e?.error || e?.message || '获取公告失败';
		const cache = loadAnnouncementCache();
		if (cache?.list) {
			announcementList.value = cache.list;
		}
	} finally {
		annLoading.value = false;
	}
}

function openAnnouncements() {
	const cache = loadAnnouncementCache();
	if (cache?.list) {
		announcementList.value = cache.list;
		showAnnouncementModal.value = true;
		// 后台刷新公告，不阻塞显示
		refreshAnnouncements();
	} else {
		// 没有缓存，先显示弹窗并加载数据
		showAnnouncementModal.value = true;
		refreshAnnouncements();
	}
}

function closeAnnouncements() {
	showAnnouncementModal.value = false;
}

// 当前组件对应的页面是否可见
let isPageVisible = false;

const handleOpenAnnouncements = () => {
	if (isPageVisible) {
		openAnnouncements();
	}
};

onMounted(() => {
	isPageVisible = true;
	uni.$on('openAnnouncements', handleOpenAnnouncements);
});

onUnmounted(() => {
	isPageVisible = false;
	uni.$off('openAnnouncements', handleOpenAnnouncements);
});

onShow(() => {
	isPageVisible = true;
});

onHide(() => {
	isPageVisible = false;
	closeAnnouncements();
});
</script>

<style scoped>
.page-title-wrapper {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}

.page-title-text {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex: 1;
	min-width: 0;
}

.page-title-extra {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 10px;
	flex-shrink: 0;
}
.page-eyebrow { font-size:9px; letter-spacing:1.4px; color:var(--x-accent); background:var(--x-gradient-soft); border:1px solid var(--x-line); padding:7px 10px; border-radius:6px; }
@media (max-width: 600px) {
	.page-title-wrapper { flex-direction:column; align-items:stretch; }
	.page-title-extra { width:100%; flex-wrap:wrap; }
}

.page-card__body {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

@media (min-width: 900px) {
	.page-card__body {
		gap: 16px;
	}
}

</style>
