<template>
	<view class="admin-navigation">
		<view id="admin-sidebar" ref="sidebar" class="admin-sidebar" :class="{ 'is-open': menuOpen }" :role="compact && menuOpen ? 'dialog' : 'navigation'" :aria-modal="compact && menuOpen ? 'true' : undefined" aria-label="后台主导航" tabindex="-1">
			<button class="admin-drawer-close" aria-label="关闭后台导航" v-bind="h5Button(closeMenu)" @tap="closeMenu">×</button>
			<view class="admin-brand"><text class="admin-brand-mark">☯</text><view><text class="admin-brand-name">玄学 · AI</text><text class="admin-brand-caption">ADMIN WORKSPACE</text></view></view>
			<view class="admin-workspace-badge"><text class="admin-status-dot" />管理工作台</view>
			<view v-for="group in navigation" :key="group.label" class="admin-nav-group">
				<text class="admin-nav-label">{{ group.label }}</text>
				<button v-for="item in group.items" :key="item.path" class="admin-nav-item" :class="{ 'is-active': activeRoute === item.path }" :data-admin-route="item.path" :aria-current="activeRoute === item.path ? 'page' : undefined" v-bind="h5Button(() => go(item.path))" @tap="go(item.path)">
					<text class="admin-nav-icon" aria-hidden="true">{{ item.icon }}</text><text>{{ item.label }}</text><text v-if="activeRoute === item.path" class="admin-nav-dot" aria-hidden="true">•</text>
				</button>
			</view>
			<view class="admin-sidebar-footer"><text>清晰掌握每一项服务</text><text>账号 · 记录 · AI · 配置</text></view>
		</view>
		<view v-if="menuOpen" class="admin-nav-scrim" aria-hidden="true" @tap="closeMenu" />
		<view class="admin-topbar">
			<view class="admin-topbar-leading"><button class="admin-menu-toggle" aria-label="打开后台导航" aria-controls="admin-sidebar" :aria-expanded="menuOpen" v-bind="h5Button(toggleMenu)" @tap="toggleMenu">☰</button><text class="admin-breadcrumb">{{ activeLabel }}</text><text class="admin-topbar-caption">管理工作台</text></view>
			<view class="admin-topbar-actions"><button class="admin-palette-trigger" aria-label="切换后台配色" aria-haspopup="dialog" :aria-expanded="paletteOpen" v-bind="h5Button(openPalette)" @tap="openPalette"><text class="admin-palette-dot" />{{ paletteName }}<text aria-hidden="true">⌄</text></button><view class="admin-account"><text class="admin-avatar">{{ accountInitial }}</text><text class="admin-account-name">{{ accountName }}</text></view><button class="admin-logout" aria-label="退出管理员登录" v-bind="h5Button(logout)" @tap="logout">退出</button></view>
		</view>
		<view v-if="paletteOpen" class="admin-palette-overlay" @tap.self="paletteOpen = false">
			<view ref="paletteDialog" class="admin-palette-dialog" role="dialog" aria-modal="true" aria-label="后台渐变配色" tabindex="-1"><view class="admin-palette-heading"><view><text class="admin-eyebrow">APPEARANCE</text><h2>选择你的工作台配色</h2></view><button aria-label="关闭配色选择" class="admin-dialog-close" v-bind="h5Button(() => paletteOpen = false)" @tap="paletteOpen = false">×</button></view><text class="admin-palette-description">与用户端一致的渐变，让管理工作也清晰舒适。</text><button v-for="item in palettes" :key="item.id" class="admin-palette-option" :class="{ 'is-selected': palette === item.id }" :data-admin-palette-option="item.id" :aria-pressed="palette === item.id" v-bind="h5Button(() => choosePalette(item.id))" @tap="choosePalette(item.id)"><text class="admin-palette-swatch" :style="{ background: `linear-gradient(115deg, ${item.colors.join(',')})` }" /><view><text class="admin-palette-name">{{ item.name }}</text><text class="admin-palette-hint">{{ item.description }}</text></view><text class="admin-palette-check" aria-hidden="true">{{ palette === item.id ? '✓' : '' }}</text></button></view>
		</view>
	</view>
</template>

<script setup lang="ts">
/* global getCurrentPages */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { useUserStore } from '@/store/user';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';
import { useAdminTheme } from '@/features/admin/theme';

const userStore = useUserStore();
const { palette, paletteName, palettes, selectPalette } = useAdminTheme();
const menuOpen = ref(false);
const paletteOpen = ref(false);
const sidebar = ref<any>(null);
const paletteDialog = ref<any>(null);
const compact = ref(false);
const activeRoute = ref('/pages/admin/dashboard');
const navigation = [
	{ label: '日常管理', items: [
		{ label: '管理总览', path: '/pages/admin/dashboard', icon: '◈' },
		{ label: '用户管理', path: '/pages/admin/users', icon: '♙' },
		{ label: '排盘记录', path: '/pages/admin/records', icon: '▤' },
		{ label: '六爻记录', path: '/pages/admin/liuyao-records', icon: '☷' },
	] },
	{ label: 'AI 与服务', items: [
		{ label: '模型配置', path: '/pages/admin/llm-config', icon: '✧' },
		{ label: '用户额度', path: '/pages/admin/llm-quota', icon: '◉' },
		{ label: '额度规则', path: '/pages/admin/quota-config', icon: '↻' },
		{ label: '邮件服务', path: '/pages/admin/email-config', icon: '✉' },
	] },
	{ label: '内容与统计', items: [
		{ label: '公告管理', path: '/pages/admin/announcements', icon: '☷' },
		{ label: '访问统计', path: '/pages/admin/analytics-stats', icon: '▥' },
	] },
];
const activeLabel = computed(() => navigation.flatMap(group => group.items).find(item => item.path === activeRoute.value)?.label || '管理工作台');
const accountName = computed(() => userStore.username || userStore.email || '管理员');
const accountInitial = computed(() => accountName.value.slice(0, 1).toUpperCase());
const drawerActive = computed(() => compact.value && menuOpen.value);
useModalFocus(drawerActive, sidebar, () => { menuOpen.value = false; });
useModalFocus(paletteOpen, paletteDialog, () => { paletteOpen.value = false; });
function closeMenu() { menuOpen.value = false; }
function toggleMenu() { paletteOpen.value = false; menuOpen.value = !menuOpen.value; }
function openPalette() { closeMenu(); paletteOpen.value = true; }
function choosePalette(id: string) { selectPalette(id); paletteOpen.value = false; }
function syncRoute() {
	// #ifdef H5
	if (typeof window !== 'undefined') {
		const hashRoute = window.location.hash.slice(1).split('?')[0];
		if (navigation.some(group => group.items.some(item => item.path === hashRoute))) {
			activeRoute.value = hashRoute;
			return;
		}
	}
	// #endif
	const pages = getCurrentPages();
	const route = pages[pages.length - 1]?.route;
	if (route) activeRoute.value = '/' + route.replace(/^\//, '');
}
function updateSize() {
	// #ifdef H5
	if (typeof window !== 'undefined') compact.value = window.innerWidth <= 1024;
	// #endif
	if (!compact.value) closeMenu();
}
function go(path: string) {
	closeMenu();
	if (path === activeRoute.value) return;
	uni.navigateTo({ url: path });
}
async function logout() {
	closeMenu();
	await userStore.logout();
	uni.reLaunch({ url: '/pages/auth/auth' });
}
onShow(syncRoute);
onHide(() => { closeMenu(); paletteOpen.value = false; });
onMounted(() => {
	userStore.restoreAuth();
	syncRoute();
	updateSize();
	// #ifdef H5
	if (typeof window !== 'undefined') {
		window.addEventListener('resize', updateSize);
		window.addEventListener('hashchange', syncRoute);
	}
	// #endif
});
onUnmounted(() => {
	// #ifdef H5
	if (typeof window !== 'undefined') {
		window.removeEventListener('resize', updateSize);
		window.removeEventListener('hashchange', syncRoute);
	}
	// #endif
});
const navbarHeight = computed(() => compact.value ? 64 : 79);
const totalHeaderHeight = navbarHeight;
const iconSize = computed(() => 28);
defineExpose({ navbarHeight, totalHeaderHeight, iconSize });
</script>
