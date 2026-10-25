import { onUnmounted } from 'vue';
import { trackPageView, startEngagementTracking } from '@/utils/analytics';

let owners = 0;
let cleanup: (() => void) | null = null;

function normalizedRoute(): string {
	const url = new URL(window.location.href);
	url.searchParams.sort();
	const hash = url.hash.slice(1);
	const separator = hash.indexOf('?');
	if (separator >= 0) {
		const params = new URLSearchParams(hash.slice(separator + 1));
		params.sort();
		url.hash = hash.slice(0, separator) + (params.size ? '?' + params.toString() : '');
	}
	return url.pathname + url.search + url.hash;
}

function start(): () => void {
	let previousRoute: string | null = null;
	let active = true;
	const routeChanged = (newSession = false) => {
		if (!active || document.visibilityState === 'hidden') return;
		const route = normalizedRoute();
		if (!newSession && previousRoute === route) return;
		previousRoute = route;
		trackPageView();
	};
	const onRoute = () => routeChanged();
	const stopEngagement = startEngagementTracking(routeChanged);
	const originalPush = history.pushState;
	const originalReplace = history.replaceState;
	const push: History['pushState'] = function (this: History, ...args) { originalPush.apply(this, args); routeChanged(); };
	const replace: History['replaceState'] = function (this: History, ...args) { originalReplace.apply(this, args); routeChanged(); };
	history.pushState = push;
	history.replaceState = replace;
	window.addEventListener('popstate', onRoute);
	window.addEventListener('hashchange', onRoute);
	routeChanged();
	return () => {
		active = false;
		window.removeEventListener('popstate', onRoute);
		window.removeEventListener('hashchange', onRoute);
		// Do not overwrite a history wrapper installed by another consumer after us.
		if (history.pushState === push) history.pushState = originalPush;
		if (history.replaceState === replace) history.replaceState = originalReplace;
		stopEngagement();
	};
}

export function usePageAnalytics(): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return;
	if (owners++ === 0) cleanup = start();
	let released = false;
	onUnmounted(() => {
		if (released) return;
		released = true;
		if (--owners === 0) { cleanup?.(); cleanup = null; }
	});
}
