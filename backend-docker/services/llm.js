/**
 * LLM service helpers
 */
const { safeJsonParse } = require('../utils/helpers');
const { StringDecoder } = require('string_decoder');

function normalizeProvider(provider) {
	return String(provider || '').trim().toLowerCase();
}

function isApiKeyOptionalProvider(provider) {
	return normalizeProvider(provider) === 'ollama';
}

function isLLMConfigReady(cfg) {
	if (!cfg) return false;
	const provider = normalizeProvider(cfg.provider);
	return Boolean(cfg.baseUrl && cfg.model && (cfg.apiKey || isApiKeyOptionalProvider(provider)));
}

function resolveOllamaChatUrl(baseUrl) {
	const base = String(baseUrl || '').trim();
	if (!base) return '';
	if (/\/api\/chat\/?$/i.test(base)) {
		return base;
	}
	return `${base.replace(/\/$/, '')}/api/chat`;
}

function stripThinkTags(text) {
	return String(text || '')
		.replace(/<think>[\s\S]*?<\/think>/gi, '')
		.trim();
}

function createThinkBlockStripper() {
	const openTag = '<think>';
	const closeTag = '</think>';
	const maxCarryLength = Math.max(openTag.length, closeTag.length) - 1;
	let insideThink = false;
	let carry = '';

	return function stripChunk(input, { flush = false } = {}) {
		let text = carry + String(input || '');
		carry = '';
		let output = '';
		let cursor = 0;

		while (cursor < text.length) {
			if (insideThink) {
				const closeIndex = text.indexOf(closeTag, cursor);
				if (closeIndex === -1) {
					if (!flush) {
						carry = text.slice(Math.max(cursor, text.length - maxCarryLength));
					}
					return output;
				}
				cursor = closeIndex + closeTag.length;
				insideThink = false;
				continue;
			}

			const openIndex = text.indexOf(openTag, cursor);
			if (openIndex === -1) {
				if (flush) {
					output += text.slice(cursor);
				} else {
					const keepStart = Math.max(cursor, text.length - maxCarryLength);
					output += text.slice(cursor, keepStart);
					carry = text.slice(keepStart);
				}
				return output;
			}

			output += text.slice(cursor, openIndex);
			cursor = openIndex + openTag.length;
			insideThink = true;
		}

		return output;
	};
}

function buildLLMHeaders(cfg) {
	const provider = normalizeProvider(cfg.provider);
	const common = { 'Content-Type': 'application/json' };

	if (provider === 'gemini') {
		return common;
	}

	if (provider === 'anthropic') {
		return {
			...common,
			'x-api-key': cfg.apiKey,
			'anthropic-version': '2023-06-01',
		};
	}

	if (provider === 'ollama') {
		return common;
	}

	return {
		...common,
		Authorization: `Bearer ${cfg.apiKey}`,
	};
}

function buildLLMPayload(cfg, messages, stream) {
	const provider = normalizeProvider(cfg.provider);
	const extra = safeJsonParse(cfg.extra) || {};

	if (provider === 'gemini') {
		const systemMessage = messages.find((item) => item.role === 'system');
		const chatMessages = messages.filter((item) => item.role !== 'system');
		const contents = chatMessages.map((item) => ({
			role: item.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: item.content }],
		}));

		const payload = {
			contents,
			...extra,
		};

		if (systemMessage) {
			payload.systemInstruction = {
				parts: [{ text: systemMessage.content }],
			};
		}

		return payload;
	}

	if (provider === 'anthropic') {
		return {
			model: cfg.model,
			messages: messages.map((item) => ({
				role: item.role || 'user',
				content: item.content,
			})),
			max_tokens: extra.max_tokens || 1024,
			stream: Boolean(stream),
			...extra,
		};
	}

	if (provider === 'ollama') {
		const payload = {
			model: cfg.model,
			messages: messages.map((item) => ({
				role: item.role || 'user',
				content: item.content,
			})),
			stream: Boolean(stream),
			...extra,
		};

		if (payload.think === undefined) {
			payload.think = false;
		}

		return payload;
	}

	const payload = {
		model: cfg.model,
		messages: messages.map((item) => ({
			role: item.role || 'user',
			content: item.content,
		})),
		stream: Boolean(stream),
		...extra,
	};
	// Compatible providers may opt out explicitly if they do not support usage chunks.
	if (provider === 'openai' && payload.stream) {
		payload.stream_options = { include_usage: true, ...payload.stream_options };
	}
	return payload;
}

function buildLLMRequest(cfg, messages, stream) {
	const provider = normalizeProvider(cfg.provider);
	const headers = buildLLMHeaders(cfg);
	const payload = buildLLMPayload(cfg, messages, stream);

	if (provider === 'gemini') {
		const base = String(cfg.baseUrl || '').trim();
		const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
		let targetUrl = '';

		if (base.includes(':streamGenerateContent') || base.includes(':generateContent')) {
			targetUrl = base.replace(/:(streamGenerateContent|generateContent)/, `:${endpoint}`);
		} else {
			targetUrl = `${base.replace(/\/$/, '')}/models/${cfg.model}:${endpoint}`;
		}

		const url = new URL(targetUrl);
		url.searchParams.set('key', cfg.apiKey);
		if (stream) {
			url.searchParams.set('alt', 'sse');
		}
		return { url: url.toString(), headers, payload };
	}

	if (provider === 'ollama') {
		return {
			url: resolveOllamaChatUrl(cfg.baseUrl),
			headers,
			payload,
		};
	}

	return { url: cfg.baseUrl, headers, payload };
}

function extractLLMText(cfg, data) {
	const provider = normalizeProvider(cfg?.provider);

	if (provider === 'gemini') {
		let text = '';
		if (data?.candidates?.[0]?.content?.parts) {
			for (const part of data.candidates[0].content.parts) {
				if (part.text) {
					text += part.text;
				}
			}
		}
		return text.trim();
	}

	if (provider === 'anthropic') {
		let text = '';
		if (Array.isArray(data?.content)) {
			for (const block of data.content) {
				if (block?.type === 'text' && block?.text) {
					text += block.text;
				}
			}
		}
		return text.trim();
	}

	if (provider === 'ollama') {
		return stripThinkTags(data?.message?.content || '');
	}

	if (data?.choices?.[0]) {
		const choice = data.choices[0];
		if (choice.message?.content) {
			return String(choice.message.content).trim();
		}
		if (choice.text) {
			return String(choice.text).trim();
		}
	}

	return '';
}

function extractLLMStreamText(cfg, data, thinkStripper) {
	const provider = normalizeProvider(cfg?.provider);
	if (provider === 'gemini') {
		return (data?.candidates?.[0]?.content?.parts || [])
			.filter((part) => !part.thought && typeof part.text === 'string')
			.map((part) => part.text).join('');
	}

	if (provider === 'anthropic') {
		return typeof data?.delta?.text === 'string' ? data.delta.text : '';
	}

	if (provider === 'ollama') {
		const content = typeof data?.message?.content === 'string' ? data.message.content : '';
		if (!content) return '';
		return thinkStripper ? thinkStripper(content) : stripThinkTags(content);
	}

	if (data?.choices?.[0]) {
		const choice = data.choices[0];
		if (typeof choice?.delta?.content === 'string') {
			return choice.delta.content;
		}
		if (typeof choice?.message?.content === 'string') {
			return choice.message.content;
		}
	}

	return '';
}

function flushLLMStreamText(cfg, thinkStripper) {
	if (normalizeProvider(cfg?.provider) !== 'ollama' || typeof thinkStripper !== 'function') {
		return '';
	}
	return thinkStripper('', { flush: true }).trim();
}

function llmResponseError(message) {
	return Object.assign(new Error(message), { statusCode: 502 });
}

function createLLMRequestControl() {
	const controller = new AbortController();
	const configured = Number(process.env.LLM_REQUEST_TIMEOUT_MS);
	const timeout = Number.isFinite(configured) && configured > 0
		? Math.min(300000, Math.max(1000, configured)) : 180000;
	const timer = setTimeout(() => controller.abort(), timeout);
	timer.unref?.();
	return {
		signal: controller.signal,
		abort: () => controller.abort(),
		dispose: () => clearTimeout(timer),
	};
}

function extractLLMTokenUsage(cfg, data) {
	const valid = value => Number.isSafeInteger(value) && value >= 0;
	const usage = data?.usage;
	if (valid(usage?.total_tokens)) return usage.total_tokens;
	if (valid(usage?.prompt_tokens) && valid(usage?.completion_tokens)) {
		const total = usage.prompt_tokens + usage.completion_tokens;
		return valid(total) ? total : 0;
	}
	return 0;
}

/** Consume provider SSE/NDJSON to completion, rejecting empty, error or cut-off responses. */
async function consumeLLMStream(cfg, body, onText) {
	const provider = normalizeProvider(cfg?.provider);
	const decoder = new StringDecoder('utf8');
	const stripThinkChunk = createThinkBlockStripper();
	let buffer = '';
	let eventData = [];
	let completed = false;
	let hasVisibleText = false;
	let tokensUsed = 0;

	const emit = (text) => {
		if (!text) return;
		if (text.trim()) hasVisibleText = true;
		onText(text);
	};
	const processPayload = (raw) => {
		if (raw === '[DONE]') { completed = true; return; }
		let data;
		try { data = JSON.parse(raw); } catch (_) { throw llmResponseError('Malformed LLM stream'); }
		if (data.error || data.type === 'error') throw llmResponseError('LLM upstream returned an error');
		// Usage is cumulative and can arrive in a separate chunk after finish_reason.
		tokensUsed = Math.max(tokensUsed, extractLLMTokenUsage(cfg, data));
		emit(extractLLMStreamText(cfg, data, stripThinkChunk));
		if (provider === 'ollama') completed ||= data.done === true;
		else if (provider === 'anthropic') completed ||= data.type === 'message_stop';
		else if (provider === 'gemini') completed ||= Boolean(data.candidates?.[0]?.finishReason);
		else completed ||= Boolean(data.choices?.[0]?.finish_reason);
	};
	const processLine = (line) => {
		line = line.replace(/\r$/, '');
		if (provider === 'ollama') {
			if (line.trim()) processPayload(line.trim());
			return;
		}
		if (!line.trim()) {
			if (eventData.length) processPayload(eventData.join('\n'));
			eventData = [];
		} else if (line.startsWith('data:')) {
			eventData.push(line.slice(5).replace(/^ /, ''));
		}
	};
	for await (const chunk of body) {
		buffer += decoder.write(chunk);
		let newline;
		while ((newline = buffer.indexOf('\n')) !== -1) {
			processLine(buffer.slice(0, newline));
			buffer = buffer.slice(newline + 1);
		}
	}
	buffer += decoder.end();
	if (buffer) processLine(buffer);
	if (eventData.length) processPayload(eventData.join('\n'));
	emit(flushLLMStreamText(cfg, stripThinkChunk));
	if (!completed) throw llmResponseError('LLM stream ended without completion');
	if (!hasVisibleText) throw llmResponseError('LLM returned an empty answer');
	return { tokensUsed };
}

function validateLLMResponse(cfg, data) {
	if (data?.error) throw llmResponseError('LLM upstream returned an error');
	if (normalizeProvider(cfg?.provider) === 'ollama' && data?.done !== true) {
		throw llmResponseError('LLM response ended without completion');
	}
	const text = extractLLMText(cfg, data);
	if (!text.trim()) throw llmResponseError('LLM returned an empty answer');
	return text;
}

module.exports = {
	buildLLMHeaders,
	buildLLMPayload,
	buildLLMRequest,
	consumeLLMStream,
	createLLMRequestControl,
	createThinkBlockStripper,
	extractLLMStreamText,
	extractLLMText,
	extractLLMTokenUsage,
	flushLLMStreamText,
	isApiKeyOptionalProvider,
	isLLMConfigReady,
	validateLLMResponse,
};
