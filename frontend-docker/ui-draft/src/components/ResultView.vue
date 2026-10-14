<script setup lang="ts">
import { useDraft } from '../useDraft';
const { state, types, isLiuyao, usePrompt, editChart, saveChart, tabKeydown } = useDraft();
import ChartPreview from './ChartPreview.vue';
</script>
<template>
	<section
		class="view"
		id="view-result"
		aria-labelledby="result-title"
		v-show="state.view === 'result'"
		v-if="state.current"
	>
		<div class="page-intro">
			<div class="result-top">
				<div>
					<p class="eyebrow" id="result-eyebrow">{{ types[state.type].english + ' · 示例' }}</p>
					<h1 id="result-title">{{ types[state.type].result }}</h1>
				</div>
				<div class="result-actions">
					<h5-button data-ui="button" class="btn" id="edit-chart" v-on:click="editChart"
						>修改信息</h5-button
					><h5-button
						data-ui="button"
						class="btn primary"
						id="save-chart"
						v-on:click="saveChart"
						:disabled="state.current?.saved"
						><svg class="icon" aria-hidden="true"><use href="#i-save"></use></svg
						>{{ state.current?.saved ? '已在草稿历史' : '保存到草稿历史' }}</h5-button
					>
				</div>
			</div>
			<div class="result-meta" id="result-meta">
				<span class="pill"
					>{{ state.current?.name || '未命名'
					}}{{ state.current?.gender && !isLiuyao ? ' · ' + state.current.gender : '' }}</span
				><span
					>{{ state.current?.calendar }} {{ state.current?.date }} {{ state.current?.time
					}}{{ isLiuyao ? ' · UTC+8' : '' }}</span
				><span>固定示例盘面</span>
			</div>
			<div class="notice">
				示例命盘仅用于评审界面，未根据输入信息进行排盘计算；解读内容为静态演示。
			</div>
		</div>
		<div class="result-tabs" role="tablist" aria-label="结果内容">
			<h5-button
				data-ui="button"
				class="result-tab"
				role="tab"
				id="tab-chart"
				data-tab="chart"
				aria-controls="result-chart"
				v-on:click="state.resultTab = 'chart'"
				:class="{ active: state.resultTab === 'chart' }"
				:aria-selected="state.resultTab === 'chart'"
				:tabindex="state.resultTab === 'chart' ? 0 : -1"
				v-on:keydown="tabKeydown"
				>命盘总览</h5-button
			><h5-button
				data-ui="button"
				class="result-tab"
				role="tab"
				id="tab-insight"
				data-tab="insight"
				aria-controls="result-insight"
				v-on:click="state.resultTab = 'insight'"
				:class="{ active: state.resultTab === 'insight' }"
				:aria-selected="state.resultTab === 'insight'"
				:tabindex="state.resultTab === 'insight' ? 0 : -1"
				v-on:keydown="tabKeydown"
				>解读示例</h5-button
			><h5-button
				data-ui="button"
				class="result-tab"
				role="tab"
				id="tab-timeline"
				data-tab="timeline"
				aria-controls="result-timeline"
				v-on:click="state.resultTab = 'timeline'"
				:class="{ active: state.resultTab === 'timeline' }"
				:aria-selected="state.resultTab === 'timeline'"
				:tabindex="state.resultTab === 'timeline' ? 0 : -1"
				v-on:keydown="tabKeydown"
				>阅读指引</h5-button
			>
		</div>
		<div
			id="result-chart"
			role="tabpanel"
			aria-labelledby="tab-chart"
			v-show="state.resultTab === 'chart'"
		>
			<div class="result-layout">
				<div class="panel chart-panel" id="chart-display"><chart-preview></chart-preview></div>
				<aside class="reading">
					<div class="eyebrow">EXPLORE A LITTLE DEEPER</div>
					<h2>看见结构，再聊细节。</h2>
					<p>把盘面与自己的生活经验放在一起，尝试提出更具体的问题。</p>
					<span class="pill">示例内容 · 文化探索</span
					><h5-button
						data-ui="button"
						class="btn primary"
						id="ask-chart"
						v-on:click="
							usePrompt(
								'请结合这张' + types[state.type].result + '示例，告诉我应该从哪些方面开始理解。'
							)
						"
						><svg class="icon"><use href="#i-spark"></use></svg>带着这张盘，问问 AI</h5-button
					>
				</aside>
			</div>
		</div>
		<div
			id="result-insight"
			class="panel reading-content"
			role="tabpanel"
			aria-labelledby="tab-insight"
			v-show="state.resultTab === 'insight'"
		>
			<p class="eyebrow">READING PREVIEW</p>
			<h2>先认识自己，再理解变化</h2>
			<p>
				正式解读可以从整体结构出发，再聚焦事业、关系或人生节奏。这里展示内容的阅读层级，不代表对个人命盘的判断。
			</p>
			<div class="insight-grid">
				<div class="insight">
					<strong>01 · 整体结构</strong>
					<p>先呈现核心信息，再解释专业名词。</p>
				</div>
				<div class="insight">
					<strong>02 · 重点主题</strong>
					<p>围绕你关心的问题，组织相关内容。</p>
				</div>
				<div class="insight">
					<strong>03 · 继续追问</strong>
					<p>保留命盘上下文，让下一步更自然。</p>
				</div>
			</div>
		</div>
		<div
			id="result-timeline"
			class="panel reading-content"
			role="tabpanel"
			aria-labelledby="tab-timeline"
			v-show="state.resultTab === 'timeline'"
		>
			<p class="eyebrow">A GUIDE TO YOUR CHART</p>
			<h2>把复杂的命盘，慢慢读懂</h2>
			<p>
				① 核对姓名、日期和时辰。<br />② 从命盘总览了解主要结构。<br />③ 选择一个关心的主题，继续与
				AI 探讨。<br />④ 保存记录，方便之后回顾。
			</p>
			<p style="margin-top: 18px; font-size: 11px">本草稿不包含真实排盘、账号同步或模型请求。</p>
		</div>
	</section>
</template>
