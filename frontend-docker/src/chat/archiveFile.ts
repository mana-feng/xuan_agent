/** Browser file transport; the encrypted archive format is owned by sessionSnapshot. */
export function downloadChatArchive(text: string, filename: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('当前环境不支持文件下载');
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  const cleanup = () => { link.remove(); window.URL.revokeObjectURL(url); };
  try { link.click(); }
  catch (error) { cleanup(); throw error; }
  // Keep the object URL alive until the browser has consumed the download.
  window.setTimeout(cleanup, 30_000);
}

export function pickChatArchive(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('当前环境不支持文件选择')); return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    let reading = false;
    let focusTimer: number | undefined;
    const cleanup = () => {
      input.remove(); window.removeEventListener('focus', onFocus);
      window.clearTimeout(focusTimer);
    };
    const cancel = () => { cleanup(); reject(new DOMException('已取消选择', 'AbortError')); };
    const onFocus = () => {
      // Older webviews may omit the input's cancel event.
      focusTimer = window.setTimeout(() => { if (!reading && !input.files?.length) cancel(); }, 500);
    };
    input.oncancel = cancel;
    input.onchange = async () => {
      try {
        reading = true;
        const file = input.files?.[0];
        if (!file) throw new DOMException('已取消选择', 'AbortError');
        if (file.size > 4 * 1024 * 1024) throw new Error('文件过大，请选择 4 MB 以内的对话记录');
        resolve(await file.text());
      } catch (error) { reject(error); }
      finally { cleanup(); }
    };
    document.body.appendChild(input);
    window.addEventListener('focus', onFocus, { once: true });
    try { input.click(); } catch (error) { cleanup(); reject(error); }
  });
}
