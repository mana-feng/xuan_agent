<template>
  <view v-bind="$attrs" class="yx-admin-input" :class="{ 'is-disabled': disabled, 'is-readonly': readonly, 'is-monospace': monospace }">
    <view v-if="label && !hideLabel" class="admin-input-label">
      <text>{{ label }}</text><text v-if="required" class="admin-input-required" aria-hidden="true">*</text>
    </view>
    <view class="admin-input-control" :class="{ 'is-focused': active, 'is-textarea': type === 'textarea' }">
      <slot name="left"></slot>
      <textarea
        v-if="type === 'textarea'"
        class="admin-input-native admin-input-textarea"
        :value="currentValue"
        :style="textareaStyle"
        :placeholder="placeholder"
        :maxlength="nativeMaxlength"
        :disabled="disabled"
        :readonly="readonly"
        :focus="focus"
        :auto-height="false"
        :show-confirm-bar="showConfirmBar"
        :aria-label="fieldLabel"
        :aria-required="required"
        :aria-readonly="readonly"
        :aria-disabled="disabled"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @confirm="onConfirm"
      ></textarea>
      <input
        v-else
        class="admin-input-native"
        :value="currentValue"
        :type="inputType"
        :password="isPassword && !passwordVisible"
        :placeholder="placeholder"
        :maxlength="nativeMaxlength"
        :disabled="disabled"
        :readonly="readonly"
        :focus="focus"
        :confirm-type="confirmType"
        :aria-label="fieldLabel"
        :aria-required="required"
        :aria-readonly="readonly"
        :aria-disabled="disabled"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @confirm="onConfirm"
      />
      <view v-if="canClear" class="admin-input-action" aria-label="清空输入" v-bind="clearBinding" @click="clearValue">
        <text class="admin-input-clear" aria-hidden="true">×</text>
      </view>
      <view
        v-if="isPassword"
        class="admin-input-action admin-password-action"
        :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
        :aria-pressed="passwordVisible"
        v-bind="passwordBinding"
        @click="togglePassword"
      ><text>{{ passwordVisible ? '隐藏' : '显示' }}</text></view>
      <text v-if="suffixLabel" class="admin-input-suffix">{{ suffixLabel }}</text>
      <slot name="right"></slot>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { h5Button } from '@/utils/keyboard';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  modelValue?: string | number | null;
  modelModifiers?: { number?: boolean; trim?: boolean };
  type?: string;
  label?: string;
  hideLabel?: boolean;
  required?: boolean;
  placeholder?: string;
  maxlength?: number;
  disabled?: boolean;
  readonly?: boolean;
  clearable?: boolean;
  showClear?: boolean;
  password?: boolean;
  focus?: boolean;
  confirmType?: string;
  showConfirmBar?: boolean;
  monospace?: boolean;
  height?: number;
  margin?: number[];
  padding?: number[];
  round?: number;
  fontSize?: number;
  border?: number;
  color?: string;
  fontColor?: string;
  focusColor?: string;
  text?: boolean;
  outlined?: boolean;
  transprent?: boolean;
  shadow?: number;
  linear?: string;
  linearDeep?: string;
  prefix?: string;
  prefixLabel?: string;
  suffix?: string;
  suffixLabel?: string;
  align?: string;
  followTheme?: boolean | string;
}>(), {
  modelValue: '', type: 'text', label: '', hideLabel: false, placeholder: '', maxlength: -1,
  disabled: false, readonly: false, clearable: false, showClear: false, password: false,
  focus: false, confirmType: 'done', showConfirmBar: true, monospace: false, height: 88,
  modelModifiers: () => ({}), margin: () => [], padding: () => [], round: 10, fontSize: 14, border: 1,
  color: '', fontColor: '', focusColor: '', text: false, outlined: false, transprent: false,
  shadow: 0, linear: '', linearDeep: '', prefix: '', prefixLabel: '', suffix: '', suffixLabel: '',
  align: 'left', followTheme: true,
});
const emit = defineEmits<{
  (event: 'update:modelValue', value: string | number): void;
  (event: 'input', value: string): void;
  (event: 'confirm', value: string | number): void;
  (event: 'focus' | 'blur' | 'clear'): void;
}>();
const currentValue = ref(props.modelValue ?? '');
const active = ref(false);
const passwordVisible = ref(false);
watch(() => props.modelValue, value => { currentValue.value = value ?? ''; });
const isPassword = computed(() => props.password || props.type === 'password');
const inputType = computed(() => isPassword.value ? (passwordVisible.value ? 'text' : 'password') : props.type);
const fieldLabel = computed(() => props.label || props.placeholder || undefined);
const nativeMaxlength = computed(() => props.maxlength);
const canClear = computed(() => (props.clearable || props.showClear) && !props.disabled && !props.readonly && String(currentValue.value).length > 0);
const textareaStyle = computed(() => {
  const heightPx = typeof uni !== 'undefined' && uni.upx2px ? uni.upx2px(props.height) : props.height / 2;
  return { height: `${Math.max(140, heightPx)}px` };
});
function update(value: string) {
  currentValue.value = value;
  let modelValue: string | number = props.modelModifiers?.trim ? value.trim() : value;
  if (props.modelModifiers?.number && modelValue !== '') {
    const numeric = parseFloat(modelValue);
    if (!Number.isNaN(numeric)) modelValue = numeric;
  }
  emit('update:modelValue', modelValue);
  // tm-input listeners receive the entered value, never the platform event.
  emit('input', value);
}
function onInput(platformEvent: unknown) {
  const event = platformEvent as { detail?: { value?: string }; target?: { value?: string } };
  if (props.disabled || props.readonly) return;
  let value = String(event.detail?.value ?? event.target?.value ?? '');
  if (props.maxlength >= 0) value = value.slice(0, props.maxlength);
  if (event.target && event.target.value !== value) event.target.value = value;
  update(value);
}
function clearValue() {
  if (!canClear.value) return;
  update('');
  emit('clear');
}
function togglePassword() {
  if (!props.disabled) passwordVisible.value = !passwordVisible.value;
}
const clearBinding = computed(() => h5Button(clearValue, props.disabled || props.readonly));
const passwordBinding = computed(() => h5Button(togglePassword, props.disabled));
function onFocus() { active.value = true; emit('focus'); }
function onBlur() { active.value = false; emit('blur'); }
function onConfirm() { if (!props.disabled) emit('confirm', currentValue.value); }
</script>

<style scoped>
.yx-admin-input.yx-admin-input {
  display: flex; flex-direction: column; gap: 8px; width: 100%; min-width: 0;
  box-sizing: border-box; text-align: left;
}
.yx-admin-input .admin-input-label {
  display: flex; flex-direction: row; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 600; line-height: 1.5; color: var(--admin-body, #475569);
}
.yx-admin-input .admin-input-suffix {
  display: block; flex: 0 0 auto; margin-left: 10px; font-size: 12px; line-height: 1.5;
  color: var(--admin-muted, #718897); white-space: nowrap;
}
.yx-admin-input .admin-input-required { color: #dc4c64; font-weight: 500; }
.yx-admin-input .admin-input-control {
  display: flex; flex-direction: row; align-items: center; width: 100%; min-width: 0; min-height: 44px;
  box-sizing: border-box; padding: 0 12px; border: 1px solid var(--admin-line, #d8e6ed);
  border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgba(30, 66, 81, .025);
  transition: border-color .16s ease, box-shadow .16s ease;
}
.yx-admin-input:not(.is-disabled) .admin-input-control:hover { border-color: #93bdca; }
.yx-admin-input .admin-input-control.is-focused,
.yx-admin-input .admin-input-control:focus-within {
  border-color: var(--admin-accent, #16899a); box-shadow: 0 0 0 3px rgba(16, 151, 164, .12);
}
.yx-admin-input .admin-input-native {
  display: block; flex: 1 1 0%; width: 100%; min-width: 0; height: 42px; min-height: 42px;
  margin: 0 !important; padding: 0 !important; box-sizing: border-box; border: 0 !important;
  border-radius: 0 !important; outline: 0 !important; background: transparent !important;
  color: var(--admin-ink, #203c4a); font-family: inherit; font-size: 14px !important; line-height: 1.6 !important;
}
.yx-admin-input .admin-input-native::placeholder { color: #98a7b2; font-size: 14px; }
.yx-admin-input .admin-input-control.is-textarea { align-items: flex-start; padding: 11px 12px; }
.yx-admin-input .admin-input-textarea {
  flex: 1 1 auto; min-height: 140px !important; resize: vertical; white-space: pre-wrap;
}
.yx-admin-input.is-monospace .admin-input-native { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px !important; }
.yx-admin-input .admin-input-action {
  display: flex; flex-direction: row; align-items: center; justify-content: center; flex: 0 0 auto;
  min-width: 28px; height: 32px; margin-left: 5px; border-radius: 6px; cursor: pointer;
  font-size: 12px; line-height: 1; color: #718897; user-select: none;
}
.yx-admin-input .admin-input-action:hover { background: #eef6f8; color: #167e8b; }
.yx-admin-input .admin-input-action:focus-visible { outline: 2px solid var(--admin-accent, #16899a); outline-offset: 2px; }
.yx-admin-input .admin-input-clear { font-size: 22px; line-height: 1; }
.yx-admin-input .admin-password-action { min-width: 36px; }
.yx-admin-input.is-disabled .admin-input-control { background: #f4f7f9; border-color: #e2eaf0; box-shadow: none; }
.yx-admin-input.is-disabled .admin-input-native { color: #91a0ab; cursor: not-allowed; }
.yx-admin-input.is-disabled .admin-input-action { cursor: not-allowed; opacity: .5; }
.yx-admin-input.is-readonly .admin-input-control { background: #f8fafc; }
</style>
