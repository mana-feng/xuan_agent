<template>
	<button
		v-bind="h5Button(() => emit('select'))"
		:class="['method-card', { active }]"
		:aria-pressed="active"
		:aria-label="'选择' + text"
		@tap="$emit('select')"
	>
		<text class="method-card__title">{{ text }}</text>
		<text class="method-card__check">{{ active ? '✓' : '○' }}</text>
	</button>
</template>
<script lang="ts" setup>
import { h5Button } from '@/utils/keyboard';
defineProps({
	text: { type: String, required: true },
	icon: { type: String, default: '' },
	desc: { type: String, default: '' },
	active: { type: Boolean, default: false },
});
const emit = defineEmits(['select']);
</script>
<style scoped>
.method-card {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
	margin: 0;
	padding: 12px 11px;
	line-height: 22px;
	border-radius: 8px;
	background: var(--x-paper, #fff);
	border: 1px solid var(--x-line, #dbe9ed);
	color: var(--x-body, #425d65);
	text-align: left;
	cursor: pointer;
}
.method-card::after {
	border: 0;
}
.method-card.active {
	background: var(--x-tint, #e7f4fc);
	color: var(--x-accent, #1672b1);
	border-color: var(--x-accent, #1672b1);
}
.method-card__title {
	font-size: 12px;
}
.method-card__check {
	font-size: 11px;
	opacity: 0.7;
}
</style>
