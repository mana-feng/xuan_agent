<script setup lang="ts">
import { useDraft } from '../useDraft';
const {
	state,
	qiguaDate,
	qiguaClock,
	isLiuyao,
	validQigua,
	qiguaDateText,
	qiguaWeekday,
	qiguaHint,
	restoreNow,
	toggleQigua,
} = useDraft();
</script>
<template>
	<fieldset id="qigua-time-fields" class="time-fieldset" v-show="isLiuyao" :disabled="!isLiuyao">
		<div class="qigua-heading">
			<div class="block-title">
				<svg class="icon"><use href="#i-clock"></use></svg>
				<h2>起卦时间</h2>
			</div>
			<span class="pill">东八区 · UTC+8</span>
		</div>
		<div class="qigua-time-card">
			<div class="qigua-time-main" aria-live="polite">
				<span class="qigua-clock-icon"
					><svg class="icon"><use href="#i-clock"></use></svg
				></span>
				<div>
					<div class="qigua-source" id="qigua-source">
						{{
							validQigua
								? state.qigua.source === 'now'
									? '已取当前时间'
									: '已指定时间'
								: '待补全时间'
						}}
					</div>
					<div class="qigua-date-text" id="qigua-date-text">{{ qiguaDateText }}</div>
					<div class="qigua-clock-row">
						<time
							id="qigua-time-text"
							:datetime="
								validQigua ? state.qigua.date + 'T' + state.qigua.time + ':00+08:00' : undefined
							"
							>{{ validQigua ? state.qigua.time : '--:--' }}</time
						><span id="qigua-weekday">{{ qiguaWeekday }}</span>
					</div>
				</div>
			</div>
			<div class="qigua-time-actions">
				<h5-button
					data-ui="button"
					class="btn"
					type="button"
					id="edit-qigua-time"
					aria-controls="qigua-editor"
					v-on:click="toggleQigua"
					:aria-expanded="state.qiguaEditing"
					>{{ state.qiguaEditing ? '收起修改' : '修改时间' }}</h5-button
				><h5-button
					data-ui="button"
					class="text-btn"
					type="button"
					id="reset-qigua-time"
					v-on:click="restoreNow()"
					><svg class="icon"><use href="#i-clock"></use></svg>恢复现在</h5-button
				>
			</div>
		</div>
		<p class="qigua-time-hint" id="qigua-time-hint">{{ qiguaHint }}</p>
		<fieldset
			class="qigua-editor"
			id="qigua-editor"
			v-show="state.qiguaEditing"
			:disabled="!state.qiguaEditing"
		>
			<legend>指定起卦时间</legend>
			<div class="field-grid">
				<div class="field">
					<h5-label data-ui="label" for="qigua-date">公历日期</h5-label
					><h5-input
						data-ui="input"
						id="qigua-date"
						type="date"
						min="1900-01-01"
						max="2099-12-30"
						required=""
						v-model="state.qigua.date"
						ref="qiguaDate"
						v-on:input="state.qigua.source = 'manual'"
					/>
				</div>
				<div class="field">
					<h5-label data-ui="label" for="qigua-clock">时间 <span>24 小时制</span></h5-label
					><h5-input
						data-ui="input"
						id="qigua-clock"
						type="time"
						step="60"
						required=""
						v-model="state.qigua.time"
						ref="qiguaClock"
						v-on:input="state.qigua.source = 'manual'"
					/>
				</div>
			</div>
			<p class="help-text">按东八区填写，精确到分钟。修改后会固定为你选择的时刻。</p>
		</fieldset>
	</fieldset>
</template>
