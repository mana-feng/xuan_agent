export interface PageViewData {
	url: string;
	referrer?: string;
	title?: string;
	userAgent: string;
	screenWidth: number;
	screenHeight: number;
	viewportWidth: number;
	viewportHeight: number;
	deviceType: 'mobile' | 'tablet' | 'desktop';
	browser: string;
	browserVersion: string;
	os: string;
	osVersion: string;
	language: string;
	charset: string;
	colorDepth: number;
	pixelRatio: number;
	touchSupport: boolean;
	connectionType: string;
	downlinkSpeed: number;
	timezone: string;
	loadTime: number;
	domContentLoadedTime: number;
	fcpTime: number;
	isEntryPage: boolean;
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
	utmTerm?: string;
	utmContent?: string;
	referrerType: 'direct' | 'search' | 'social' | 'internal' | 'external' | 'email' | 'other';
	searchEngine?: string;
	searchKeyword?: string;
	timestamp: number;
	isLoggedIn: boolean;
	username?: string | null;
}

let pageViewEndpoint = '/api/stats/pageview';
const SESSION_TIMEOUT = 30 * 60 * 1000;
const SESSION_KEY = 'stats_session';
interface AnalyticsSession {
	id: string;
	start: number;
	last: number;
	activeMs: number;
	hasPageView: boolean;
}
let pvid: string | null = null;
let session: AnalyticsSession | null = null;
let sessionRead = false;
let visibleSince: number | null = null;
let reportedActiveMs = -1;

function generateId(): string {
	return globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function storageGet(type: 'localStorage' | 'sessionStorage', key: string): string | null {
	try { return window[type].getItem(key); } catch { return null; }
}

function persistSession(): void {
	if (!session) return;
	try {
		window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
		window.sessionStorage.setItem('stats_session_id', session.id);
	} catch { /* Keep the current session in memory when browser storage is blocked. */ }
}

function readSession(): void {
	if (sessionRead) return;
	sessionRead = true;
	try {
		const saved = JSON.parse(storageGet('sessionStorage', SESSION_KEY) || 'null');
		if (saved && typeof saved.id === 'string' && saved.id &&
			Number.isFinite(saved.start) && Number.isFinite(saved.last) && saved.start <= saved.last &&
			Number.isFinite(saved.activeMs) && saved.activeMs >= 0 && typeof saved.hasPageView === 'boolean') session = saved;
	} catch { /* A damaged record starts a new session. */ }
}

function expired(now: number): boolean {
	return !session || now < session.last || now - session.last >= SESSION_TIMEOUT;
}

function isVisible(): boolean {
	return document.visibilityState !== 'hidden';
}

function settleVisibleTime(now: number): void {
	if (session && visibleSince !== null) {
		// An unattended visible tab cannot accumulate time beyond its activity deadline.
		session.activeMs += Math.max(0, Math.min(now, session.last + SESSION_TIMEOUT) - visibleSince);
		visibleSince = now;
		persistSession();
	}
}

function getPvid(): string {
	if (pvid) return pvid;
	pvid = storageGet('localStorage', 'stats_pvid') || generateId();
	try { window.localStorage.setItem('stats_pvid', pvid); } catch { /* In-memory visitor fallback. */ }
	return pvid;
}

function prepareSession(now: number): AnalyticsSession {
	readSession();
	settleVisibleTime(now);
	if (expired(now)) {
		flushEngagement(false, true);
		session = { id: generateId(), start: now, last: now, activeMs: 0, hasPageView: false };
		reportedActiveMs = -1;
	}
	session!.last = now;
	visibleSince = isVisible() ? now : null;
	return session!;
}

function getDeviceType(ua: string): 'mobile' | 'tablet' | 'desktop' {
	if (/ipad|tablet|playbook|silk/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
	if (/iphone|ipod|android.*mobile|windows phone|mobi/i.test(ua)) return 'mobile';
	return 'desktop';
}

function parseBrowserInfo(ua: string): { browser: string; browserVersion: string; os: string; osVersion: string } {
	let browser = 'Unknown', browserVersion = '', os = 'Unknown', osVersion = '';
	const browsers: [string, RegExp][] = [
		['Edge', /(?:edg|edga|edgios)\/([\d.]+)/i],
		['Opera', /(?:opr|opera)\/([\d.]+)/i],
		['Chrome', /(?:chrome|crios)\/([\d.]+)/i],
		['Firefox', /(?:firefox|fxios)\/([\d.]+)/i],
		['Safari', /version\/([\d.]+).*safari/i],
		['IE', /(?:msie |rv:)([\d.]+)/i],
	];
	for (const [name, regex] of browsers) {
		const match = ua.match(regex);
		if (match) { browser = name; browserVersion = match[1]; break; }
	}
	if (/ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
		os = 'iPadOS'; osVersion = ua.match(/cpu os ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '';
	} else if (/iphone|ipod/i.test(ua)) {
		os = 'iOS'; osVersion = ua.match(/(?:iphone )?os ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '';
	} else if (/android/i.test(ua)) {
		os = 'Android'; osVersion = ua.match(/android ([\d.]+)/i)?.[1] || '';
	} else if (/windows nt/i.test(ua)) {
		os = 'Windows';
		const version = ua.match(/windows nt ([\d.]+)/i)?.[1] || '';
		osVersion = ({ '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7' } as Record<string, string>)[version] || version;
	} else if (/mac os x/i.test(ua)) {
		os = 'macOS'; osVersion = ua.match(/mac os x ([\d._]+)/i)?.[1]?.replace(/_/g, '.') || '';
	} else if (/linux/i.test(ua)) os = 'Linux';
	return { browser, browserVersion, os, osVersion };
}
function getConnectionInfo(): { type: string; downlink: number } {
	try {
		const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
		if (conn) {
			return {
				type: conn.effectiveType || 'unknown',
				downlink: conn.downlink || 0,
			};
		}
	} catch (e) {
		// ignore network info errors
	}
	return { type: '', downlink: 0 };
}

function getPerformanceMetrics(): { loadTime: number; domContentLoadedTime: number; fcpTime: number } {
	const result = { loadTime: 0, domContentLoadedTime: 0, fcpTime: 0 };
	try {
		const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
		if (perf) {
			result.loadTime = Math.round(perf.loadEventEnd - perf.fetchStart);
			result.domContentLoadedTime = Math.round(perf.domContentLoadedEventEnd - perf.fetchStart);
		}
		const paintEntries = performance.getEntriesByType('paint');
		for (const entry of paintEntries) {
			if (entry.name === 'first-contentful-paint') {
				result.fcpTime = Math.round(entry.startTime);
			}
		}
	} catch (e) {
		// ignore performance metrics errors
	}
	return result;
}

function parseUTMParams(url: string): Record<string, string> {
	try {
		const u = new URL(url, window.location.href);
		const hashQuery = u.hash.indexOf('?');
		const hashParams = new URLSearchParams(hashQuery < 0 ? '' : u.hash.slice(hashQuery + 1));
		const params: Record<string, string> = {};
		for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
			const val = u.searchParams.get(key) || hashParams.get(key);
			if (val) params[key] = val;
		}
		return params;
	} catch { return {}; }
}
function classifyReferrer(referrer: string): { type: 'direct' | 'search' | 'social' | 'internal' | 'external' | 'email' | 'other'; engine?: string; keyword?: string } {
	if (!referrer || referrer === '') return { type: 'direct' };

	try {
		const refUrl = new URL(referrer);
		const hostname = refUrl.hostname.toLowerCase();

		const currentHost = typeof location !== 'undefined' ? location.hostname : '';
		if (hostname === currentHost || hostname.endsWith('.' + currentHost)) {
			return { type: 'internal' };
		}

		const searchEngines: Record<string, string> = {
			'google.com': 'Google',
			'google.com.hk': 'Google',
			'google.co.jp': 'Google',
			'baidu.com': 'Baidu',
			'bing.com': 'Bing',
			'sogou.com': 'Sogou',
			'360.cn': '360 Search',
			'yandex.com': 'Yandex',
			'duckduckgo.com': 'DuckDuckGo',
			'yahoo.com': 'Yahoo',
		};

		for (const [domain, name] of Object.entries(searchEngines)) {
			if (hostname === domain || hostname.endsWith('.' + domain)) {
				const keyword = refUrl.searchParams.get('q')
					|| refUrl.searchParams.get('wd')
					|| refUrl.searchParams.get('keyword')
					|| refUrl.searchParams.get('p')
					|| '';
				return { type: 'search', engine: name, keyword: keyword || undefined };
			}
		}

		const socialNetworks = [
			'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com',
			'weibo.com', 'zhihu.com', 'douyin.com', 'tiktok.com', 'youtube.com',
			'pinterest.com', 'reddit.com', 'tumblr.com', 'vk.com', 'telegram.org',
		];
		if (socialNetworks.some(s => hostname === s || hostname.endsWith('.' + s))) {
			return { type: 'social' };
		}

		if (hostname.includes('mail.') || hostname.includes('outlook') || hostname.includes('gmail')) {
			return { type: 'email' };
		}

		return { type: 'external' };
	} catch (e) {
		return { type: 'other' };
	}
}

export function collectPageView(data: Partial<PageViewData> = {}): void {
	if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined' || !isVisible()) return;
	const now = Date.now();
	const currentSession = prepareSession(now);
	const ua = data.userAgent || navigator.userAgent || '';
	const browserInfo = parseBrowserInfo(ua);
	const connectionInfo = getConnectionInfo();
	const perfMetrics = getPerformanceMetrics();
	const utmParams = parseUTMParams(data.url || window.location.href);
	const refInfo = classifyReferrer(data.referrer ?? document.referrer ?? '');
	let isLoggedIn = false;
	let username: string | null = null;
	try {
		const userInfo = typeof uni !== 'undefined' && uni.getStorageSync
			? uni.getStorageSync('user_info') : JSON.parse(storageGet('localStorage', 'user_info') || 'null');
		if (userInfo) { isLoggedIn = true; username = userInfo.username || userInfo.email || null; }
	} catch { /* Login metadata is optional. */ }
	const pageData: PageViewData = {
		url: data.url || window.location.href,
		referrer: data.referrer ?? document.referrer ?? '',
		title: data.title ?? document.title ?? '',
		userAgent: ua,
		screenWidth: data.screenWidth ?? window.screen.width,
		screenHeight: data.screenHeight ?? window.screen.height,
		viewportWidth: data.viewportWidth ?? window.innerWidth,
		viewportHeight: data.viewportHeight ?? window.innerHeight,
		deviceType: data.deviceType || getDeviceType(ua),
		browser: data.browser || browserInfo.browser,
		browserVersion: data.browserVersion || browserInfo.browserVersion,
		os: data.os || browserInfo.os,
		osVersion: data.osVersion || browserInfo.osVersion,
		language: data.language || navigator.language || '',
		charset: data.charset || document.characterSet || 'UTF-8',
		colorDepth: data.colorDepth ?? window.screen.colorDepth ?? 24,
		pixelRatio: data.pixelRatio ?? window.devicePixelRatio ?? 1,
		touchSupport: data.touchSupport ?? (navigator.maxTouchPoints > 0 || 'ontouchstart' in window),
		connectionType: data.connectionType || connectionInfo.type,
		downlinkSpeed: data.downlinkSpeed ?? connectionInfo.downlink,
		timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
		loadTime: data.loadTime ?? perfMetrics.loadTime,
		domContentLoadedTime: data.domContentLoadedTime ?? perfMetrics.domContentLoadedTime,
		fcpTime: data.fcpTime ?? perfMetrics.fcpTime,
		isEntryPage: !currentSession.hasPageView,
		utmSource: data.utmSource || utmParams.utm_source,
		utmMedium: data.utmMedium || utmParams.utm_medium,
		utmCampaign: data.utmCampaign || utmParams.utm_campaign,
		utmTerm: data.utmTerm || utmParams.utm_term,
		utmContent: data.utmContent || utmParams.utm_content,
		referrerType: data.referrerType || refInfo.type,
		searchEngine: data.searchEngine || refInfo.engine,
		searchKeyword: data.searchKeyword || refInfo.keyword,
		timestamp: now,
		isLoggedIn,
		username,
	};
	currentSession.hasPageView = true;
	persistSession();
	sendEvent({ ...pageData, eventType: 'pageview', eventId: generateId(), sessionId: currentSession.id, pvid: getPvid(), sessionDuration: Math.floor(currentSession.activeMs / 1000) });
}

function sendEvent(data: object): void {
	const body = JSON.stringify(data);
	try {
		if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(pageViewEndpoint, new Blob([body], { type: 'application/json' }))) return;
	} catch { /* Browsers may reject the beacon quota or omit the API. */ }
	// Reuse the event id in the fallback. At most one fetch follows each rejected beacon.
	try {
		if (typeof fetch !== 'function') return;
		void fetch(pageViewEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
			.then(response => { if (!response.ok) return; })
			.catch(() => { /* Offline collection must never break navigation. */ });
	} catch { /* Some embedded runtimes throw synchronously. */ }
}

function flushEngagement(force = false, sessionEnded = false): void {
	if (!session?.hasPageView || (!force && session.activeMs <= reportedActiveMs)) return;
	reportedActiveMs = session.activeMs;
	sendEvent({ eventType: 'engagement', eventId: generateId(), pvid: getPvid(), sessionId: session.id, timestamp: Date.now(), sessionDuration: Math.floor(session.activeMs / 1000), sessionEnded });
}

/** Own the browser lifecycle alongside the route collector; cleanup also settles its final interval. */
export function startEngagementTracking(onVisible: (forcePageView: boolean) => void): () => void {
	readSession();
	const HEARTBEAT_INTERVAL = 60 * 1000;
	let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
	let lastHeartbeatAt = Date.now();
	let tracking = true;
	const cancelHeartbeat = () => {
		if (heartbeatTimer !== null) clearTimeout(heartbeatTimer);
		heartbeatTimer = null;
	};
	const heartbeat = () => {
		heartbeatTimer = null;
		const now = Date.now();
		if (!tracking || !isVisible() || visibleSince === null || expired(now)) return;
		settleVisibleTime(now);
		flushEngagement(true);
		lastHeartbeatAt = now;
	};
	const scheduleHeartbeat = () => {
		const wait = HEARTBEAT_INTERVAL - (Date.now() - lastHeartbeatAt);
		if (wait <= 0) { cancelHeartbeat(); heartbeat(); }
		else if (heartbeatTimer === null) heartbeatTimer = setTimeout(heartbeat, wait);
	};
	const suspend = () => {
		cancelHeartbeat();
		if (visibleSince === null) return;
		settleVisibleTime(Date.now());
		visibleSince = null;
		flushEngagement(false, true);
	};
	const resume = (forcePageView = false) => {
		if (!isVisible()) return;
		const now = Date.now();
		const newSession = expired(now);
		settleVisibleTime(now);
		onVisible(newSession || forcePageView);
		if (session && !expired(now)) {
			session.last = now; visibleSince = now; persistSession();
			if (newSession || forcePageView) { cancelHeartbeat(); lastHeartbeatAt = now; }
			else scheduleHeartbeat();
		}
	};
	const pageShow = (event: PageTransitionEvent) => resume(event.persisted);
	const visibility = () => { if (isVisible()) resume(); else suspend(); };
	const activity = () => {
		if (!isVisible()) return;
		const now = Date.now();
		if (expired(now)) { cancelHeartbeat(); resume(); return; }
		settleVisibleTime(now);
		if (session) { session.last = now; visibleSince = now; persistSession(); }
		// Only real activity schedules a heartbeat; no periodic timer can keep an idle tab alive.
		scheduleHeartbeat();
	};
	const activities = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
	document.addEventListener('visibilitychange', visibility);
	window.addEventListener('pagehide', suspend);
	window.addEventListener('pageshow', pageShow);
	for (const event of activities) document.addEventListener(event, activity, { passive: true, capture: true });
	return () => {
		tracking = false;
		suspend();
		document.removeEventListener('visibilitychange', visibility);
		window.removeEventListener('pagehide', suspend);
		window.removeEventListener('pageshow', pageShow);
		for (const event of activities) document.removeEventListener(event, activity, true);
	};
}

export function trackPageView(): void { collectPageView(); }
export function setStatsEndpoint(endpoint: string): void { pageViewEndpoint = endpoint; }
