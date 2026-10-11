import fs from 'node:fs/promises';
import { frontendOnly, frontendOnlyHTML, frontendOnlyMarkdown } from './frontend-only-report.mjs';
import { backend, backendHTML, backendMarkdown } from './backend-report.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ledger = JSON.parse(await fs.readFile(path.join(dir, 'evidence/test-ledger.json'), 'utf8'));
const { testRuns: tests, findings, browserEvidence } = ledger;
const repairs = JSON.parse(await fs.readFile(path.join(dir, 'evidence/repairs.json'), 'utf8'));
const lint = JSON.parse(await fs.readFile(path.join(dir, 'checks/eslint.json'), 'utf8'));
const counts = tests.reduce((out, t) => (out[t.status] = (out[t.status] || 0) + 1, out), {});
const generatedAt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date());
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusClass = s => ({ '通过': 'pass', '失败': 'fail', '阻塞': 'blocked', '未验证': 'pending' }[s] || 'pending');
const badge = s => `<span class="badge ${statusClass(s)}">${esc(s)}</span>`;
const evidenceHref = e => e.startsWith('../checks/') ? e.slice(3) : `evidence/${e}${path.extname(e) ? '' : '.txt'}`;
const evidenceLink = e => e ? `<a href="${esc(evidenceHref(e))}">查看证据</a>` : '见操作结果 / 对应模块证据';
const sourceLinks = source => source.split(';').map(s => {
  return `<code>F:/github/xuanxue_AI-chat-agent/${esc(s)}</code>`;
}).join('<br>');
const repairClass = s => s === '已修复并验证' ? 'pass' : s === '复测失败' ? 'fail' : 'pending';
const repairCounts = Object.values(repairs.items).reduce((out, r) => (out[r.status] = (out[r.status] || 0) + 1, out), {});
const repairCard = id => {
  const r = repairs.items[id];
  if (!r) throw new Error(`Missing repair status for ${id}`);
  return `<div class="repair-current"><h4>现状 <span class="badge ${repairClass(r.status)}">${esc(r.status)}</span></h4><p><strong>修复内容：</strong>${esc(r.change)}</p><p><strong>验证结果：</strong>${esc(r.validation)}</p>${r.boundary ? `<p><strong>待补验收：</strong>${esc(r.boundary)}</p>` : ''}<p class="meta">更新时间：${esc(r.updatedAt || repairs.updatedAt)} · 协作负责：${esc(r.owner)}</p>${r.evidence?.length ? `<p>${r.evidence.map(e => `<a href="${esc(e.path)}">${esc(e.label)}</a>`).join(' · ')}</p>` : ''}${r.screenshot ? `<a href="${esc(r.screenshot)}"><img class="finding-shot" loading="lazy" src="${esc(r.screenshot)}" alt="${esc(id)} 修复后页面"></a>` : ''}</div>`;
};
const currentChecks = Object.entries(repairs.checks).map(([name, c]) => `<div class="check"><h3>${esc(name)} ${badge(c.exitCode === 0 ? '通过' : '失败')}</h3><p>${esc(c.detail)}</p><a href="${esc(c.log)}">修复后检查证据</a></div>`).join('');
const regressionRows = repairs.regressions.map(t => `<tr><td>${esc(t.id)}</td><td>${esc(t.title)}</td><td>${badge(t.status)}</td><td>${esc(t.actual)}</td><td><a href="${esc(t.evidence)}">复测证据</a></td></tr>`).join('');
const repairStyles = `.repair-current{background:#f0f7f3;border:1px solid #bfd6c7;border-radius:10px;padding:15px 18px;margin:15px 0}.repair-current h4{margin:0}.original{margin:16px 0}.original summary{cursor:pointer;color:var(--muted)}.repair-overview{border-top:5px solid #32845c}.repair-overview nav{display:flex;gap:14px;flex-wrap:wrap}`;
const repairOverview = `<section class="repair-overview" id="repairs"><h2>修复现状 · ${esc(repairs.updatedAt)}</h2><p>本次按用户授权由三个 agent 并行修复，逐项整合及复测。首轮 81 条记录保留为历史基线。</p><p>${Object.entries(repairCounts).map(([s, n]) => `<span class="badge ${repairClass(s)}">${esc(s)} ${n} 项</span>`).join(' ')}；真实后端与 AI 的新增验收见上方最新状态。</p><nav>${findings.map(f => `<a href="#${esc(f.id)}">${esc(f.id)} · ${esc(repairs.items[f.id].status)}</a>`).join('')}</nav><h4>修复后工程检查</h4><div class="checks">${currentChecks || '<p>等待整合后检查。</p>'}</div>${regressionRows ? `<h4>修复复测记录</h4><div class="table-wrap"><table><thead><tr><th>编号</th><th>复测项</th><th>结果</th><th>实际结果</th><th>证据</th></tr></thead><tbody>${regressionRows}</tbody></table></div>` : '<p>复测记录将在验证完成后填入。</p>'}<p><a href="evidence/repairs.json">修复状态与复测原始 JSON</a></p></section>`;
const repairMarkdown = `## 修复现状\n\n更新时间：${repairs.updatedAt}。首轮 81 条记录保留为历史基线。\n\n${findings.map(f => { const r = repairs.items[f.id]; return `### ${f.id} ${r.status}\n\n修复：${r.change}\n\n验证：${r.validation}${r.boundary ? `\n\n待补验收：${r.boundary}` : ''}\n\n${r.evidence.map(e => `[${e.label}](${e.path})`).join(' · ')}`; }).join('\n\n')}\n\n${Object.entries(repairs.checks).map(([n, c]) => `- ${n}：退出 ${c.exitCode}，${c.detail}。[证据](${c.log})`).join('\n')}\n`;

const details = {
  'F-07': {
    basis: 'Chrome 实际复现 + 源码核对',
    steps: ['八字输入姓名“跨模块八字甲”、男，按 2026/10/10 08:46 排盘。', '紫微输入姓名“跨模块紫微乙”、女，将出生时间改为 2022/10/10 08:38，并排盘。', '在同一标签页返回八字结果路由 /pages/index/detail。', '查看基本信息和主星：姓名为“跨模块紫微乙”，性别为“女”，阳历仍为 2026/10/10，主星仍为“元男”。'],
    impact: '同一结果页混合两个人物的信息。保存、导出和 AI 上下文可能继续混用当前用户信息与旧盘面，这是源码推断；服务端保存结果本轮未验证。',
    remedy: '为各类排盘保存独立的输入快照；结果显示、导出、保存和聊天统一读取该快照。时间或性别变化时应整体重算，不能仅以已有 solar.year 判断无需计算。',
    extra: ['49-cross-bazi-before', '50-cross-ziwei-result'],
    screenshot: '51-cross-bazi-after',
  },
  'F-01': {
    basis: 'Chrome 实际复现 + 源码核对',
    steps: ['进入八字输入页并生成结果。', '在结果页点击“编辑”。', '等待跳转，实际落在 Agent 首页，未进入八字表单。', '再点八字“立即打开”才看到回填数据。'],
    impact: '编辑操作增加无提示的中间步骤，用户容易认为编辑失败。原数据可以恢复，没有观察到本次编辑数据丢失。',
    remedy: '编辑跳转目标改为 /pages/index/index，并保留现有 edit_bazi_data 回填流程。',
    screenshot: '06-bazi-edit-wrong-route',
  },
  'F-02': {
    basis: 'Chrome 两个入口均实际点击 + 源码核对',
    steps: ['进入登录/注册页，切换到“注册”。', '点击《用户服务协议》，出现“用户服务协议页面开发中”。', '点击《隐私权政策》，出现“隐私权政策页面开发中”。'],
    impact: '注册表单展示了协议名称，但用户无法查阅对应正文。',
    remedy: '补齐两份可访问的正文页面或弹窗，再连接注册页入口。',
  },
  'F-03': {
    basis: '390×844 Chrome 布局实测 + 截图 + DOM 尺寸',
    steps: ['把浏览器视口设为 390×844。', '生成紫微命盘，滚动到“命盘总览”。', '查看宫格中的“小限”年龄列表，观察跨格挤压。'],
    impact: '全页没有横向溢出，但十二宫总览的文字难以辨认：单格约 75.5px，年龄列表约 108.8px，字号 8px。双击宫位可以打开约 374px 宽、年龄字号 14px 的详情面板，已验证可作为绕行方案。',
    remedy: '总览年龄列表改为简短摘要或受约束的换行显示，突出宫位放大入口；避免长列表覆盖相邻格子。',
    screenshot: '39-mobile-ziwei-chart',
    extra: ['43-mobile-ziwei-zoom'],
  },
  'F-04': {
    basis: '实际 Tab 操作 + DOM 焦点检查',
    steps: ['在 Agent 首页将焦点放入消息输入框。', '按 Tab，检查下一个焦点。', '焦点回到 body，没有进入发送按钮；可见可聚焦控件仅 textarea。'],
    impact: '首页的发送、工具卡和头像导航不能通过常规 Tab 顺序到达。发送控件渲染为 uni-button，tabIndex=-1，且没有 button 角色。该结论限于本次首页样本，不等同于全站无障碍合规审计。',
    remedy: '为 H5 操作控件提供正确的按钮语义、焦点顺序及 Enter/Space 触发方式，并补充焦点样式。',
  },
  'F-05': {
    basis: '实际执行 vue-tsc，退出码 2',
    steps: ['在 frontend-docker 目录执行 vue-tsc --noEmit。', '查看 src/store/ziwei.ts 的第 88、98 行。', '两处均报 TS2578：Unused @ts-expect-error directive。'],
    impact: 'H5 构建通过，但类型检查不能作为通过的质量门禁。',
    remedy: '清理过期的 @ts-expect-error 注释，重新执行 typecheck，确认无新增类型错误。',
  },
  'F-06': {
    basis: '首页文案实测 + 前后端源码确认；401 未运行复现',
    steps: ['首页 Agent 对话说明宣称“无需登录即可直接调用”。', '检查 Agent 请求，needAuth 设置为 true。', '后端 /api/llm/agent 路由使用 authMiddleware；缺少 token 时中间件返回 401。'],
    impact: '提供的后端实现不支持文案承诺的匿名调用。当前测试请求因后端未启动而得到 500，不能把该 500 当成 401 的运行证据。',
    remedy: '确认产品预期：若要求登录，应调整文案并提供登录引导；若支持匿名，应实现相应的匿名接口策略，再补跑真实请求测试。',
  },
};

const routes = [
  ['Agent 首页', '/', '工具卡、快捷指令、空输入、错误恢复、菜单、键盘', 'AI 执行动作受后台阻塞'],
  ['八字输入', '/pages/index/index', '姓名、男女、历法切换、农历年份、阳历分钟、取消、回填', '代表性日期测试'],
  ['八字结果', '/pages/index/detail', '详情、时间线、保存拦截、AI 入口、编辑、深链接、跨模块', '导出实际文件未验证'],
  ['六爻输入', '/pages/liuyao/index', '全部 8 类起卦方式、必填、单数双数汉字校验、手机排盘', '在线方式验证六次逐爻生成'],
  ['六爻结果', '/pages/liuyao/result', '本卦变卦、六爻、卦辞、复制、保存拦截、AI 入口、深链接', '服务端保存未验证'],
  ['紫微输入', '/pages/ziwei/index', '姓名、性别、历法、重排、编辑回填、不同年份', '代表性日期测试'],
  ['紫微结果', '/pages/ziwei/result', '十二宫、聚焦、双击放大、大限流年流月、保存拦截、AI 入口、无数据提示', '手机总览文字挤压；导出文件未验证'],
  ['登录/注册', '/pages/auth/auth', '登录必填、请求失败、注册邮箱/用户名/密码校验、协议', '验证码与真实注册登录受阻'],
  ['历史记录', '/pages/history/list', '匿名空状态、刷新、登录入口', '登录后筛选及记录读写受阻'],
  ['聊天', '/pages/chat/index', '空消息、请求失败、三种排盘入口、保存入口、本地备份恢复', '模型回复与外部档案导入未完成'],
  ['关于', '/pages/about/index', '正文、娱乐提示、图片加载、手机适配', '仅核对展示，未核验故事真实性'],
];
const routeRows = routes.map(r => `<tr><td>${esc(r[0])}</td><td><code>${esc(r[1])}</code></td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join('');
const testRows = tests.map(t => `<tr class="${statusClass(t.status)}-row"><td><code>${esc(t.id)}</code><br><small>${esc(t.module)}</small></td><td>${esc(t.title)}</td><td>${badge(t.status)}</td><td>${esc(t.actual)}<br><small>预期：${esc(t.expected)}</small></td><td>${evidenceLink(t.evidence)}</td></tr>`).join('');
const findingCards = findings.map(f => {
  const d = details[f.id];
  return `<article class="finding" id="${esc(f.id)}"><div class="finding-title"><span class="priority ${f.priority === 'P1' ? 'critical' : ''}">${esc(f.priority)}</span><h3>${esc(f.id)} · ${esc(f.title)}</h3></div>${repairCard(f.id)}<details class="original"><summary>首轮发现与原始复现证据</summary><p class="basis">证据方式：${esc(d.basis)}</p><p>${esc(f.actual)}</p><h4>复现步骤</h4><ol>${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p><strong>原始影响：</strong>${esc(d.impact)}</p><p><strong>原始建议：</strong>${esc(d.remedy)}</p><p class="source">首轮源码位置：<br>${sourceLinks(f.source)}</p><p>${evidenceLink(f.evidence)}${(d.extra || []).map(e => ` · <a href="${esc(evidenceHref(e))}">${esc(e)}</a>`).join('')}</p>${d.screenshot ? `<a href="screenshots/${esc(d.screenshot)}.jpg"><img class="finding-shot" loading="lazy" src="screenshots/${esc(d.screenshot)}.jpg" alt="${esc(f.title)}首轮页面截图"></a>` : ''}</details></article>`;
}).join('');

const network = browserEvidence.apiEvents || [];
const requests = new Map(network.filter(e => e.method && !e.method.startsWith('Network.')).map(e => [e.requestId, e.method]));
const apiRows = network.filter(e => e.status).map(e => `<tr><td>${esc(requests.get(e.requestId) || (e.url.includes('/agent') ? 'POST' : ''))}</td><td><code>${esc(new URL(e.url).pathname + new URL(e.url).search)}</code></td><td>${esc(e.status)}</td></tr>`).join('');
const lintErrors = lint.reduce((n, f) => n + f.errorCount, 0);
const lintWarnings = lint.reduce((n, f) => n + f.warningCount, 0);
const gallery = [
  ['05-bazi-timeline', '八字大运、流年、流月与流日'],
  ['12-liuyao-online', '六次在线摇卦完成'],
  ['21-ziwei-timeline', '紫微时间线联动'],
  ['24-chat-error', '聊天 500 错误与输入恢复'],
  ['25-history-anonymous', '历史记录匿名提示'],
  ['26-announcement', '公告弹窗与请求失败'],
  ['31-mobile-home', '390 像素移动首页'],
  ['46-chat-restore', '恢复当前测试保存的本地聊天'],
].map(([name, caption]) => `<figure><a href="screenshots/${name}.jpg"><img loading="lazy" src="screenshots/${name}.jpg" alt="${esc(caption)}"></a><figcaption>${esc(caption)}</figcaption></figure>`).join('');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>玄学 AI 网站检测与修复报告 · 2026-10-10</title><style>
:root{color-scheme:light;--ink:#172033;--muted:#5b677c;--line:#dce3ed;--paper:#fff;--bg:#f3f6fa;--accent:#365ac8}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--bg);font:15px/1.7 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1160px;margin:32px auto;padding:0 22px}header,section{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:28px;margin-bottom:22px}h1{font-size:30px;line-height:1.3;margin:5px 0 12px}h2{font-size:23px;margin:0 0 16px}h3{font-size:18px;margin:0}h4{margin:16px 0 6px}p{margin:10px 0}a{color:var(--accent);text-underline-offset:3px}code{font:13px/1.6 ui-monospace,Consolas,monospace;overflow-wrap:anywhere}small,.meta,.basis,.source{color:var(--muted)}.kicker{letter-spacing:.08em;font-size:12px;color:var(--accent);font-weight:700}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:24px 0}.stat{background:#f5f7fc;padding:15px;border-radius:12px}.stat b{display:block;font-size:29px;line-height:1.2}.stat span{font-size:13px}.notice{background:#fff4ec;border-left:4px solid #d87532;padding:14px 17px;border-radius:6px}.nav{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:20px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border-bottom:1px solid var(--line);padding:12px 10px;text-align:left;vertical-align:top}th{background:#f4f6fb;font-size:13px}td{font-size:14px}.badge,.priority{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;white-space:nowrap;font-weight:700}.pass{background:#e7f5ed;color:#216540}.fail,.critical{background:#fce7e8;color:#9c2632}.blocked{background:#fff0dd;color:#8b560c}.pending{background:#eaf0f7;color:#46566e}.priority{background:#fff0dd;color:#8b560c}.priority.critical{background:#fce7e8;color:#9c2632}.finding{border-top:1px solid var(--line);padding:23px 0}.finding:first-of-type{border-top:0}.finding-title{display:flex;gap:12px;align-items:flex-start}.finding-shot{display:block;width:auto;max-width:100%;max-height:540px;margin:15px auto;border:1px solid var(--line);border-radius:8px}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:#f6f8fc;padding:12px;border-radius:10px}figure img{display:block;width:100%;height:280px;object-fit:contain}figcaption{font-size:13px;color:var(--muted);margin-top:10px}.checks{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.check{padding:17px;background:#f6f8fc;border-radius:10px}li{margin:6px 0}footer{font-size:12px;color:var(--muted);padding:12px 0 24px}.test-table td:nth-child(1){width:100px}.test-table td:nth-child(3){width:75px}.test-table td:nth-child(5){width:105px}.fail-row{background:#fff8f8}.blocked-row{background:#fffaf2}@media(max-width:700px){main{padding:0 12px;margin:15px auto}header,section{padding:20px 16px}h1{font-size:25px}.stats{grid-template-columns:repeat(3,1fr)}.gallery,.checks{grid-template-columns:1fr}table{min-width:680px}}@media print{body{background:white;font-size:11px}main{max-width:none;margin:0;padding:0}header,section{border-radius:0;padding:16px;break-inside:auto}.finding{break-inside:avoid}.nav{display:none}.stats{grid-template-columns:repeat(5,1fr)}.table-wrap{overflow:visible}table{min-width:0}.gallery img{height:180px}a{color:inherit}img{max-height:350px!important}}
${repairStyles}</style></head><body><main>
<header><div class="kicker">CHROME 首轮 · EDGE 补验 / FRONTEND-ONLY · FRONTEND-DOCKER · MYSQL BACKEND</div><h1>玄学 AI 网站检测与修复报告</h1><p><strong>首轮前端问题：${repairCounts["已修复并验证"] || 0}/7 已修复并验证。</strong> ${esc(backend.summary)}</p><p class="meta">测试日期：2026-10-10 · Asia/Singapore（UTC+8） · 报告生成：${esc(generatedAt)} · 首轮 Git 快照：cd12c5b；修复位于当前未提交工作区</p><p>本报告分别记录 frontend-only（3050）与 frontend-docker / backend-docker（3000/3001）。两套各有 11 个注册页面；本页首轮统计属于 frontend-docker，纯前端本轮结果见独立章节。</p><div class="stats"><div class="stat"><b>${tests.length}</b><span>首轮记录用例</span></div>${['通过', '失败', '阻塞', '未验证'].map(s => `<div class="stat"><b>${counts[s] || 0}</b><span>${badge(s)}</span></div>`).join('')}</div><div class="notice"><strong>首轮检测基线（修复现状见下方）：</strong>发现 1 项 P1 数据一致性问题、6 项 P2 功能/质量问题。基础排盘多数流程可用；登录、AI、公告和账户记录管理受后台未运行影响。统计按用例计数，不代表数学算法覆盖率或安全认证。</div><nav class="nav"><a href="#frontend-only">纯前端独立检测与修复</a><a href="#backend">后台最新现状</a><a href="#repairs">前端修复现状</a><a href="#scope">首轮范围与环境</a><a href="#findings">7 项问题</a><a href="#blocked">接口与阻塞</a><a href="#tests">81 项用例</a><a href="#checks">工程检查</a><a href="#evidence">截图与证据</a><a href="#limits">未完成边界</a></nav></header>
${frontendOnlyHTML}${backendHTML}${repairOverview}<section id="scope"><h2>首轮范围与环境（历史基线）</h2><p>目标：<a href="http://127.0.0.1:3000/#/">http://127.0.0.1:3000/#/</a>，对应 <code>frontend-docker</code>。浏览器使用 Chrome 扩展控制，Chrome 154 / Windows；桌面主要视口 1211×922，手机布局视口 390×844。手机检查属于桌面浏览器尺寸模拟，未模拟真实触屏、软键盘或移动浏览器。</p><p>运行 Node v24.19.0、uni-app / Vue 3 / Vite H5 开发服务。当前启动进程临时设置了 <code>VITE_CSP_ALLOW_UNSAFE_STYLE_INLINE=true</code>；本报告结论基于该运行配置，未验证默认开发 CSP 或生产部署 CSP。首轮仅前端运行，后台未启动。后续已启动真实后台与独立 MySQL，并创建合成账号和记录验收；当前状态以“后台联调与修复现状”为准。</p><div class="table-wrap"><table><thead><tr><th>页面</th><th>路由（# 后）</th><th>已检查内容</th><th>边界</th></tr></thead><tbody>${routeRows}</tbody></table></div><p class="meta">附加入口：头像菜单、公告弹窗、三张工具卡、聊天保存/恢复、宫位放大。首轮未包含 frontend-only；后续已独立启动并测试，详见上方纯前端章节。管理后台和小程序/App 构建未纳入。</p></section>
<section id="findings"><h2>问题与复现步骤</h2><p>每项优先展示当前修复状态、改动与复测证据，展开可查看首轮发现。已修复不代表相关后台业务已完成端到端验收。</p>${findingCards}</section>
<section id="blocked"><h2>首轮接口与环境阻塞（历史基线）</h2><p>首轮浏览器实际请求的以下接口返回 HTTP 500。Vite 默认将 /api 代理至 <code>http://localhost:3001</code>，而首轮监听检查只看到前端 3000。首轮 500 是测试环境未具备完整后台时的结果，不能据此判断模型服务、认证、邮件或数据库业务实现本身存在同样的故障。</p><div class="table-wrap"><table><thead><tr><th>方法</th><th>路径</th><th>浏览器状态</th></tr></thead><tbody>${apiRows}</tbody></table></div><p><a href="evidence/api-events.json">脱敏网络证据</a>仅保存方法、URL、状态和请求 ID，不含请求正文、认证令牌或响应头。聊天流式失败后又回退一次普通请求，两次都为 500。</p><p>首轮这些流程未完成；后续登录、三类记录、额度和 AI 的逐项进展已记录在上方后台最新现状。原始网络结果保留，不覆盖历史证据。</p></section>
<section id="tests"><h2>首轮 81 项测试明细（历史基线）</h2><p>“通过”仅代表该行所述结果；“阻塞”包括实际遇到 500 的流程和依赖登录而未能继续的流程；“未验证”保留下载文件、原生文件选择及外部档案的实际内容边界。</p><div class="table-wrap"><table class="test-table"><thead><tr><th>编号 / 模块</th><th>检查项</th><th>结果</th><th>实际与预期</th><th>证据</th></tr></thead><tbody>${testRows}</tbody></table></div></section>
<section id="checks"><h2>首轮工程检查（历史基线）</h2><div class="checks"><div class="check"><h3>H5 构建 ${badge('通过')}</h3><p><code>uni build -p h5</code><br>退出码 0，产物位于 dist/build/h5。</p><a href="checks/build.log">构建日志</a></div><div class="check"><h3>类型检查 ${badge('失败')}</h3><p><code>vue-tsc --noEmit</code><br>退出码 2，ziwei.ts 88/98 行 TS2578。</p><a href="checks/typecheck.log">类型日志</a></div><div class="check"><h3>ESLint ${badge('通过')}</h3><p>执行 package.json 对应 lint 命令：${lint.length} 个文件，${lintErrors} 错误、${lintWarnings} 警告，退出码 0。按现有 .eslintignore 排除 tmui 及产物。</p><a href="checks/eslint.json">完整 JSON 结果</a></div></div><p>浏览器捕获 ${browserEvidence.consoleSummary?.errors ?? 0} 条 error、${browserEvidence.consoleSummary?.warnings ?? 0} 条 warn，主要为运行时配置加载失败、uni-text 嵌套组件提示、HTTP 流式回退。见 <a href="evidence/browser-console.json">控制台日志</a>。构建还提示 Browserslist 数据较旧；没有因此导致构建失败。</p><p>首轮时 package.json 没有独立 test 脚本；修复轮已新增 test 命令和 35 项真实行为回归，结果见上方修复后检查。</p></section>
<section id="evidence"><h2>关键截图与可追溯证据</h2><div class="gallery">${gallery}</div><p><a href="evidence/test-ledger.json">81 条测试记录与问题原始 JSON</a> · <a href="evidence/liuyao-copy.txt">六爻实际复制文本</a> · <a href="report.md">Markdown 报告</a></p><p class="meta">部分页面切换中的截图为空白或截图采集超时，因此这些用例使用对应 DOM 文本作为证据；上方只选取已核对的有效截图。截图目录保留原始采集记录，不将采集异常认定为网站缺陷。</p></section>
<section id="limits"><h2>测试边界与后续验收</h2><ul><li>TOON 导出已点击，页面未见报错，但八字下载事件等待超时；实际八字/紫微下载文件的内容一致性没有验证。不会把工具超时视为导出功能失败。</li><li>聊天保存触发原生文件保存流程并取消；当前测试会话的本地备份恢复通过。实际外部加密聊天档案文件导入尚未验证。</li><li>测试数据均为合成输入；后端轮在独立本地 bazi_e2e 数据库创建 example.test 测试账号，并完成实际注册、登录及服务端保存。未使用真实个人资料；验证码由数据库播种，SMTP 未测试。</li><li>排盘检查验证了操作、字段与结果的关联、指定爻象和代表性日期流程；未对全部 1900–2099 日期、闰月、节气边界或命理结论进行独立标准比对。</li><li>未进行渗透测试、负载测试、真实设备兼容性矩阵或无障碍全量审计。生产构建能完成，不等于正式部署已经验收。</li><li>浏览器临时尺寸覆盖已恢复，前端开发服务保留运行。F-07 的复测范围和结果见对应现状；真实服务端保存和模型回答以后台最新现状为准；实际下载档案仍按所列边界补验收。</li></ul></section>
<footer>报告由当前仓库源码回归、工程检查及 Chrome / Edge 扩展实际操作生成。所有结论以本报告列出的环境和证据为限。</footer>
</main></body></html>`;

const md = `# 玄学 AI 网站检测与修复报告

日期：2026-10-10（UTC+8），生成时间：${generatedAt}。首轮 Git 快照：cd12c5b；修复位于当前未提交工作区。

目标：frontend-docker，http://127.0.0.1:3000/#/。Chrome 扩展实际测试全部 11 个注册页面，桌面与 390×844 布局检查。

共 ${tests.length} 项：${counts['通过']} 通过、${counts['失败']} 失败、${counts['阻塞']} 阻塞、${counts['未验证']} 未验证。当前不能判定全站验收通过。

${frontendOnlyMarkdown}\n${backendMarkdown}\n${repairMarkdown}\n## 首轮已确认问题

${findings.map(f => {
  const d = details[f.id];
  return `### ${f.priority} ${f.id} ${f.title}\n\n${f.actual}\n\n证据方式：${d.basis}。\n\n${d.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n影响：${d.impact}\n\n建议：${d.remedy}\n\n源码：${f.source}\n\n[证据](${evidenceHref(f.evidence)})${d.screenshot ? ` · [截图](screenshots/${d.screenshot}.jpg)` : ''}\n`;
}).join('\n')}
## 首轮构建与静态检查

- H5 构建退出 0，通过。[日志](checks/build.log)
- vue-tsc 退出 2，ziwei.ts 88、98 两处 TS2578。[日志](checks/typecheck.log)
- ESLint 退出 0，${lint.length} 文件、${lintErrors} 错误、${lintWarnings} 警告；按既有配置排除 tmui。[结果](checks/eslint.json)

## 首轮环境阻塞（历史）与未验证边界

首轮只见 127.0.0.1:3000 前端监听，未见 3001 后端或 3306 MySQL。Agent、登录、聊天及公告接口实测返回 500；账户记录读写、验证码注册及 AI 工具动作不能完成端到端验证。[网络证据](evidence/api-events.json)

TOON 实际下载文件内容、聊天实际文件保存和外部加密档案导入未验证；当前测试保存的本地聊天备份恢复通过。手机测试为桌面视口模拟，没有覆盖真实触屏/软键盘。未对全部日期、闰月/节气边界、命理结论做独立标准比对，也未做渗透/负载/全量无障碍审计。

当前开发进程临时设置 VITE_CSP_ALLOW_UNSAFE_STYLE_INLINE=true；修复内容与现状见上方。前端服务保留运行，浏览器尺寸已恢复。

## 页面覆盖

| 页面 | 路由 | 已检查 | 边界 |
| --- | --- | --- | --- |
${routes.map(r => `| ${r.join(' | ')} |`).join('\n')}

## 用例明细

| 编号 | 模块 | 检查项 | 结果 | 实际结果 |
| --- | --- | --- | --- | --- |
${tests.map(t => `| ${t.id} | ${t.module} | ${t.title} | ${t.status} | ${String(t.actual ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`).join('\n')}

[完整 HTML 报告](report.html) · [原始测试 JSON](evidence/test-ledger.json)
`;
await fs.writeFile(path.join(dir, 'report.html'), html, 'utf8');
await fs.writeFile(path.join(dir, 'report.md'), md, 'utf8');
await fs.writeFile(path.join(dir, 'checks/summary.json'), JSON.stringify({ generatedAt, frontendOnly: { updatedAt: frontendOnly.updatedAt, summary: frontendOnly.summary, items: frontendOnly.items?.map(r => ({id:r.id,status:r.status})), checks: frontendOnly.checks }, repairs: { updatedAt: repairs.updatedAt, counts: repairCounts, checks: repairs.checks, regressions: repairs.regressions.length }, backend: { updatedAt: backend.updatedAt, items: backend.items.map(r => ({id:r.id,status:r.status})), checks: backend.checks }, total: tests.length, counts, findingCount: findings.length, priorities: findings.reduce((o, f) => (o[f.priority] = (o[f.priority] || 0) + 1, o), {}), build: { exitCode: 0 }, typecheck: { exitCode: 2, errors: 2 }, lint: { exitCode: 0, files: lint.length, errors: lintErrors, warnings: lintWarnings } }, null, 2));
console.log(JSON.stringify({ files: ['report.html', 'report.md', 'checks/summary.json'], total: tests.length, counts, findings: findings.length }));
const missing = [];
for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const ref = match[1];
  if (/^https?:/.test(ref)) continue;
  if (ref.startsWith('#')) {
    if (!html.includes(`id="${ref.slice(1)}"`)) missing.push(ref);
    continue;
  }
  try {
    const target = path.resolve(dir, decodeURIComponent(ref));
    if (!target.startsWith(dir + path.sep)) throw new Error('Reference is outside report');
    await fs.access(target);
  } catch { missing.push(ref); }
}
if (missing.length) throw new Error(`Report references missing: ${missing.join(', ')}`);
console.log('Verified all report links and image references.');
