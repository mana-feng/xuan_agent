/**
 * LLM routes.
 */
const express = require('express');

const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { getDatabase } = require('../db');
const ConfigService = require('../config-service');
const { checkLLMQuota, reserveLLMQuota } = require('../services/quota');
const {
	buildLLMRequest,
	consumeLLMStream,
	createLLMRequestControl,
	validateLLMResponse,
	isLLMConfigReady,
} = require('../services/llm');
const { authMiddleware } = require('../middleware/auth');
const { apiSignatureMiddleware } = require('../middleware/api-signature');
const { llmLimiter } = require('../config/rateLimit');
const {
	normalizeStatusCode,
	isLikelyUpstreamNetworkError,
	resolvePublicErrorMessage,
	sanitizeErrorForLog,
} = require('../utils/error-sanitizer');
const { getErrorCode } = require('../utils/response');

const db = getDatabase();

function resolveLlmErrorCode({ statusCode, rawMessage, rawCode } = {}) {
	const normalizedStatus = normalizeStatusCode(statusCode || 500);
	const safeCode = typeof rawCode === 'string' ? rawCode : '';
	const safeMessage = typeof rawMessage === 'string' ? rawMessage : '';

	if (safeCode === 'LLM_UPSTREAM_AUTH_FAILED') return safeCode;
	if (isLikelyUpstreamNetworkError(safeMessage, safeCode)) {
		return 'LLM_UPSTREAM_UNREACHABLE';
	}

	if (normalizedStatus === 429) {
		return 'LLM_QUOTA_EXHAUSTED';
	}

	if (normalizedStatus >= 500) {
		return 'LLM_REQUEST_FAILED';
	}

	return getErrorCode(normalizedStatus);
}

function writeStreamError(res, { statusCode = 502, rawMessage, rawCode } = {}) {
	const code = resolveLlmErrorCode({ statusCode, rawMessage, rawCode });
	const errorMessage = resolvePublicErrorMessage({ statusCode, rawMessage });
	res.write(`data: ${JSON.stringify({ error: errorMessage, code })}\n\n`);
	res.end();
}

async function handleLLMRequest(req, res, { scope = 'chat', requireQuota = false } = {}) {
	const { messages = [], stream = false } = req.body || {};

	if (!Array.isArray(messages) || messages.length === 0) {
		return res.status(400).json({ error: 'messages cannot be empty' });
	}

	let reservation;
	const control = createLLMRequestControl();
	const onClose = () => { if (!res.writableEnded) control.abort(); };
	res.once('close', onClose);
	try {
		const cfg = await ConfigService.getLLMConfig(db, scope);
		if (!isLLMConfigReady(cfg)) {
			return res.status(400).json({ error: 'LLM config is incomplete' });
		}
		if (requireQuota) {
			reservation = await reserveLLMQuota(req.user.id);
			if (!reservation.allowed) {
				return res.status(429).json({
					error: reservation.reason || 'quota exhausted',
					code: 'LLM_QUOTA_EXHAUSTED',
					usage: reservation.usage,
				});
			}
		}
		control.signal.throwIfAborted();
		const { url, headers, payload } = buildLLMRequest(cfg, messages, stream);
		const llmRes = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
			signal: control.signal,
		});
		if (!llmRes.ok || !llmRes.body) {
			await llmRes.text();
			if (llmRes.status === 401 || llmRes.status === 403) {
				// Provider credentials are independent of the user's application session.
				throw Object.assign(new Error('LLM provider authentication failed'), {
					statusCode: 502, code: 'LLM_UPSTREAM_AUTH_FAILED',
				});
			}
			throw Object.assign(new Error('LLM request failed'), { statusCode: normalizeStatusCode(llmRes.status || 502) });
		}

		if (stream) {
			res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
			res.setHeader('Cache-Control', 'no-cache');
			res.setHeader('Connection', 'keep-alive');
			await consumeLLMStream(cfg, llmRes.body, (text) => {
				res.write(`data: ${JSON.stringify({ event: 'delta', text })}\n\n`);
			});
			control.signal.throwIfAborted();
			await reservation?.commit();
			res.write('data: [DONE]\n\n');
			res.end();
			return;
		}

		const data = await llmRes.json();
		const text = validateLLMResponse(cfg, data);
		control.signal.throwIfAborted();
		await reservation?.commit();
		return res.json({ reply: text });
	} catch (err) {
		await reservation?.rollback?.();
		if (res.destroyed) return;
		const statusCode = normalizeStatusCode(err?.statusCode || err?.status || 502);
		const code = resolveLlmErrorCode({
			statusCode,
			rawMessage: err?.publicMessage || err?.message || 'request failed',
			rawCode: err?.code || err?.errno || err?.cause?.code,
		});
		const message = code === 'LLM_UPSTREAM_AUTH_FAILED' ? '模型服务鉴权失败，请检查后台模型配置' : resolvePublicErrorMessage({
			statusCode,
			rawMessage: err?.publicMessage || err?.message || 'request failed',
		});
		console.error('LLM request failed:', { statusCode, code, ...sanitizeErrorForLog(err) });
		if (res.headersSent) {
			writeStreamError(res, { statusCode, rawMessage: message, rawCode: code });
			return;
		}
		return res.status(statusCode).json({ error: message, code });
	} finally {
		await reservation?.rollback?.();
		control.dispose();
		res.removeListener('close', onClose);
	}
}

router.get('/quota', authMiddleware, async (req, res) => {
	try {
		const userId = req.user.id;

		await checkLLMQuota(userId);

		const quota = await db.get('SELECT * FROM user_llm_quotas WHERE user_id = ?', [userId]);
		const remainingCount =
			quota?.remaining_daily_count !== null && quota?.remaining_daily_count !== undefined
				? quota.remaining_daily_count
				: 0;

		res.json({
			remainingCount,
		});
	} catch (err) {
		console.error('load llm quota failed:', err);
		res.status(500).json({ error: 'load quota failed' });
	}
});

router.post('/chat', llmLimiter, authMiddleware, apiSignatureMiddleware(), async (req, res) => {
	return handleLLMRequest(req, res, { scope: 'chat', requireQuota: true });
});

router.post('/agent', llmLimiter, authMiddleware, apiSignatureMiddleware(), async (req, res) => {
	return handleLLMRequest(req, res, { scope: 'agent', requireQuota: true });
});

module.exports = router;
