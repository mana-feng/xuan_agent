const DEFAULT_TTL = 15 * 24 * 60 * 60 * 1000;

interface Payload<T> {
	value: T;
	expiresAt: number;
}

function encode<T>(data: Payload<T>): string {
	const text = JSON.stringify(data);
	return btoa(unescape(encodeURIComponent(text)));
}

function decode<T>(encoded: string): Payload<T> | null {
	try {
		const text = decodeURIComponent(escape(atob(encoded)));
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export function setPersistentItem<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL) {
	const payload: Payload<T> = {
		value,
		expiresAt: ttlMs === 0 ? 0 : Date.now() + ttlMs,
	};
	const encoded = encode(payload);
	uni.setStorageSync(key, encoded);
}

export function getPersistentItem<T>(key: string, options: { permanent?: boolean } = {}): T | null {
	const encoded = uni.getStorageSync(key);
	if (!encoded) return null;
	const payload = decode<T>(encoded);
	if (!payload) {
		// A saved record is user data. Keep unreadable bytes for recovery, and block overwrites.
		if (options.permanent) throw new Error('本地记录无法读取，请先备份后检查');
		uni.removeStorageSync(key);
		return null;
	}
	if (!options.permanent && payload.expiresAt && payload.expiresAt < Date.now()) {
		uni.removeStorageSync(key);
		return null;
	}
	return payload.value;
}

export function removePersistentItem(key: string) {
	uni.removeStorageSync(key);
}

// 注意：以上存储仅做 base64 编码，并非加密。历史别名 setSecureItem/getSecureItem
// 因命名有误导性已移除，如需持久化请直接使用 setPersistentItem/getPersistentItem。

type IDBValue = any;

function openKvDb(): Promise<IDBDatabase> {
	if (typeof indexedDB === 'undefined') {
		return Promise.reject(new Error('indexedDB not supported'));
	}
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('ai_xuanxue_kv', 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains('kv')) {
				db.createObjectStore('kv');
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function idbSetItem<T = IDBValue>(key: string, value: T): Promise<void> {
	const db = await openKvDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction('kv', 'readwrite');
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.objectStore('kv').put(value as any, key);
	});
	db.close();
}

export async function idbGetItem<T = IDBValue>(key: string): Promise<T | null> {
	const db = await openKvDb();
	const result = await new Promise<T | null>((resolve, reject) => {
		const tx = db.transaction('kv', 'readonly');
		const req = tx.objectStore('kv').get(key);
		req.onsuccess = () => resolve((req.result as T) ?? null);
		req.onerror = () => reject(req.error);
	});
	db.close();
	return result;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
	const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '==='.slice((normalized.length + 3) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveAesGcmKey(purpose: string, salt: Uint8Array): Promise<CryptoKey> {
	const cryptoObj = (globalThis as any).crypto as Crypto | undefined;
	if (!cryptoObj?.subtle) {
		throw new Error('当前环境不支持加密');
	}
	const { getDeviceId } = await import('@/utils/device');
	const material = `${purpose}:${getDeviceId()}`;
	const encoder = new TextEncoder();
	const keyMaterial = await cryptoObj.subtle.importKey('raw', encoder.encode(material), 'PBKDF2', false, ['deriveKey']);
	return cryptoObj.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: toArrayBuffer(salt),
			iterations: 100000,
			hash: 'SHA-256',
		},
		keyMaterial,
		{
			name: 'AES-GCM',
			length: 256,
		},
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptJsonAesGcm(value: any, purpose: string): Promise<string> {
	const cryptoObj = (globalThis as any).crypto as Crypto | undefined;
	if (!cryptoObj?.subtle || !cryptoObj.getRandomValues) {
		return JSON.stringify({ v: 0, alg: 'none', data: value });
	}
	const iv = cryptoObj.getRandomValues(new Uint8Array(12));
	const salt = cryptoObj.getRandomValues(new Uint8Array(16));
	const key = await deriveAesGcmKey(purpose, salt);
	const plaintext = new TextEncoder().encode(JSON.stringify(value));
	const ct = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext));
	return JSON.stringify({
		v: 1,
		alg: 'AES-GCM',
		iv: bytesToBase64Url(iv),
		salt: bytesToBase64Url(salt),
		ct: bytesToBase64Url(new Uint8Array(ct)),
	});
}

export async function decryptJsonAesGcm(text: string, purpose: string): Promise<any> {
	const payload = JSON.parse(text);
	if (payload?.v === 0 && payload?.alg === 'none' && 'data' in payload) {
		return payload.data;
	}
	if (payload?.v !== 1 || payload?.alg !== 'AES-GCM' || !payload?.iv || !payload?.salt || !payload?.ct) {
		return payload;
	}
	const cryptoObj = (globalThis as any).crypto as Crypto | undefined;
	if (!cryptoObj?.subtle) {
		throw new Error('当前环境不支持解密');
	}
	const iv = base64UrlToBytes(String(payload.iv));
	const salt = base64UrlToBytes(String(payload.salt));
	const ct = base64UrlToBytes(String(payload.ct));
	const key = await deriveAesGcmKey(purpose, salt);
	const pt = await cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ct));
	const decoded = new TextDecoder().decode(pt);
	return JSON.parse(decoded);
}
