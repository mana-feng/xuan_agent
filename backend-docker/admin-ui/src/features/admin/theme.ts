import { computed, ref } from 'vue';

export const adminPalettes = [
	{ id: 'aurora', name: '青蓝流光', description: '清透蓝绿，轻盈明亮', colors: ['#1672b1', '#147f91', '#11785f'] },
	{ id: 'sunset', name: '琥珀暖阳', description: '温润琥珀，柔和静谧', colors: ['#b35424', '#a96918', '#927117'] },
] as const;
const palette = ref('aurora');
let restored = false;
function applyPalette() {
	// #ifdef H5
	if (typeof document !== 'undefined') document.documentElement.setAttribute('data-admin-palette', palette.value);
	// #endif
}
export function useAdminTheme() {
	if (!restored) {
		restored = true;
		try {
			const saved = uni.getStorageSync('xuan-admin-palette');
			if (adminPalettes.some(item => item.id === saved)) palette.value = saved;
			else if (saved) uni.setStorageSync('xuan-admin-palette', palette.value);
		} catch { /* The default palette works without storage. */ }
	}
	applyPalette();
	const paletteName = computed(() => adminPalettes.find(item => item.id === palette.value)?.name || adminPalettes[0].name);
	function selectPalette(id: string) {
		if (!adminPalettes.some(item => item.id === id)) return;
		palette.value = id;
		applyPalette();
		try { uni.setStorageSync('xuan-admin-palette', id); } catch { /* Keep the in-session selection. */ }
	}
	return { palette, paletteName, palettes: adminPalettes, selectPalette };
}
