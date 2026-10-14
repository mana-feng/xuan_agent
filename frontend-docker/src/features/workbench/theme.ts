import { computed, ref } from 'vue';

export const palettes = [
  { id: 'aurora', name: '青蓝流光' },
  { id: 'sunset', name: '琥珀暖阳' },
  { id: 'lake', name: '湖光青翠' },
] as const;
const palette = ref('aurora');
let restored = false;
export function useWorkbenchTheme() {
  if (!restored) {
    restored = true;
    try {
      const saved = uni.getStorageSync('xuan-ui-palette');
      if (palettes.some(item => item.id === saved)) palette.value = saved;
    } catch { /* The default theme also works without storage. */ }
  }
  const paletteName = computed(() => palettes.find(item => item.id === palette.value)?.name || palettes[0].name);
  function changePalette(index: number) {
    const next = palettes[index];
    if (!next) return;
    palette.value = next.id;
    try { uni.setStorageSync('xuan-ui-palette', next.id); } catch { /* Keep the in-session choice. */ }
  }
  return { palette, paletteName, palettes, changePalette };
}
