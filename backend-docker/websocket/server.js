/**
 * WebSocket 服务器
 */
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { getDatabase } = require('../db');
const ConfigService = require('../config-service');
const { reserveLLMQuota } = require('../services/quota');
const {
	buildLLMRequest,
	consumeLLMStream,
	createLLMRequestControl,
	validateLLMResponse,
	isLLMConfigReady,
} = require('../services/llm');
const config = require('../config');
const {
	normalizeStatusCode,
	isLikelyUpstreamNetworkError,
	resolvePublicErrorMessage,
	sanitizeErrorForLog,
} = require('../utils/error-sanitizer');

// 在初始化阶段获取数据库和密钥，确保已完成 initDatabase 后再调用
let cachedDb = null;
const JWT_SECRET = config.JWT_SECRET;
const wsRateMap = new Map();

// 定期清理已过期的限流记录，避免 Map 无限增长
const wsRateCleanupTimer = setInterval(() => {
	const now = Date.now();
	for (const [key, rec] of wsRateMap.entries()) {
		if (now > rec.resetAt) {
			wsRateMap.delete(key);
		}
	}
}, 5 * 60 * 1000);
if (typeof wsRateCleanupTimer.unref === 'function') {
	wsRateCleanupTimer.unref();
}

function resolveWsLlmErrorCode({ statusCode, rawMessage, rawCode, fallbackCode } = {}) {
	const normalizedStatus = normalizeStatusCode(statusCode || 500);
	const codeText = typeof rawCode === 'string' ? rawCode : '';
	const messageText = typeof rawMessage === 'string' ? rawMessage : '';

	if (codeText === 'LLM_UPSTREAM_AUTH_FAILED') return codeText;
	if (isLikelyUpstreamNetworkError(messageText, codeText)) {
		return 'LLM_UPSTREAM_UNREACHABLE';
	}
	if (normalizedStatus === 429) return 'LLM_QUOTA_EXHAUSTED';
	if (normalizedStatus >= 500) return fallbackCode || 'LLM_REQUEST_FAILED';
	return fallbackCode || 'REQUEST_ERROR';
}

function extractBearerToken(authHeader) {
	if (typeof authHeader !== 'string') return null;
	const m = authHeader.match(/^Bearer\s+(.+)$/i);
	return m && m[1] ? m[1].trim() : null;
}

function extractWsToken(req) {
	const fromAuth = extractBearerToken(req.headers.authorization);
	if (fromAuth) return fromAuth;

	const rawProtocolHeader = req.headers['sec-websocket-protocol'];
	const protocolHeader = Array.isArray(rawProtocolHeader) ? rawProtocolHeader.join(',') : rawProtocolHeader;
	if (typeof protocolHeader === 'string' && protocolHeader.trim()) {
		const protocols = protocolHeader
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
		if (protocols.length >= 2 && protocols[0].toLowerCase() === 'bearer') {
			return protocols[1];
		}

		const bearerProtocol = protocols.find((item) => item.toLowerCase().startsWith('bearer.'));
		if (bearerProtocol) {
			return bearerProtocol.slice('bearer.'.length);
		}
	}

	return null;
}

function sendWsError(ws, { code, message, statusCode = 500, extra } = {}) {
	const safeMessage = code === 'LLM_UPSTREAM_AUTH_FAILED' ? '模型服务鉴权失败，请检查后台模型配置' : resolvePublicErrorMessage({
		statusCode: normalizeStatusCode(statusCode),
		rawMessage: message || '请求失败',
	});
	const payload = {
		event: 'error',
		code: code || 'INTERNAL_ERROR',
		message: safeMessage,
	};
	if (extra && typeof extra === 'object') {
		Object.assign(payload, extra);
	}
	try {
		ws.send(JSON.stringify(payload) + '\n');
	} catch (_) {
		void 0;
	}
}

/**
 * 初始化 WebSocket 服务器
 */
function initWebSocketServer(server) {
	// 确保在 app.js 调用 initDatabase() 之后再获取数据库实例
	if (!cachedDb) {
		cachedDb = getDatabase();
	}
	const db = cachedDb;
	const wss = new WebSocketServer({ server, path: '/api/llm/chat/ws' });
	
	wss.on('connection', (ws, req) => {
		const token = extractWsToken(req);
		
		if (!token) {
			sendWsError(ws, { code: 'MISSING_TOKEN', message: 'missing token', statusCode: 401 });
			ws.close(4001, 'missing token');
			return;
		}
		
		try {
			const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
			ws.userId = decoded.uid;
		} catch (e) {
			sendWsError(ws, { code: 'INVALID_TOKEN', message: 'invalid token', statusCode: 401 });
			ws.close(4002, 'invalid token');
			return;
		}

		ws.on('message', async (message) => {
			const now = Date.now();
			const key = String(ws.userId || 'unknown');
			let rec = wsRateMap.get(key) || { count: 0, resetAt: now + 60000 };
			if (now > rec.resetAt) {
				rec.count = 0;
				rec.resetAt = now + 60000;
			}
			rec.count++;
			wsRateMap.set(key, rec);
			if (rec.count > 5) {
				sendWsError(ws, { code: 'RATE_LIMIT', message: '消息过于频繁', statusCode: 429 });
				ws.close();
				return;
			}
			let parsed = null;
			try {
				parsed = JSON.parse(message.toString());
			} catch (e) {
				sendWsError(ws, { code: 'INVALID_JSON', message: 'invalid json', statusCode: 400 });
				return;
			}
			
			const { messages = [], stream = true } = parsed || {};
			if (!Array.isArray(messages) || messages.length === 0) {
				sendWsError(ws, { code: 'INVALID_PARAMS', message: 'messages 不能为空', statusCode: 400 });
				return;
			}
			
			// One generation owns this socket until its done/error event and close.
			if (ws.generating) {
				sendWsError(ws, { code: 'REQUEST_IN_PROGRESS', message: '已有请求正在生成', statusCode: 429 });
				return;
			}
			ws.generating = true;
			let reservation;
			const control = createLLMRequestControl();
			const onClose = () => control.abort();
			ws.once('close', onClose);
			try {
				const cfg = await ConfigService.getLLMConfig(db);
				if (!isLLMConfigReady(cfg)) {
					throw Object.assign(new Error('LLM 配置不完整'), { statusCode: 500 });
				}
				reservation = await reserveLLMQuota(ws.userId);
				if (!reservation.allowed) {
					sendWsError(ws, {
						code: 'QUOTA_EXHAUSTED',
						message: reservation.reason || '额度已用完',
						statusCode: 429,
						extra: { usage: reservation.usage },
					});
					ws.close();
					return;
				}
				control.signal.throwIfAborted();
				const { url, headers, payload } = buildLLMRequest(cfg, messages, Boolean(stream));
				const llmRes = await fetch(url, {
					method: 'POST', headers, body: JSON.stringify(payload), signal: control.signal,
				});
				if (!llmRes.ok || !llmRes.body) {
					await llmRes.text();
					if (llmRes.status === 401 || llmRes.status === 403) {
						throw Object.assign(new Error('LLM provider authentication failed'), {
							statusCode: 502, code: 'LLM_UPSTREAM_AUTH_FAILED',
						});
					}
					throw Object.assign(new Error('LLM 请求失败'), { statusCode: llmRes.status || 502 });
				}
				const sendText = (text) => {
					if (ws.readyState !== 1) throw new Error('Client disconnected');
					ws.send(JSON.stringify({ event: 'delta', text }) + '\n');
				};
				if (stream) {
					await consumeLLMStream(cfg, llmRes.body, sendText);
				} else {
					sendText(validateLLMResponse(cfg, await llmRes.json()));
				}
				control.signal.throwIfAborted();
				await reservation.commit();
				ws.send(JSON.stringify({ event: 'done' }) + '\n');
				ws.close();
			} catch (err) {
				await reservation?.rollback?.();
				console.error('[WebSocket] 调用失败:', sanitizeErrorForLog(err));
				const statusCode = normalizeStatusCode(err?.statusCode || 502);
				sendWsError(ws, {
					code: resolveWsLlmErrorCode({
						statusCode,
						rawMessage: err?.message || '调用失败',
						rawCode: err?.code || err?.errno,
						fallbackCode: 'LLM_REQUEST_FAILED',
					}),
					message: err?.message || '调用失败',
					statusCode,
				});
				ws.close();
			} finally {
				await reservation?.rollback?.();
				control.dispose();
				ws.removeListener('close', onClose);
				ws.generating = false;
			}
		});
	});
	
	return wss;
}

module.exports = {
	initWebSocketServer,
};

