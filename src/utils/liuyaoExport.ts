import { GUAS, GUA5, XING5, SYMBOL } from '@/features/liuyao/najiaConst';
import { getGuaName as getGuaciGuaName, getCanonicalNameByName } from '@/features/liuyao/guaci';
import { getYaoSymbol } from '@/features/liuyao/uiHelpers';
import { setShiYao } from '@/features/liuyao/najiaCore';

/**
 * 安全获取数组元素
 */
function safeAt(arr: any, index: number): any {
	if (!arr) return undefined;
	if (Array.isArray(arr)) return arr[index];
	// 尝试作为对象访问
	return arr[index];
}

/**
 * 格式化显示文本
 */
function formatDisplay(value: string | undefined | null) {
	return value && value.trim() ? value : '—';
}

/**
 * 构建世应标签
 */
function buildShiyLabel(d: any) {
	if (!d || !d.shiyDisplay) return '世：— · 应：—';
	
	const shiIndex = d.shiyDisplay.findIndex((x: string) => x && x.trim() === '世');
	const yingIndex = d.shiyDisplay.findIndex((x: string) => x && x.trim() === '应');
	const map = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
	const shi = shiIndex >= 0 && shiIndex < map.length ? map[shiIndex] : '—';
	const ying = yingIndex >= 0 && yingIndex < map.length ? map[yingIndex] : '—';
	return `世：${shi} · 应：${ying}`;
}

/**
 * 获取卦象概览信息
 */
function getGuaOverview(c: any, d: any) {
	if (!c || !d) {
		return {
			main: { name: '—', palace: '—', type: '—', wuxing: '—', shiying: '—', trend: '—' },
			changed: { name: '—', palace: '—', type: '—', wuxing: '—', shiying: '—', trend: '—' },
			note: '暂无数据'
		};
	}
	
	const gongIndex = GUAS.indexOf(c.gong);
	const wuxing = gongIndex >= 0 && GUA5[gongIndex] !== undefined ? XING5[GUA5[gongIndex]] : '—';
	
	const bianGongIndex = c.bian ? GUAS.indexOf(c.bian.gong) : -1;
	const bianWuxing = bianGongIndex >= 0 && GUA5[bianGongIndex] !== undefined ? XING5[GUA5[bianGongIndex]] : '—';
	
	const preferName = (mark: string, fallback: string) => {
		const n = getGuaciGuaName(mark);
		return n && n.trim() ? n : (fallback || '—');
	};

	const buildShiy = (d: any) => {
		return buildShiyLabel(d);
	};

	return {
		main: {
			name: preferName(c.mark, c.name),
			palace: c.gong || '—',
			type: d?.main?.type || '—',
			wuxing: `卦宫：${c.gong || '—'} · 五行：${wuxing}`,
			shiying: buildShiy(d),
			trend: '可结合世应、动爻与变卦解读'
		},
		changed: {
			name: (() => {
				if (!c.bian) return '无变卦';
				const rawMark = c.bian.mark;
				let resolvedMark = '';
				if (typeof rawMark === 'string' && /^[01]{6}$/.test(rawMark)) {
					resolvedMark = rawMark;
				} else if (Array.isArray(rawMark) && rawMark.length === 6) {
					const bits = rawMark.map((s: string) => {
						const idx = SYMBOL.indexOf(s);
						if (idx === -1) return '';
						return String(idx % 2);
					});
					if (bits.every((b: string) => b === '0' || b === '1')) {
						resolvedMark = bits.join('');
					}
				}
				if (resolvedMark) {
					const byMark = getGuaciGuaName(resolvedMark);
					if (byMark && byMark.trim()) return byMark;
				}
				const byName = getCanonicalNameByName(c.bian?.name || '');
				if (byName && byName.trim()) return byName;
				return c.bian?.name || '无变卦';
			})(),
			palace: c.bian?.gong || '—',
			type: d?.bian?.type || '—',
			wuxing: c.bian ? `卦宫：${c.bian.gong || '—'} · 五行：${bianWuxing}` : '—',
			shiying: c.bian ? '变卦已生成' : '本卦静卦',
			trend: c.bian ? '动爻生成的变卦，建议结合世应及动爻解读' : '无动爻，静观其变'
		},
		note: c.guaci ? '已加载卦辞，可结合 AI 解读使用' : '暂无卦辞文本'
	};
}

/**
 * 获取六爻行数据
 */
function getYaoRows(c: any, d: any) {
	if (!d) return [];
	const orderLabels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
	const rows: any[] = [];
	const mainShiy = c?.shiy || [];
	const bianMark = c?.bian?.mark || '';
	const bianShiyArr = bianMark ? setShiYao(bianMark) : [-1, -1, -1];
	const bianShiy = { shi: bianShiyArr[0] || -1, ying: bianShiyArr[1] || -1 };

	for (let i = 5; i >= 0; i--) {
		const order = orderLabels[i];
		const mainParam = safeAt(c?.params, i);
		const mainSymbol = mainParam !== undefined ? getYaoSymbol(mainParam) : '';
		const mainRole = safeAt(mainShiy, 0) - 1 === i ? '世' : safeAt(mainShiy, 1) - 1 === i ? '应' : '';
		const moving = mainParam !== undefined && mainParam > 2;

		let bianRelation = '';
		let bRole = '';
		let bianSymbol = '';

		if (c?.bian) {
			let markStr = '';
			const rawMark = c.bian.mark;
			if (typeof rawMark === 'string') {
				markStr = rawMark;
			} else if (Array.isArray(rawMark) && rawMark.length === 6) {
				markStr = rawMark.join('');
			}
			
			if (markStr && markStr.length > i) {
				const bit = markStr[i];
				bianSymbol = getYaoSymbol(bit);
			}

			const relMain = (safeAt(c.bian.qin6, i) || '').trim();
			const relExtra = (safeAt(c.bian.qinx, i) || '').trim();
			if (relMain && relExtra) {
				if (relMain.includes(relExtra) || relExtra.includes(relMain)) {
					bianRelation = relMain || relExtra;
				} else {
					bianRelation = `${relMain} ${relExtra}`.trim();
				}
			} else {
				bianRelation = relMain || relExtra;
			}

			if (bianShiy.shi - 1 === i) bRole = '世';
			else if (bianShiy.ying - 1 === i) bRole = '应';
		}

		rows.push({
			id: `${6 - i}`,
			order,
			liushen: formatDisplay(safeAt(d?.god6, i) || ''),
			relation: formatDisplay(`${safeAt(d?.qin6, i) || ''}${safeAt(d?.qinx, i) || ''}`),
			hidden: formatDisplay(safeAt(d?.hide?.qin6, i) || ''),
			moving,
			mainSymbol,
			mainRole,
			bianRelation: formatDisplay(bianRelation),
			bianSymbol,
			bianRole: bRole
		});
	}
	return rows;
}

/**
 * Copy and AI context share a plain-text report. Every line of user text is
 * quoted so labels in a question cannot become chart metadata.
 */
export function buildLiuyaoExportPayload(liuyaoStore: any): string | null {
	try {
		const { compiled: c, display: d, profile: p } = liuyaoStore;
		if (!c || !d || !p) return null;

		const readable = (value: any, fallback = '未填写'): string => {
			const text = value == null ? '' : String(value).trim();
			return text && text !== '—' ? text : fallback;
		};
		let timeStr = p.timeLabel || '';
		if (timeStr.includes('-')) {
			const parts = timeStr.split(/[- :]/);
			if (parts.length >= 5) {
				timeStr = `${parts[0]}年${parts[1]}月${parts[2]}日 ${parts[3]}:${parts[4]}`;
			}
		}
		const lines: string[] = [timeStr, '', '【起卦信息】', '占问（原文）：'];
		String(p.title || '未填写').split(/\r\n|\r|\n/).forEach(line => lines.push(`> ${line}`));
		lines.push('', `性别：${readable(p.gender)}`, `起卦方式：${readable(p.method, '未记录')}`);
		const calculation = liuyaoStore.calculation;
		lines.push(`时区：${readable(calculation?.timeZone)}`);
		if (calculation?.rules?.dayDivide === 'zi') lines.push('换日：23:00');
		if (!calculation) {
			lines.push('旧记录未保存原时区与规则版本；以下为保留的原盘，不按当前默认规则重排。');
		} else if (calculation.replayMode === 'snapshot') {
			lines.push('原时间仅精确到分钟，显示保存的原盘快照。');
		}
		const gz = c.lunar?.gz;
		lines.push(`干支：${readable(gz?.year)}年 ${readable(gz?.month)}月 ${readable(gz?.day)}日 ${readable(gz?.hour)}时`);
		lines.push(`旬空：${readable(c.lunar?.xkong, '未记录')}`);

		const guaOverview = getGuaOverview(c, d);
		const guaLine = (label: string, gua: any) => {
			const type = readable(gua.type, '');
			return `${label}：${readable(gua.name)}；卦宫：${readable(gua.palace)}${type ? `；卦性：${type}` : ''}`;
		};
		lines.push('', '【卦象】', guaLine('本卦', guaOverview.main));
		lines.push(c.bian ? guaLine('变卦', guaOverview.changed) : '变卦：无（六爻皆静）');
		const positionNames = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
		const movingPositions = positionNames.filter((_, index) => ['3', '4'].includes(String(safeAt(c.params, index))));
		lines.push(`动爻：${movingPositions.length ? movingPositions.join('、') : '无（静卦）'}`);
		lines.push('以下六爻自上而下：上爻、五爻、四爻、三爻、二爻、初爻（初爻为第一爻）', '', '【六爻明细（自上而下）】');

		const states: Record<string, [string, string]> = {
			'0': ['阴爻', '静爻'],
			'1': ['阳爻', '静爻'],
			'3': ['阳爻', '老阳动爻（阳变阴）'],
			'4': ['阴爻', '老阴动爻（阴变阳）'],
		};
		getYaoRows(c, d).forEach((row, index) => {
			const state = states[String(safeAt(c.params, 5 - index))] || ['未填写', '未填写'];
			lines.push('', `${row.order}（六神：${readable(row.liushen)}）`);
			lines.push(`  本卦：${readable(row.relation)}；阴阳：${state[0]}；动静：${state[1]}；世应：${readable(row.mainRole, '无')}`);
			if (c.bian) {
				const relation = `${safeAt(c.bian.qin6, 5 - index) || ''}${safeAt(c.bian.qinx, 5 - index) || ''}`;
				const polarity = row.bianSymbol === '━ ━' ? '阴爻' : row.bianSymbol === '━━━' ? '阳爻' : '未填写';
				lines.push(`  变卦：${readable(relation)}；阴阳：${polarity}；世应：${readable(row.bianRole, '无')}`);
			}
			lines.push(`  伏神：${readable(row.hidden, '无')}`);
		});
		return lines.join('\n');
	} catch (e) {
		console.error('Failed to build Liuyao export payload', e);
		return null;
	}
}
