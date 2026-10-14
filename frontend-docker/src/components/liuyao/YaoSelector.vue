<template>
	<view class="yao-selector-item">
		<text class="yao-label">{{ label }}</text>
		<picker
			ref="pickerControl"
			mode="selector"
			:range="options"
			range-key="label"
			:value="selectedIndex"
			@change="onChange"
		>
			<view
				class="picker-trigger"
				v-bind="h5Button(openPicker)"
				:aria-label="'选择' + label + '，当前' + (displayName || '未选择')"
				aria-haspopup="dialog"
			>
				<view class="picker-content">
					<text v-if="displaySymbol" class="yao-symbol">{{ displaySymbol }}</text>
					<text v-if="displayName" class="yao-name">{{ displayName }}</text>
				</view>
				<text class="yao-chevron">⌄</text>
			</view>
		</picker>
	</view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { h5Button } from '@/utils/keyboard';
import { getYaoName } from '@/features/liuyao/uiHelpers';

const props = defineProps({
	modelValue: { type: [String, Number], default: '' },
	options: { type: Array as () => Array<any>, required: true },
	label: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'change']);
const pickerControl = ref<any>(null);
function openPicker() {
	// #ifdef H5
	const target = pickerControl.value?.$el || pickerControl.value;
	target?.click?.();
	// #endif
}

const selectedIndex = computed(() => {
	const idx = props.options.findIndex((opt) => String(opt.value) === String(props.modelValue));
	return idx >= 0 ? idx : 0;
});

const displaySymbol = computed(() => {
	const opt = props.options[selectedIndex.value];
	if (!opt) return '';
	return opt.symbol || opt.label || '';
});

const displayName = computed(() => {
	const opt = props.options[selectedIndex.value];
	if (!opt) return '';
	const v = opt.value;
	if (v === '' || v === null || v === undefined) return '';
	return opt.name || getYaoName(v);
});

function onChange(e: any) {
	const idx = e.detail.value;
	const opt = props.options[idx];
	emit('update:modelValue', String(opt.value));
	emit('change', e);
}
</script>

<style scoped>
.yao-selector-item {
	display: grid;
	grid-template-columns: 45px minmax(0, 1fr);
	gap: 15px;
	align-items: center;
}
.yao-label {
	font-size: 12px;
	color: var(--x-muted, #667d82);
}
.picker-trigger {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	min-height: 43px;
	box-sizing: border-box;
	background: var(--x-paper, #fff);
	border: 1px solid var(--x-line, #dbe9ed);
	border-radius: 8px;
}
.picker-content {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 15px;
	flex-wrap: nowrap;
}
.yao-symbol {
	color: var(--x-accent, #1672b1);
	font-size: 17px;
	font-weight: 600;
	min-width: 75px;
	text-align: center;
	white-space: pre;
	font-family: monospace;
	letter-spacing: 1px;
}
.yao-name {
	color: var(--x-body, #425d65);
	font-size: 12px;
	white-space: nowrap;
}
.yao-chevron {
	color: var(--x-muted, #667d82);
}
</style>
