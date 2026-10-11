<template>
	<view class="protocol-reader" @keydown.esc.prevent="emit('close')">
		<view class="protocol-header">
			<text class="protocol-title">{{ document.title }}</text>
			<view class="protocol-close" v-bind="h5Button(() => emit('close'))" @tap="emit('close')">
				<text>关闭说明</text>
			</view>
		</view>
		<text class="protocol-date">更新日期：{{ document.updatedAt }}</text>
		<scroll-view scroll-y class="protocol-scroll" :style="{ height: height + 'px' }" tabindex="0" :aria-label="document.title + '正文'">
			<view v-for="section in document.sections" :key="section.title" class="protocol-section">
				<text class="protocol-section-title">{{ section.title }}</text>
				<text v-for="paragraph in section.paragraphs" :key="paragraph" class="protocol-paragraph">{{ paragraph }}</text>
			</view>
		</scroll-view>
		<view class="protocol-footer">
			<text>阅读后可关闭说明，返回原来的表单。</text>
		</view>
	</view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { protocols } from '@/features/auth/protocols';
import type { ProtocolType } from '@/features/auth/protocols';
import { h5Button } from '@/utils/keyboard';

const props = defineProps<{ type: ProtocolType; height: number }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const document = computed(() => protocols[props.type]);
</script>

<style scoped>
.protocol-reader {
	margin: 16px;
	padding: 20px;
	border-radius: 16px;
	background: #ffffff;
	color: #253047;
}
.protocol-header {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}
.protocol-title {
	font-size: 22px;
	font-weight: 700;
}
.protocol-close {
	flex-shrink: 0;
	padding: 10px 12px;
	border-radius: 8px;
	background: #eef1ff;
	color: #384caa;
	font-size: 14px;
	cursor: pointer;
}
.protocol-close:focus-visible {
	outline: 2px solid #384caa;
	outline-offset: 3px;
}
.protocol-date {
	display: block;
	margin: 12px 0;
	color: #607086;
	font-size: 13px;
}
.protocol-scroll {
	min-height: 180px;
}
.protocol-section {
	padding: 8px 0 12px;
}
.protocol-section-title {
	display: block;
	margin-bottom: 8px;
	font-size: 16px;
	font-weight: 700;
	line-height: 1.6;
}
.protocol-paragraph {
	display: block;
	margin-bottom: 10px;
	font-size: 14px;
	line-height: 1.9;
}
.protocol-footer {
	padding-top: 12px;
	border-top: 1px solid #e5eaf1;
	font-size: 12px;
	color: #607086;
	line-height: 1.6;
}
</style>
