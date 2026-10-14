import { decryptJsonAesGcm, encryptJsonAesGcm } from '@/utils/persistentStorage';

export type SessionIdentity = {
	account: string;
	chartType: string;
	chart: unknown;
	recordId?: string | number | null;
};
export type SessionMessage = {
	role: 'user' | 'assistant'; text: string; time: string;
	status?: string;
};
export type SessionData = { messages: SessionMessage[]; draft: string };
export type SessionScope = { key: string; base: string };

const PURPOSE = 'chat-session-v2';
const TTL = 30 * 86400000;
const MAX_BYTES = 2 * 1024 * 1024;
const writeVersions = new Map<string, number>();
const advanceWrite = (key: string) => {
	const version = (writeVersions.get(key) || 0) + 1;
	writeVersions.set(key, version);
	return version;
};

// Order-independent inputs, including the chart's original clock and rules.
// Record IDs are separate so a newly saved chart can migrate its active draft.
function canonical(value: any): string {
	if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
	if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
		.filter(key => value[key] !== undefined)
		.map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
	return JSON.stringify(value) ?? 'null';
}

export function identityBase(identity: SessionIdentity): string {
	return canonical([identity.account.trim().toLowerCase(), identity.chartType, identity.chart]);
}

export function identityToken(identity: SessionIdentity | null | undefined): string {
	return identity ? canonical([identityBase(identity), identity.recordId ?? null]) : '';
}

function requireCrypto() {
	if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
		throw new Error('当前环境不支持安全加密，无法保存对话');
	}
}

export async function createScope(identity: SessionIdentity): Promise<SessionScope> {
	requireCrypto();
	if (!identity.account.trim() || !identity.chartType || !identity.chart) throw new Error('缺少账号或命盘身份');
	const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
		.map(byte => byte.toString(16).padStart(2, '0')).join('');
	const base = await digest(identityBase(identity));
	return { base, key: `${PURPOSE}:${await digest(identityToken(identity))}` };
}

function validateData(data: any): asserts data is SessionData {
	if (!data || typeof data.draft !== 'string' || !Array.isArray(data.messages) || data.messages.some((item: any) =>
		!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string' || typeof item.time !== 'string' ||
		(item.status !== undefined && !['ready', 'waiting', 'stream', 'error'].includes(item.status)))) {
		throw new Error('对话记录格式不正确');
	}
	if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_BYTES) throw new Error('对话过长，无法自动保存；请保留所需内容后清空重试');
}

function requireEnvelope(text: string) {
	const envelope = JSON.parse(text);
	if (envelope?.v !== 1 || envelope?.alg !== 'AES-GCM' || !envelope.iv || !envelope.salt || !envelope.ct) {
		throw new Error('旧版或未加密记录无法确认账号和命盘，请勿自动恢复');
	}
}

export async function encodeSnapshot(scope: SessionScope, data: SessionData): Promise<string> {
	requireCrypto(); // The shared utility has a plaintext fallback. Sessions must fail closed.
	validateData(data);
	const text = await encryptJsonAesGcm({ v: 2, kind: 'chat-session', scope: scope.key, expiresAt: Date.now() + TTL, ...data }, `${PURPOSE}:${scope.key}`);
	requireEnvelope(text);
	return text;
}

export async function decodeSnapshot(scope: SessionScope, text: string): Promise<SessionData | null> {
	if (typeof text !== 'string' || text.length > MAX_BYTES * 2) throw new Error('对话记录格式不正确');
	requireEnvelope(text);
	let data: any;
	try { data = await decryptJsonAesGcm(text, `${PURPOSE}:${scope.key}`); }
	catch { throw new Error('记录损坏，或不属于当前设备、账号或命盘'); }
	if (data?.v !== 2 || data?.kind !== 'chat-session' || data?.scope !== scope.key || !Number.isFinite(data.expiresAt)) {
		throw new Error('记录不属于当前账号或命盘');
	}
	const expired = data.expiresAt <= Date.now();
	validateData(data);
	if (expired) return null;
	return recoverSessionData(data);
}

export function recoverSessionData(data: SessionData): SessionData {
	return {
		draft: data.draft,
		messages: data.messages.map((item: SessionMessage) => item.status === 'waiting' || item.status === 'stream'
			? { ...item, status: 'error', text: `${item.text}${item.text ? '\n\n' : ''}回复已中断，未自动重发；请检查额度后手动继续。` }
			: { ...item }),
	};
}

export async function readSnapshot(scope: SessionScope): Promise<SessionData | null> {
	const value = uni.getStorageSync(scope.key);
	if (!value) return null;
	const data = await decodeSnapshot(scope, value);
	if (!data) removeSnapshot(scope);
	return data;
}

export async function writeSnapshot(scope: SessionScope, data: SessionData, isCurrent: () => boolean = () => true): Promise<boolean> {
	const version = advanceWrite(scope.key);
	// Capture before asynchronous encryption; never retain a reactive mutable array.
	const text = await encodeSnapshot(scope, JSON.parse(JSON.stringify(data)));
	if (!isCurrent() || writeVersions.get(scope.key) !== version) return false;
	uni.setStorageSync(scope.key, text);
	if (uni.getStorageSync(scope.key) !== text) throw new Error('本地存储未确认写入');
	return true;
}

export function removeSnapshot(scope: SessionScope) {
	advanceWrite(scope.key);
	uni.removeStorageSync(scope.key);
	if (uni.getStorageSync(scope.key)) throw new Error('本地记录未能清除，请重试');
}
