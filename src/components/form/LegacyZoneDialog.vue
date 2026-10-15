<template>
	<view class="legacy-backdrop x-workbench" :data-palette="palette" @tap.self="emit('close')"
		><view
			ref="dialog"
			class="legacy-dialog"
			role="dialog"
			aria-modal="true"
			aria-label="补充原排盘时区"
			tabindex="-1"
		>
			<h2>补充原排盘时区</h2>
			<text class="legacy-copy"
				>这条旧记录没有保存原时区，无法确定原来的钟表日期。请选择当初排盘所用的时区；仍沿用旧版子时和闰月规则。</text
			>
			<CalendarSettings v-model:time-zone="zone" :rules="DEFAULT_CALENDAR_RULES" legacy />
			<view v-if="needsOccurrence" class="legacy-actions"
				><button
					v-for="v in occurrences"
					:key="v.id"
					:class="{ primary: occurrence === v.id }"
					v-bind="h5Button(() => (occurrence = v.id))"
					@tap="occurrence = v.id"
				>
					{{ v.label }}
				</button></view
			>
			<text v-if="error" class="legacy-copy" role="alert">{{ error }}</text>
			<text class="legacy-copy"
				>若不确定原时区，请先取消并核对原记录。仅选择时区不会改写本机里的记录。</text
			>
			<view class="legacy-actions"
				><button v-bind="h5Button(() => emit('close'))" @tap="emit('close')">取消</button
				><button
					class="primary"
					v-bind="h5Button(() => emit('confirm', zone, occurrence))"
					@tap="emit('confirm', zone, occurrence)"
				>
					按此时区打开
				</button></view
			>
		</view></view
	>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import CalendarSettings from './CalendarSettings.vue';
import { DEFAULT_CALENDAR_RULES } from '@/utils/calendarContext';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';
import { useWorkbenchTheme } from '@/features/workbench/theme';
import type { Disambiguation } from '@/utils/chartTime';
defineProps<{ needsOccurrence?: boolean; error?: string }>();
const emit = defineEmits<{
	(e: 'close'): void;
	(e: 'confirm', zone: string, choice: Disambiguation): void;
}>();
const occurrence = ref<Disambiguation>('reject');
const occurrences = [
	{ id: 'reject', label: '重复时刻需确认' },
	{ id: 'earlier', label: '较早一次' },
	{ id: 'later', label: '较晚一次' },
] as const;
const zone = ref('Asia/Shanghai'),
	dialog = ref();
const { palette } = useWorkbenchTheme();
useModalFocus(ref(true), dialog, () => emit('close'));
</script>
<style scoped>
.legacy-backdrop {
	position: fixed;
	inset: 0;
	z-index: 10020;
	background: #17374766;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
}
.legacy-dialog {
	position: relative;
	width: 100%;
	max-width: 580px;
	max-height: 85dvh;
	overflow: auto;
	background: var(--x-paper, #fff);
	border-radius: 20px;
	padding: 24px;
	color: var(--x-body, #315466);
	box-shadow: 0 20px 70px #17374733;
}
.legacy-dialog h2 {
	font-size: 20px;
	margin: 0 0 12px;
	color: var(--x-ink, #173747);
}
.legacy-copy {
	display: block;
	font-size: 13px;
	line-height: 1.8;
}
.legacy-actions {
	display: flex;
	flex-direction: row;
	gap: 12px;
	margin-top: 20px;
}
.legacy-actions button {
	flex: 1;
	margin: 0;
	padding: 10px;
	border: 1px solid var(--x-line, #d8e5ed);
	border-radius: 9px;
	background: var(--x-paper, #fff);
	color: inherit;
	font-size: 14px;
	line-height: 1.6;
}
.legacy-actions .primary {
	background: var(--x-gradient, linear-gradient(110deg, #1672b1, #11816b));
	color: #fff;
}
.legacy-actions button::after {
	border: 0;
}
</style>
