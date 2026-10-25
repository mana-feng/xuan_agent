import { ref } from 'vue';

type LayoutMode = 'layout-compact' | 'layout-medium' | 'layout-wide';

// 统一断点标准 (与 responsive-layout.css 保持一致)
const BREAKPOINT_SM = 768;
const BREAKPOINT_LG = 1280;

const MODES: LayoutMode[] = ['layout-compact', 'layout-medium', 'layout-wide'];

// TMUI already converts rpx for each viewport; a second scale makes controls unreadable.

const uiScale = ref(1);

const getMode = (width: number): LayoutMode => {
	// 使用标准断点：640px/768px/1024px/1280px
	if (width >= BREAKPOINT_LG) return 'layout-wide';
	if (width >= BREAKPOINT_SM) return 'layout-medium';
	return 'layout-compact';
};

const applyMode = (mode: LayoutMode) => {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	const body = document.body;
	if (!root || !body) return;

	MODES.forEach((item) => {
		root.classList.remove(item);
		body.classList.remove(item);
	});
	root.classList.add(mode);
	body.classList.add(mode);
};

const applyScale = () => {
	uiScale.value = 1;
	if (typeof document !== 'undefined') {
		document.documentElement?.style.setProperty('--ui-scale', uiScale.value.toString());
	}
};

export const useUiScale = () => uiScale;

export const setupViewportWatcher = () => {
	if (typeof window === 'undefined') return;

	let rafId = 0;
	const update = () => {
		const width = window.innerWidth || 0;
		applyMode(getMode(width));
		applyScale();
	};

	const schedule = () => {
		if (rafId) {
			window.cancelAnimationFrame(rafId);
		}
		rafId = window.requestAnimationFrame(update);
	};

	if (document.readyState === 'loading') {
		window.addEventListener('DOMContentLoaded', update, { once: true });
	} else {
		update();
	}

	window.addEventListener('resize', schedule);
};
