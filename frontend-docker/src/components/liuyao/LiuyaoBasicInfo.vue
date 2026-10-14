<template>
	<view class="casting-basic">
		<text class="basic-title">基本信息</text>
		<view class="question-field">
			<text class="basic-label">想问的事 <text class="basic-hint">请围绕一个具体问题</text></text>
			<textarea
				v-model="titleLocal"
				class="question-input"
				placeholder="例如：这次合作的推进情况如何？"
				:maxlength="200"
				aria-label="想问的事"
			/>
		</view>
		<view class="gender-field">
			<text class="basic-label">性别 <text class="basic-hint">选填</text></text>
			<view class="gender-choices" role="group" aria-label="性别">
				<button
					v-bind="h5Button(() => (genderLocal = ''))"
					:class="{ selected: genderLocal === '' }"
					:aria-pressed="genderLocal === ''"
					@tap="genderLocal = ''"
				>
					未填写
				</button>
				<button
					v-bind="h5Button(() => (genderLocal = 0))"
					:class="{ selected: String(genderLocal) === '0' }"
					:aria-pressed="String(genderLocal) === '0'"
					@tap="genderLocal = 0"
				>
					男
				</button>
				<button
					v-bind="h5Button(() => (genderLocal = 1))"
					:class="{ selected: String(genderLocal) === '1' }"
					:aria-pressed="String(genderLocal) === '1'"
					@tap="genderLocal = 1"
				>
					女
				</button>
			</view>
		</view>
		<view class="casting-time-section">
			<TimeInput
				:model-value="timeLabel"
				:source="timeSource"
				@open="$emit('openTimePicker')"
				@use-now="$emit('useNowTime')"
			/>
		</view>
	</view>
</template>
<script lang="ts" setup>
import { h5Button } from '@/utils/keyboard';
import { computed } from 'vue';
import TimeInput from '@/components/liuyao/TimeInput.vue';
const props = defineProps({
	title: { type: String, default: '' },
	timeLabel: { type: String, default: '' },
	timeSource: { type: String, default: 'now' },
	gender: { type: [String, Number], default: '' },
});
const emit = defineEmits([
	'update:title',
	'update:timeLabel',
	'update:gender',
	'openTimePicker',
	'useNowTime',
]);
const titleLocal = computed({
	get: () => props.title,
	set: (value) => emit('update:title', value),
});
const genderLocal = computed({
	get: () => props.gender,
	set: (value) => emit('update:gender', value),
});
</script>
<style scoped>
.basic-title {
	display: block;
	font-family: var(--x-serif, SimSun, serif);
	font-size: 21px;
	color: var(--x-ink, #233e49);
	margin-bottom: 24px;
}
.question-field,
.gender-field {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-bottom: 21px;
}
.basic-label {
	color: var(--x-body, #425d65);
	font-size: 13px;
}
.basic-hint {
	margin-left: 7px;
	color: var(--x-muted, #667d82);
	font-size: 11px;
}
.question-input {
	width: 100%;
	height: 100px;
	padding: 13px 15px;
	border: 1px solid var(--x-line, #dbe9ed);
	border-radius: 8px;
	box-sizing: border-box;
	color: var(--x-ink, #233e49);
	background: var(--x-paper, #fff);
	font-size: 13px;
	line-height: 1.8;
}
.gender-choices {
	display: flex;
	flex-direction: row;
	gap: 4px;
	padding: 3px;
	border: 1px solid var(--x-line, #dbe9ed);
	border-radius: 8px;
	background: var(--x-tint, #e7f4fc);
	max-width: 300px;
}
.gender-choices button {
	flex: 1;
	margin: 0;
	padding: 7px 12px;
	line-height: 23px;
	font-size: 12px;
	background: transparent;
	color: var(--x-muted, #667d82);
	border-radius: 5px;
}
.gender-choices button.selected {
	color: var(--x-accent, #1672b1);
	background: var(--x-paper, #fff);
	box-shadow: 0 1px 5px #233e4910;
}
.gender-choices button::after {
	border: 0;
}
.casting-time-section {
	border-top: 1px solid var(--x-line, #dbe9ed);
	margin-top: 27px;
	padding-top: 27px;
}
</style>
