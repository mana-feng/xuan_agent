<script setup lang="ts">
import { useDraft } from '../useDraft';
const { state, filteredRecords } = useDraft();
import RecordList from './RecordList.vue';
</script>
<template>
	<section
		class="view"
		id="view-history"
		aria-labelledby="history-title"
		v-show="state.view === 'history'"
	>
		<div class="page-intro">
			<p class="eyebrow">YOUR EXPLORATIONS</p>
			<h1 id="history-title">每一次探索，都有迹可循</h1>
			<p class="page-description">回到曾经的问题，也许会有新的理解。以下为本次草稿中的示例记录。</p>
		</div>
		<div class="history-toolbar">
			<h5-label data-ui="label" class="search-box"
				><svg class="icon"><use href="#i-search"></use></svg
				><h5-input
					data-ui="input"
					id="history-search"
					aria-label="搜索历史记录"
					placeholder="搜索称呼、主题或日期"
					v-model="state.search" /></h5-label
			><h5-button
				data-ui="button"
				class="btn"
				id="sort-records"
				v-on:click="state.ascending = !state.ascending"
				><svg class="icon"><use href="#i-sort"></use></svg
				><span>{{ state.ascending ? '最早优先' : '最近优先' }}</span></h5-button
			>
		</div>
		<div class="history-filters" role="group" aria-label="按排盘类型筛选">
			<h5-button
				data-ui="button"
				class="filter"
				data-filter="all"
				v-on:click="state.filter = 'all'"
				:aria-pressed="state.filter === 'all'"
				:class="{ active: state.filter === 'all' }"
				>全部</h5-button
			><h5-button
				data-ui="button"
				class="filter"
				data-filter="bazi"
				v-on:click="state.filter = 'bazi'"
				:aria-pressed="state.filter === 'bazi'"
				:class="{ active: state.filter === 'bazi' }"
				>八字</h5-button
			><h5-button
				data-ui="button"
				class="filter"
				data-filter="liuyao"
				v-on:click="state.filter = 'liuyao'"
				:aria-pressed="state.filter === 'liuyao'"
				:class="{ active: state.filter === 'liuyao' }"
				>六爻</h5-button
			><h5-button
				data-ui="button"
				class="filter"
				data-filter="ziwei"
				v-on:click="state.filter = 'ziwei'"
				:aria-pressed="state.filter === 'ziwei'"
				:class="{ active: state.filter === 'ziwei' }"
				>紫微</h5-button
			>
		</div>
		<div class="panel history-list" id="history-records">
			<record-list :records="filteredRecords"></record-list>
		</div>
		<div class="history-count" id="history-count" aria-live="polite">
			{{ '共 ' + filteredRecords.length + ' 条示例记录 · 当前会话内保存，刷新后重置' }}
		</div>
	</section>
</template>
