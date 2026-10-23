<template>
  <view ref="rootRef" class="ganzhi-relationship">
    <view ref="scrollRef" class="relationship-scroll" role="region" aria-label="干支关系图，可横向滑动" @scroll="placeExplanation">
      <view class="relationship-diagram" :style="diagramStyle">
        <view class="relationship-edges">
          <button v-for="edge in ganEdges" :key="edge.id" v-bind="h5Button(() => toggleRelation(edge))"
            class="relationship-row" :class="{ 'is-active': isActive(edge) }"
            :data-edge-id="edge.id" :data-kind="edge.kind" :data-from="edge.from" :data-to="edge.to" :data-type="edge.type"
            :aria-label="'查看关系：' + describe(edge)" :aria-pressed="selectedEdge?.id === edge.id" :aria-expanded="selectedEdge?.id === edge.id"
            :aria-controls="dialogId" aria-haspopup="dialog" :style="edgeStyle(edge)" @tap="toggleRelation(edge)" @mouseenter="hovered = edge.id" @mouseleave="hovered = null">
            <view class="relationship-line" aria-hidden="true"></view>
            <view class="relationship-endpoint" :style="{ left: position(edge.from) }" aria-hidden="true">{{ diagramData.nodes[edge.from].gan }}</view>
            <text class="relationship-label">{{ edge.label }}</text>
            <view class="relationship-endpoint" :style="{ left: position(edge.to) }" aria-hidden="true">{{ diagramData.nodes[edge.to].gan }}</view>
          </button>
        </view>
        <view v-if="diagramData.nodes.length" class="pillar-groups" :style="columnStyle">
          <text v-if="originalCount" class="pillar-group" :style="{ gridColumn: 'span ' + originalCount }">原局 · {{ originalCount === 4 ? '四柱' : '命盘' }}</text>
          <text v-if="movingCount" class="pillar-group moving-group" :style="{ gridColumn: 'span ' + movingCount }">岁运 · 当前</text>
        </view>
        <view class="pillar-cards" :style="columnStyle">
          <view v-for="(node, index) in diagramData.nodes" :key="index" class="pillar-card" :class="{ 'is-day-master': sourceColumns[index].sourceIndex === 2 }">
            <text class="pillar-name">{{ node.label }}</text>
            <button v-for="kind in nodeKinds" :key="kind" v-bind="h5Button(() => toggleNode(index, kind))" class="pillar-node"
              :class="[wuxingClass(node[kind]), { 'is-target': isTarget(index, kind) }]" :data-node="nodeKey(index, kind)"
              :aria-label="'定位' + endpointName(index, kind)" :aria-pressed="selectedNode === nodeKey(index, kind)" @tap="toggleNode(index, kind)">
              {{ node[kind] }}<text v-if="sourceColumns[index].sourceIndex === 2 && kind === 'gan'" class="day-mark">日主</text>
            </button>
          </view>
        </view>
        <view class="relationship-edges">
          <button v-for="edge in zhiEdges" :key="edge.id" v-bind="h5Button(() => toggleRelation(edge))"
            class="relationship-row" :class="{ 'is-active': isActive(edge) }"
            :data-edge-id="edge.id" :data-kind="edge.kind" :data-from="edge.from" :data-to="edge.to" :data-type="edge.type"
            :aria-label="'查看关系：' + describe(edge)" :aria-pressed="selectedEdge?.id === edge.id" :aria-expanded="selectedEdge?.id === edge.id"
            :aria-controls="dialogId" aria-haspopup="dialog" :style="edgeStyle(edge)" @tap="toggleRelation(edge)" @mouseenter="hovered = edge.id" @mouseleave="hovered = null">
            <view class="relationship-line" aria-hidden="true"></view>
            <view class="relationship-endpoint" :style="{ left: position(edge.from) }" aria-hidden="true">{{ diagramData.nodes[edge.from].zhi }}</view>
            <text class="relationship-label">{{ edge.label }}</text>
            <view class="relationship-endpoint" :style="{ left: position(edge.to) }" aria-hidden="true">{{ diagramData.nodes[edge.to].zhi }}</view>
          </button>
        </view>
      </view>
    </view>
    <text v-if="!edges.length" class="relationship-empty">暂无可显示的干支关系</text>
    <text v-else class="relationship-status" role="status" aria-live="polite">{{ selectedEdge ? describe(selectedEdge) : '点关系，查看基础含义' }}</text>
    <text v-if="needsScroll" class="relationship-scroll-hint">左右滑动，查看完整柱位 ↔</text>
    <view v-if="selectedEdge" :id="dialogId" ref="dialogRef" class="relationship-explanation" role="dialog" aria-modal="false" :aria-label="selectedEdge.label + '关系说明'" :style="explanationStyle">
      <view class="relation-heading"><text class="relation-title">{{ selectedEdge.label }}</text><button v-bind="h5Button(() => closeExplanation())" class="relation-close" aria-label="关闭关系说明" @tap="closeExplanation()">关闭</button></view>
      <text class="relation-endpoints">{{ endpointName(selectedEdge.from, selectedEdge.kind) }} ↔ {{ endpointName(selectedEdge.to, selectedEdge.kind) }}</text>
      <text class="relation-meaning">{{ meaning }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, nextTick, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { onHide } from '@dcloudio/uni-app';
import baziEnhanced, { type GanZhiDiagramEdge } from '@/libs/utils/bazi-enhanced';
import { getGanZhiRelationDescription } from '@/libs/utils/ganzhi-relation-description';
import { h5Button } from '@/utils/keyboard';

type Kind = 'gan' | 'zhi';
type Relation = GanZhiDiagramEdge & { kind: Kind; id: string };
const props = defineProps<{ ganzhiList: string[]; labels?: string[] }>();
const nodeKinds: Kind[] = ['gan', 'zhi'];
const defaultLabels = ['年柱', '月柱', '日柱', '时柱', '大运', '流年', '流月'];
const sourceColumns = computed(() => props.ganzhiList.map((ganzhi, sourceIndex) => ({ ganzhi, sourceIndex, label: props.labels?.[sourceIndex] || defaultLabels[sourceIndex] || `柱位${sourceIndex + 1}` }))
  .filter(column => /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(column.ganzhi)));
const diagramData = computed(() => {
  const columns = sourceColumns.value;
  const data = baziEnhanced.buildGanZhiDiagram(columns.map(c => c.ganzhi), columns.map(c => c.label), { showKe: false });
  const sort = (items: GanZhiDiagramEdge[]) => [...items].sort((a, b) => Math.min(a.from, a.to) - Math.min(b.from, b.to) || Math.max(a.from, a.to) - Math.max(b.from, b.to));
  return { ...data, ganEdges: sort(data.ganEdges), zhiEdges: sort(data.zhiEdges) };
});
const relations = (kind: Kind): Relation[] => diagramData.value[kind === 'gan' ? 'ganEdges' : 'zhiEdges'].map(edge => ({ ...edge, kind, id: `${kind}-${edge.from}-${edge.to}-${edge.type}-${edge.label}` }));
const ganEdges = computed(() => relations('gan')), zhiEdges = computed(() => relations('zhi'));
const edges = computed(() => [...ganEdges.value, ...zhiEdges.value]);
const originalCount = computed(() => sourceColumns.value.filter(c => c.sourceIndex < 4).length);
const movingCount = computed(() => sourceColumns.value.length - originalCount.value);
const columnStyle = computed(() => ({ gridTemplateColumns: `repeat(${diagramData.value.nodes.length || 1}, minmax(0, 1fr))` }));
const diagramStyle = computed(() => ({ minWidth: diagramData.value.nodes.length ? `${Math.max(320, diagramData.value.nodes.length * 80)}px` : '0' }));
const position = (index: number) => `${(index + 0.5) / (diagramData.value.nodes.length || 1) * 100}%`;
const edgeStyle = (edge: Relation) => ({ '--from': position(Math.min(edge.from, edge.to)), '--to': position(Math.max(edge.from, edge.to)) });
const nodeKey = (index: number, kind: Kind) => `${index}:${kind}`;
const endpointName = (index: number, kind: Kind) => { const node = diagramData.value.nodes[index]; return node ? `${node.label} ${kind === 'gan' ? '天干' : '地支'} ${node[kind]}` : ''; };
const describe = (edge: Relation) => `${endpointName(edge.from, edge.kind)} · ${edge.label} · ${endpointName(edge.to, edge.kind)}`;
const colors: Record<string, string> = { 甲: 'wood', 乙: 'wood', 丙: 'fire', 丁: 'fire', 戊: 'soil', 己: 'soil', 庚: 'gold', 辛: 'gold', 壬: 'water', 癸: 'water', 子: 'water', 丑: 'soil', 寅: 'wood', 卯: 'wood', 辰: 'soil', 巳: 'fire', 午: 'fire', 未: 'soil', 申: 'gold', 酉: 'gold', 戌: 'soil', 亥: 'water' };
const wuxingClass = (character: string) => colors[character] || '';
const rootRef = ref<any>(null), scrollRef = ref<any>(null), dialogRef = ref<any>(null);
const dialogId = `ganzhi-meaning-${getCurrentInstance()?.uid ?? 0}`;
const selectedEdge = ref<Relation | null>(null), selectedNode = ref<string | null>(null), hovered = ref<string | null>(null);
const needsScroll = ref(false), explanationStyle = ref<Record<string, string>>({ left: '8px', top: '8px' });
let trigger: HTMLElement | null = null;
let resizeObserver: ResizeObserver | undefined;
const element = (value: any): HTMLElement | null => value?.$el || value || null;
const activeEdge = computed(() => selectedEdge.value || edges.value.find(edge => edge.id === hovered.value));
const isTarget = (index: number, kind: Kind) => { const edge = activeEdge.value; return !!edge && edge.kind === kind && (edge.from === index || edge.to === index); };
const isActive = (edge: Relation) => edge.id === (selectedEdge.value?.id || hovered.value) || !!selectedNode.value && [nodeKey(edge.from, edge.kind), nodeKey(edge.to, edge.kind)].includes(selectedNode.value);
const meaning = computed(() => selectedEdge.value ? getGanZhiRelationDescription(selectedEdge.value, selectedEdge.value.kind, { from: diagramData.value.nodes[selectedEdge.value.from][selectedEdge.value.kind], to: diagramData.value.nodes[selectedEdge.value.to][selectedEdge.value.kind] }) : '');

function closeExplanation(restoreFocus = true) {
  const previous = trigger; selectedEdge.value = null; hovered.value = null; trigger = null;
  if (restoreFocus && previous?.isConnected) previous.focus({ preventScroll: true });
}
function resetSelection() { closeExplanation(false); selectedNode.value = null; }
function toggleNode(index: number, kind: Kind) { closeExplanation(false); const key = nodeKey(index, kind); selectedNode.value = selectedNode.value === key ? null : key; }
async function toggleRelation(edge: Relation) {
  if (selectedEdge.value?.id === edge.id) { closeExplanation(); return; }
  selectedEdge.value = edge; selectedNode.value = null; hovered.value = null;
  // #ifdef H5
  trigger = Array.from(element(rootRef.value)?.querySelectorAll<HTMLElement>('[data-edge-id]') || []).find(button => button.dataset.edgeId === edge.id) || null;
  // #endif
  await nextTick(); if (selectedEdge.value?.id === edge.id) placeExplanation();
}
function placeExplanation() {
  // #ifdef H5
  if (typeof window === 'undefined') return;
  const scroll = element(scrollRef.value); if (scroll) needsScroll.value = scroll.scrollWidth > scroll.clientWidth + 1;
  const root = element(rootRef.value), panel = element(dialogRef.value);
  if (!selectedEdge.value || !root || !panel || !trigger) return;
  const box = root.getBoundingClientRect(), mark = (trigger.querySelector('.relationship-label') || trigger).getBoundingClientRect();
  const leftEdge = Math.max(8, box.left + 8), rightEdge = Math.min(window.innerWidth - 8, box.right - 8);
  const width = Math.max(180, Math.min(340, rightEdge - leftEdge));
  const left = Math.max(leftEdge, Math.min(mark.right + 10, rightEdge - width));
  // Measure the wrapping height at its final width on the first opening, too.
  panel.style.width = `${width}px`;
  const height = panel.getBoundingClientRect().height;
  let top = mark.bottom + 10;
  if (top + height > window.innerHeight - 8 && mark.top - height - 10 >= 8) top = mark.top - height - 10;
  top = Math.max(box.top + 8, Math.min(top, box.bottom - height - 8));
  const visibleTop = Math.max(8, box.top + 8), visibleBottom = Math.min(window.innerHeight - 8, box.bottom - 8);
  if (height <= visibleBottom - visibleTop) top = Math.max(visibleTop, Math.min(top, visibleBottom - height));
  explanationStyle.value = { width: `${width}px`, left: `${left - box.left}px`, top: `${top - box.top}px` };
  // #endif
}
function outside(event: Event) {
  // #ifdef H5
  if (!selectedEdge.value || !(event.target instanceof Element)) return;
  const root = element(rootRef.value), panel = element(dialogRef.value);
  if (panel?.contains(event.target) || root?.contains(event.target) && event.target.closest('[data-edge-id],[data-node]')) return;
  closeExplanation(!event.target.closest('button,a,input,select,textarea,[role="button"],[tabindex="0"]'));
  // #endif
}
function escape(event: KeyboardEvent) { if (event.key === 'Escape' && selectedEdge.value) { event.preventDefault(); closeExplanation(); } }
watch(() => [props.ganzhiList, props.labels], resetSelection, { deep: true, flush: 'sync' });
onHide(resetSelection); onDeactivated(resetSelection);
onMounted(() => {
  // #ifdef H5
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', outside); document.addEventListener('click', outside); document.addEventListener('keydown', escape);
  window.addEventListener('resize', placeExplanation); window.addEventListener('scroll', placeExplanation, true);
  if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(placeExplanation); const scroll = element(scrollRef.value); if (scroll) resizeObserver.observe(scroll); }
  placeExplanation();
  // #endif
});
onUnmounted(() => {
  resetSelection(); resizeObserver?.disconnect();
  // #ifdef H5
  if (typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', outside); document.removeEventListener('click', outside); document.removeEventListener('keydown', escape);
  window.removeEventListener('resize', placeExplanation); window.removeEventListener('scroll', placeExplanation, true);
  // #endif
});
</script>

<style scoped>
.ganzhi-relationship { position:relative; min-width:0; width:100%; color:#425d65; }
.relationship-scroll { width:100%; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; scrollbar-color:#a8c2ca #f2f6f7; }
.relationship-diagram { width:100%; }
.relationship-edges { padding:3px 0; }
.relationship-row { display:block; position:relative; box-sizing:border-box; width:100%; height:39px; margin:0; padding:0; border:0; border-radius:0; background:transparent; text-align:initial; color:#526d78; overflow:visible; }
.relationship-row:after,.pillar-node:after,.relation-close:after { border:0; }
.relationship-line { position:absolute; left:var(--from); width:calc(var(--to) - var(--from)); top:50%; height:1px; background:#bacbd0; }
.relationship-endpoint { position:absolute; top:50%; transform:translate(-50%,-50%); display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:24px; height:24px; border:1px solid #dce7ea; border-radius:50%; background:#f7fafb; color:#45616c; font:15px/1 "Songti SC",SimSun,serif; }
.relationship-label { position:absolute; left:calc((var(--from) + var(--to)) / 2); top:50%; transform:translate(-50%,-50%); color:#486c79; background:#fff; border-radius:4px; padding:2px 7px; font-size:13px; white-space:nowrap; line-height:1.5; }
.relationship-row.is-active .relationship-line { background:#3f8292; height:2px; }
.relationship-row.is-active .relationship-label { color:#245f70; background:#edf6f7; }
.relationship-row.is-active .relationship-endpoint { border-color:#72a5b0; color:#245f70; background:#eef7f8; }
.pillar-groups { display:grid; margin:15px 0 0; font-size:12px; color:#526d78; letter-spacing:1px; }
.pillar-group { display:block; padding:7px 10px; border-top:1px solid #dbe9ed; background:#f1f7fa; }
.pillar-groups .moving-group { border-left:1px solid #c6dce3; background:#eef7f8; }
.pillar-cards { display:grid; margin:0 0 15px; padding:10px 0; background:#f7fafb; border-bottom:1px solid #dbe9ed; }
.pillar-card { display:grid; grid-template-rows:28px 48px 48px; row-gap:5px; align-items:center; justify-items:center; position:relative; padding:10px 0 12px; isolation:isolate; }
.pillar-card:before { content:""; position:absolute; inset:0 4px; background:#fff; border:1px solid #dce8ed; border-radius:8px; z-index:-1; }
.pillar-card:after { content:""; position:absolute; left:14px; right:14px; top:93px; border-top:1px solid #e6eef1; pointer-events:none; }
.pillar-name { font-size:14px; color:#526d78; font-weight:500; }
.pillar-card.is-day-master:before { background:#edf6fa; border-color:#8eb6c4; box-shadow:inset 0 3px #5c96aa; }
.pillar-card.is-day-master .pillar-name { color:#245f70; }
.pillar-node { box-sizing:border-box; margin:0; border:1px solid transparent; padding:0; width:48px; height:48px; border-radius:7px; background:transparent; color:var(--node-ink); font:31px/1 "Songti SC",SimSun,serif; display:flex; align-items:center; justify-content:center; position:relative; overflow:visible; }
.soil { --node-ink:#805b43; }.gold { --node-ink:#80600e; }.water { --node-ink:#2c7597; }.wood { --node-ink:#3f7b50; }.fire { --node-ink:#b15a43; }
.pillar-node:hover { background:#edf6f9; }
.pillar-node.is-target,.pillar-node[aria-pressed="true"] { border-color:#42899e; background:#e2f1f7; box-shadow:0 0 0 2px #d4e9f0; }
.day-mark { position:absolute; bottom:0; right:-11px; border:1px solid #bfd5df; border-radius:3px; background:#e7f1f4; color:#3d7180; font:11px/1.2 "Microsoft YaHei",sans-serif; padding:1px 2px; }
.relationship-status,.relationship-empty,.relationship-scroll-hint { display:block; margin-top:10px; color:#667d82; font-size:12px; line-height:1.6; }
.relationship-scroll-hint { margin-top:4px; font-size:11px; }
.relationship-explanation { position:absolute; z-index:50; box-sizing:border-box; width:340px; padding:16px 18px; background:#fff; color:#425d65; border:1px solid #bdd6dd; border-radius:12px; box-shadow:0 12px 38px #264c5e26; overflow-wrap:anywhere; }
.relation-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.relation-title { font:500 19px/1.5 "Songti SC",SimSun,serif; color:#233e49; }
.relation-close { flex-shrink:0; margin:0; border:0; border-radius:6px; background:#f0f6f7; color:#416d7a; padding:7px 10px; min-height:36px; font-size:12px; line-height:1.5; }
.relation-endpoints { display:block; margin:6px 0 10px; font-size:12px; line-height:1.6; color:#526f7c; }
.relation-meaning { display:block; font-size:14px; line-height:1.75; }
@media(pointer:coarse) { .relationship-row { height:44px; }.relation-close { min-height:44px; } }
@media(prefers-reduced-motion:reduce) { .ganzhi-relationship * { transition:none!important; animation:none!important; } }
</style>
