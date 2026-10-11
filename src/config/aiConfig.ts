export interface AiConfig {
	apiUrl: string;
	apiKey: string;
	model: string;
	provider:
		| 'openai'
		| 'anthropic'
		| 'gemini'
		| 'qwen'
		| 'deepseek'
		| 'kimi'
		| 'zhipu'
		| 'ollama'
		| 'custom';
}

const STORAGE_KEY = 'xuanxue_ai_config';
const PROVIDERS = ['openai', 'anthropic', 'gemini', 'qwen', 'deepseek', 'kimi', 'zhipu', 'ollama', 'custom'];

export function requiresAiKey(config: Pick<AiConfig, 'provider' | 'apiUrl'>): boolean {
	if (config.provider === 'custom' || config.provider === 'ollama') return false;
	try {
		return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.apiUrl.trim()).hostname);
	} catch { return true; }
}

export function normalizeAiConfig(value: unknown): AiConfig {
	const raw = value as Partial<AiConfig> | null;
	if (!raw || typeof raw !== 'object' || !PROVIDERS.includes(String(raw.provider))) throw new Error('请选择 AI 提供商');
	const apiUrl = typeof raw.apiUrl === 'string' ? raw.apiUrl.trim() : '';
	const model = typeof raw.model === 'string' ? raw.model.trim() : '';
	const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
	try {
		const url = new URL(apiUrl);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
	} catch { throw new Error('请输入有效的 HTTP 或 HTTPS API 地址'); }
	if (!model) throw new Error('请输入模型名称');
	const config = { provider: raw.provider!, apiUrl, apiKey, model };
	if (requiresAiKey(config) && !apiKey) throw new Error('请输入 API Key');
	return config;
}

export function getAiConfig(): AiConfig | null {
	try {
		const raw = uni.getStorageSync(STORAGE_KEY);
		if (!raw) return null;
		return normalizeAiConfig(typeof raw === 'string' ? JSON.parse(raw) : raw);
	} catch {
		return null;
	}
}

export function saveAiConfig(config: AiConfig): void {
	uni.setStorageSync(STORAGE_KEY, JSON.stringify(normalizeAiConfig(config)));
}

export function clearAiConfig(): void {
	uni.removeStorageSync(STORAGE_KEY);
}

export function hasAiConfig(): boolean {
	return !!getAiConfig();
}
