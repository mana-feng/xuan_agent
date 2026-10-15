import { computed, ref } from 'vue';

export const palettes = [
  { id: 'aurora', name: '青蓝流光', description: '清透蓝绿，轻盈明亮', colors: ['#1672b1', '#147f91', '#11785f'] },
  { id: 'sunset', name: '琥珀暖阳', description: '温润琥珀，柔和静谧', colors: ['#b35424', '#a96918', '#927117'] },
  { id: 'lake', name: '湖光青翠', description: '湖蓝青翠，清新舒缓', colors: ['#176d9e', '#197b8e', '#0f776f'] },
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
