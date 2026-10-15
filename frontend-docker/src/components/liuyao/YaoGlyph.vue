<template>
	<view class="yao-glyph" role="img" :aria-label="description">
		<view class="yao-strokes" aria-hidden="true">
			<view class="yao-stroke" />
			<view v-if="isYin" class="yao-stroke" />
		</view>
		<text class="yao-motion" aria-hidden="true">{{ marker }}</text>
	</view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ value: number | string }>();
const isYin = computed(() => ['0', '4'].includes(String(props.value)));
const marker = computed(() => String(props.value) === '3' ? '○' : String(props.value) === '4' ? '×' : '');
const description = computed(() => `${isYin.value ? '阴爻' : '阳爻'}${marker.value ? '，动爻' : '，静爻'}`);
</script>

<style scoped>
.yao-glyph { display: flex; flex-direction: row; align-items: center; width: 100%; max-width: 144px; min-width: 0; min-height: 24px; gap: 10px; color: var(--x-accent, #1672b1); }
.yao-strokes { display: flex; flex-direction: row; flex: 1; align-items: center; gap: 14px; min-width: 0; }
.yao-stroke { display: block; flex: 1; height: 4px; border-radius: 2px; background: currentColor; }
.yao-motion { display: block; flex-shrink: 0; width: 18px; font: 18px/24px Arial, sans-serif; text-align: center; color: var(--x-accent-end, #11785f); }
</style>
