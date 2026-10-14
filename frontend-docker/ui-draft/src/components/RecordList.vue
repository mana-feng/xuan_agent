<script setup lang="ts">
import { useDraft } from '../useDraft';
const { types, openRecord } = useDraft();
import type { DraftRecord } from '../useDraft';
defineProps<{ records: DraftRecord[] }>();
</script>
<template>
	<div>
		<h5-button
			data-ui="button"
			v-for="record in records"
			:key="record.id"
			class="record-row"
			:data-record="record.id"
			:aria-label="'打开' + record.title"
			@click="openRecord(record)"
			><span class="record-symbol">{{ types[record.type].symbol }}</span
			><span
				><span class="record-name" style="display: block">{{ record.title }}</span
				><span class="record-subtitle" style="display: block">{{ record.subtitle }}</span></span
			><span class="record-type">{{ types[record.type].short }} · 示例</span
			><span class="record-date">{{ record.created.slice(5).replace('-', ' / ') }}</span
			><svg class="icon" aria-hidden="true"><use href="#i-chevron" /></svg
		></h5-button>
		<div v-if="!records.length" class="empty">没有找到相关记录。试试其他关键词或排盘类型。</div>
	</div>
</template>
