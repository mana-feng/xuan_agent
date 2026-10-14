<template>
	<view class="param-preview-component">
		<view v-if="params && params.length" class="param-grid">
			<view v-for="(p, idx) in params" :key="idx" class="param-chip">
				<view class="param-line">
					<text class="yao-prefix">{{
						['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][idx]
					}}</text>
					<text class="yao-symbol">{{ getYaoSymbol(p) }}</text>
					<text class="yao-name">{{ getYaoName(p) }}</text>
				</view>
			</view>
		</view>
		<view v-else>
			<text class="preview-empty">尚未生成爻</text>
		</view>
	</view>
</template>

<script lang="ts" setup>
import { getYaoName, getYaoSymbol } from '@/features/liuyao/uiHelpers';

defineProps({
	params: { type: Array as () => number[], default: () => [] },
});
</script>

<style scoped>
.param-grid {
	display: flex;
	flex-direction: column-reverse;
	gap: 7px;
	padding-top: 3px;
}
.param-chip {
	background: var(--x-paper, #fff);
	border: 1px solid var(--x-line, #dbe9ed);
	padding: 10px 15px;
	border-radius: 7px;
}
.param-line {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	font-size: 12px;
	white-space: nowrap;
}
.yao-symbol {
	min-width: 85px;
	text-align: center;
	white-space: pre;
	font-family: monospace;
	letter-spacing: 2px;
	color: var(--x-accent, #1672b1);
	font-size: 19px;
}
.yao-prefix,
.yao-name {
	color: var(--x-muted, #667d82);
	min-width: 38px;
}
.yao-name {
	text-align: right;
}
.preview-empty {
	font-size: 12px;
	color: var(--x-muted, #667d82);
}
</style>
