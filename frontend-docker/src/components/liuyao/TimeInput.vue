<template>
	<TimeCard :label="label" :date="dateText || placeholder" :clock="clockText"
		:status="modelValue ? (source === 'now' ? '已取当前时间' : '已指定时间') : '请选择时间'"
		:hint="hint" :allow-now="true" @edit="emit('open')" @now="emit('useNow')" />
</template>
<script lang="ts" setup>
import { computed } from 'vue';
import TimeCard from '@/components/form/TimeCard.vue';
const props = defineProps({
	modelValue: { type: String, default: '' },
	label: { type: String, default: '起卦时间' },
	placeholder: { type: String, default: '请选择起卦日期与时间' },
	source: { type: String, default: 'now' },
});
const emit = defineEmits(['update:modelValue', 'open', 'useNow']);
const dateText = computed(() => props.modelValue.split(' ')[0]?.replace(/[-/]/g, ' / '));
const clockText = computed(() => props.modelValue.split(' ')[1]?.slice(0, 5));
const hint = computed(() => (props.source === 'now' ? '已记录当前时刻，不会随等待自动变化。' : '本次排盘会使用你指定的起卦时刻。') + '起卦时间与出生时间分别保存。');
</script>
