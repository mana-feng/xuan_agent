// The backend defaults to 180 seconds; allow 15 seconds for error delivery/cleanup.
// Build-time override for deployments that also adjust LLM_REQUEST_TIMEOUT_MS.
const configuredTimeout = Number(import.meta.env.VITE_LLM_REQUEST_TIMEOUT_MS);
export const LLM_REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
	? Math.min(315000, Math.max(1000, configuredTimeout))
	: 195000;

export function supportsLLMStreaming(): boolean {
	return typeof fetch === 'function'
		&& typeof ReadableStream === 'function'
		&& typeof AbortController === 'function';
}
