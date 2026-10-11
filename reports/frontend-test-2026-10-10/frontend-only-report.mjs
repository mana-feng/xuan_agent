import fs from 'node:fs/promises';

const reportDir = new URL('./', import.meta.url);
const sectionTitle = '纯前端 frontend-only 检测与修复现状';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = value => String(value ?? '').replace(/[\\`*_{}[\]()<>#!|]/g, '\\$&');
const mdCell = value => md(value).replace(/\r?\n/g, ' / ');
const array = value => Array.isArray(value) ? value : [];

async function readJson(relative, fallback) {
  try {
    return JSON.parse(await fs.readFile(new URL(relative, reportDir), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// All emitted file URLs stay in this report's frontend-only subtree. Reject
// encoded traversal as well as raw traversal; never turn filesystem paths into links.
function fileHref(value, defaultFolder = 'evidence') {
  if (typeof value !== 'string' || !value.trim()) return null;
  const relative = value.trim();
  if (/^[/.]|[:\\%?#\u0000-\u001f\u007f]/.test(relative)) return null;
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  const target = relative.startsWith('frontend-only/') ? relative
    : /^(evidence|checks|screenshots)\//.test(relative) ? `frontend-only/${relative}`
    : `frontend-only/${defaultFolder}/${relative}`;
  if (!target.startsWith('frontend-only/') || target === 'frontend-only/') return null;
  return target.split('/').map(part => encodeURIComponent(part)).join('/');
}

function evidenceEntries(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(entry =>
    typeof entry === 'string' ? { path: entry, label: '查看证据' } : entry,
  ).filter(entry => entry && typeof entry === 'object');
}

function evidenceHTML(value) {
  return evidenceEntries(value).map(entry => {
    const href = fileHref(entry.path);
    const label = esc(entry.label || '查看证据');
    return href ? `<a href="${esc(href)}">${label}</a>` : `<span class="meta">${label}（无效证据路径）</span>`;
  }).join(' · ');
}

function evidenceMarkdown(value) {
  return evidenceEntries(value).map(entry => {
    const href = fileHref(entry.path);
    const label = md(entry.label || '查看证据');
    return href ? `[${label}](${href})` : `${label}（无效证据路径）`;
  }).join(' · ');
}

const statusClass = status => {
  if (['通过', '已修复并验证', 'passed', 'pass'].includes(status)) return 'pass';
  if (['失败', '复测失败', '待修复', 'failed', 'fail'].includes(status)) return 'fail';
  if (['阻塞', 'blocked'].includes(status)) return 'blocked';
  return 'pending';
};
const badge = status => `<span class="badge ${statusClass(status)}">${esc(status || '未验证')}</span>`;
const itemAnchor = (item, index) => `frontend-only-${String(item.id || index + 1).replace(/[^a-zA-Z0-9_-]/g, '-')}-${index + 1}`;

export function renderFrontendOnlyReport(status = {}, browserLedger = []) {
  const items = array(status.items);
  const checks = array(status.checks);
  const browser = Array.isArray(browserLedger) ? browserLedger : array(browserLedger.rows);
  const counts = browser.reduce((result, row) => {
    const key = row.status || '未验证';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, Object.create(null));
  const titleOf = row => row.title || row.test || '未命名检查';
  const evidenceOf = row => row.evidence || [];

  const findingHTML = items.map((item, index) => {
    const screenshot = fileHref(item.screenshot, 'screenshots');
    return `<article class="finding" id="${itemAnchor(item, index)}"><div class="finding-title"><h3>${esc(item.id)} · ${esc(item.title)}</h3></div><div class="repair-current"><h4>现状 ${badge(item.status)}</h4><p><strong>原问题：</strong>${esc(item.problem)}</p><p><strong>处理：</strong>${esc(item.change)}</p><p><strong>验证：</strong>${esc(item.validation)}</p><p><strong>边界：</strong>${esc(item.boundary || '见本区块全局证据边界')}</p>${item.evidence ? `<p>${evidenceHTML(item.evidence)}</p>` : ''}${screenshot ? `<a href="${esc(screenshot)}"><img class="finding-shot" loading="lazy" src="${esc(screenshot)}" alt="${esc(item.title)}当前页面"></a>` : item.screenshot ? '<p class="meta">截图路径无效，未生成外部链接。</p>' : ''}</div></article>`;
  }).join('');

  const browserHTML = browser.length ? `<div class="table-wrap"><table class="test-table"><thead><tr><th>编号 / 模块</th><th>检查项</th><th>现状</th><th>实际结果</th><th>证据</th></tr></thead><tbody>${browser.map(row => `<tr><td>${esc(row.id)}${row.area ? `<br>${esc(row.area)}` : ''}</td><td>${esc(titleOf(row))}</td><td>${badge(row.status)}</td><td>${esc(row.actual)}</td><td>${evidenceHTML(evidenceOf(row)) || '未附证据'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="meta">尚未生成浏览器操作记录，不计为通过。</p>';

  const html = `<section id="frontend-only" class="repair-overview"><div class="kicker">FRONTEND-ONLY / 纯前端独立验收</div><h2>${sectionTitle}</h2><p class="meta">更新时间：${esc(status.updatedAt || '待生成')} · 本区块对应 frontend-only；frontend-docker 与 backend-docker 的结果分别保留在其他区块。</p><p><strong>${esc(status.summary || '纯前端验收资料尚未生成。')}</strong></p><p>${esc(status.environment)}</p><p class="notice">${esc(status.evidenceBoundary || '以本区块实际列出的证据为限；未生成的检查和浏览器记录不计为通过。')}</p><div class="stats"><div class="stat"><b>${browser.length}</b><span>纯前端浏览器记录</span></div>${Object.entries(counts).map(([result, count]) => `<div class="stat"><b>${count}</b><span>${badge(result)}</span></div>`).join('')}</div><nav class="nav">${items.map((item, index) => `<a href="#${itemAnchor(item, index)}">${esc(item.id)} · ${esc(item.title)}</a>`).join('')}<a href="#frontend-only-browser">浏览器操作记录</a><a href="#frontend-only-checks">工程验证</a></nav><h3 id="frontend-only-checks">纯前端工程验证</h3><div class="checks">${checks.map(check => `<div class="check"><h3>${esc(check.title)} ${badge(check.status)}</h3><p>${esc(check.detail)}</p>${evidenceHTML(check.evidence)}</div>`).join('') || '<p class="meta">尚未生成工程检查结果。</p>'}</div>${findingHTML}<h3 id="frontend-only-browser">纯前端浏览器实际操作记录</h3>${browserHTML}<p><a href="frontend-only/evidence/status.json">纯前端现状 JSON</a> · <a href="frontend-only/evidence/browser-ledger.json">纯前端浏览器记录 JSON</a></p></section>`;

  const markdown = `## ${sectionTitle}\n\n更新时间：${md(status.updatedAt || '待生成')}\n\n本区块对应 frontend-only；frontend-docker 与 backend-docker 的结果分别保留在其他区块。\n\n${md(status.summary || '纯前端验收资料尚未生成。')}\n\n${md(status.environment)}\n\n证据边界：${md(status.evidenceBoundary || '以本区块实际列出的证据为限；未生成的检查和浏览器记录不计为通过。')}\n\n浏览器记录 ${browser.length} 项${Object.keys(counts).length ? '：' + Object.entries(counts).map(([result, count]) => `${md(result)} ${count}`).join('、') : ''}。\n\n### 纯前端工程验证\n\n${checks.map(check => `- ${md(check.title)}：${md(check.status || '未验证')}。${md(check.detail)} ${evidenceMarkdown(check.evidence)}`).join('\n') || '尚未生成工程检查结果。'}\n\n${items.map(item => {
    const screenshot = fileHref(item.screenshot, 'screenshots');
    return `### ${md(item.id)} ${md(item.title)}：${md(item.status || '未验证')}\n\n原问题：${md(item.problem)}\n\n处理：${md(item.change)}\n\n验证：${md(item.validation)}\n\n边界：${md(item.boundary || '见本区块全局证据边界')}\n\n${evidenceMarkdown(item.evidence)}${screenshot ? `\n\n[当前页面截图](${screenshot})` : ''}`;
  }).join('\n\n')}\n\n### 纯前端浏览器实际操作记录\n\n${browser.length ? `| 编号 | 检查项 | 现状 | 实际结果 | 证据 |\n| --- | --- | --- | --- | --- |\n${browser.map(row => `| ${mdCell(row.id)} | ${mdCell(titleOf(row))} | ${mdCell(row.status || '未验证')} | ${mdCell(row.actual)} | ${evidenceMarkdown(evidenceOf(row)) || '未附证据'} |`).join('\n')}` : '尚未生成浏览器操作记录，不计为通过。'}\n\n[纯前端现状 JSON](frontend-only/evidence/status.json) · [纯前端浏览器记录 JSON](frontend-only/evidence/browser-ledger.json)\n`;
  return { html, markdown };
}

export const frontendOnly = await readJson('frontend-only/evidence/status.json', {});
const browserLedger = await readJson('frontend-only/evidence/browser-ledger.json', []);
const rendered = renderFrontendOnlyReport(frontendOnly, browserLedger);
export const frontendOnlyHTML = rendered.html;
export const frontendOnlyMarkdown = rendered.markdown;
