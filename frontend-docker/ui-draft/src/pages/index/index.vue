<script setup lang="ts">
import { provide } from 'vue';
import { createDraft, DraftKey } from '../../useDraft';
import HomeView from '../../components/HomeView.vue';
import ChartForm from '../../components/ChartForm.vue';
import ResultView from '../../components/ResultView.vue';
import HistoryView from '../../components/HistoryView.vue';
import DesignNotes from '../../components/DesignNotes.vue';
const context = createDraft();
provide(DraftKey, context);
const {
	state,
	main,
	sidebar,
	openNav,
	closeNav,
	notes,
	activeRoute,
	breadcrumb,
	setNavOpen,
	navigate,
	newChat,
} = context;
</script>
<template>
	<div class="draft-root" :data-palette="state.palette">
		<svg width="0" height="0" aria-hidden="true" style="position: absolute; overflow: hidden">
			<defs>
				<symbol id="i-spark" viewBox="0 0 24 24">
					<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"></path>
					<path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5Z"></path>
				</symbol>
				<symbol id="i-grid" viewBox="0 0 24 24">
					<rect x="4" y="3" width="5" height="18" rx="1"></rect>
					<rect x="15" y="3" width="5" height="18" rx="1"></rect>
					<path d="M4 9h5M4 15h5M15 9h5M15 15h5"></path>
				</symbol>
				<symbol id="i-lines" viewBox="0 0 24 24">
					<path d="M4 5h16M4 10h6m4 0h6M4 15h16M4 20h6m4 0h6"></path>
				</symbol>
				<symbol id="i-star" viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="9"></circle>
					<path d="m12 5 1.7 4.6 4.8.3-3.7 3 1.2 4.8-4-2.7-4 2.7 1.2-4.8-3.7-3 4.8-.3Z"></path>
				</symbol>
				<symbol id="i-clock" viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="9"></circle>
					<path d="M12 7v5l3 2"></path>
				</symbol>
				<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></symbol>
				<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"></path></symbol>
				<symbol id="i-up" viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"></path></symbol>
				<symbol id="i-chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"></path></symbol>
				<symbol id="i-search" viewBox="0 0 24 24">
					<circle cx="10.5" cy="10.5" r="6.5"></circle>
					<path d="m16 16 4 4"></path>
				</symbol>
				<symbol id="i-book" viewBox="0 0 24 24">
					<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"></path>
				</symbol>
				<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"></path></symbol>
				<symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"></path></symbol>
				<symbol id="i-leaf" viewBox="0 0 24 24">
					<path d="M20 3C9 2 3 7 5 15c7 4 15 0 15-12ZM4 21 15 10"></path>
				</symbol>
				<symbol id="i-home" viewBox="0 0 24 24">
					<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"></path>
				</symbol>
				<symbol id="i-user" viewBox="0 0 24 24">
					<circle cx="12" cy="7" r="4"></circle>
					<path d="M4 21v-2a8 8 0 0 1 16 0v2"></path>
				</symbol>
				<symbol id="i-save" viewBox="0 0 24 24">
					<path d="M5 3h12l4 4v14H3V3Zm2 0v7h10V3M7 21v-7h10v7"></path>
				</symbol>
				<symbol id="i-sort" viewBox="0 0 24 24">
					<path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4"></path>
				</symbol>
			</defs>
		</svg>
		<a class="skip-link" href="#main" @click.prevent="main?.focus()">跳到主要内容</a>
		<aside
			class="sidebar"
			id="sidebar"
			aria-label="主导航"
			ref="sidebar"
			:class="{ open: state.navOpen }"
			:inert="state.mobile && !state.navOpen"
		>
			<h5-button
				data-ui="button"
				class="brand"
				data-route="home"
				aria-label="玄学 AI 首页"
				v-on:click="navigate('home')"
				><span class="brand-mark">玄</span
				><span
					><span class="brand-name">玄学 <em>AI</em></span
					><span class="brand-caption" style="display: block">观 象 · 知 己</span></span
				></h5-button
			>
			<h5-button
				data-ui="button"
				class="close-btn sidebar-close"
				aria-label="关闭导航"
				id="close-nav"
				ref="closeNav"
				v-on:click="setNavOpen(false, true)"
				><svg class="icon"><use href="#i-close"></use></svg
			></h5-button>
			<h5-button data-ui="button" class="btn new-chat" data-action="new-chat" v-on:click="newChat"
				><svg class="icon"><use href="#i-plus"></use></svg>开启新对话<kbd>Alt N</kbd></h5-button
			>
			<p class="nav-label">探索</p>
			<nav>
				<h5-button
					data-ui="button"
					class="nav-item"
					data-route="home"
					v-on:click="navigate('home')"
					:class="{ active: activeRoute === 'home' }"
					:aria-current="activeRoute === 'home' ? 'page' : undefined"
					><svg class="icon"><use href="#i-spark"></use></svg>问问 AI</h5-button
				>
				<h5-button
					data-ui="button"
					class="nav-item"
					data-route="bazi"
					v-on:click="navigate('bazi')"
					:class="{ active: activeRoute === 'bazi' }"
					:aria-current="activeRoute === 'bazi' ? 'page' : undefined"
					><svg class="icon"><use href="#i-grid"></use></svg>八字排盘</h5-button
				>
				<h5-button
					data-ui="button"
					class="nav-item"
					data-route="liuyao"
					v-on:click="navigate('liuyao')"
					:class="{ active: activeRoute === 'liuyao' }"
					:aria-current="activeRoute === 'liuyao' ? 'page' : undefined"
					><svg class="icon"><use href="#i-lines"></use></svg>六爻问事</h5-button
				>
				<h5-button
					data-ui="button"
					class="nav-item"
					data-route="ziwei"
					v-on:click="navigate('ziwei')"
					:class="{ active: activeRoute === 'ziwei' }"
					:aria-current="activeRoute === 'ziwei' ? 'page' : undefined"
					><svg class="icon"><use href="#i-star"></use></svg>紫微斗数</h5-button
				>
			</nav>
			<p class="nav-label">我的空间</p>
			<h5-button
				data-ui="button"
				class="nav-item"
				data-route="history"
				v-on:click="navigate('history')"
				:class="{ active: activeRoute === 'history' }"
				:aria-current="activeRoute === 'history' ? 'page' : undefined"
				><svg class="icon"><use href="#i-clock"></use></svg>历史记录</h5-button
			>
			<div class="sidebar-foot">
				<div class="side-poem">
					<p>观天之道<br />以察时变</p>
					<small>一份理解自己的新视角</small>
				</div>
				<div class="profile">
					<div class="avatar">访</div>
					<div>
						<p class="profile-name">访客体验</p>
						<p class="profile-sub">UI 草稿 · 示例模式</p>
					</div>
				</div>
			</div>
		</aside>
		<h5-button
			data-ui="button"
			class="nav-backdrop"
			id="nav-backdrop"
			aria-label="关闭导航"
			v-on:click="setNavOpen(false, true)"
		></h5-button>
		<div class="app">
			<header class="topbar">
				<h5-button
					data-ui="button"
					class="mobile-menu"
					id="open-nav"
					aria-label="打开导航"
					aria-controls="sidebar"
					ref="openNav"
					:aria-expanded="state.navOpen"
					v-on:click="setNavOpen(true)"
					><svg class="icon"><use href="#i-menu"></use></svg
				></h5-button>
				<div class="breadcrumb">
					<svg class="icon"><use href="#i-home"></use></svg
					><span class="crumb-home">我的工作台</span><span class="slash">/</span
					><strong id="breadcrumb-current">{{ breadcrumb }}</strong>
				</div>
				<div class="top-actions">
					<select
						class="palette-select"
						id="palette-select"
						aria-label="选择渐变配色"
						v-model="state.palette"
					>
						<option value="aurora">青蓝流光</option>
						<option value="sunset">琥珀暖阳</option>
						<option value="lake">湖光青翠</option></select
					><span class="draft-badge">Vue 交互草稿 · 示例数据</span
					><h5-button
						data-ui="button"
						class="notes-button"
						id="open-notes"
						v-on:click="notes?.showModal()"
						><svg class="icon"><use href="#i-book"></use></svg>设计说明</h5-button
					>
				</div>
			</header>
			<main class="workspace" id="main" tabindex="-1" ref="main">
				<home-view></home-view>
				<chart-form></chart-form>
				<result-view></result-view>
				<history-view></history-view>
				<footer class="workspace-footer">
					<span class="tiny-logo">玄学 AI · 观象知己</span
					><span>传统文化的新视角，仅作文化探索与自我思考参考</span>
				</footer>
			</main>
		</div>
		<nav class="mobile-bottom" aria-label="移动端快捷导航">
			<h5-button
				data-ui="button"
				class=""
				data-route="home"
				v-on:click="navigate('home')"
				:class="{ active: activeRoute === 'home' }"
				:aria-current="activeRoute === 'home' ? 'page' : undefined"
				><svg class="icon"><use href="#i-spark"></use></svg>问问 AI</h5-button
			><h5-button
				data-ui="button"
				data-route="bazi"
				v-on:click="navigate('bazi')"
				:class="{ active: activeRoute === 'bazi' }"
				:aria-current="activeRoute === 'bazi' ? 'page' : undefined"
				><svg class="icon"><use href="#i-grid"></use></svg>八字</h5-button
			><h5-button
				data-ui="button"
				data-route="liuyao"
				v-on:click="navigate('liuyao')"
				:class="{ active: activeRoute === 'liuyao' }"
				:aria-current="activeRoute === 'liuyao' ? 'page' : undefined"
				><svg class="icon"><use href="#i-lines"></use></svg>六爻</h5-button
			><h5-button
				data-ui="button"
				data-route="ziwei"
				v-on:click="navigate('ziwei')"
				:class="{ active: activeRoute === 'ziwei' }"
				:aria-current="activeRoute === 'ziwei' ? 'page' : undefined"
				><svg class="icon"><use href="#i-star"></use></svg>紫微</h5-button
			><h5-button
				data-ui="button"
				data-route="history"
				v-on:click="navigate('history')"
				:class="{ active: activeRoute === 'history' }"
				:aria-current="activeRoute === 'history' ? 'page' : undefined"
				><svg class="icon"><use href="#i-clock"></use></svg>记录</h5-button
			>
		</nav>
		<design-notes></design-notes>
		<div class="toast" id="toast" role="status" aria-live="polite" :class="{ show: !!state.toast }">
			{{ state.toast }}
		</div>
	</div>
</template>
