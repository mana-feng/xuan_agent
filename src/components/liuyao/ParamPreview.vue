<template>
	<view class="param-preview-component">
		<view class="param-heading">
			<text class="param-title">卦象预览</text>
			<text class="param-summary" role="status">{{ generatedCount < 6 ? `已生成 ${generatedCount}/6 爻` : movingCount ? `${movingCount} 个动爻` : '六爻皆静' }}</text>
		</view>
		<view class="param-grid" role="list" aria-label="六爻卦象，从上爻到初爻">
			<view v-for="row in rows" :key="row.index" class="param-line" :class="{ 'is-moving': row.moving }" role="listitem">
				<text class="yao-prefix">{{ row.label }}</text>
				<YaoGlyph v-if="row.value !== undefined" :value="row.value" />
				<view v-else class="yao-pending"><text>待生成</text></view>
				<text class="yao-name">{{ row.value === undefined ? '—' : getYaoName(row.value) }}</text>
			</view>
		</view>
		<view class="param-legend">
			<text>初爻在下，自下而上成卦</text>
			<text>○ 阳动　× 阴动</text>
		</view>
	</view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { getYaoName } from '@/features/liuyao/uiHelpers';
import YaoGlyph from './YaoGlyph.vue';

const props = defineProps({
	params: { type: Array as () => number[], default: () => [] },
});
const labels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
const rows = computed(() => labels.map((label, index) => ({ label, index, value: props.params[index], moving: [3, 4].includes(props.params[index]) })).reverse());
const generatedCount = computed(() => Math.min(props.params.length, 6));
const movingCount = computed(() => rows.value.filter(row => row.moving).length);
</script>

<style scoped>
.param-preview-component { display: block; box-sizing: border-box; width: 100%; max-width: 480px; margin: 0 auto; padding: 18px 20px 14px; border: 1px solid var(--x-line, #dbe9ed); border-radius: 12px; background: var(--x-paper, #fff); }
.param-heading { display: flex; flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-bottom: 14px; border-bottom: 1px solid var(--x-line, #dbe9ed); }
.param-title { font-size: 13px; font-weight: 500; color: var(--x-ink, #233e49); }
.param-summary { color: var(--x-muted, #667d82); font-size: 11px; }
.param-grid { display: flex; flex-direction: column; gap: 5px; max-width: 330px; margin: 14px auto; }
.param-line { display: grid; grid-template-columns: 30px minmax(0, 1fr) 34px; align-items: center; gap: 12px; min-height: 32px; }
.param-line:nth-child(3) { margin-bottom: 9px; }
.param-line :deep(.yao-glyph) { justify-self: center; }
.yao-prefix, .yao-name { color: var(--x-muted, #667d82); font-size: 11px; white-space: nowrap; }
.yao-name { text-align: right; }
.is-moving .yao-name { color: var(--x-accent-end, #11785f); font-weight: 500; }
.yao-pending { display: flex; flex-direction: row; align-items: center; justify-content: center; width: 100%; max-width: 144px; min-height: 24px; justify-self: center; color: var(--x-muted, #667d82); font-size: 10px; }
.param-legend { display: flex; flex-direction: row; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; border-top: 1px solid var(--x-line, #dbe9ed); padding-top: 12px; color: var(--x-muted, #667d82); font-size: 10px; line-height: 1.7; }
@media (max-width: 520px) { .param-preview-component { padding: 16px 12px 12px; } .param-line { gap: 8px; } .param-legend { flex-direction: column; align-items: center; gap: 3px; } }
</style>
