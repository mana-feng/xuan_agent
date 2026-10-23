import { nextTick, onActivated, onDeactivated, onUnmounted, ref, watch, type Ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';

// Shared by workbench dialogs and the navigation drawer, including their handoff.
const activeModals: symbol[] = [];
let bodyStyles: Array<{ property: string; value: string; priority: string }> = [];
let documentStyles: Array<{ property: string; value: string; priority: string }> = [];
let pageScroll = { x: 0, y: 0 };

function lockPageScroll() {
	const body = document.body, root = document.documentElement;
	pageScroll = { x: window.scrollX, y: window.scrollY };
	bodyStyles = ['overflow', 'position', 'top', 'left', 'right', 'width', 'padding-right'].map(property => ({
		property, value: body.style.getPropertyValue(property), priority: body.style.getPropertyPriority(property),
	}));
	documentStyles = ['overflow', '--x-modal-scrollbar-gap'].map(property => ({
		property, value: root.style.getPropertyValue(property), priority: root.style.getPropertyPriority(property),
	}));
	const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
	const paddingRight = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
	root.style.setProperty('--x-modal-scrollbar-gap', `${scrollbarWidth}px`);
	// Lock the visible page in place. Hiding overflow on both H5 roots alone
	// can reset window.scrollY, even when focus uses preventScroll.
	body.style.position = 'fixed';
	body.style.top = `${-pageScroll.y}px`;
	body.style.left = `${-pageScroll.x}px`;
	body.style.right = '0';
	body.style.width = '100%';
	if (scrollbarWidth) body.style.paddingRight = `${paddingRight + scrollbarWidth}px`;
	body.style.overflow = 'hidden';
	root.style.overflow = 'hidden';
}

function restorePageScroll(previous: HTMLElement | null) {
	const body = document.body, root = document.documentElement;
	for (const { property, value, priority } of bodyStyles) {
		if (value) body.style.setProperty(property, value, priority);
		else body.style.removeProperty(property);
	}
	for (const { property, value, priority } of documentStyles) {
		if (value) root.style.setProperty(property, value, priority);
		else root.style.removeProperty(property);
	}
	const behavior = { value: root.style.getPropertyValue('scroll-behavior'), priority: root.style.getPropertyPriority('scroll-behavior') };
	root.style.setProperty('scroll-behavior', 'auto', 'important');
	try {
		if (previous?.isConnected) previous.focus({ preventScroll: true });
		if (window.scrollX !== pageScroll.x || window.scrollY !== pageScroll.y) window.scrollTo(pageScroll.x, pageScroll.y);
	} finally {
		if (behavior.value) root.style.setProperty('scroll-behavior', behavior.value, behavior.priority);
		else root.style.removeProperty('scroll-behavior');
	}
}

export function useModalFocus(open: Ref<boolean>, root: Ref<any>, dismiss: () => void) {
	let release: (() => void) | undefined;
	let revision = 0;
	const pageActive = ref(true);
	const suspend = () => {
		pageActive.value = false;
		revision++;
		release?.();
		release = undefined;
	};
	const resume = () => { pageActive.value = true; };
	onHide(suspend);
	onShow(resume);
	onDeactivated(suspend);
	onActivated(resume);
	const stop = watch([open, pageActive], async ([visible, active]) => {
		const current = ++revision;
		release?.();
		release = undefined;
		// #ifdef H5
		if (!visible || !active || typeof document === 'undefined') return;
		await nextTick();
		if (current !== revision || !open.value || !pageActive.value) return;
		const element: HTMLElement | undefined = root.value?.$el || root.value;
		if (!element) return;
		const previous = document.activeElement as HTMLElement | null;
		const token = Symbol('modal');
		if (!activeModals.length) {
			lockPageScroll();
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
				restorePageScroll(previous);
			}
		};
		// #endif
	}, { immediate: true, flush: 'post' });
	onUnmounted(() => { revision++; stop(); release?.(); });
}
