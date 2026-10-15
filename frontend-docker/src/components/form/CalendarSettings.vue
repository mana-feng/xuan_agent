<template>
	<view class="calendar-settings">
		<button
			class="calendar-toggle"
			:aria-expanded="expanded"
			v-bind="h5Button(() => (expanded = !expanded))"
			@tap="expanded = !expanded"
		>
			<text>时间与排盘口径</text><text>{{ expanded ? '收起 −' : '调整 +' }}</text>
		</button>
		<text class="calendar-summary"
			>{{ timeZone }} · 钟表时间 · 日柱
			{{ rules.dayDivide === 'zi' ? '23:00' : '00:00' }} 换日</text
		>
		<view v-if="expanded" class="calendar-options">
			<text class="calendar-label">{{
				legacy ? '选择这条记录原来排盘时使用的时区' : '日期和时间按这个时区填写'
			}}</text>
			<view class="calendar-choices"
				><button
					v-for="zone in zones"
					:key="zone.id"
					:class="{ selected: timeZone === zone.id }"
					:aria-pressed="timeZone === zone.id"
					v-bind="h5Button(() => emit('update:timeZone', zone.id))"
					@tap="emit('update:timeZone', zone.id)"
				>
					{{ zone.label }}
				</button></view
			>
			<view class="calendar-custom"
				><input
					v-model="zoneDraft"
					aria-label="其他时区名称"
					placeholder="其他时区，如 Europe/Paris"
				/><button v-bind="h5Button(applyZone)" @tap="applyZone">应用时区</button></view
			>
			<text v-if="error" class="calendar-error" role="alert">{{ error }}</text>
			<template v-if="!legacy">
				<text class="calendar-label">子时日界</text>
				<view class="calendar-choices"
					><button
						v-for="option in dayOptions"
						:key="option.id"
						:class="{ selected: rules.dayDivide === option.id }"
						:aria-pressed="rules.dayDivide === option.id"
						v-bind="h5Button(() => updateRule('dayDivide', option.id))"
						@tap="updateRule('dayDivide', option.id)"
					>
						{{ option.label }}
					</button></view
				>
				<text class="calendar-note">{{
					rules.dayDivide === 'midnight'
						? '保留原默认：日柱零点换日；23点后的子时时干按次日日干推算。'
						: '23点起日柱按次日，子时时干随次日日干推算。'
				}}</text>
				<template v-if="casting">
					<text class="calendar-label">时间起卦的年支取数</text>
					<view class="calendar-choices"
						><button
							v-for="option in yearOptions"
							:key="option.id"
							:class="{ selected: rules.yearDivide === option.id }"
							:aria-pressed="rules.yearDivide === option.id"
							v-bind="h5Button(() => updateRule('yearDivide', option.id))"
							@tap="updateRule('yearDivide', option.id)"
						>
							{{ option.label }}
						</button></view
					>
					<text class="calendar-label">时间起卦的闰月取数</text>
					<view class="calendar-choices"
						><button
							v-for="option in leapOptions"
							:key="option.id"
							:class="{ selected: rules.leapMonth === option.id }"
							:aria-pressed="rules.leapMonth === option.id"
							v-bind="h5Button(() => updateRule('leapMonth', option.id))"
							@tap="updateRule('leapMonth', option.id)"
						>
							{{ option.label }}
						</button></view
					>
					<text class="calendar-note"
						>仅影响时间起卦取数。闰月加12沿用旧版规则；按原月数时，闰二月取2。23点换日模式下，时间起卦的农历日期也进入次日。</text
					>
				</template>
				<text v-else class="calendar-note"
					>八字按节气定年、月柱，闰月不分前后半月。起运沿用原来的时辰折算法。</text
				>
				<text class="calendar-label">夏令时结束时，重复出现的钟表时间</text>
				<view class="calendar-choices"
					><button
						v-for="option in overlapOptions"
						:key="option.id"
						:class="{ selected: overlapChoice === option.id }"
						:aria-pressed="overlapChoice === option.id"
						v-bind="h5Button(() => emit('update:overlapChoice', option.id))"
						@tap="emit('update:overlapChoice', option.id)"
					>
						{{ option.label }}
					</button></view
				>
				<text class="calendar-note"
					>按所选时区的钟表时间排盘，不校正真太阳时。保存记录会保留时区、钟面时间和当前规则。</text
				>
			</template>
		</view>
	</view>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { h5Button } from '@/utils/keyboard';
import { calendarCivil, type CalendarRules } from '@/utils/calendarContext';
import type { Disambiguation } from '@/utils/chartTime';
const props = withDefaults(
	defineProps<{
		timeZone: string;
		rules: CalendarRules;
		casting?: boolean;
		legacy?: boolean;
		overlapChoice?: Disambiguation;
	}>(),
	{ overlapChoice: 'reject' }
);
const emit = defineEmits<{
	(e: 'update:timeZone', v: string): void;
	(e: 'update:rules', v: CalendarRules): void;
	(e: 'update:overlapChoice', v: Disambiguation): void;
}>();
const expanded = ref(Boolean(props.legacy)),
	zoneDraft = ref(props.timeZone),
	error = ref('');
watch(
	() => props.timeZone,
	(value) => {
		zoneDraft.value = value;
		error.value = '';
	}
);
const zones = [
	{ id: 'Asia/Shanghai', label: '北京 / 上海' },
	{ id: 'Asia/Hong_Kong', label: '香港' },
	{ id: 'Asia/Singapore', label: '新加坡' },
	{ id: 'Asia/Tokyo', label: '东京' },
	{ id: 'America/New_York', label: '纽约' },
	{ id: 'America/Los_Angeles', label: '洛杉矶' },
	{ id: 'Europe/London', label: '伦敦' },
	{ id: 'Australia/Sydney', label: '悉尼' },
	{ id: 'UTC', label: 'UTC' },
];
const dayOptions = [
	{ id: 'midnight', label: '00:00 换日' },
	{ id: 'zi', label: '23:00 换日' },
] as const;
const yearOptions = [
	{ id: 'lichun', label: '立春换年（旧版）' },
	{ id: 'lunar', label: '春节换年' },
] as const;
const leapOptions = [
	{ id: 'add-twelve', label: '原月数加12（旧版）' },
	{ id: 'same-month', label: '按原月数' },
] as const;
const overlapOptions = [
	{ id: 'reject', label: '遇到重复时提醒' },
	{ id: 'earlier', label: '较早的一次' },
	{ id: 'later', label: '较晚的一次' },
] as const;
function updateRule<K extends keyof CalendarRules>(key: K, value: CalendarRules[K]) {
	emit('update:rules', { ...props.rules, [key]: value });
}
function applyZone() {
	try {
		const zone = zoneDraft.value.trim();
		calendarCivil(Date.now(), zone);
		emit('update:timeZone', zone);
	} catch {
		error.value = '请输入有效时区名称，如 Asia/Shanghai';
	}
}
</script>
<style scoped>
.calendar-settings {
	margin: 16px 0;
	padding-top: 14px;
	border-top: 1px solid var(--x-line, #d8e5ed);
	color: var(--x-body, #315466);
	font-size: 13px;
}
.calendar-toggle {
	display: flex;
	justify-content: space-between;
	align-items: center;
	width: 100%;
	padding: 4px 0;
	border: 0;
	background: transparent;
	color: var(--x-ink, #173747);
	font-size: 14px;
	text-align: left;
}
.calendar-toggle::after,
.calendar-choices button::after,
.calendar-custom button::after {
	border: 0;
}
.calendar-summary,
.calendar-label,
.calendar-note,
.calendar-error {
	display: block;
	line-height: 1.65;
}
.calendar-summary {
	color: var(--x-muted, #607f8c);
	margin: 7px 0;
}
.calendar-label {
	margin: 14px 0 8px;
	font-weight: 600;
}
.calendar-choices {
	display: flex;
	flex-direction: row;
	gap: 8px;
	flex-wrap: wrap;
}
.calendar-choices button,
.calendar-custom button {
	margin: 0;
	padding: 8px 12px;
	line-height: 1.5;
	font-size: 13px;
	border: 1px solid var(--x-line, #d8e5ed);
	border-radius: 8px;
	background: var(--x-paper, #fff);
	color: inherit;
}
.calendar-choices button.selected {
	border-color: var(--x-accent, #1672b1);
	background: var(--x-gradient-soft, linear-gradient(110deg, #e7f2ff, #e6f6ed));
	color: var(--x-accent, #1672b1);
}
.calendar-note {
	margin: 9px 0;
	color: var(--x-muted, #607f8c);
	font-size: 12px;
}
.calendar-custom {
	display: flex;
	flex-direction: row;
	gap: 8px;
	margin: 10px 0;
}
.calendar-custom input {
	min-width: 0;
	flex: 1;
	border: 1px solid var(--x-line, #d8e5ed);
	border-radius: 8px;
	padding: 8px;
	font-size: 13px;
	height: 38px;
}
.calendar-custom button {
	flex-shrink: 0;
}
.calendar-error {
	color: #a44223;
}
</style>
