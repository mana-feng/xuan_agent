import { getAiConfig } from '@/config/aiConfig';

export type StreamCallbacks = {
	onChunk?: (text: string) => void;
	onThinking?: (text: string) => void;
};
export type AiRequestOptions = { signal?: AbortSignal; timeoutMs?: number };
type AiProtocol = 'openai' | 'anthropic' | 'gemini';

/** A generation is sent once. An ambiguous network failure must never replay it. */
export async function callAi(
	messages: Array<{ role: string; content: string }>,
	callbacks?: StreamCallbacks,
	options: AiRequestOptions = {},
): Promise<string> {
	const config = getAiConfig();
	if (!config) throw new Error('请先在设置页面配置 AI API');
	if (options.signal?.aborted) throw new Error('AI 请求已取消');
	const { apiUrl, apiKey, model, provider } = config;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const protocol: AiProtocol = provider === 'anthropic' ? 'anthropic'
		: provider === 'gemini' && !new URL(apiUrl).pathname.includes('/chat/completions') ? 'gemini' : 'openai';
	// Choose transport before sending; platforms without fetch can use uni.request.
	const useStream = !!(callbacks?.onChunk || callbacks?.onThinking) && typeof fetch === 'function';
	const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
	let url = apiUrl;
	let body: any;
	if (protocol === 'anthropic') {
		if (apiKey) headers['x-api-key'] = apiKey;
		headers['anthropic-version'] = '2023-06-01';
		headers['anthropic-dangerous-direct-browser-access'] = 'true';
		body = { model, max_tokens: 4096, stream: useStream,
			messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
		};
		if (systemText) body.system = systemText;
	} else if (protocol === 'gemini') {
		if (apiKey) headers['x-goog-api-key'] = apiKey;
		body = { contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
		if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
		url = resolveGeminiNativeUrl(apiUrl, model, useStream);
	} else {
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
		body = { model, messages, stream: useStream };
	}

	const controller = new AbortController();
	let timedOut = false;
	const cancel = () => controller.abort();
	options.signal?.addEventListener('abort', cancel, { once: true });
	const timeout = Number.isFinite(options.timeoutMs) && options.timeoutMs! > 0 ? options.timeoutMs! : 300000;
	const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
	try {
		return useStream
			? await streamRequest(url, headers, body, protocol, controller.signal, callbacks)
			: await nonStreamRequest(url, headers, body, protocol, controller.signal, timeout);
	} catch (error) {
		if (controller.signal.aborted) throw new Error(timedOut ? 'AI 请求超时，请稍后手动重试' : 'AI 请求已取消');
		if (error instanceof TypeError) throw new Error('模型连接失败，请检查 API 地址、网络和浏览器跨域设置');
		throw error;
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', cancel);
	}
}

function resolveGeminiNativeUrl(baseUrl: string, model: string, stream: boolean): string {
	const url = new URL(baseUrl);
	const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
	if (/:(streamGenerateContent|generateContent)$/.test(url.pathname)) {
		url.pathname = url.pathname.replace(/:(streamGenerateContent|generateContent)$/, `:${endpoint}`);
	} else {
		url.pathname = `${url.pathname.replace(/\/+$/, '')}/models/${encodeURIComponent(model.replace(/^models\//, ''))}:${endpoint}`;
	}
	if (stream) url.searchParams.set('alt', 'sse');
	else if (url.searchParams.get('alt') === 'sse') url.searchParams.delete('alt');
	return url.toString();
}

function checkProviderError(data: any, protocol: AiProtocol): void {
	if (data?.error || data?.type === 'error' || data?.promptFeedback?.blockReason) throw new Error('AI 服务返回失败或内容被拦截');
	const reason = protocol === 'anthropic' ? (data?.delta?.stop_reason || data?.stop_reason)
		: protocol === 'gemini' ? data?.candidates?.[0]?.finishReason : data?.choices?.[0]?.finish_reason;
	if (['length', 'max_tokens', 'MAX_TOKENS'].includes(reason)) throw new Error('AI 回复达到长度上限，内容已截断，请缩小问题范围');
	if (reason && !['stop', 'end_turn', 'stop_sequence', 'STOP', 'tool_calls', 'function_call'].includes(reason)) {
		throw new Error('AI 回复未正常结束，请检查模型返回状态');
	}
}

function joinText(parts: any, thought = false): string {
	if (!Array.isArray(parts)) return '';
	return parts.filter(p => !!p?.thought === thought && typeof p?.text === 'string').map(p => p.text).join('');
}

function parseReply(data: any, protocol: AiProtocol): string {
	if (typeof data === 'string') {
		try { data = JSON.parse(data); } catch { throw new Error('AI 响应解析失败'); }
	}
	checkProviderError(data, protocol);
	const content = protocol === 'anthropic' ? joinText(data?.content)
		: protocol === 'gemini' ? joinText(data?.candidates?.[0]?.content?.parts)
		: data?.choices?.[0]?.message?.content;
	if (typeof content !== 'string' || !content.trim()) throw new Error('AI 未返回可显示内容');
	return content;
}

async function nonStreamRequest(url: string, headers: Record<string, string>, body: any, protocol: AiProtocol, signal: AbortSignal, timeout: number): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let task: ReturnType<typeof uni.request> | undefined;
		const finish = (error: unknown, content?: string) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener('abort', cancel);
			if (error) reject(error); else resolve(content!);
		};
		const cancel = () => { finish(new Error('AI 请求已取消')); task?.abort(); };
		signal.addEventListener('abort', cancel, { once: true });
		if (signal.aborted) { cancel(); return; }
		try {
			task = uni.request({ url, method: 'POST', data: body, header: headers, timeout,
				success: (res: any) => {
					try {
						if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`AI 请求失败: ${res.statusCode}`);
						finish(null, parseReply(res.data, protocol));
					} catch (error) { finish(error); }
				},
				fail: () => finish(new Error('AI 请求失败，请检查网络和浏览器跨域设置')),
			});
		} catch (error) { finish(error); }
	});
}

function extractStreamChunk(data: any, protocol: AiProtocol): { content: string; thinking: string } {
	if (protocol === 'anthropic') {
		return {
			content: data?.type === 'content_block_delta' && data?.delta?.type === 'text_delta' ? data.delta.text || '' : '',
			thinking: data?.type === 'content_block_delta' && data?.delta?.type === 'thinking_delta' ? data.delta.thinking || '' : '',
		};
	}
	if (protocol === 'gemini') {
		const parts = data?.candidates?.[0]?.content?.parts;
		return { content: joinText(parts), thinking: joinText(parts, true) };
	}
	return { content: data?.choices?.[0]?.delta?.content || '', thinking: data?.choices?.[0]?.delta?.reasoning_content || '' };
}

async function streamRequest(url: string, headers: Record<string, string>, body: any, protocol: AiProtocol, signal: AbortSignal, callbacks?: StreamCallbacks): Promise<string> {
	const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
	if (!response.ok) throw new Error(`AI 请求失败: ${response.status}`);
	if (response.headers.get('content-type')?.includes('application/json')) {
		return parseReply(await response.text(), protocol);
	}
	if (!response.body) throw new Error('AI 响应为空，未收到流式内容');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let dataLines: string[] = [];
	let fullText = '';
	let complete = false;
	const dispatch = () => {
		if (!dataLines.length || complete) return;
		const dataText = dataLines.join('\n').trim();
		dataLines = [];
		if (!dataText) return;
		if (dataText === '[DONE]') { complete = true; return; }
		let data: any;
		try { data = JSON.parse(dataText); } catch { throw new Error('AI 流式响应解析失败'); }
		checkProviderError(data, protocol);
		const { content, thinking } = extractStreamChunk(data, protocol);
		if (typeof content !== 'string' || typeof thinking !== 'string') throw new Error('AI 流式内容格式无效');
		if (!signal.aborted) {
			if (thinking) callbacks?.onThinking?.(thinking);
			if (content) { fullText += content; callbacks?.onChunk?.(content); }
		}
		complete = protocol === 'anthropic' ? data?.type === 'message_stop'
			: protocol === 'gemini' ? !!data?.candidates?.[0]?.finishReason : !!data?.choices?.[0]?.finish_reason;
	};
	const processLine = (line: string) => {
		if (!line) dispatch();
		else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
	};
	const drain = (final = false) => {
		let match: RegExpExecArray | null;
		while ((match = /\r\n|\r|\n/.exec(buffer))) {
			// A CR at the chunk boundary may be the first half of CRLF.
			if (!final && match[0] === '\r' && match.index === buffer.length - 1) break;
			const line = buffer.slice(0, match.index);
			buffer = buffer.slice(match.index + match[0].length);
			processLine(line);
		}
		if (final) { if (buffer) processLine(buffer); buffer = ''; dispatch(); }
	};
	try {
		while (!complete) {
			const { done, value } = await reader.read();
			if (done) { buffer += decoder.decode(); drain(true); break; }
			buffer += decoder.decode(value, { stream: true });
			drain();
		}
		if (signal.aborted) throw new Error('AI 请求已取消');
		if (!complete) throw new Error('AI 连接中断，未收到完整回复，请手动重试');
		if (!fullText.trim()) throw new Error('AI 未返回可显示内容');
		return fullText;
	} finally {
		try { await reader.cancel(); } catch { /* A failed stream is already closed. */ }
		reader.releaseLock();
	}
}
