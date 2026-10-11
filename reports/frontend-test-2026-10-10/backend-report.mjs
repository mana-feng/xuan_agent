import fs from 'node:fs/promises';

const dir = new URL('./', import.meta.url);
export const backend = JSON.parse(await fs.readFile(new URL('evidence/backend-status.json', dir), 'utf8'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const links = list => (list || []).map(e => `<a href="${esc(e.path)}">${esc(e.label)}</a>`).join(' · ');
const badge = s => `<span class="badge ${s === '已修复并验证' || s === '通过' ? 'pass' : s === '阻塞' ? 'blocked' : 'pending'}">${esc(s)}</span>`;
const suites = [];
for (const [file, title, field] of [['backend-auth-live.json','真实认证与注册','checks'],['backend-records-live.json','三类记录与账号隔离','checks'],['backend-quota-live.json','真实数据库额度与故障回滚','cases']]) {
  try {
    const data = JSON.parse(await fs.readFile(new URL(`evidence/${file}`, dir), 'utf8'));
    const rows = data[field] || data.results || [];
    const passed = rows.filter(r => r.status === 'passed' || r.status === 'pass' || r.passed === true).length;
    suites.push({title, file, total: rows.length, passed, status: passed === rows.length && rows.length ? '通过' : '复测中'});
  } catch { /* A running acceptance script may not have produced its evidence yet. */ }
}
export const backendHTML = `<section id="backend" class="repair-overview"><div class="kicker">真实后端验收 / 最新状态</div><h2>后台联调与修复现状</h2><p class="meta">更新时间：${esc(backend.updatedAt)} · 多 agent 分工修复与独立审查，主 agent 执行 Chrome 页面流程并整合报告</p><p><strong>${esc(backend.summary)}</strong></p><p>${esc(backend.environment)}</p><div class="checks">${suites.map(s => `<div class="check"><h3>${esc(s.title)} ${badge(s.status)}</h3><p>${s.passed}/${s.total} 项通过</p><a href="evidence/${s.file}">逐项实际结果</a></div>`).join('')}</div><p class="notice">${esc(backend.evidenceBoundary)}</p><nav class="nav">${backend.items.map(r => `<a href="#${r.id}">${r.id} · ${esc(r.title)}</a>`).join('')}</nav>${backend.items.map(r => `<article class="finding" id="${r.id}"><div class="finding-title"><h3>${r.id} · ${esc(r.title)}</h3></div><div class="repair-current"><h4>现状 ${badge(r.status)}</h4><p><strong>原问题：</strong>${esc(r.problem)}</p><p><strong>处理：</strong>${esc(r.change)}</p><p><strong>验证：</strong>${esc(r.validation)}</p>${r.boundary ? `<p><strong>边界：</strong>${esc(r.boundary)}</p>` : ''}<p>${links(r.evidence)}</p>${r.screenshot ? `<a href="${r.screenshot}"><img class="finding-shot" loading="lazy" src="${r.screenshot}" alt="${esc(r.title)}当前页面"></a>` : ''}</div></article>`).join('')}<h3>Chrome 真实操作记录</h3><div class="table-wrap"><table><thead><tr><th>流程</th><th>现状</th><th>实际结果</th><th>证据</th></tr></thead><tbody>${backend.browser.map(r => `<tr><td>${esc(r.title)}</td><td>${badge(r.status)}</td><td>${esc(r.actual)}</td><td>${links(r.evidence)}</td></tr>`).join('')}</tbody></table></div><h3>本轮最终工程验证</h3><div class="checks">${backend.checks.map(c => `<div class="check"><h3>${esc(c.title)} ${badge(c.status)}</h3><p>${esc(c.detail)}</p>${links(c.evidence)}</div>`).join('')}</div><p><a href="evidence/backend-status.json">后台现状 JSON</a></p></section>`;
export const backendMarkdown = `## 后台联调最新现状\n\n${backend.updatedAt}\n\n${backend.summary}\n\n${backend.environment}\n\n${backend.evidenceBoundary}\n\n${suites.map(s => `- ${s.title}：${s.passed}/${s.total}。[证据](evidence/${s.file})`).join('\n')}\n\n${backend.items.map(r => `### ${r.id} ${r.title}：${r.status}\n\n原问题：${r.problem}\n\n处理：${r.change}\n\n验证：${r.validation}\n\n边界：${r.boundary || '见全局范围'}\n\n${(r.evidence || []).map(e => `[${e.label}](${e.path})`).join(' · ')}`).join('\n\n')}\n`;
