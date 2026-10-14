<script setup lang="ts">
import { useDraft } from '../useDraft';
const {
	state,
	prompt,
	conversation,
	recentRecords,
	navigate,
	usePrompt,
	newChat,
	sendMessage,
	promptKeydown,
} = useDraft();
import RecordList from './RecordList.vue';
</script>
<template>
	<section class="view" id="view-home" aria-label="问问 AI" v-show="state.view === 'home'">
		<div class="hero" id="welcome" v-show="!state.messages.length">
			<div class="hero-copy">
				<div class="eyebrow">一点古老智慧，一份全新视角</div>
				<h1>观象，知己。<br /><span>从你的一个问题开始。</span></h1>
				<p>让 AI 帮你理清思绪，找到适合自己的探索方式。</p>
			</div>
			<div class="hero-art" aria-hidden="true">
				<div class="cosmos">
					<i class="orbit-line"></i><i class="orbit-line second"></i
					><span class="trigram t1">☰</span><span class="trigram t2">☱</span
					><span class="trigram t3">☲</span><span class="trigram t4">☳</span
					><span class="trigram t5">☷</span><span class="trigram t6">☶</span
					><span class="trigram t7">☵</span><span class="trigram t8">☴</span>
					<div class="yin"></div>
					<i class="orbit-star"></i>
				</div>
				<span class="art-caption">万物有时 · 自有回响</span>
			</div>
		</div>
		<div class="chat-header" id="chat-header" v-show="state.messages.length > 0">
			<div>
				<p class="eyebrow" style="font-size: 9px; margin-bottom: 5px">A MOMENT OF CLARITY</p>
				<h2 class="serif">一起理清你的问题</h2>
			</div>
			<h5-button data-ui="button" class="text-btn" data-action="new-chat" v-on:click="newChat"
				><svg class="icon"><use href="#i-plus"></use></svg>新的探索</h5-button
			>
		</div>
		<div
			class="conversation"
			id="conversation"
			role="log"
			aria-live="polite"
			aria-label="示例对话"
			v-show="state.messages.length > 0"
			ref="conversation"
		>
			<template v-for="(message, index) in state.messages" :key="index"
				><div class="chat-row user">
					<div class="chat-avatar">我</div>
					<div class="chat-content">
						<p>{{ message.text }}</p>
					</div>
				</div>
				<div class="chat-row">
					<div class="chat-avatar">玄</div>
					<div class="chat-content">
						<h3>
							玄学 AI
							<span class="muted" style="font-size: 10px; font-weight: 400">· 静态回复示例</span>
						</h3>
						<p>{{ message.reply }}</p>
						<div class="chat-action">
							<div>
								<strong>{{ message.label }}</strong>
								<p>继续体验{{ message.target === 'history' ? '记录检索' : '信息填写' }}流程</p>
							</div>
							<h5-button data-ui="button" class="btn primary" @click="navigate(message.target)"
								>前往{{ message.label
								}}<svg class="icon" aria-hidden="true"><use href="#i-arrow"></use></svg
							></h5-button>
						</div>
					</div></div
			></template>
		</div>
		<h5-form data-ui="form" class="composer" id="chat-form" v-on:submit.prevent="sendMessage"
			><h5-label data-ui="label" class="composer-heading" for="prompt"
				><svg class="icon"><use href="#i-spark"></use></svg>你的专属探索助手</h5-label
			><h5-textarea
				data-ui="textarea"
				id="prompt"
				rows="2"
				maxlength="1000"
				placeholder="最近有什么想了解的？比如：我想了解自己的事业发展方向……"
				v-model="state.prompt"
				ref="prompt"
				v-on:keydown="promptKeydown"
			></h5-textarea>
			<div class="composer-bottom">
				<span class="compose-mode"
					><svg class="icon"><use href="#i-leaf"></use></svg>先聊聊，再选盘</span
				>
				<div class="compose-right">
					<span class="keyboard-tip">Enter 发送 · Shift + Enter 换行</span
					><h5-button
						data-ui="button"
						class="send-btn"
						id="send"
						type="submit"
						:disabled="!state.prompt.trim()"
						>开始探索<svg class="icon"><use href="#i-up"></use></svg
					></h5-button>
				</div></div
		></h5-form>
		<div class="suggestions">
			<span>不妨试试</span
			><h5-button
				data-ui="button"
				class="suggestion"
				data-prompt="我不确定八字、六爻和紫微有什么区别，帮我选一个适合的工具。"
				v-on:click="usePrompt('我不确定八字、六爻和紫微有什么区别，帮我选一个适合的工具。')"
				>帮我选合适的盘</h5-button
			><h5-button
				data-ui="button"
				class="suggestion"
				data-prompt="我想从传统命理的角度，了解自己的事业发展方向。"
				v-on:click="usePrompt('我想从传统命理的角度，了解自己的事业发展方向。')"
				>了解事业方向</h5-button
			><h5-button
				data-ui="button"
				class="suggestion"
				data-prompt="我想回顾一份之前保存的命盘，请带我查看历史记录。"
				v-on:click="usePrompt('我想回顾一份之前保存的命盘，请带我查看历史记录。')"
				>继续上次的探索</h5-button
			>
		</div>
		<section class="tools" id="home-tools" v-show="!state.messages.length">
			<div class="section-heading">
				<h2>也可以，直接开始<span>选一种方式认识自己</span></h2>
			</div>
			<div class="tool-grid">
				<h5-button
					data-ui="button"
					class="tool-card"
					data-route="bazi"
					v-on:click="navigate('bazi')"
					><div class="tool-head">
						<span class="tool-icon"
							><svg class="icon"><use href="#i-grid"></use></svg
						></span>
						<div>
							<h3>八字排盘</h3>
							<div class="english">FOUR PILLARS</div>
						</div>
					</div>
					<p>从出生时刻，理解性格与人生节奏</p>
					<div class="tool-footer">
						<span>命局格局 · 大运流年</span><svg class="icon"><use href="#i-arrow"></use></svg></div
				></h5-button>
				<h5-button
					data-ui="button"
					class="tool-card"
					data-route="liuyao"
					v-on:click="navigate('liuyao')"
					><div class="tool-head">
						<span class="tool-icon"
							><svg class="icon"><use href="#i-lines"></use></svg
						></span>
						<div>
							<h3>六爻问事</h3>
							<div class="english">SIX LINES</div>
						</div>
					</div>
					<p>带着一个具体问题，观察当下变化</p>
					<div class="tool-footer">
						<span>一事一问 · 事件走势</span><svg class="icon"><use href="#i-arrow"></use></svg></div
				></h5-button>
				<h5-button
					data-ui="button"
					class="tool-card"
					data-route="ziwei"
					v-on:click="navigate('ziwei')"
					><div class="tool-head">
						<span class="tool-icon"
							><svg class="icon"><use href="#i-star"></use></svg
						></span>
						<div>
							<h3>紫微斗数</h3>
							<div class="english">PURPLE STAR</div>
						</div>
					</div>
					<p>从十二宫位，探索人生的不同面向</p>
					<div class="tool-footer">
						<span>宫位结构 · 人生主题</span><svg class="icon"><use href="#i-arrow"></use></svg></div
				></h5-button>
			</div>
		</section>
		<section class="recent">
			<div class="section-heading">
				<h2>最近的探索<span>示例记录</span></h2>
				<h5-button
					data-ui="button"
					class="text-btn"
					data-route="history"
					v-on:click="navigate('history')"
					>查看全部<svg class="icon"><use href="#i-arrow"></use></svg
				></h5-button>
			</div>
			<div id="recent-records"><record-list :records="recentRecords"></record-list></div>
		</section>
	</section>
</template>
