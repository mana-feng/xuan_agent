<template>
	<view class="yao-selector-item">
		<text class="yao-label">{{ label }}</text>
		<button
			class="picker-trigger"
			v-bind="h5Button(openPicker)"
			:aria-label="'选择' + label + '，当前' + (displayName || '未选择')"
			aria-haspopup="dialog"
			:aria-expanded="choiceOpen"
			@tap="openPicker"
		>
			<view class="picker-content">
				<YaoGlyph v-if="displayName" :value="options[selectedIndex].value" />
				<text class="yao-name">{{ displayName || '请选择爻象' }}</text>
			</view>
			<text class="yao-chevron">⌄</text>
		</button>
	</view>
	<YaoChoiceDialog v-if="choiceOpen" :label="label" :model-value="modelValue" :options="options" @select="onChoose" @close="choiceOpen = false" />
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { h5Button } from '@/utils/keyboard';
import { getYaoName } from '@/features/liuyao/uiHelpers';
import YaoGlyph from './YaoGlyph.vue';
import YaoChoiceDialog from './YaoChoiceDialog.vue';

const props = defineProps({
	modelValue: { type: [String, Number], default: '' },
	options: { type: Array as () => Array<any>, required: true },
	label: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'change']);
const choiceOpen = ref(false);
function openPicker() { choiceOpen.value = true; }

const selectedIndex = computed(() => {
	const idx = props.options.findIndex((opt) => String(opt.value) === String(props.modelValue));
	return idx >= 0 ? idx : 0;
});

const displayName = computed(() => {
	const opt = props.options[selectedIndex.value];
	if (!opt) return '';
	const v = opt.value;
	if (v === '' || v === null || v === undefined) return '';
	return opt.name || getYaoName(v);
});

function onChoose(value: string) {
	const idx = props.options.findIndex(option => String(option.value) === value);
	if (idx < 0) return;
	const opt = props.options[idx];
	choiceOpen.value = false;
	emit('update:modelValue', String(opt.value));
	emit('change', { detail: { value: idx } });
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
	width: 100%;
	margin: 0;
	gap: 10px;
	line-height: 1.5;
	text-align: left;
}
.picker-trigger::after { border: 0; }
.picker-content {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 12px;
	flex-wrap: nowrap;
	flex: 1;
	min-width: 0;
}
.yao-name {
	color: var(--x-body, #425d65);
	font-size: 12px;
	white-space: nowrap;
	flex-shrink: 0;
}
.yao-chevron {
	color: var(--x-muted, #667d82);
}
</style>
