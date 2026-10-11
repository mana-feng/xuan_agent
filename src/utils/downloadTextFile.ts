export function downloadTextFile(text: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
	const blob = new Blob([text], { type: mimeType });
	const url = URL.createObjectURL(blob);
	try {
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
	} finally {
		// Keep the URL alive through the click task, and release it even if handoff throws.
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
}
