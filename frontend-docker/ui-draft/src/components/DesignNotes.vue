<script setup lang="ts">
import { useDraft } from '../useDraft';
const { notes, backdropNotes } = useDraft();
</script>
<template>
	<dialog
		class="drawer"
		id="design-notes"
		aria-labelledby="notes-title"
		ref="notes"
		v-on:click="backdropNotes"
	>
		<div class="drawer-head">
			<div>
				<p class="eyebrow" style="font-size: 9px; margin-bottom: 4px">DESIGN NOTES · 2026.10.12</p>
				<h2 id="notes-title">让探索更自然地发生</h2>
			</div>
			<h5-button
				data-ui="button"
				class="close-btn"
				id="close-notes"
				aria-label="关闭设计说明"
				v-on:click="notes?.close()"
				><svg class="icon"><use href="#i-close"></use></svg
			></h5-button>
		</div>
		<div class="drawer-body">
			<p>
				基于当前用户端源码与仓库截图的 UI 审视。保留八字、六爻、紫微、AI
				对话和历史记录能力，重点优化信息层级与操作路径。本页使用项目原有 Vue 3 / uni-app H5
				技术栈，数据与回复均为静态演示。
			</p>
			<div class="palette" aria-label="当前渐变配色">
				<span style="background: var(--gradient)"></span
				><span style="background: var(--tint)"></span><span style="background: var(--paper)"></span
				><span style="background: var(--accent-end)"></span>
			</div>
			<div class="audit-item">
				<span class="priority">P1 / 首屏主任务</span>
				<h3>让用户先表达，再选择工具</h3>
				<p>
					现状：工具、快捷指令、对话依次排列，输入框位于页面后部。<br />草稿：将输入框提升到首屏，快捷问题缩为轻量提示，工具卡片放在其后。
				</p>
				<code>pages/agent/index.nvue<br />components/agent/AgentConsolePanel.vue</code>
			</div>
			<div class="audit-item">
				<span class="priority">P1 / 导航与任务连续性</span>
				<h3>在任何页面，都知道下一步在哪</h3>
				<p>
					现状：全局头部主要为图标与账户入口，主要工具依赖首页进入。<br />草稿：桌面侧栏、手机底栏固定呈现核心功能；结果页直接连接保存、编辑与继续提问。
				</p>
				<code
					>components/yx-nav-header/yx-nav-header.vue<br />components/layout/PageScaffold.vue</code
				>
			</div>
			<div class="audit-item">
				<span class="priority">P1 / 操作层级</span>
				<h3>一个入口，只强调一个动作</h3>
				<p>
					现状：每张工具卡片都有标签、解释和两个按钮；日期选择也使用强渐变按钮。<br />草稿：工具整卡可点击，输入保持朴素；仅发送、查看结果、保存等推进动作使用主色。
				</p>
				<code>components/agent/AgentToolPanel.vue<br />pages/index/index.nvue</code>
			</div>
			<div class="audit-item">
				<span class="priority">P2 / 视觉一致性</span>
				<h3>减少容器层级，让内容更安静</h3>
				<p>
					现状：页面卡片、区块与工具卡片层层嵌套，多个样式文件重复定义圆角、阴影与渐变。<br />草稿：使用可切换的渐变主题，在品牌、标题与主按钮上集中呈现，浅色背景光晕与细边线分区；宋体只用于品牌与大标题，正文维持易读的无衬线字体。
				</p>
				<code
					>styles/app-shell.css<br />styles/responsive-layout.css<br />styles/page-patterns.css</code
				>
			</div>
			<div class="audit-item">
				<span class="priority">P2 / 阅读与响应式</span>
				<h3>表单按组填写，结果按层阅读</h3>
				<p>
					草稿：表单包含清楚的标签、历法切换与日期输入；命盘表格和解读分开。桌面充分利用横向空间，手机改为单列和固定导航，保留键盘焦点与触控空间。
				</p>
				<code>pages/index/index.nvue<br />pages/history/list.nvue</code>
			</div>
			<div class="audit-item">
				<h3>本次草稿的边界</h3>
				<p>
					包含：首页、静态示例对话、三类表单与结果、历史搜索/筛选/排序、当前页面会话内保存。<br />不包含：排盘算法、模型服务、账户登录与持久化。输入不会发送至后端，刷新后恢复示例数据。<br />本稿未修改现有业务页面。
				</p>
			</div>
		</div>
	</dialog>
</template>
