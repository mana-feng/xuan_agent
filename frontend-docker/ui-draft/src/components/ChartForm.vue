<script setup lang="ts">
import { useDraft } from '../useDraft';
const {
	state,
	types,
	chartQuestion,
	isLiuyao,
	form,
	isLunar,
	helpItems,
	usePrompt,
	submitChart,
} = useDraft();
import QiguaTime from './QiguaTime.vue';
</script>
<template>
	<section class="view" id="view-form" aria-labelledby="form-title" v-show="state.view === 'form'">
		<div class="page-intro">
			<p class="eyebrow" id="form-eyebrow">{{ types[state.type].english }}</p>
			<h1 id="form-title">{{ types[state.type].title }}</h1>
			<p class="page-description" id="form-description">{{ types[state.type].description }}</p>
			<div class="steps">
				<span class="step current"><b>1</b>填写信息</span><span class="step"><b>2</b>查看命盘</span
				><span class="step"><b>3</b>深入解读</span>
			</div>
		</div>
		<div class="form-layout">
			<h5-form
				data-ui="form"
				class="panel form-panel"
				id="chart-form"
				v-on:submit.prevent="submitChart"
				><div class="block-title">
					<svg class="icon"><use href="#i-user"></use></svg>
					<h2>基本信息</h2>
				</div>
				<div class="field-grid">
					<div class="field">
						<h5-label data-ui="label" for="chart-name">称呼 <span>选填</span></h5-label
						><h5-input
							data-ui="input"
							id="chart-name"
							name="name"
							placeholder="怎么称呼你？"
							maxlength="30"
							autocomplete="off"
							v-model="form.name"
						/>
					</div>
					<div class="field" id="gender-field" v-show="!isLiuyao">
						<span class="field-title" id="gender-label">性别</span>
						<div class="segmented" role="group" aria-labelledby="gender-label">
							<h5-label data-ui="label"
								><h5-input
									data-ui="input"
									type="radio"
									name="gender"
									value="男"
									v-model="state.birth.gender"
								/>男</h5-label
							><h5-label data-ui="label"
								><h5-input
									data-ui="input"
									type="radio"
									name="gender"
									value="女"
									v-model="state.birth.gender"
								/>女</h5-label
							>
						</div>
					</div>
					<div class="field full" id="question-field" v-show="isLiuyao">
						<h5-label data-ui="label" for="chart-question"
							>想问的事 <span>请围绕一个具体问题</span></h5-label
						><h5-textarea
							data-ui="textarea"
							id="chart-question"
							rows="3"
							maxlength="200"
							placeholder="例如：这次合作的推进情况如何？"
							v-model="state.liuyao.question"
							:required="isLiuyao"
							ref="chartQuestion"
						></h5-textarea>
					</div>
				</div>
				<hr class="form-divider" />
				<fieldset
					id="birth-time-fields"
					class="time-fieldset"
					v-show="!isLiuyao"
					:disabled="isLiuyao"
				>
					<div class="block-title">
						<svg class="icon"><use href="#i-clock"></use></svg>
						<h2 id="time-title">出生时间</h2>
					</div>
					<div class="field-grid">
						<div class="field full">
							<span class="field-title" id="calendar-label">历法</span>
							<div class="segmented" role="group" aria-labelledby="calendar-label">
								<h5-label data-ui="label"
									><h5-input
										data-ui="input"
										type="radio"
										name="calendar"
										value="阳历"
										v-model="state.birth.calendar"
									/>阳历（公历）</h5-label
								><h5-label data-ui="label"
									><h5-input
										data-ui="input"
										type="radio"
										name="calendar"
										value="阴历"
										v-model="state.birth.calendar"
									/>阴历（农历）</h5-label
								>
							</div>
						</div>
						<div class="field" id="solar-field" v-show="!isLunar">
							<h5-label data-ui="label" for="chart-date" id="date-label">出生日期</h5-label
							><h5-input
								data-ui="input"
								id="chart-date"
								type="date"
								min="1900-01-01"
								max="2099-12-30"
								v-model="state.birth.date"
								:required="!isLunar"
								:disabled="isLunar"
							/>
						</div>
						<div class="field" id="lunar-field" v-show="isLunar">
							<h5-label data-ui="label" for="lunar-year">农历日期</h5-label>
							<div class="row" style="gap: 6px">
								<h5-input
									data-ui="input"
									id="lunar-year"
									type="number"
									min="1900"
									max="2099"
									placeholder="年份"
									aria-label="农历年份"
									style="width: 40%"
									v-model="state.birth.lunarYear"
									:required="isLunar"
									:disabled="!isLunar"
								/><select
									id="lunar-month"
									aria-label="农历月份"
									style="width: 32%"
									v-model="state.birth.lunarMonth"
								>
									<option value="1">正月</option>
									<option value="2">二月</option>
									<option value="3">三月</option>
									<option value="4">四月</option>
									<option value="5">五月</option>
									<option value="6">六月</option>
									<option value="7">七月</option>
									<option value="8">八月</option>
									<option value="9">九月</option>
									<option value="10">十月</option>
									<option value="11">冬月</option>
									<option value="12">腊月</option></select
								><h5-input
									data-ui="input"
									id="lunar-day"
									type="number"
									min="1"
									max="30"
									placeholder="日"
									aria-label="农历日"
									style="width: 28%"
									v-model="state.birth.lunarDay"
									:required="isLunar"
									:disabled="!isLunar"
								/>
							</div>
							<h5-label data-ui="label" class="small"
								><h5-input
									data-ui="input"
									id="lunar-leap"
									type="checkbox"
									v-model="state.birth.lunarLeap"
								/>闰月</h5-label
							>
						</div>
						<div class="field">
							<h5-label data-ui="label" for="chart-time" id="hour-label"
								>出生时间 <span>精确到分钟</span></h5-label
							><h5-input
								data-ui="input"
								id="chart-time"
								type="time"
								required=""
								v-model="state.birth.time"
							/>
						</div>
						<p class="help-text field full" id="calendar-hint">
							{{
								isLunar
									? '农历日期请填写年份、月份与日数；遇到闰月请勾选。草稿不会换算历法。'
									: '请按所选历法填写日期，避免阴阳历混用。'
							}}
						</p>
					</div>
				</fieldset>
				<qigua-time></qigua-time>
				<div class="form-bottom">
					<p class="help-text">草稿仅演示信息输入与结果布局，提交后展示固定示例命盘。</p>
					<h5-button data-ui="button" class="btn primary" type="submit"
						>查看命盘示例<svg class="icon"><use href="#i-arrow"></use></svg
					></h5-button></div
			></h5-form>
			<aside class="help-panel">
				<svg class="icon"><use href="#i-leaf"></use></svg>
				<h2 id="help-title">{{ isLiuyao ? '把问题，问得更具体' : '每个时刻，都有来处' }}</h2>
				<p id="help-description">
					{{
						isLiuyao
							? '六爻适合聚焦一件事。描述你正在面对的情况，以及你最想了解的部分。'
							: '准确的出生时间，是理解命盘的起点。你可以先向家人确认，或查看出生证明。'
					}}
				</p>
				<ol id="help-list">
					<li v-for="item in helpItems" :key="item">{{ item }}</li>
				</ol>
				<h5-button
					data-ui="button"
					class="text-btn"
					data-prompt="我还不确定自己的出生时间，应该如何开始？"
					v-on:click="
						usePrompt(
							isLiuyao
								? '起卦时间应该怎么填写，当前时间和指定时间有什么区别？'
								: '我还不确定自己的出生时间，应该如何开始？'
						)
					"
					>不确定怎么填？问问 AI<svg class="icon"><use href="#i-arrow"></use></svg
				></h5-button>
			</aside>
		</div>
	</section>
</template>
