<template>
	<view class="yao-choice-backdrop x-workbench" :data-palette="palette" @tap.self="emit('close')">
		<view ref="dialog" class="yao-choice-dialog" role="dialog" aria-modal="true" :aria-label="'选择' + label" tabindex="-1">
			<view class="yao-choice-heading">
				<view><text class="yao-choice-eyebrow">手工指定</text><h2>选择{{ label }}</h2></view>
				<button class="yao-choice-close" aria-label="关闭爻象选择" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">×</button>
			</view>
			<text class="yao-choice-hint">点击一种爻象，即可填入{{ label }}。</text>
			<view class="yao-choice-options" role="group" aria-label="四种爻象">
				<button v-for="option in choices" :key="option.value" class="yao-choice-option" :class="{ selected: String(modelValue) === option.value }"
					:aria-label="option.name + '，' + option.description" :aria-pressed="String(modelValue) === option.value"
					v-bind="h5Button(() => emit('select', option.value))" @tap="emit('select', option.value)">
					<YaoGlyph :value="option.value" />
					<view class="yao-choice-copy"><text class="yao-choice-name">{{ option.name }}</text><text class="yao-choice-description">{{ option.description }}</text></view>
					<text class="yao-choice-check" aria-hidden="true">{{ String(modelValue) === option.value ? '✓' : '' }}</text>
				</button>
			</view>
			<view class="yao-choice-footer">
				<button v-if="hasSelection && options.some(option => option.value === '')" class="yao-choice-clear" v-bind="h5Button(() => emit('select', ''))" @tap="emit('select', '')">清除此爻</button>
				<button class="yao-choice-cancel" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">取消</button>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import YaoGlyph from './YaoGlyph.vue';
import { getYaoName } from '@/features/liuyao/uiHelpers';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';
import { useWorkbenchTheme } from '@/features/workbench/theme';

const props = defineProps<{ label: string; modelValue: string | number; options: Array<{ value: string | number; name?: string }> }>();
const emit = defineEmits<{ (event: 'close'): void; (event: 'select', value: string): void }>();
const { palette } = useWorkbenchTheme();
const dialog = ref();
useModalFocus(ref(true), dialog, () => emit('close'));
const validValues = ['0', '1', '3', '4'];
const hasSelection = computed(() => validValues.includes(String(props.modelValue)));
const choices = computed(() => props.options.filter(option => validValues.includes(String(option.value))).map(option => {
	const value = String(option.value), yin = value === '0' || value === '4', moving = value === '3' || value === '4';
	return { value, name: option.name || getYaoName(value), description: `${yin ? '阴爻' : '阳爻'} · ${moving ? '动爻' : '静爻'}` };
}));
</script>

<style scoped>
.yao-choice-backdrop { position: fixed; inset: 0; z-index: 2100; display: flex; flex-direction: row; align-items: center; justify-content: center; box-sizing: border-box; padding: 24px; min-height: 0; background: rgba(21,43,52,.32); backdrop-filter: blur(6px); }
.yao-choice-dialog { display: block; box-sizing: border-box; width: 100%; max-width: 420px; max-height: calc(100dvh - 48px); overflow-y: auto; overscroll-behavior: contain; padding: 24px; border: 1px solid var(--x-line, #dbe9ed); border-radius: 22px; background: var(--x-paper, #fff); color: var(--x-ink, #233e49); box-shadow: 0 24px 80px #163a4933; }
.yao-choice-heading { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
.yao-choice-eyebrow { color: var(--x-muted, #667d82); font-size: 11px; }
.yao-choice-heading h2 { margin: 5px 0 0; color: var(--x-ink, #233e49); font-size: 20px; font-weight: 600; line-height: 1.5; }
.yao-choice-close { display: flex; flex-direction: row; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 40px; margin: 0; padding: 0; border-radius: 50%; background: var(--x-bg, #f3fafb); color: var(--x-muted, #667d82); font-size: 24px; }
.yao-choice-hint { display: block; margin: 12px 0 18px; color: var(--x-muted, #667d82); font-size: 12px; line-height: 1.7; }
.yao-choice-options { display: flex; flex-direction: column; gap: 10px; }
.yao-choice-option { display: grid; grid-template-columns: minmax(0, 1fr) auto 18px; align-items: center; gap: 16px; box-sizing: border-box; width: 100%; min-height: 70px; margin: 0; padding: 12px 16px; border: 1px solid var(--x-line, #dbe9ed); border-radius: 12px; background: var(--x-paper, #fff); text-align: left; cursor: pointer; }
.yao-choice-option.selected { border-color: var(--x-accent, #1672b1); background: var(--x-gradient-soft, linear-gradient(125deg, #e7f4fc, #e6f6ed)); }
.yao-choice-copy { display: flex; flex-direction: column; gap: 3px; }
.yao-choice-name { color: var(--x-ink, #233e49); font-size: 14px; font-weight: 500; line-height: 1.6; }
.yao-choice-description { color: var(--x-muted, #667d82); font-size: 11px; line-height: 1.6; }
.yao-choice-check { color: var(--x-accent-end, #11785f); font-size: 16px; text-align: right; }
.yao-choice-footer { display: flex; flex-direction: row; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--x-line, #dbe9ed); }
.yao-choice-footer button { min-height: 44px; margin: 0; padding: 8px 16px; border-radius: 8px; font-size: 12px; line-height: 28px; }
.yao-choice-clear { margin-right: auto !important; color: var(--x-muted, #667d82); background: transparent; }
.yao-choice-cancel { color: var(--x-accent, #1672b1); background: var(--x-tint, #e7f4fc); }
button::after { border: 0; }
button:focus-visible { outline: 2px solid var(--x-accent, #1672b1); outline-offset: 3px; }
@media (max-width: 600px) { .yao-choice-backdrop { align-items: flex-end; padding: 12px; padding-bottom: max(12px, env(safe-area-inset-bottom)); } .yao-choice-dialog { max-height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); padding: 22px 20px 16px; } }
@media (max-width: 360px) { .yao-choice-dialog { padding-inline: 16px; } .yao-choice-option { padding-inline: 12px; gap: 10px; } }
</style>
