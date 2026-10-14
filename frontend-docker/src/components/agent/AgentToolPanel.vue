<template>
	<view class="tool-section">
		<view class="tools-heading">
			<text>选择一种方式，开始探索</text>
			<text class="tools-caption">也可以直接排盘</text>
		</view>
		<view class="tool-grid">
			<view v-for="card in toolCards" :key="card.target" class="tool-card">
				<view class="tool-card__head">
					<view class="tool-card__icon">
						<tm-icon :name="card.icon" :font-size="26" color="var(--x-accent)"></tm-icon>
					</view>
					<view class="tool-card__title-wrap">
						<text class="tool-card__title">{{ card.title }}</text>
						<text class="tool-card__subtitle">{{ card.subtitle }}</text>
					</view>
				</view>
				<text class="tool-card__summary">{{ card.summary }}</text>
				<view class="tool-card__tags">
					<text v-for="badge in card.badges" :key="badge" class="tool-card__tag">{{ badge }}</text>
				</view>
				<view class="tool-card__actions">
					<button class="tool-btn tool-btn--primary" v-bind="h5Button(() => emit('open-target', card.target))" :aria-label="'立即打开' + card.title" @tap="emit('open-target', card.target)">开始排盘 ↗</button>
					<button class="tool-btn tool-btn--secondary" v-bind="h5Button(() => emit('quick-prompt', card.prompt))" :aria-label="'让 Agent 帮我用' + card.title" @tap="emit('quick-prompt', card.prompt)">问问 AI</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import type { AgentTarget, ToolCard } from '@/features/agent/types';
import { h5Button } from '@/utils/keyboard';

defineProps<{
	toolCards: ToolCard[];
}>();

const emit = defineEmits<{
	(event: 'open-target', target: AgentTarget): void;
	(event: 'quick-prompt', prompt: string): void;
}>();
</script>

<style scoped>
.tool-section { padding-top:16px; }
.tools-heading { display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:15px; margin-bottom:16px; font-size:16px; font-weight:600; color:var(--x-ink); }
.tools-caption { font-size:12px; font-weight:400; color:var(--x-muted); }
.tool-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
.tool-card { display:flex; flex-direction:column; min-width:0; gap:14px; padding:20px; background:var(--x-paper); border:1px solid var(--x-line); border-radius:15px; transition:border-color .2s; }
.tool-card:hover { border-color:var(--x-accent); }
.tool-card__head { display:flex; flex-direction:row; align-items:center; gap:12px; }
.tool-card__icon { width:40px; height:40px; display:flex; flex-direction:row; align-items:center; justify-content:center; border-radius:11px; background:var(--x-gradient-soft); flex-shrink:0; }
.tool-card:nth-child(2) .tool-card__icon { background:#eaf2fb; }
.tool-card:nth-child(3) .tool-card__icon { background:#e7f5ed; }
.tool-card:nth-child(4) .tool-card__icon { background:#e6f4f3; }
.tool-card__title-wrap { display:flex; flex-direction:column; min-width:0; gap:5px; }
.tool-card__title { font-size:17px; font-family:var(--x-serif); font-weight:600; color:var(--x-ink); }
.tool-card__subtitle { font-size:12px; line-height:1.6; color:var(--x-muted); }
.tool-card__summary { font-size:13px; line-height:1.8; color:var(--x-body); flex:1; }
.tool-card__tags { display:flex; flex-direction:row; flex-wrap:wrap; gap:6px; }
.tool-card__tag { font-size:12px; line-height:1.5; color:var(--x-body); background:var(--x-bg); padding:4px 7px; border-radius:5px; }
.tool-card__actions { display:flex; flex-direction:row; align-items:center; gap:8px; border-top:1px solid var(--x-line); padding-top:12px; }
.tool-btn { min-height:40px; margin:0; padding:0 10px; font-size:13px; line-height:1.5; border:0; border-radius:8px; background:transparent; display:flex; flex-direction:row; align-items:center; justify-content:center; white-space:nowrap; }
.tool-btn::after { border:0; }
.tool-btn--primary { flex:1; background:var(--x-gradient); color:#fff; font-weight:600; }
.tool-btn--secondary { flex-shrink:0; color:var(--x-body); }
/* #ifdef H5 */
.tool-btn:focus-visible { outline:3px solid var(--x-accent); outline-offset:3px; }
/* #endif */
@media(max-width:1280px) { .tool-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:570px) { .tool-grid { grid-template-columns:1fr; gap:12px; } .tool-card { padding:18px; } .tools-caption { display:none; } }
</style>
