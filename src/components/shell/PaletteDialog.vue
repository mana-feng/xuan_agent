<template>
  <view class="palette-backdrop" @tap.self="emit('close')">
    <view ref="dialog" class="palette-dialog" role="dialog" aria-modal="true" aria-label="选择渐变配色" tabindex="-1">
      <view class="palette-handle" aria-hidden="true" />
      <view class="palette-heading">
        <view class="palette-heading-copy"><text class="palette-eyebrow">给探索，换一种心情</text><h2>选择渐变配色</h2></view>
        <button class="palette-close" aria-label="关闭配色选择" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">×</button>
      </view>
      <view class="palette-options" role="group" aria-label="渐变配色">
        <button v-for="(item, index) in palettes" :key="item.id" class="palette-option" :class="{ 'is-selected': palette === item.id }" :aria-label="`选择${item.name}`" :aria-pressed="palette === item.id" v-bind="h5Button(() => emit('select', index))" @tap="emit('select', index)">
          <view class="palette-swatch" :style="{ background: `linear-gradient(115deg, ${item.colors.join(', ')})` }" aria-hidden="true"><view class="palette-swatch-orbit" /><view class="palette-swatch-light" /></view>
          <view class="palette-option-copy"><text class="palette-option-name">{{ item.name }}</text><text class="palette-option-description">{{ item.description }}</text></view>
          <view class="palette-indicator" aria-hidden="true"><text v-if="palette === item.id">✓</text></view>
        </button>
      </view>
      <text class="palette-footnote">选择后立即生效，自动记住你的偏好</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { palettes } from '@/features/workbench/theme';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';

defineProps<{ palette: string }>();
const emit = defineEmits<{ (event: 'close'): void; (event: 'select', index: number): void }>();
const dialog = ref();
useModalFocus(ref(true), dialog, () => emit('close'));
</script>

<style scoped>
.palette-backdrop { position:fixed; inset:0; z-index:2100; display:flex; flex-direction:row; align-items:center; justify-content:center; padding:24px; background:rgba(21,43,52,.32); backdrop-filter:blur(7px); }
.palette-dialog { box-sizing:border-box; width:100%; max-width:416px; max-height:calc(100dvh - 48px); overflow-y:auto; padding:26px; border:1px solid rgba(255,255,255,.8); border-radius:24px; background:var(--x-paper,#fff); color:var(--x-ink,#233e49); box-shadow:0 24px 90px rgba(19,52,65,.2); animation:palette-appear .18s ease-out; }
.palette-heading { display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; margin-bottom:22px; }
.palette-heading-copy { display:flex; flex-direction:column; gap:6px; }
.palette-eyebrow { font-size:11px; line-height:1.6; letter-spacing:1px; color:var(--x-muted,#667d82); }
.palette-heading h2 { margin:0; font-size:20px; font-weight:600; line-height:1.5; letter-spacing:.5px; }
.palette-close { display:flex; flex-direction:row; align-items:center; justify-content:center; flex-shrink:0; width:36px; height:36px; padding:0; border:1px solid var(--x-line,#dbe9ed); border-radius:50%; background:var(--x-bg,#f3fafb); color:var(--x-muted,#667d82); font-size:23px; }
.palette-options { display:flex; flex-direction:column; gap:10px; }
.palette-option { box-sizing:border-box; display:flex; flex-direction:row; align-items:center; gap:14px; width:100%; min-height:85px; padding:14px; border:1px solid var(--x-line,#dbe9ed); border-radius:15px; background:var(--x-paper,#fff); color:var(--x-ink,#233e49); text-align:left; cursor:pointer; transition:background .15s,border-color .15s; }
.palette-option.is-selected { border-color:var(--x-accent,#1672b1); background:var(--x-gradient-soft,linear-gradient(115deg,#e7f4fc,#e6f6ed)); }
.palette-swatch { position:relative; flex-shrink:0; width:58px; height:52px; overflow:hidden; border-radius:11px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.15); }
.palette-swatch-orbit { position:absolute; width:52px; height:52px; top:18px; left:-16px; border:1px solid rgba(255,255,255,.3); border-radius:50%; box-shadow:0 0 0 9px rgba(255,255,255,.08),0 0 0 18px rgba(255,255,255,.06); }
.palette-swatch-light { position:absolute; top:11px; right:12px; width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.8); }
.palette-option-copy { display:flex; flex-direction:column; flex:1; min-width:0; gap:5px; }
.palette-option-name { font-size:14px; font-weight:600; line-height:1.5; }
.palette-option-description { font-size:11px; font-weight:400; line-height:1.6; color:var(--x-muted,#667d82); }
.palette-indicator { display:flex; flex-direction:row; align-items:center; justify-content:center; box-sizing:border-box; flex-shrink:0; width:21px; height:21px; border:1px solid var(--x-line,#dbe9ed); border-radius:50%; color:#fff; font-size:12px; }
.is-selected .palette-indicator { border-color:transparent; background:var(--x-gradient,linear-gradient(115deg,#1672b1,#11785f)); }
.palette-footnote { display:block; margin-top:20px; text-align:center; font-size:11px; line-height:1.7; color:var(--x-muted,#667d82); }
.palette-handle { display:none; }
@keyframes palette-appear { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@media(max-width:600px) {
  .palette-backdrop { align-items:flex-end; padding:12px; padding-bottom:max(12px,env(safe-area-inset-bottom)); }
  .palette-dialog { max-width:440px; max-height:calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); padding:12px 20px 22px; border-radius:24px; }
  .palette-handle { display:block; width:32px; height:4px; border-radius:4px; margin:0 auto 18px; background:var(--x-line,#dbe9ed); }
  .palette-heading { margin-bottom:18px; }
  .palette-heading h2 { font-size:19px; }
  .palette-option { gap:12px; padding:12px; min-height:81px; }
  .palette-swatch { width:54px; height:48px; }
}
@media(max-width:360px) { .palette-dialog { padding-inline:16px; } .palette-option { gap:10px; } .palette-swatch { width:46px; } .palette-option-description { font-size:10px; } }
@media(prefers-reduced-motion:reduce) { .palette-dialog { animation:none; } .palette-option { transition:none; } }
</style>
