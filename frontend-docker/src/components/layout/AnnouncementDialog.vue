<template>
	<view class="announcement-backdrop" @tap.self="emit('close')">
		<view ref="dialog" class="announcement-dialog" role="dialog" aria-modal="true" aria-label="公告" tabindex="-1">
			<view class="announcement-header">
				<view class="announcement-heading"><text class="announcement-symbol" aria-hidden="true">☷</text><view><h2>公告</h2><text class="announcement-subtitle">产品更新与使用提醒</text></view></view>
				<button class="announcement-close" aria-label="关闭公告" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">×</button>
			</view>
			<view class="announcement-body" tabindex="0" role="region" aria-label="公告内容" :aria-busy="loading">
				<view v-if="loading && !announcements.length" class="announcement-state" role="status"><view class="announcement-spinner" /><text>正在加载公告…</text></view>
				<template v-else>
					<view v-if="error" class="announcement-error" role="alert"><text>{{ announcements.length ? '更新暂未完成，以下为已缓存公告。' : '暂时无法读取公告' }}</text><text class="announcement-error-detail">{{ error }}</text><button class="announcement-retry" v-bind="h5Button(() => emit('retry'), loading)" :disabled="loading" @tap="emit('retry')">{{ loading ? '重新加载中…' : '重新加载' }}</button></view>
					<view v-if="announcements.length" class="announcement-list">
						<view v-for="(item, index) in announcements" :key="item.id" class="announcement-item">
							<text class="announcement-index">NOTICE {{ String(index + 1).padStart(2, '0') }}</text>
							<h3>{{ item.title }}</h3>
							<text v-if="item.expiresAt" class="announcement-expiry">有效期至 {{ item.expiresAt.replace('T', ' ').slice(0, 16) }}</text>
							<text class="announcement-content" selectable>{{ item.content }}</text>
						</view>
					</view>
					<view v-else-if="!error" class="announcement-state"><text class="announcement-empty-symbol" aria-hidden="true">☷</text><text>暂无公告</text><text class="announcement-subtitle">有新的消息时，会在这里与你见面。</text></view>
				</template>
			</view>
			<view class="announcement-footer"><text>{{ loading ? '正在更新…' : announcements.length ? `共 ${announcements.length} 条公告` : '玄学 · AI' }}</text><button class="announcement-done" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">知道了</button></view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Announcement } from '@/services/api/announcement';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';
defineProps<{ announcements: Announcement[]; loading: boolean; error: string }>();
const emit = defineEmits<{ (event: 'close'): void; (event: 'retry'): void }>();
const dialog = ref();
useModalFocus(ref(true), dialog, () => emit('close'));
</script>

<style scoped>
.announcement-backdrop { position:fixed; inset:0; z-index:2000; display:flex; flex-direction:row; justify-content:center; align-items:center; padding:24px; background:rgba(20,43,52,.42); backdrop-filter:blur(5px); }
.announcement-dialog { width:100%; max-width:600px; max-height:calc(100dvh - 48px); display:flex; flex-direction:column; flex-shrink:1; min-height:0; overflow:hidden; background:var(--x-paper); border:1px solid var(--x-line); border-radius:20px; box-shadow:0 24px 100px #163a4940; color:var(--x-ink); }
.announcement-header { display:flex; flex-direction:row; justify-content:space-between; align-items:center; gap:16px; padding:24px 28px; flex-shrink:0; background:var(--x-gradient-soft); border-bottom:1px solid var(--x-line); }
.announcement-heading { display:flex; flex-direction:row; align-items:center; gap:14px; min-width:0; }
.announcement-symbol { display:flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:13px; color:white; background:var(--x-gradient); font-size:24px; }
.announcement-heading h2 { margin:0 0 3px; font:600 25px/1.4 var(--x-serif); color:var(--x-ink); }
.announcement-subtitle { color:var(--x-muted); font-size:12px; line-height:1.8; }
.announcement-close { width:40px; height:40px; min-height:40px; padding:0; display:flex; flex-direction:row; align-items:center; justify-content:center; border:1px solid var(--x-line); border-radius:50%; background:var(--x-paper); color:var(--x-body); font-size:24px; flex-shrink:0; }
.announcement-body { min-height:0; flex:1 1 auto; overflow-y:auto; overscroll-behavior:contain; padding:26px 28px; scrollbar-gutter:stable; }
.announcement-list { display:flex; flex-direction:column; gap:26px; }
.announcement-item { display:flex; flex-direction:column; align-items:stretch; gap:9px; }
.announcement-item + .announcement-item { border-top:1px solid var(--x-line); padding-top:24px; }
.announcement-index { color:var(--x-accent); letter-spacing:1.5px; font-size:10px; }
.announcement-item h3 { margin:0; font-size:17px; font-weight:600; line-height:1.7; overflow-wrap:anywhere; }
.announcement-expiry { font-size:11px; color:var(--x-muted); }
.announcement-content { display:block; font-size:14px; line-height:1.9; color:var(--x-body); white-space:pre-wrap; overflow-wrap:anywhere; }
.announcement-footer { display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; padding:16px 28px; border-top:1px solid var(--x-line); color:var(--x-muted); font-size:12px; flex-shrink:0; }
.announcement-done { background:var(--x-gradient); color:white; border-radius:9px; min-width:100px; padding:12px 22px; font-size:13px; }
.announcement-state { min-height:130px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--x-body); text-align:center; font-size:14px; }
.announcement-empty-symbol { font-size:26px; color:var(--x-accent); }
.announcement-spinner { width:24px; height:24px; border:2px solid var(--x-line); border-top-color:var(--x-accent); border-radius:50%; animation:announcement-spin 1s linear infinite; }
.announcement-error { display:flex; flex-direction:column; align-items:flex-start; gap:9px; padding:16px; border-radius:10px; color:#9a5437; background:#fff4e8; font-size:13px; margin-bottom:18px; }
.announcement-error-detail { font-size:12px; line-height:1.7; overflow-wrap:anywhere; }
.announcement-retry { font-size:12px; color:var(--x-accent); padding:9px 14px; border:1px solid var(--x-line); border-radius:7px; background:var(--x-paper); }
@keyframes announcement-spin { to { transform:rotate(360deg); } }
@media(max-width:600px) { .announcement-backdrop { padding:16px 12px; padding-top:max(16px,env(safe-area-inset-top)); padding-bottom:max(16px,env(safe-area-inset-bottom)); } .announcement-dialog { max-height:calc(100dvh - max(16px,env(safe-area-inset-top)) - max(16px,env(safe-area-inset-bottom))); border-radius:16px; } .announcement-header { padding:20px 18px; } .announcement-heading { gap:11px; } .announcement-heading h2 { font-size:23px; } .announcement-body { padding:22px 18px; } .announcement-footer { padding:14px 18px; } }
@media(prefers-reduced-motion:reduce) { .announcement-spinner { animation:none; } }
</style>
