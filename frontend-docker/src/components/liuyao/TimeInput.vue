<template>
	<view class="casting-time">
		<view class="casting-heading"
			><text class="casting-title">{{ label }}</text
			><text class="casting-zone">设备本地时间</text></view
		>
		<view class="casting-card">
			<view class="casting-main">
				<text class="casting-clock-icon">◷</text>
				<view class="casting-value">
					<text class="casting-source">{{
						modelValue ? (source === 'now' ? '已取当前时间' : '已指定时间') : '请选择时间'
					}}</text>
					<text class="casting-date">{{ dateText || placeholder }}</text>
					<text class="casting-clock">{{ clockText || '--:--' }}</text>
				</view>
			</view>
			<view class="casting-actions">
				<button v-bind="h5Button(() => emit('open'))" class="casting-edit" @tap="$emit('open')">
					修改时间
				</button>
				<button
					v-bind="h5Button(() => emit('useNow'))"
					class="casting-reset"
					@tap="$emit('useNow')"
				>
					◷　恢复现在
				</button>
			</view>
		</view>
		<text class="casting-hint"
			>{{
				source === 'now'
					? '已记录当前时刻，不会随等待自动变化。'
					: '本次排盘会使用你指定的起卦时刻。'
			}}
			起卦时间与出生时间分别保存。</text
		>
	</view>
</template>
<script lang="ts" setup>
import { h5Button } from '@/utils/keyboard';
import { computed } from 'vue';
const props = defineProps({
	modelValue: { type: String, default: '' },
	label: { type: String, default: '起卦时间' },
	placeholder: { type: String, default: '请选择起卦日期与时间' },
	source: { type: String, default: 'now' },
});
const emit = defineEmits(['update:modelValue', 'open', 'useNow']);
const dateText = computed(() => props.modelValue.split(' ')[0]?.replace(/[-/]/g, ' / '));
const clockText = computed(() => props.modelValue.split(' ')[1]?.slice(0, 5));
</script>
<style scoped>
.casting-time {
	width: 100%;
}
.casting-heading {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 18px;
}
.casting-title {
	font-family: var(--x-serif, SimSun, serif);
	font-size: 21px;
	color: var(--x-ink, #233e49);
}
.casting-zone {
	font-size: 10px;
	color: var(--x-muted, #667d82);
	background: var(--x-tint, #e7f4fc);
	padding: 5px 9px;
	border-radius: 20px;
	white-space: nowrap;
}
.casting-card {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
	gap: 20px;
	padding: 22px;
	border: 1px solid var(--x-line, #dbe9ed);
	border-radius: 12px;
	background: var(--x-gradient-soft, linear-gradient(125deg, #e7f4fc, #fff, #e6f6ed));
}
.casting-main {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 15px;
	min-width: 0;
}
.casting-clock-icon {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
	width: 44px;
	height: 46px;
	border-radius: 12px;
	font-size: 29px;
	background: var(--x-tint, #e7f4fc);
	color: var(--x-accent, #1672b1);
}
.casting-value {
	display: flex;
	flex-direction: column;
	gap: 3px;
}
.casting-source {
	font-size: 10px;
	color: var(--x-accent, #1672b1);
	margin-bottom: 3px;
}
.casting-date {
	font-size: 15px;
	color: var(--x-ink, #233e49);
	letter-spacing: 0.03em;
}
.casting-clock {
	font-size: 31px;
	color: var(--x-accent, #1672b1);
	line-height: 1.4;
	font-variant-numeric: tabular-nums;
}
.casting-actions {
	display: flex;
	flex-direction: column;
	gap: 5px;
	flex-shrink: 0;
}
.casting-edit,
.casting-reset {
	margin: 0;
	padding: 8px 15px;
	line-height: 21px;
	font-size: 12px;
	color: var(--x-accent, #1672b1);
	border-radius: 7px;
}
.casting-edit {
	border: 1px solid var(--x-line, #dbe9ed);
	background: var(--x-paper, #fff);
}
.casting-reset {
	background: transparent;
}
button::after {
	border: 0;
}
.casting-hint {
	display: block;
	margin-top: 11px;
	font-size: 11px;
	line-height: 1.85;
	color: var(--x-muted, #667d82);
}
@media (max-width: 520px) {
	.casting-card {
		padding: 18px;
		flex-direction: column;
		align-items: stretch;
		gap: 16px;
	}
	.casting-actions {
		flex-direction: row;
		border-top: 1px solid var(--x-line, #dbe9ed);
		padding-top: 13px;
		gap: 10px;
	}
	.casting-actions button {
		flex: 1;
	}
}
</style>
