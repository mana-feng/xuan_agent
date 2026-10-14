<script setup lang="ts">
import { useDraft } from '../useDraft';
const { state, isLiuyao } = useDraft();
const palaces = [
	['命宫', '紫微'],
	['兄弟', '天机'],
	['夫妻', '太阴'],
	['子女', '天同'],
	['父母', '太阳'],
	['财帛', '武曲'],
	['福德', '天梁'],
	['疾厄', '天相'],
	['田宅', '天府'],
	['官禄', '廉贞'],
	['交友', '破军'],
	['迁移', '七杀'],
];
</script>
<template>
	<div>
		<template v-if="state.type === 'bazi'"
			><div class="section-heading">
				<h2>四柱总览</h2>
				<span class="pill">示例盘面</span>
			</div>
			<table class="chart-table">
				<caption class="hidden">
					四柱示例，未根据输入计算
				</caption>
				<thead>
					<tr>
						<th scope="col">四柱</th>
						<th scope="col">年柱</th>
						<th scope="col">月柱</th>
						<th scope="col" class="day">日柱</th>
						<th scope="col">时柱</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>主星</td>
						<td>正印</td>
						<td>正官</td>
						<td class="day">日主</td>
						<td>比肩</td>
					</tr>
					<tr>
						<td>天干</td>
						<td class="stem water">癸</td>
						<td class="stem metal">辛</td>
						<td class="stem day">甲</td>
						<td class="stem">甲</td>
					</tr>
					<tr>
						<td>地支</td>
						<td class="stem metal">酉</td>
						<td class="stem metal">酉</td>
						<td class="stem day earth">辰</td>
						<td class="stem water">子</td>
					</tr>
					<tr>
						<td>藏干</td>
						<td>辛</td>
						<td>辛</td>
						<td class="day">戊 乙 癸</td>
						<td>癸</td>
					</tr>
					<tr>
						<td>纳音</td>
						<td>剑锋金</td>
						<td>石榴木</td>
						<td class="day">覆灯火</td>
						<td>海中金</td>
					</tr>
				</tbody>
			</table>
			<div class="chart-foot">
				<span><i class="swatch"></i>木</span><span><i class="swatch fire"></i>火</span
				><span><i class="swatch earth"></i>土</span><span><i class="swatch metal"></i>金</span
				><span><i class="swatch water"></i>水</span>
			</div></template
		><template v-else-if="isLiuyao"
			><div class="section-heading">
				<h2>地天泰 · 卦象示例</h2>
				<span class="pill">时间起卦</span>
			</div>
			<p class="help-text">占问：{{ state.current?.question || state.current?.title }}</p>
			<div class="yao-list">
				<div
					v-for="(label, index) in ['上六', '六五', '六四', '九三', '九二', '初九']"
					:key="label"
					class="yao"
				>
					<span>{{ label }}</span
					><span class="yao-bar"><i></i><i v-if="index < 3"></i></span
					><span>{{ index === 1 ? '应' : index === 4 ? '世' : '　' }}</span>
				</div>
			</div>
			<p class="help-text" style="text-align: center">固定卦象布局示例 · 未执行起卦</p></template
		><template v-else
			><div class="section-heading">
				<h2>十二宫位 · 结构示例</h2>
				<span class="pill">宫位总览</span>
			</div>
			<div class="palaces">
				<div
					v-for="(palace, index) in palaces"
					:key="palace[0]"
					class="palace"
					:style="
						index === 5
							? 'grid-column:4;grid-row:2'
							: index === 6
								? 'grid-column:1;grid-row:3'
								: index === 7
									? 'grid-column:4;grid-row:3'
									: ''
					"
				>
					<span>{{ palace[0] }}</span
					><strong>{{ palace[1] }}</strong
					><span>宫位示例</span>
				</div>
				<div class="palace center">
					<span>紫 微 斗 数</span><strong>观象 · 知己</strong><span>固定布局 · 星曜仅为占位</span>
				</div>
			</div></template
		>
	</div>
</template>
