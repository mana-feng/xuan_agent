import { onScopeDispose, ref, watch } from 'vue';
import { createScope, decodeSnapshot, encodeSnapshot, identityBase, identityToken, readSnapshot, recoverSessionData, removeSnapshot, writeSnapshot,
	type SessionData, type SessionIdentity, type SessionScope } from './sessionSnapshot';

export function useChatSession(
	identity: () => SessionIdentity | null | undefined,
	capture: () => SessionData,
	apply: (data: SessionData) => void,
	reset: () => void,
	account: () => string | undefined = () => undefined,
) {
	const notice = ref('');
	const failed = ref(false);
	const restoring = ref(false);
	const dirty = ref(false);
	let generation = 0;
	let revision = 0;
	let applying = false;
	let disposed = false;
	let canPersist = false;
	let scope: SessionScope | null = null;
	let previous: SessionIdentity | null = null;
	let activation: Promise<void> = Promise.resolve();
	const departures = new Set<Promise<void>>();
	const unsaved = new Map<string, SessionData>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
	const mutate = (action: () => void) => { applying = true; try { action(); } finally { applying = false; } };
	const snapshot = () => JSON.parse(JSON.stringify(capture())) as SessionData;

	async function flush() {
		cancelTimer();
		const epoch = generation;
		await activation;
		if (epoch !== generation || !identity()) return false;
		canPersist = true;
		const version = ++revision;
		const data = snapshot();
		dirty.value = true;
		notice.value = '正在加密保存，请稍候再刷新…';
		try {
			if (!scope) {
				const target = await createScope(identity()!);
				if (epoch !== generation || version !== revision) return false;
				scope = target;
			}
			const target = scope;
			const written = await writeSnapshot(target, data, () => epoch === generation && version === revision);
			if (written) { unsaved.delete(identityToken(identity())); dirty.value = false; failed.value = false; notice.value = '已保存到此设备 · 30 天内可恢复'; }
			return written;
		} catch {
			if (epoch === generation && version === revision) {
				failed.value = true;
				notice.value = '对话未保存：加密或本地存储不可用。请重试，刷新前保留所需内容。';
			}
			return false;
		}
	}

	// An ordinary chat has no snapshot identity, but still belongs to the
	// current account. Invalidate its messages and pending replies on logout.
	watch([() => identityToken(identity()), account], () => {
		const next = identity() ? JSON.parse(JSON.stringify(identity())) as SessionIdentity : null;
		let oldScope = scope;
		const departingIdentity = previous;
		const migrating = next && previous && identityBase(next) === identityBase(previous) && previous.recordId == null && next.recordId != null;
		let carried = migrating && canPersist ? snapshot() : null;
		if (!migrating && previous && canPersist && dirty.value) {
			// Capture the departing chart before reset. Its write stays bound to that
			// identity, and a quick return waits for it before reading old storage.
			const departing = previous;
			const data = snapshot();
			const work = (async () => {
				try {
					const target = await createScope(departing);
					if (await writeSnapshot(target, data)) unsaved.delete(identityToken(departing));
				} catch {
					unsaved.set(identityToken(departing), data);
					uni.showToast({ title: '上一对话未保存，请返回原盘重试', icon: 'none' });
				}
			})();
			departures.add(work);
			void work.finally(() => departures.delete(work));
		}
		previous = next;
		const epoch = ++generation;
		++revision; cancelTimer(); scope = null; dirty.value = Boolean(carried); failed.value = false;
		canPersist = Boolean(carried);
		if (!carried) mutate(reset);
		restoring.value = Boolean(next);
		notice.value = next ? '正在恢复此命盘的对话…' : '登录并关联命盘后可自动保存；当前对话刷新后会丢失。';
		activation = (async () => {
			if (!next) return;
			try {
				await Promise.all([...departures]);
				const target = await createScope(next);
				if (epoch !== generation || disposed) return;
				scope = target;
				if (migrating && !carried && departingIdentity) {
					// A save can assign the record ID before restore has finished.
					// Migrate the stored conversation, never the unread mount state.
					oldScope = oldScope || await createScope(departingIdentity);
					const stored = await readSnapshot(oldScope);
					if (epoch !== generation || disposed) return;
					if (stored) {
						carried = stored;
						mutate(() => apply(stored));
						canPersist = true; dirty.value = true;
					}
				}
				if (carried) {
					// Streaming can continue while the chart gains a record ID. Save
					// again if it changed during encryption, before claiming success.
					for (;;) {
						const version = revision;
						const written = await writeSnapshot(target, snapshot(), () => epoch === generation && version === revision);
						if (epoch !== generation) return;
						if (written) break;
					}
					if (oldScope) removeSnapshot(oldScope);
					dirty.value = false;
					notice.value = '已保存到此设备 · 30 天内可恢复';
				} else {
					const retained = unsaved.get(identityToken(next));
					if (retained) {
						canPersist = true;
						mutate(() => apply(recoverSessionData(retained)));
						dirty.value = true; failed.value = true;
						notice.value = '对话未保存：已保留上次切盘前的内容，请重试保存。';
						return;
					}
					const restored = await readSnapshot(target);
					if (epoch !== generation || disposed) return;
					canPersist = true;
					if (restored) { mutate(() => apply(restored)); notice.value = '已恢复此命盘的对话；中断的回复不会自动重发。'; }
					else notice.value = '对话将加密保存到此设备 · 保留 30 天';
				}
			} catch {
				if (epoch === generation) {
					failed.value = true;
					notice.value = carried ? '对话未保存：命盘保存后的记录迁移失败，请重试。'
						: '对话恢复失败：记录损坏、版本不兼容或存储不可用。当前内容仍可继续使用。';
				}
			} finally { if (epoch === generation) restoring.value = false; }
		})();
	}, { immediate: true, flush: 'sync' });

	watch(capture, () => {
		if (applying) return;
		// Mount hints are not a recovered conversation. Never let a logout or
		// navigation during decryption persist them over an unread snapshot.
		if (restoring.value && !canPersist) return;
		canPersist = true;
		++revision; dirty.value = true; cancelTimer();
		if (restoring.value || !scope) return;
		notice.value = '正在保存，请稍候再刷新…';
		timer = setTimeout(() => { void flush(); }, 150);
	}, { deep: true, flush: 'sync' });

	async function clear() {
		if (restoring.value) return;
		const target = scope;
		++generation; ++revision; cancelTimer(); restoring.value = false;
		// Cancel requests and erase in-memory content even when storage removal fails.
		mutate(reset); dirty.value = false;
		try { if (target) removeSnapshot(target); unsaved.delete(identityToken(identity())); failed.value = false; notice.value = '当前对话已清空'; }
		catch { failed.value = true; notice.value = '本地记录未能清除，请重试清空；刷新可能恢复旧内容。'; }
	}

	async function exportArchive() {
		await activation;
		if (!scope) throw new Error('请先登录并关联命盘，才能安全导出');
		return encodeSnapshot(scope, snapshot());
	}
	async function importArchive(text: string) {
		await activation;
		if (!scope) throw new Error('请先登录并关联命盘');
		const epoch = generation;
		const restored = await decodeSnapshot(scope, text);
		if (epoch !== generation || disposed) return;
		if (!restored) throw new Error('记录已超过 30 天保留期');
		mutate(() => { reset(); apply(restored); });
		await flush();
	}
	const beforeUnload = (event: BeforeUnloadEvent) => {
		if (!dirty.value && !failed.value) return;
		event.preventDefault(); event.returnValue = '';
	};
	if (typeof window !== 'undefined') window.addEventListener('beforeunload', beforeUnload);
	onScopeDispose(() => {
		cancelTimer();
		if (canPersist && dirty.value && scope) void flush();
		disposed = true;
		if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload);
	});
	return { notice, failed, restoring, dirty, flush, clear, exportArchive, importArchive, ready: () => activation };
}
