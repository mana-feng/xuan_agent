import { nextTick, onUnmounted, watch, type Ref } from 'vue';

// Shared by the navigation drawer and announcement dialog, including their handoff.
const activeModals: symbol[] = [];
let bodyOverflow = '';
let documentOverflow = '';

export function useModalFocus(open: Ref<boolean>, root: Ref<any>, dismiss: () => void) {
	let release: (() => void) | undefined;
	let revision = 0;
	const stop = watch(open, async (visible) => {
		const current = ++revision;
		release?.();
		release = undefined;
		// #ifdef H5
		if (!visible || typeof document === 'undefined') return;
		await nextTick();
		if (current !== revision || !open.value) return;
		const element: HTMLElement | undefined = root.value?.$el || root.value;
		if (!element) return;
		const previous = document.activeElement as HTMLElement | null;
		const token = Symbol('modal');
		if (!activeModals.length) {
			bodyOverflow = document.body.style.overflow;
			documentOverflow = document.documentElement.style.overflow;
			document.body.style.overflow = 'hidden';
			document.documentElement.style.overflow = 'hidden';
		}
		activeModals.push(token);
		const controls = () => Array.from(element.querySelectorAll<HTMLElement>('[tabindex="0"],button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])'))
			.filter(node => node.getAttribute('aria-disabled') !== 'true' && window.getComputedStyle(node).display !== 'none' && window.getComputedStyle(node).visibility !== 'hidden');
		const focusFirst = () => (controls()[0] || element).focus({ preventScroll: true });
		const isActive = () => activeModals[activeModals.length - 1] === token;
		const handleKey = (event: KeyboardEvent) => {
			if (!isActive()) return;
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				dismiss();
			} else if (event.key === 'Tab') {
				const items = controls();
				const first = items[0];
				const last = items[items.length - 1];
				if (!first || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
					event.preventDefault();
					(event.shiftKey ? last : first)?.focus();
				}
			}
		};
		const handleFocus = (event: FocusEvent) => {
			if (isActive() && !element.contains(event.target as Node)) focusFirst();
		};
		document.addEventListener('keydown', handleKey, true);
		document.addEventListener('focusin', handleFocus);
		focusFirst();
		release = () => {
			document.removeEventListener('keydown', handleKey, true);
			document.removeEventListener('focusin', handleFocus);
			const index = activeModals.indexOf(token);
			if (index >= 0) activeModals.splice(index, 1);
			if (!activeModals.length) {
				document.body.style.overflow = bodyOverflow;
				document.documentElement.style.overflow = documentOverflow;
				if (previous?.isConnected) previous.focus({ preventScroll: true });
			}
		};
		// #endif
	}, { immediate: true, flush: 'post' });
	onUnmounted(() => { revision++; stop(); release?.(); });
}
