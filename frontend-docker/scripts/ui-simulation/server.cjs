const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { TYPES, DEMO_USER, VERIFICATION_CODE, createState } = require('./fixtures.cjs');

const SCENARIOS = ['success', 'loading', 'empty', 'error', 'quota', 'unauthenticated', 'stream-error', 'stream-interrupted'];
const AGENT_ACTIONS = ['auto', 'none', 'navigate:bazi', 'navigate:ziwei', 'navigate:liuyao', 'navigate:history', 'run_bazi_chart', 'run_ziwei_chart', 'run_liuyao_chart', 'focus_ziwei_palace'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const publicAccount = ({ password, ...user }) => user;

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}
function success(res, data, message = '本地模拟响应') {
  json(res, 200, { success: true, data, message });
}
function fail(res, status, code, message) {
  json(res, status, { success: false, data: null, code, message, error: message });
}
async function readBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Object.assign(new Error('模拟请求体过大'), { status: 413 });
  }
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error('请求 JSON 格式错误'), { status: 400 }); }
}
function getCookie(req) {
  return String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('simulation_refresh='))?.slice('simulation_refresh='.length);
}
function cookieHeader(token) {
  return `simulation_refresh=${token}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${token ? '86400' : '0'}`;
}
function issueTokens(state, account, res) {
  const access_token = `simulation-access-${randomUUID()}`;
  const refresh_token = `simulation-refresh-${randomUUID()}`;
  state.accessTokens.set(access_token, account.email);
  state.refreshTokens.set(refresh_token, { email: account.email, access_token });
  res.setHeader('Set-Cookie', cookieHeader(refresh_token));
  return { access_token, refresh_token, expires_in: 3600, user: publicAccount(account) };
}
function scenarioSummary(state) {
  return {
    simulation: true, scenario: state.scenario, delayMs: state.delayMs,
    agentAction: state.agentAction, remainingCount: state.scenario === 'quota' ? 0 : state.remainingCount,
    counts: Object.fromEntries(TYPES.map(type => [type, state.records[type].length])),
    scenarios: SCENARIOS, agentActions: AGENT_ACTIONS,
  };
}
function validQimenPayload(rawPayload, timestamp) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload) ||
    rawPayload.module !== 'qimen' || rawPayload.version !== 1 ||
    rawPayload.input?.ruleVersion !== 'qimen-chai-bu-v1' ||
    typeof rawPayload.input?.question !== 'string' ||
    !Number.isFinite(rawPayload.input?.timestamp) || rawPayload.input.timestamp !== timestamp ||
    typeof rawPayload.input?.timeZone !== 'string' || !rawPayload.input.timeZone ||
    !rawPayload.snapshot || typeof rawPayload.snapshot !== 'object' || Array.isArray(rawPayload.snapshot)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: rawPayload.input.timeZone });
    return Buffer.byteLength(JSON.stringify(rawPayload), 'utf8') <= 1000000;
  } catch { return false; }
}
function agentReply(body, forcedAction) {
  const prompt = String(body.messages?.filter(message => message.role === 'user').at(-1)?.content || '');
  const date = prompt.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})/);
  const time = prompt.match(/(\d{1,2})[:：](\d{2})/);
  const gender = /女/.test(prompt) ? 1 : /男/.test(prompt) ? 0 : undefined;
  const hasBirth = Boolean(date && time && gender !== undefined);
  let selected = forcedAction;
  if (selected === 'auto') {
    if (/历史|记录/.test(prompt)) selected = 'navigate:history';
    else if (/事业宫|官禄宫|夫妻宫|财帛宫/.test(prompt)) selected = 'focus_ziwei_palace';
    else if (/紫微/.test(prompt)) selected = hasBirth ? 'run_ziwei_chart' : 'navigate:ziwei';
    else if (/八字|出生|大运/.test(prompt)) selected = hasBirth ? 'run_bazi_chart' : 'navigate:bazi';
    else if (/起卦|占问|六爻|换工作|合作/.test(prompt)) selected = /打开|进入/.test(prompt) ? 'navigate:liuyao' : 'run_liuyao_chart';
    else selected = 'none';
  }
  let action = { type: selected, label: '执行模拟建议', reason: '本地固定规则模拟，仅验证界面交互' };
  if (selected.startsWith('navigate:')) {
    action = { ...action, type: 'navigate', target: selected.split(':')[1], label: `打开${{ bazi: '八字', ziwei: '紫微', liuyao: '六爻', history: '历史记录' }[selected.split(':')[1]]}` };
  } else if (selected === 'run_bazi_chart' || selected === 'run_ziwei_chart') {
    action.payload = {
      realname: '模拟排盘', gender: gender ?? 0,
      date: date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : '1996-03-21',
      time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '18:30',
    };
  } else if (selected === 'run_liuyao_chart') {
    action.payload = { title: prompt || '模拟事件占问', date: '2026-10-12', time: '09:30' };
  } else if (selected === 'focus_ziwei_palace') {
    action.payload = { palace: prompt.includes('夫妻') ? '夫妻宫' : prompt.includes('财帛') ? '财帛宫' : '事业宫' };
  }
  return `【本地模拟】\n推荐工具：${action.label}。\n原因：使用固定测试响应验证导航与执行。\n下一步：由浏览器原有排盘算法执行；此回复不代表真实模型能力。\n<!--AGENT_ACTION:${JSON.stringify(action)}-->`;
}

function createSimulationServer(options = {}) {
  let state = createState();
  const streamIntervalMs = options.streamIntervalMs ?? 130;
  const frontendPort = Number(options.frontendPort || 4174);
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-UI-Simulation', 'true');
    try {
      const host = new URL(`http://${req.headers.host || '127.0.0.1'}`);
      if (!['127.0.0.1', 'localhost'].includes(host.hostname)) return fail(res, 403, 'LOCAL_ONLY', '仅接受本地模拟请求');
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        const allowedPort = [frontendPort, server.address()?.port].includes(Number(origin.port));
        if (!['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.protocol !== 'http:' || !allowedPort) {
          return fail(res, 403, 'LOCAL_ONLY', '仅接受本地模拟来源');
        }
        res.setHeader('Access-Control-Allow-Origin', origin.origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Device-Id,X-Signature,X-Timestamp,X-Nonce',
        });
        return res.end();
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const route = url.pathname;
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      if (req.method === 'GET' && route === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
        return res.end(fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8').replaceAll('{{FRONTEND_PORT}}', String(frontendPort)));
      }
      if (route.startsWith('/__simulation/')) {
        if (req.method === 'GET' && route === '/__simulation/state') return success(res, scenarioSummary(state));
        if (req.method === 'GET' && route === '/__simulation/requests') return success(res, { list: state.requests });
        if (req.method === 'GET' && route === '/__simulation/chat-requests') return success(res, { list: state.chatRequests });
        if (req.method === 'POST' && route === '/__simulation/reset') {
          state = createState();
          return success(res, scenarioSummary(state), '模拟内存数据已重置；请在前端重新登录');
        }
        if (req.method === 'POST' && route === '/__simulation/expire-access') {
          state.accessTokens.clear();
          return success(res, { expired: true }, 'Access token 已失效，下一次受保护请求应尝试刷新');
        }
        if (req.method === 'POST' && route === '/__simulation/scenario') {
          if (body.scenario !== undefined && !SCENARIOS.includes(body.scenario)) return fail(res, 400, 'INVALID_SCENARIO', '未知模拟场景');
          if (body.agentAction !== undefined && !AGENT_ACTIONS.includes(body.agentAction)) return fail(res, 400, 'INVALID_ACTION', '未知 Agent 动作');
          if (body.delayMs !== undefined && (!Number.isFinite(body.delayMs) || body.delayMs < 0 || body.delayMs > 15000)) return fail(res, 400, 'INVALID_DELAY', '延迟必须在 0 到 15000 毫秒');
          for (const key of ['scenario', 'delayMs', 'agentAction']) if (body[key] !== undefined) state[key] = body[key];
          return success(res, scenarioSummary(state));
        }
        return fail(res, 404, 'NOT_FOUND', '模拟控制端点不存在');
      }
      // Keep a bounded, body-free request log: no passwords, tokens or chat text.
      const entry = { method: req.method, path: route, query: url.search, at: new Date().toISOString(), status: null };
      state.requests.push(entry);
      if (state.requests.length > 150) state.requests.shift();
      res.once('finish', () => { entry.status = res.statusCode; });
      if (state.scenario === 'loading') await wait(state.delayMs);
      if (req.method === 'GET' && route === '/api/config/bootstrap') {
        return success(res, { version: 'ui-simulation-1', simulation: true, features: { bazi: true, ziwei: true, liuyao: true, qimen: true, agent: true, history: true }, label: '本地模拟环境' });
      }
      if (req.method === 'GET' && route === '/api/announcements') {
        const announcement = { id: 1, title: '本地模拟环境', content: '当前账号、历史记录与 AI 回复均为本地模拟数据。排盘由正式前端算法计算。本环境不连接生产后端、不发送邮件；重启后数据恢复初始状态。', expiresAt: null, createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' };
        return success(res, url.searchParams.get('onlyMeta') === 'true' ? { meta: [{ id: 1, updatedAt: announcement.updatedAt }] } : { list: [announcement] });
      }
      if (req.method === 'POST' && route === '/api/stats/pageview') return success(res, { recorded: false, simulation: true });
      if (state.scenario === 'error' && route !== '/api/auth/logout') return fail(res, 503, 'SIMULATED_ERROR', '模拟服务暂时不可用，请切换成功场景后重试');
      if (req.method === 'POST' && route.startsWith('/api/email/')) {
        const email = String(body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.test$/.test(email)) return fail(res, 400, 'TEST_EMAIL_ONLY', '模拟环境请使用 .test 结尾的虚构邮箱');
        if (route === '/api/email/send-code') {
          state.codes.add(email);
          return success(res, { code: VERIFICATION_CODE }, '本地模拟验证码为 123456，未发送邮件');
        }
        if (route === '/api/email/verify-code') {
          if (!state.codes.has(email) || body.code !== VERIFICATION_CODE) return fail(res, 400, 'INVALID_CODE', '模拟验证码不正确，请输入 123456');
          return success(res, { verified: true }, '模拟验证码验证成功');
        }
      }
      if (req.method === 'POST' && route === '/api/auth/login') {
        if (state.scenario === 'unauthenticated') return fail(res, 401, 'UNAUTHORIZED', '登录已失效，请重新登录');
        const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
        const account = [...state.accounts.values()].find(item => item.email === identifier || item.username === identifier);
        if (!account || body.password !== account.password) return fail(res, 401, 'INVALID_CREDENTIALS', '模拟账号或密码错误');
        return success(res, issueTokens(state, account, res));
      }
      if (req.method === 'POST' && route === '/api/auth/register') {
        const email = String(body.email || '').trim().toLowerCase();
        if (!email.endsWith('.test') || !state.codes.has(email) || body.verification_code !== VERIFICATION_CODE) return fail(res, 400, 'INVALID_CODE', '请先发送并填写模拟验证码 123456');
        if (state.accounts.has(email)) return fail(res, 409, 'ALREADY_EXISTS', '该模拟邮箱已注册');
        if (String(body.password || '').length < 6 || String(body.username || '').trim().length < 2) return fail(res, 400, 'INVALID_INPUT', '请填写用户名与至少 6 位的模拟密码');
        const account = { id: state.accounts.size + 1, username: String(body.username), email, password: String(body.password), role: 'user' };
        state.accounts.set(email, account);
        state.codes.delete(email);
        return success(res, issueTokens(state, account, res));
      }
      if (req.method === 'POST' && route === '/api/auth/refresh') {
        const token = body.refresh_token || getCookie(req);
        const session = state.refreshTokens.get(token);
        if (state.scenario === 'unauthenticated' || !session) return fail(res, 401, 'UNAUTHORIZED', '登录已失效，请重新登录');
        state.refreshTokens.delete(token);
        state.accessTokens.delete(session.access_token);
        return success(res, issueTokens(state, state.accounts.get(session.email), res));
      }
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const email = state.accessTokens.get(token);
      if (req.method === 'POST' && route === '/api/auth/logout') {
        const refresh = body.refresh_token || getCookie(req);
        const session = state.refreshTokens.get(refresh);
        state.refreshTokens.delete(refresh);
        state.accessTokens.delete(session?.access_token || token);
        res.setHeader('Set-Cookie', cookieHeader(''));
        return success(res, { loggedOut: true });
      }
      if (!email || state.scenario === 'unauthenticated') return fail(res, 401, 'UNAUTHORIZED', '未登录');
      if (req.method === 'GET' && route === '/api/auth/me') return success(res, { user: publicAccount(state.accounts.get(email)) });
      if (req.method === 'GET' && route === '/api/llm/quota') return success(res, { remainingCount: state.scenario === 'quota' ? 0 : state.remainingCount, totalCount: 30, usedCount: 30 - state.remainingCount });
      if (req.method === 'GET' && route === '/api/charts') {
        const type = url.searchParams.get('type') || 'bazi';
        if (!TYPES.includes(type)) return fail(res, 400, 'INVALID_TYPE', '未知排盘类型');
        const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase();
        const gender = url.searchParams.get('gender');
        const list = (state.scenario === 'empty' ? [] : state.records[type]).filter(row => (!keyword || row.title.toLowerCase().includes(keyword)) && (!gender || row.gender === gender));
        const direction = url.searchParams.get('sortOrder') === 'ASC' ? 1 : -1;
        const sortBy = url.searchParams.get('sortBy');
        list.sort((a, b) => (sortBy === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : new Date(a.createdAt) - new Date(b.createdAt)) * direction);
        const total = list.length;
        // The production client requests the complete list and paginates locally.
        // Explicit pagination is useful for protocol probes; it is never forced.
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || total || 1));
        const offset = (Math.max(1, Number(url.searchParams.get('page')) || 1) - 1) * limit;
        return success(res, { list: list.slice(offset, offset + limit), total, hasMore: offset + limit < total });
      }
      const write = route.match(/^\/api\/(bazi|ziwei|liuyao|qimen)(?:\/(\d+))?$/);
      if (write && ['POST', 'PUT', 'GET', 'DELETE'].includes(req.method)) {
        const [, type, idText] = write;
        const id = Number(idText);
        const index = state.records[type].findIndex(row => row.id === id);
        if (req.method === 'GET' && !idText) return success(res, { list: state.scenario === 'empty' ? [] : state.records[type] });
        if (['PUT', 'GET', 'DELETE'].includes(req.method) && index < 0) return fail(res, 404, 'NOT_FOUND', '记录不存在或无权访问');
        if (req.method === 'GET') return success(res, state.records[type][index]);
        if (req.method === 'DELETE') {
          state.records[type].splice(index, 1);
          return success(res, { id, deleted: true });
        }
        const birth = new Date(body.birthDatetime);
        if (!body.name || !body.rawPayload || Number.isNaN(birth.getTime())) return fail(res, 400, 'INVALID_INPUT', '缺少名称、有效时间或排盘输入');
        if (type === 'qimen' && !validQimenPayload(body.rawPayload, birth.getTime())) return fail(res, 400, 'INVALID_INPUT', '缺少有效的奇门输入或排盘快照');
        const updated = req.method === 'PUT';
        const savedId = updated ? id : state.nextIds[type]++;
        const now = new Date().toISOString();
        const row = { id: savedId, type, title: body.name, gender: body.gender == null ? null : String(body.gender), birthDatetime: birth.toISOString(), calendarType: body.calendarType || 'solar', rawPayload: body.rawPayload, createdAt: updated ? state.records[type][index].createdAt : now, updatedAt: now };
        if (updated) state.records[type][index] = row;
        else state.records[type].push(row);
        return success(res, { id: savedId, updated });
      }
      const remove = route.match(/^\/api\/charts\/(\d+)$/);
      if (req.method === 'DELETE' && remove) {
        const type = url.searchParams.get('type') || 'bazi';
        if (!TYPES.includes(type)) return fail(res, 400, 'INVALID_TYPE', '未知排盘类型');
        const index = state.records[type].findIndex(row => row.id === Number(remove[1]));
        if (index < 0) return fail(res, 404, 'NOT_FOUND', '记录不存在或无权访问');
        state.records[type].splice(index, 1);
        return success(res, { id: Number(remove[1]), deleted: true });
      }
      if (req.method === 'POST' && ['/api/llm/agent', '/api/llm/chat'].includes(route)) {
        if (state.scenario === 'quota' || state.remainingCount <= 0) return fail(res, 429, 'QUOTA_EXCEEDED', '模拟额度已用完，请切换成功场景或重置额度');
        if (!Array.isArray(body.messages) || !body.messages.some(item => item.role === 'user' && item.content)) return fail(res, 400, 'INVALID_MESSAGES', '消息不能为空');
        // This capture exists only in the local simulator. Keep the actual model
        // messages for UI context verification, never headers or credential fields.
        state.chatRequests.push({
          path: route, at: new Date().toISOString(), stream: Boolean(body.stream),
          messages: body.messages.filter(item => item && typeof item.content === 'string')
            .map(item => ({ role: String(item.role), content: item.content })),
        });
        if (state.chatRequests.length > 20) state.chatRequests.shift();
        state.remainingCount -= 1;
        const reply = route.endsWith('/agent') ? agentReply(body, state.agentAction) : '【本地模拟回复】已读取本次对话及盘面上下文。\n\n这是用于验证消息展示、流式输出与额度变化的固定内容。排盘结果由浏览器真实算法生成；此回复不代表真实模型推理。\n\n你可以继续提问，或导出当前对话。';
        if (!body.stream || route.endsWith('/agent')) return success(res, { reply, choices: [{ message: { role: 'assistant', content: reply } }] });
        const streamScenario = state.scenario;
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        const chunks = reply.match(/.{1,14}|\n/g) || [];
        for (let index = 0; index < chunks.length; index += 1) {
          if (res.destroyed) return;
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[index] } }] })}\n\n`);
          if (index === 1 && ['stream-error', 'stream-interrupted'].includes(streamScenario)) {
            if (streamScenario === 'stream-error') res.write(`data: ${JSON.stringify({ error: '模拟流式响应失败，请手动重试', code: 'SIMULATED_STREAM_ERROR' })}\n\n`);
            return res.end();
          }
          await wait(streamIntervalMs);
        }
        return res.end('data: [DONE]\n\n');
      }
      return fail(res, 404, 'NOT_FOUND', '未实现的模拟接口，请检查请求日志');
    } catch (error) {
      if (res.headersSent) return res.end();
      fail(res, error.status || 500, error.status === 400 ? 'INVALID_JSON' : 'SIMULATION_ERROR', error.status ? error.message : '本地模拟服务异常');
    }
  });
  return server;
}

module.exports = { createSimulationServer, SCENARIOS, AGENT_ACTIONS };
