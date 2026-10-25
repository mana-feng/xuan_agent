<template>
  <view v-if="show" class="admin-dialog-overlay" @click.self="close">
    <view ref="dialog" class="admin-dialog-panel" :class="{ 'admin-dialog-panel-wide': wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <view class="admin-dialog-heading">
        <view class="admin-dialog-heading-copy"><text class="admin-dialog-eyebrow">{{ eyebrow }}</text><h2>{{ title }}</h2><text v-if="description" class="admin-dialog-description">{{ description }}</text></view>
        <button class="admin-dialog-close" aria-label="关闭弹窗" v-bind="h5Button(close)" @tap="close">×</button>
      </view>
      <view class="admin-dialog-body"><slot /></view>
      <view v-if="$slots.footer" class="admin-dialog-footer"><slot name="footer" /></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, toRef } from 'vue';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';
const props = withDefaults(defineProps<{ show: boolean; title: string; eyebrow?: string; description?: string; wide?: boolean }>(), { eyebrow: '管理工作台', description: '', wide: false });
const emit = defineEmits<{ (event: 'update:show', value: boolean): void }>();
const dialog = ref<any>(null);
function close() { emit('update:show', false); }
useModalFocus(toRef(props, 'show'), dialog, close);
</script>
<style scoped>
.admin-dialog-overlay { position:fixed!important; inset:0; z-index:1500; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px; box-sizing:border-box; background:rgba(18,42,51,.38); backdrop-filter:blur(5px); }
.admin-dialog-overlay .admin-dialog-panel { display:flex; flex-direction:column; position:relative; width:480px; max-width:100%; max-height:min(820px,calc(100dvh - 56px)); overflow:hidden; border:1px solid rgba(255,255,255,.8); border-radius:22px; background:var(--admin-paper,#fff); box-shadow:0 24px 90px rgba(17,50,61,.22); outline:none; color:var(--admin-ink); }
.admin-dialog-overlay .admin-dialog-panel-wide { width:640px; }
.admin-dialog-overlay .admin-dialog-heading { display:flex; flex-direction:row; justify-content:space-between; align-items:flex-start; gap:20px; padding:26px 28px 22px; border-bottom:1px solid var(--admin-line); background:linear-gradient(120deg,var(--admin-bg),#fff); flex-shrink:0; }
.admin-dialog-overlay .admin-dialog-heading-copy { display:flex; flex-direction:column; gap:7px; min-width:0; }
.admin-dialog-overlay .admin-dialog-eyebrow { font-size:11px; color:var(--admin-accent); letter-spacing:1.5px; }
.admin-dialog-overlay .admin-dialog-heading h2 { font:600 23px/1.45 var(--admin-serif); margin:0; }
.admin-dialog-overlay .admin-dialog-description { font-size:12px; line-height:1.7; color:var(--admin-muted); }
.admin-dialog-overlay .admin-dialog-close { display:flex; flex-direction:row; justify-content:center; align-items:center; width:34px; height:34px; flex-shrink:0; padding:0; margin:0; border:1px solid var(--admin-line); border-radius:10px; background:var(--admin-paper); color:var(--admin-muted); font:24px/1 var(--admin-sans); box-shadow:none; }
.admin-dialog-overlay .admin-dialog-close::after { border:0; }
.admin-dialog-overlay .admin-dialog-close:hover { color:var(--admin-accent); border-color:var(--admin-accent); }
.admin-dialog-overlay .admin-dialog-body { display:flex; flex-direction:column; padding:24px 28px; flex:1 1 auto; overflow-y:auto; overscroll-behavior:contain; min-height:0; }
.admin-dialog-overlay .admin-dialog-footer { display:flex; flex-direction:row; align-items:center; justify-content:flex-end; gap:10px; flex-shrink:0; padding:18px 28px; border-top:1px solid var(--admin-line); background:var(--admin-bg); }
@media(max-width:600px) { .admin-dialog-overlay { padding:16px; } .admin-dialog-overlay .admin-dialog-panel { border-radius:18px; max-height:calc(100dvh - 32px); } .admin-dialog-overlay .admin-dialog-heading { padding:22px 20px 18px; gap:12px; } .admin-dialog-overlay .admin-dialog-heading h2 { font-size:22px; } .admin-dialog-overlay .admin-dialog-body { padding:20px; } .admin-dialog-overlay .admin-dialog-footer { padding:16px 20px; } }
</style>
