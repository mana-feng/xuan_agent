<template>
	<view class="time-card">
		<view class="time-card-heading">
			<text class="time-card-title">{{ label }}</text>
			<text class="time-card-zone">{{ zone }}</text>
		</view>
		<view v-if="$slots.before" class="time-card-options"><slot name="before" /></view>
		<view class="time-card-surface">
			<view class="time-card-main">
				<text class="time-card-icon" aria-hidden="true">◷</text>
				<view class="time-card-value">
					<text class="time-card-status">{{ status }}</text>
					<text class="time-card-date">{{ date || '请选择日期' }}</text>
					<text class="time-card-clock">{{ clock || '--:--' }}</text>
				</view>
			</view>
			<view class="time-card-actions">
				<button class="time-card-edit" v-bind="h5Button(() => emit('edit'))" @tap="emit('edit')">修改时间</button>
				<button v-if="allowNow" class="time-card-now" v-bind="h5Button(() => emit('now'))" @tap="emit('now')">恢复现在</button>
			</view>
			<view v-if="alternate" class="time-card-alternate">
				<text class="time-card-alternate-label">{{ alternateLabel }}</text>
				<text class="time-card-alternate-value">{{ alternate }}</text>
			</view>
		</view>
		<text v-if="hint" class="time-card-hint">{{ hint }}</text>
	</view>
</template>

<script setup lang="ts">
import { h5Button } from '@/utils/keyboard';
defineProps({
	label: { type: String, required: true },
	zone: { type: String, default: '设备本地时间' },
	date: { type: String, default: '' },
	clock: { type: String, default: '' },
	status: { type: String, default: '公历日期 · 精确到分钟' },
	allowNow: { type: Boolean, default: false },
	alternateLabel: { type: String, default: '' },
	alternate: { type: String, default: '' },
	hint: { type: String, default: '' },
});
const emit = defineEmits(['edit', 'now']);
</script>

<style scoped>
.time-card { display: block; width: 100%; min-width: 0; }
.time-card-heading { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.time-card-title { font: 500 19px/1.5 var(--x-serif, SimSun, serif); color: var(--x-ink, #233e49); flex-shrink: 0; }
.time-card-zone { padding: 4px 9px; border-radius: 20px; background: var(--x-tint, #e7f4fc); color: var(--x-muted, #667d82); font-size: 10px; line-height: 1.6; overflow-wrap: anywhere; text-align: right; }
.time-card-options { display: block; margin-bottom: 14px; }
.time-card-surface { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 20px; padding: 20px; border: 1px solid var(--x-line, #dbe9ed); border-radius: 12px; background: var(--x-gradient-soft, linear-gradient(125deg, #e7f4fc, #e6f6ed)); }
.time-card-main { display: flex; flex-direction: row; align-items: center; gap: 14px; min-width: 0; }
.time-card-icon { display: flex; flex-direction: row; align-items: center; justify-content: center; width: 38px; height: 42px; flex-shrink: 0; color: var(--x-accent, #1672b1); font-size: 26px; }
.time-card-value { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.time-card-status { color: var(--x-muted, #667d82); font-size: 11px; line-height: 1.5; }
.time-card-date { color: var(--x-ink, #233e49); font-size: 15px; line-height: 1.6; overflow-wrap: anywhere; }
.time-card-clock { color: var(--x-accent, #1672b1); font-size: 28px; font-weight: 500; line-height: 1.25; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.time-card-actions { display: flex; flex-direction: column; gap: 4px; }
.time-card-edit, .time-card-now { box-sizing: border-box; display: flex; flex-direction: row; align-items: center; justify-content: center; margin: 0; min-height: 44px; padding: 9px 16px; border-radius: 8px; color: var(--x-accent, #1672b1); font-size: 12px; line-height: 24px; white-space: nowrap; cursor: pointer; }
.time-card-edit { background: var(--x-paper, #fff); border: 1px solid var(--x-line, #dbe9ed); }
.time-card-now { background: transparent; }
.time-card-actions button::after { border: 0; }
.time-card-actions button:focus-visible { outline: 2px solid var(--x-accent, #1672b1); outline-offset: 3px; }
.time-card-alternate { display: flex; flex-direction: row; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 5px 16px; grid-column: 1 / -1; border-top: 1px solid var(--x-line, #dbe9ed); padding-top: 12px; margin-top: 16px; font-size: 12px; line-height: 1.8; }
.time-card-alternate-label { color: var(--x-muted, #667d82); flex-shrink: 0; }
.time-card-alternate-value { color: var(--x-ink, #233e49); overflow-wrap: anywhere; }
.time-card-hint { display: block; margin-top: 10px; font-size: 11px; line-height: 1.8; color: var(--x-muted, #667d82); }
@media (max-width: 520px) {
	.time-card-surface { grid-template-columns: minmax(0, 1fr); padding: 16px; }
	.time-card-actions { flex-direction: row; gap: 10px; border-top: 1px solid var(--x-line, #dbe9ed); margin-top: 14px; padding-top: 12px; }
	.time-card-actions button { flex: 1; }
	.time-card-alternate { margin-top: 12px; }
	.time-card-main { gap: 10px; }
}
</style>
