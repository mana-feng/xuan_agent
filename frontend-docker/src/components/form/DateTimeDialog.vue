<template>
  <view class="datetime-backdrop x-workbench" :data-palette="palette" @tap.self="emit('close')">
    <view ref="dialog" class="datetime-dialog" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <view class="datetime-header"><text class="datetime-eyebrow">{{ subtitle || '年份直接输入，不用来回滚动' }}</text><h2>{{ title }}</h2></view>
      <view class="datetime-body">
        <text class="datetime-label">{{ lunar ? '农历日期' : '公历日期' }}</text>
        <view class="datetime-date-fields">
          <view v-for="part in dateFields" :key="part.key" class="datetime-part"><view class="datetime-field" :class="{ 'has-error': fieldErrors[part.key] }"><input :value="fields[part.key]" :data-time-part="part.key" type="text" inputmode="numeric" :maxlength="part.length" :aria-label="part.label" :aria-invalid="Boolean(fieldErrors[part.key])" @focus="selectInput" @input="setPart(part.key, $event)" @blur="finishPart(part.key)" @confirm="confirm" /><text>{{ part.label }}</text></view></view>
        </view>
        <view v-if="lunar" class="datetime-lunar" role="group" aria-label="农历月份类型"><button :class="{ selected: !leapDraft }" :aria-pressed="!leapDraft" v-bind="h5Button(() => setLeap(false))" @tap="setLeap(false)">普通月</button><button :class="{ selected: leapDraft }" :aria-pressed="leapDraft" v-bind="h5Button(() => setLeap(true))" @tap="setLeap(true)">闰月</button></view>
        <view class="datetime-clock-heading"><text class="datetime-label">时间 <text class="datetime-muted">24 小时制</text></text><button v-if="allowNow" class="datetime-now" v-bind="h5Button(() => emit('now'))" @tap="emit('now')">↺ 使用现在</button></view>
        <view class="datetime-clock-fields"><view class="datetime-part"><view class="datetime-field" :class="{ 'has-error': fieldErrors.hour }"><input :value="fields.hour" data-time-part="hour" type="text" inputmode="numeric" :maxlength="2" aria-label="小时" :aria-invalid="Boolean(fieldErrors.hour)" @focus="selectInput" @input="setPart('hour', $event)" @blur="finishPart('hour')" @confirm="confirm" /><text>时</text></view></view><text class="datetime-colon">:</text><view class="datetime-part"><view class="datetime-field" :class="{ 'has-error': fieldErrors.minute }"><input :value="fields.minute" data-time-part="minute" type="text" inputmode="numeric" :maxlength="2" aria-label="分钟" :aria-invalid="Boolean(fieldErrors.minute)" @focus="selectInput" @input="setPart('minute', $event)" @blur="finishPart('minute')" @confirm="confirm" /><text>分</text></view></view></view>
        <text v-if="preview" class="datetime-preview">{{ preview }}</text>
        <text v-if="hint" class="datetime-hint">{{ hint }}</text>
        <text v-if="error || liveError || externalError" class="datetime-error" role="alert">{{ error || liveError || externalError }}</text>
      </view>
      <view class="datetime-footer"><button class="datetime-cancel" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">取消</button><button class="datetime-confirm" :disabled="!canConfirm" v-bind="h5Button(confirm, !canConfirm)" @tap="confirm">确认时间 <text>→</text></button></view>
      <button class="datetime-close" aria-label="关闭时间选择" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">×</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { Solar, LunarMonth } from 'lunar-javascript';
import { parseCivil } from '@/utils/chartTime';
import { lunarCivilToSolar } from '@/utils/ziweiCalendarInput';
import { h5Button } from '@/utils/keyboard';
import { useModalFocus } from '@/utils/useModalFocus';
import { useWorkbenchTheme } from '@/features/workbench/theme';

const props = withDefaults(defineProps<{ date: string; clock: string; leap?: boolean; lunar?: boolean; title?: string; subtitle?: string; hint?: string; externalError?: string; allowNow?: boolean }>(), { title: '选择日期与时间', leap: false, lunar: false, allowNow: false });
const emit = defineEmits<{ (event: 'close'): void; (event: 'now'): void; (event: 'edit'): void; (event: 'confirm', value: { date: string; clock: string; leap: boolean }): void }>();
const { palette } = useWorkbenchTheme();
const dialog = ref();
useModalFocus(ref(true), dialog, () => emit('close'));
function syncNativeInputs() {
  // uni-input owns the native H5 input; forward the numeric keyboard and label.
  // #ifdef H5
  const root = dialog.value?.$el || dialog.value;
  root?.querySelectorAll('[data-time-part]').forEach((wrapper: HTMLElement) => {
    const input = wrapper.tagName === 'INPUT' ? wrapper as HTMLInputElement : wrapper.querySelector('input');
    if (!input) return;
    const part = wrapper.getAttribute('data-time-part') as Part;
    // A correction can equal the previous prop value; still replace the native
    // input's rejected text even when Vue has no changed value to render.
    if (input.value !== fields[part]) input.value = fields[part] || '';
    input.inputMode = 'numeric'; input.autocomplete = 'off';
    input.setAttribute('aria-label', wrapper.getAttribute('aria-label') || '');
    input.setAttribute('aria-invalid', wrapper.getAttribute('aria-invalid') || 'false');
    input.setAttribute('pattern', '[0-9]*');
  });
  // #endif
}
onMounted(syncNativeInputs);
const fields = reactive({ year: '', month: '', day: '', hour: '', minute: '' });
type Part = keyof typeof fields;
const dateFields: { key: Part; label: string; length: number }[] = [{ key: 'year', label: '年份', length: 4 }, { key: 'month', label: '月份', length: 2 }, { key: 'day', label: '日期', length: 2 }];
const leapDraft = ref(props.leap);
const error = ref('');
// Keep the supported solar interval intact when displaying the other calendar.
const calendarLimits = computed(() => {
  if (!props.lunar) return { start: [1900, 1, 1], end: [2099, 12, 31] };
  const start = Solar.fromYmd(1900, 1, 1).getLunar(), end = Solar.fromYmd(2099, 12, 31).getLunar();
  return { start: [start.getYear(), start.getMonth(), start.getDay()], end: [end.getYear(), end.getMonth(), end.getDay()] };
});
const calendarMonth = computed(() => {
  const year = Number(fields.year), month = Number(fields.month);
  if (!/^\d{4}$/.test(fields.year || '') || year < calendarLimits.value.start[0] || year > calendarLimits.value.end[0] || !/^\d{1,2}$/.test(fields.month || '') || month < 1 || month > 12) return undefined;
  if (!props.lunar) return { days: new Date(Date.UTC(year, month, 0)).getUTCDate() };
  const lunarMonth = LunarMonth.fromYm(year, leapDraft.value ? -month : month);
  return lunarMonth ? { days: lunarMonth.getDayCount() } : null;
});
const bounds = computed<Record<Part, [number, number]>>(() => {
  const { start, end } = calendarLimits.value, year = Number(fields.year), month = Number(fields.month);
  const firstYear = year === start[0], lastYear = year === end[0];
  return {
    year: [start[0], end[0]], month: [firstYear ? start[1] : 1, lastYear ? end[1] : 12],
    day: [firstYear && month === start[1] ? start[2] : 1, lastYear && month === end[1] ? end[2] : calendarMonth.value?.days ?? (props.lunar ? 30 : 31)],
    hour: [0, 23], minute: [0, 59],
  };
});
const fieldErrors = computed(() => {
  const result = { year: '', month: '', day: '', hour: '', minute: '' };
  const labels = { year: '年份', month: '月份', day: '日期', hour: '小时', minute: '分钟' };
  for (const part of Object.keys(result) as Part[]) {
    const raw = fields[part] || '';
    if (!raw) continue;
    const [min, max] = bounds.value[part];
    if (part === 'year' && /^\d{1,3}$/.test(raw)) continue;
    if (!(part === 'year' ? /^\d{4}$/ : /^\d{1,2}$/).test(raw) || Number(raw) < min || Number(raw) > max) result[part] = `请填写有效的${labels[part]}`;
  }
  if (!result.month && calendarMonth.value === null) result.month = '所选农历闰月不存在，请核对年份和月份';
  return result;
});
watch(fieldErrors, async () => { await nextTick(); syncNativeInputs(); }, { flush: 'post' });
const canConfirm = computed(() => { try { value(); return true; } catch { return false; } });
const liveError = computed(() => {
  const invalidField = Object.values(fieldErrors.value).find(Boolean);
  if (invalidField) return invalidField;
  if (Object.values(fields).some(text => !text)) return '';
  if (/^\d{1,3}$/.test(fields.year)) return '';
  try { value(); return ''; } catch (reason: any) { return reason.message; }
});
watch(() => [props.date, props.clock, props.leap], () => {
  [fields.year, fields.month, fields.day] = props.date.replace(/\//g, '-').split('-');
  [fields.hour, fields.minute] = props.clock.split(':');
  leapDraft.value = props.leap;
  normalizeAll();
}, { immediate: true });
function normalizePart(part: Part) {
  const raw = (fields[part] || '').trim();
  if (raw && !/^-?\d+$/.test(raw)) return;
  const [min, max] = bounds.value[part];
  const next = Math.min(max, Math.max(min, raw ? Number(raw) : min));
  fields[part] = part === 'year' ? String(next) : String(next).padStart(2, '0');
}
function normalizeDay() { if (calendarMonth.value && /^\d+$/.test(fields.day || '')) normalizePart('day'); }
function normalizeMonth() { if (/^\d{4}$/.test(fields.year || '') && /^\d+$/.test(fields.month || '')) normalizePart('month'); }
function normalizeAll() { for (const part of ['year', 'month', 'day', 'hour', 'minute'] as Part[]) normalizePart(part); }
function setPart(part: Part, event: any) {
  const raw = String(event.detail?.value ?? event.target?.value ?? '').trim();
  fields[part] = raw;
  // Leave unfinished low prefixes such as 1/19/198 and 0/01 editable.
  if (/^-?\d+$/.test(raw) && (raw.length >= (part === 'year' ? 4 : 2) || Number(raw) > bounds.value[part][1] || Number(raw) < 0)) normalizePart(part);
  if (part === 'year') normalizeMonth();
  if (part === 'year' || part === 'month') normalizeDay();
  error.value = ''; emit('edit'); void nextTick(syncNativeInputs);
}
function finishPart(part: Part) { normalizePart(part); if (part === 'year') normalizeMonth(); if (part === 'year' || part === 'month') normalizeDay(); error.value = ''; emit('edit'); void nextTick(syncNativeInputs); }
function setLeap(value: boolean) { leapDraft.value = value; normalizeDay(); error.value = ''; emit('edit'); void nextTick(syncNativeInputs); }
function selectInput(event: any) {
  // #ifdef H5
  const input = event.target?.select ? event.target : typeof document !== 'undefined' ? document.activeElement : null;
  try { input?.select?.(); } catch { /* Some native number controls do not expose text selection. */ }
  // #endif
}
function value() {
  const invalidField = Object.values(fieldErrors.value).find(Boolean);
  if (invalidField) throw new Error(invalidField);
  if (!/^\d{4}$/.test(fields.year || '') || ['month', 'day', 'hour', 'minute'].some(key => !/^\d{1,2}$/.test(fields[key as Part] || ''))) throw new Error('请填写完整的年、月、日、时、分');
  const pad = (text: string) => text.padStart(2, '0');
  const date = `${fields.year}-${pad(fields.month)}-${pad(fields.day)}`, clock = `${pad(fields.hour)}:${pad(fields.minute)}`;
  if (props.lunar) lunarCivilToSolar(date, clock, leapDraft.value);
  else parseCivil(`${date} ${clock}`);
  return { date, clock, leap: props.lunar && leapDraft.value };
}
const preview = computed(() => {
  try {
    const next = value();
    if (props.lunar) return `对应公历 ${lunarCivilToSolar(next.date, next.clock, next.leap)}`;
    const p = parseCivil(`${next.date} ${next.clock}`);
    return `农历 ${Solar.fromYmd(p.year, p.month, p.day).getLunar().toString()} · ${next.clock}`;
  } catch { return ''; }
});
function confirm() { normalizeAll(); void nextTick(syncNativeInputs); try { emit('confirm', value()); } catch (reason: any) { error.value = reason.message; } }
</script>

<style scoped>
.datetime-backdrop { position:fixed; inset:0; z-index:2100; display:flex; flex-direction:row; align-items:center; justify-content:center; padding:24px; min-height:0; background:rgba(21,43,52,.32); backdrop-filter:blur(6px); box-sizing:border-box; }
.datetime-dialog { position:relative; display:flex; flex-direction:column; width:100%; max-width:440px; max-height:calc(100dvh - 48px); border:1px solid var(--x-line); border-radius:24px; overflow:hidden; background:var(--x-paper); box-shadow:0 24px 80px #163a4933; }
.datetime-header { padding:24px 64px 20px 24px; background:var(--x-gradient-soft); flex-shrink:0; }
.datetime-header h2 { margin:6px 0 0; font-size:20px; line-height:1.5; font-weight:600; color:var(--x-ink); }
.datetime-eyebrow,.datetime-hint { color:var(--x-muted); font-size:11px; line-height:1.8; }
.datetime-body { flex:1 1 auto; padding:22px 24px; overflow-y:auto; overscroll-behavior:contain; min-height:0; }
.datetime-label { display:block; color:var(--x-body); font-size:12px; font-weight:500; }
.datetime-date-fields { display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:10px; margin-top:9px; }
.datetime-part { min-width:0; }
.datetime-field.has-error { border-color:#cc6c60; background:#fff7f5; }
.datetime-field { display:flex; flex-direction:row; align-items:center; gap:4px; min-width:0; min-height:52px; box-sizing:border-box; padding:0 12px; border:1px solid var(--x-line); border-radius:11px; background:var(--x-bg); }
.datetime-field:focus-within { border-color:var(--x-accent); box-shadow:0 0 0 2px var(--x-tint); }
.datetime-field.has-error:focus-within { border-color:#cc6c60; box-shadow:0 0 0 2px #fbebe7; }
.datetime-field input { flex:1; width:0; min-width:0; height:50px; color:var(--x-ink); font-size:19px; font-weight:500; font-variant-numeric:tabular-nums; outline:none; }
.datetime-field>uni-text,.datetime-field>text { font-size:10px; white-space:nowrap; color:var(--x-muted); }
.datetime-lunar { display:flex; flex-direction:row; gap:8px; margin-top:12px; }
.datetime-lunar button { min-height:36px; padding:8px 16px; border:1px solid var(--x-line); border-radius:8px; font-size:12px; color:var(--x-body); background:var(--x-paper); }
.datetime-lunar button.selected { border-color:var(--x-accent); color:var(--x-accent); background:var(--x-gradient-soft); }
.datetime-clock-heading { display:flex; flex-direction:row; align-items:center; justify-content:space-between; margin:22px 0 9px; }
.datetime-muted { margin-left:6px; color:var(--x-muted); font-size:10px; font-weight:400; }
.datetime-now { padding:5px 0 5px 12px; color:var(--x-accent); font-size:11px; background:transparent; }
.datetime-clock-fields { display:grid; grid-template-columns:1fr 10px 1fr; align-items:center; gap:8px; }
.datetime-clock-fields input { text-align:center; font-size:22px; }
.datetime-colon { text-align:center; color:var(--x-muted); font-size:20px; }
.datetime-preview { display:block; margin-top:17px; padding:10px 12px; border-radius:9px; background:var(--x-gradient-soft); color:var(--x-body); font-size:11px; line-height:1.7; overflow-wrap:anywhere; }
.datetime-hint { display:block; margin-top:10px; }
.datetime-error { display:block; margin-top:12px; color:#a13232; font-size:12px; line-height:1.7; }
.datetime-footer { display:flex; flex-direction:row; gap:12px; padding:16px 24px 20px; border-top:1px solid var(--x-line); flex-shrink:0; }
.datetime-footer button { min-height:44px; border-radius:10px; padding:12px 16px; font-size:13px; }
.datetime-cancel { flex:1; border:1px solid var(--x-line); background:var(--x-paper); color:var(--x-body); }
.datetime-confirm { display:flex; flex-direction:row; align-items:center; justify-content:center; gap:24px; flex:1.6; color:#fff; background:var(--x-gradient); }
.datetime-confirm[aria-disabled='true'] { background:var(--x-line); color:var(--x-muted); cursor:not-allowed; }
.datetime-close { position:absolute; right:20px; top:26px; display:flex; flex-direction:row; justify-content:center; align-items:center; width:34px; height:34px; padding:0; border-radius:50%; color:var(--x-body); background:var(--x-paper); font-size:22px; }
@media(max-width:600px) { .datetime-backdrop { padding:12px; padding-bottom:max(12px,env(safe-area-inset-bottom)); align-items:flex-end; } .datetime-dialog { max-height:calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); border-radius:22px; } .datetime-header { padding:21px 60px 17px 20px; } .datetime-body { padding:20px; } .datetime-footer { padding:14px 20px 18px; } .datetime-close { right:18px; top:24px; } }
@media(max-width:360px) { .datetime-date-fields { gap:7px; grid-template-columns:1.45fr 1fr 1fr; } .datetime-field { padding-inline:8px; } .datetime-field input { font-size:17px; } .datetime-body { padding-inline:16px; } .datetime-header { padding-left:16px; } .datetime-footer { padding-inline:16px; } }
</style>
