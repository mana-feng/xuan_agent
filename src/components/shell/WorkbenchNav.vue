<template>
  <view ref="sidebar" class="x-sidebar" :class="{ 'is-open': menuOpen }" :role="compact && menuOpen ? 'dialog' : 'navigation'" :aria-modal="compact && menuOpen ? 'true' : undefined" aria-label="主导航" tabindex="-1">
    <button class="x-drawer-close" aria-label="收起侧边栏" v-bind="h5Button(closeMenu)" @tap="closeMenu">×</button>
    <view class="x-brand" v-bind="h5Button(() => go('/pages/agent/index'))" @tap="go('/pages/agent/index')">
      <text class="x-brand-mark">☯</text><view><text class="x-brand-name">玄学 · AI</text><text class="x-brand-en">PATTERNS & POSSIBILITIES</text></view>
    </view>
    <button class="x-new" v-bind="h5Button(() => go('/pages/agent/index'))" @tap="go('/pages/agent/index')">＋ 开始探索</button>
    <text class="x-nav-label">探索工作台</text>
    <view class="x-nav-list">
      <view v-for="item in navigation" :key="item.path" class="x-nav-item" :class="{ active: active === item.key }" v-bind="h5Button(() => go(item.path))" :aria-current="active === item.key ? 'page' : undefined" @tap="go(item.path)">
        <text class="x-nav-symbol">{{ item.icon }}</text><text>{{ item.label }}</text><text v-if="active === item.key" class="x-nav-dot">•</text>
      </view>
    </view>
    <view class="x-side-note"><text class="x-note-orbit">☷</text><text class="x-note-title">以古老智慧，观当下生活</text><text>把命盘作为了解自己的另一个视角，让选择回到自己手中。</text></view>
    <view class="x-side-footer"><view v-bind="h5Button(announcements)" @tap="announcements">☷ 公告</view><view v-bind="h5Button(() => go('/pages/about/index'))" @tap="go('/pages/about/index')">关于我们 ↗</view></view>
  </view>
  <view v-if="menuOpen" class="x-menu-scrim" aria-hidden="true" @tap="closeMenu" />
  <view class="x-topbar">
    <view class="x-topbar-left"><button class="x-menu-toggle" v-bind="h5Button(() => menuOpen = !menuOpen)" aria-label="展开导航" :aria-expanded="menuOpen" @tap="menuOpen = !menuOpen">☰</button><text class="x-breadcrumb">{{ activeLabel }}</text><text class="x-topbar-divider">/</text><text class="x-topbar-caption">让每一次探索，更了解自己</text></view>
    <view class="x-topbar-right"><button class="x-palette" v-bind="h5Button(openPalette)" aria-label="选择渐变配色" aria-haspopup="dialog" :aria-expanded="paletteOpen" @tap="openPalette"><text class="x-palette-dot" />{{ paletteName }}⌄</button><UserAvatarDropdown /></view>
  </view>
  <PaletteDialog v-if="paletteOpen" :palette="palette" @select="selectPalette" @close="paletteOpen = false" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import UserAvatarDropdown from '@/components/UserAvatarDropdown.vue';
import PaletteDialog from './PaletteDialog.vue';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';
import { useWorkbenchTheme } from '@/features/workbench/theme';
const { palette, paletteName, changePalette } = useWorkbenchTheme();
const paletteOpen = ref(false);
const menuOpen = ref(false);
const compact = ref(false);
const sidebar = ref();
const closeMenu = () => { menuOpen.value = false; };
useModalFocus(computed(() => compact.value && menuOpen.value), sidebar, closeMenu);
let stopWatchingSize: (() => void) | undefined;
const active = ref('agent');
const navigation = [
  { key: 'agent', label: 'AI 探索', short: '探索', icon: '✧', path: '/pages/agent/index' },
  { key: 'bazi', label: '八字命理', short: '八字', icon: '☷', path: '/pages/index/index' },
  { key: 'ziwei', label: '紫微斗数', short: '紫微', icon: '✳', path: '/pages/ziwei/index' },
  { key: 'liuyao', label: '六爻问事', short: '六爻', icon: '☰', path: '/pages/liuyao/index' },
  { key: 'qimen', label: '奇门遁甲', short: '奇门', icon: '▦', path: '/pages/qimen/index' },
  { key: 'history', label: '历史记录', short: '记录', icon: '◷', path: '/pages/history/list' },
];
const activeLabel = computed(() => navigation.find(item => item.key === active.value)?.label || (active.value === 'chat' ? 'AI 对话' : '个人中心'));
function updateActive() {
  const pages = getCurrentPages();
  const route = pages[pages.length - 1]?.route || '';
  active.value = route.includes('/index/') ? 'bazi' : route.split('/')[1] || 'agent';
}
function go(path: string) {
  menuOpen.value = false;
  const pages = getCurrentPages();
  if ('/' + pages[pages.length - 1]?.route === path) return;
  uni.reLaunch({ url: path });
}
function announcements() { menuOpen.value = false; uni.$emit('openAnnouncements'); }
function openPalette() {
  closeMenu();
  paletteOpen.value = true;
}
function selectPalette(index: number) {
  changePalette(index);
  paletteOpen.value = false;
}
onMounted(() => {
  updateActive();
  // #ifdef H5
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const media = window.matchMedia('(max-width: 1024px)');
  const syncSize = () => { compact.value = media.matches; if (!media.matches) closeMenu(); };
  syncSize();
  media.addEventListener('change', syncSize);
  stopWatchingSize = () => media.removeEventListener('change', syncSize);
  // #endif
});
onUnmounted(() => stopWatchingSize?.());
onShow(updateActive);
</script>
