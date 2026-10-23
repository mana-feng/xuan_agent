/**
 * Basic traditional meanings only; no chart interpretation or transformation verdict.
 * Sources: 三命通會/卷二 (合、三合、害、刑、沖), 滴天髓/07 (合與化的區分),
 * 五行大義/2 (干支衝破), and 權衡一書/刑沖破害說 (六破配對).
 * https://zh.wikisource.org/wiki/三命通會/卷二
 * https://zh.wikisource.org/wiki/滴天髓/07
 * https://zh.wikisource.org/wiki/五行大義/2
 * https://www.shidianguji.com/mid-page/7549312309756166154
 */
export interface GanZhiRelationReference {
  type?: string;
  label?: string;
}

export interface GanZhiRelationEndpoints {
  from: string;
  to: string;
}

const descriptions: Record<string, string> = {
  ganHe: '天干五合表示两干相合、彼此牵连；有合不等于已经合化。',
  ganChong: '天干相冲表示两干相对、彼此制约。',
  zhiHe: '地支六合表示两支相合、彼此牵连；不据此直接判断成化。',
  chong: '地支相冲表示两支相对、彼此冲动。',
  xing: '相刑表示地支之间相互牵制、关系不协调。',
  sanHe: '三合指三支依生、旺、墓相合，聚向同一五行；有合不等于已化。',
  banHe: '半合指同一三合组中两种不同地支的相合，尚非完整三合。',
  sanHui: '三会指同一方位、同一季节的三支会聚。',
  hai: '相害指两支之间相互牵制、不相协调的关系。',
  po: '相破指地支之间相互破损、牵制的关系。',
  anHe: '暗合从地支所藏天干的相合配对，观察两支间的隐含联系。',
  ganKe: '天干相克表示一方对另一方的制约。',
  zhiKe: '地支相克表示一方对另一方的制约。',
};

/** Accepts the existing edge type/label; endpoint characters distinguish 自刑. */
export function getGanZhiRelationDescription(
  edge: GanZhiRelationReference,
  kind: 'gan' | 'zhi',
  endpoints?: GanZhiRelationEndpoints,
): string {
  if (kind === 'zhi' && edge.type === 'xing') {
    const sameSelfBranch = endpoints && endpoints.from === endpoints.to && ['辰', '午', '酉', '亥'].includes(endpoints.from);
    if (sameSelfBranch || (!endpoints && edge.label === '自刑')) {
      return '自刑指辰、午、酉、亥各自与同支相见所成的刑。';
    }
  }
  return descriptions[edge.type || ''] || `${kind === 'gan' ? '天干' : '地支'}关系暂无基础说明。`;
}
