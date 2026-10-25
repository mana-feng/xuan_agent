/** Keyboard semantics for uni-app's custom H5 elements, which do not activate like native buttons. */
export const h5Button = (activate: () => void, disabled = false) => {
	let attributes: Record<string, unknown> = {};
	// #ifdef H5
	let pressedKey: string | null = null;
	attributes = {
		role: 'button',
		tabindex: disabled ? -1 : 0,
		'aria-disabled': disabled,
		onKeydown: (event: KeyboardEvent) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			// Keep activation keys out of page/global handlers and prevent native click synthesis.
			event.preventDefault();
			event.stopPropagation();
			if (!disabled && !event.repeat) pressedKey = event.key;
		},
		onKeyup: (event: KeyboardEvent) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			event.stopPropagation();
			const shouldActivate = !disabled && pressedKey === event.key;
			pressedKey = null;
			// Activate after stopping keyup so a newly opened uni modal cannot consume this Enter.
			if (shouldActivate) activate();
		},
	};
	// #endif
	return attributes;
};
