<template>
	<view class="quick-section"><text class="quick-caption">试着问问</text>
		<view class="quick-list">
			<view
				v-for="item in quickPrompts"
				:key="item.label"
				class="quick-chip" :aria-label="item.prompt"
				v-bind="h5Button(() => emit('quick-prompt', item.prompt))"
				@tap="emit('quick-prompt', item.prompt)"
			>
				<text class="quick-chip__label">{{ item.label }}</text>
				<text aria-hidden="true">↗</text>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import type { QuickPrompt } from '@/features/agent/types';
import { h5Button } from '@/utils/keyboard';

defineProps<{
	quickPrompts: QuickPrompt[];
}>();

const emit = defineEmits<{
	(event: 'quick-prompt', prompt: string): void;
}>();
</script>

<style scoped>
.quick-section { display:flex; flex-direction:row; align-items:center; gap:12px; padding:0 2px; flex-wrap:wrap; }
.quick-caption { color:var(--x-muted); font-size:10px; }
.quick-list { display:flex; flex-direction:row; gap:8px; flex-wrap:wrap; flex-shrink:1; min-width:0; max-width:100%; }
.quick-chip { display:flex; flex-direction:row; align-items:center; gap:10px; padding:0 12px; min-height:31px; border:1px solid var(--x-line); border-radius:20px; font-size:10px; background:var(--x-paper); color:var(--x-body); }
.quick-chip:hover { color:var(--x-accent); border-color:var(--x-accent); }
@media(max-width:600px) { .quick-section { gap:8px; } .quick-list { gap:6px; } .quick-chip { min-height:35px; } }
</style>
