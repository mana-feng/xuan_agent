// #ifdef H5
// Templates recreate bindings while streaming. uni normalizes currentTarget into a
// fresh data object for each event, so retain the actual focused element instead.
let activePress: { element: Element; key: string } | null = null;
const keyboardTarget = (event: KeyboardEvent) =>
	event.currentTarget instanceof Element ? event.currentTarget : document.activeElement;
// #endif

/** Keyboard semantics for uni-app's custom H5 elements, which do not activate like native buttons. */
export const h5Button = (activate: () => void, disabled = false) => {
	let attributes: Record<string, unknown> = {};
	// #ifdef H5
	attributes = {
		role: 'button',
		tabindex: disabled ? -1 : 0,
		'aria-disabled': disabled,
		onKeydown: (event: KeyboardEvent) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			// Keep activation keys out of page/global handlers and prevent native click synthesis.
			event.preventDefault();
			event.stopPropagation();
			const element = keyboardTarget(event);
			if (!disabled && !event.repeat && element) activePress = { element, key: event.key };
		},
		onKeyup: (event: KeyboardEvent) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			event.stopPropagation();
			const shouldActivate = !disabled && activePress?.element === keyboardTarget(event) && activePress?.key === event.key;
			activePress = null;
			// Activate after stopping keyup so a newly opened uni modal cannot consume this Enter.
			if (shouldActivate) activate();
		},
		onBlur: () => {
			activePress = null;
		},
	};
	// #endif
	return attributes;
};
