<template>
	<view class="chat-page">
    <view class="chat-header"><view class="header-left"><text class="chat-title">AI 对话</text><text class="chat-subtitle">把盘面与生活经验，放在一起聊聊。</text></view><button class="header-btn" v-bind="h5Button(clearSession, restoring || archiveBusy)" :disabled="restoring || archiveBusy" @tap="clearSession">清空对话</button></view>
    <view class="session-notice" role="status" aria-live="polite"><text>{{ sessionNotice }}</text><button v-if="sessionFailed" class="header-btn" v-bind="h5Button(retrySession)" @tap="retrySession">重试保存</button></view>
		<scroll-view
			class="chat-body"
			scroll-y
			:show-scrollbar="true"
			:scroll-with-animation="true"
			:scroll-top="scrollTop"
			:scroll-into-view="lastMessageId"
		>
			<view class="chat-messages">
			<view
				v-for="msg in messages"
				:id="msg.id"
				:key="msg.id"
				class="chat-item"
				:class="msg.role === 'user' ? 'from-user' : 'from-bot'"
			>
				<view class="avatar">
					<text>{{ msg.role === 'user' ? '我' : 'AI' }}</text>
				</view>
				<view class="bubble">
					<view v-if="(msg.status === 'waiting' || msg.status === 'stream') && !msg.text" class="thinking-section">
						<view v-if="msg.thinking" class="thinking-content" v-bind="h5Button(() => toggleThinking(msg.id))" :aria-expanded="!!msg.showThinking" @tap="toggleThinking(msg.id)">
							<view class="thinking-header">
								<text class="thinking-label">思考中</text>
								<text class="thinking-toggle">{{ msg.showThinking ? '收起' : '展开' }}</text>
							</view>
							<text v-if="msg.showThinking" class="thinking-text">{{ msg.thinking }}</text>
						</view>
						<view v-else class="waiting-container">
							<text class="bubble-text waiting-text">正在思考</text>
							<text class="waiting-dots">...</text>
						</view>
					</view>
					<view v-if="(msg.status === 'waiting' || msg.status === 'stream') && msg.text && msg.thinking" class="thinking-section">
						<view class="thinking-content" v-bind="h5Button(() => toggleThinking(msg.id))" :aria-expanded="!!msg.showThinking" @tap="toggleThinking(msg.id)">
							<view class="thinking-header">
								<text class="thinking-label">思考中</text>
								<text class="thinking-toggle">{{ msg.showThinking ? '收起' : '展开' }}</text>
							</view>
							<text v-if="msg.showThinking" class="thinking-text">{{ msg.thinking }}</text>
						</view>
					</view>
					<text v-if="msg.text" class="bubble-text" :selectable="true" :user-select="true">{{ msg.text }}</text>
					<view v-if="msg.status === 'ready' && msg.thinking" class="thinking-section-done">
						<view class="thinking-toggle-bar" v-bind="h5Button(() => toggleThinking(msg.id))" :aria-expanded="!!msg.showThinking" @tap="toggleThinking(msg.id)">
							<text class="thinking-toggle-label">思考过程</text>
							<text class="thinking-toggle">{{ msg.showThinking ? '收起' : '展开' }}</text>
						</view>
						<text v-if="msg.showThinking" class="thinking-text">{{ msg.thinking }}</text>
					</view>
					<view class="meta">
						<text class="time">{{ msg.time }}</text>
						<text v-if="msg.status === 'error'" class="status status-error">发送失败</text>
					</view>
				</view>
			</view>
			</view>
		</scroll-view>

		<view class="chat-input-bar">
			<textarea
				v-model="draft"
				class="chat-input"
				auto-height
				maxlength="-1"
				placeholder="输入你想聊的问题…"
				aria-label="聊天消息"
				:disabled="sending || archiveBusy || restoring"
				confirm-type="send"
				@confirm="handleSend"
			/>
			<button class="chat-send" v-bind="h5Button(handleSend, sending || archiveBusy || restoring || !draft.trim())" :disabled="sending || archiveBusy || restoring || !draft.trim()" @tap="handleSend">
				{{ sending ? '发送中…' : '发送' }}
			</button>
		</view>
	</view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, reactive, ref } from 'vue';
import { useChatSession } from './useChatSession';
import type { SessionIdentity } from './sessionSnapshot';
import { downloadTextFile } from '@/utils/downloadTextFile';
import { h5Button } from '@/utils/keyboard';
import {
	getPersistentItem,
	idbGetItem,
	idbSetItem,
	setPersistentItem,
} from '@/utils/persistentStorage';

type Role = 'user' | 'assistant';

type Message = {
	id: string;
	role: Role;
	text: string;
	time: string;
	status?: string;
	thinking?: string;
	showThinking?: boolean;
};

const props = defineProps<{
	disableAutoRestore?: boolean;
	sessionIdentity?: SessionIdentity | null;
	sessionAccount?: string;
}>();

const emit = defineEmits<{
	(e: 'send', text: string): void;
	(e: 'session-reset'): void;
}>();

const messages = reactive<Message[]>([
	{
		id: 'm-1',
		role: 'assistant',
		text: '你好，我是你的 AI 助手，可以随时发问。',
		time: formatNow(),
		status: 'ready',
	},
]);

const draft = ref('');
const sending = ref(false);
const scrollTop = ref(0);

let sessionEpoch = 0;
onScopeDispose(() => { ++sessionEpoch; });
const session = useChatSession(() => props.sessionIdentity,
	() => ({ messages: messages.filter(message => message.id !== 'm-1'), draft: draft.value }),
	data => {
		messages.splice(1, messages.length - 1, ...data.messages.map((message, index) => ({ ...message, id: `restored-${index}` })));
		draft.value = data.draft;
		sending.value = false;
		nextTick(() => { scrollTop.value += 9999; });
	},
	() => {
		if (!props.sessionIdentity && !props.sessionAccount && sessionEpoch === 0) return;
		++sessionEpoch;
		messages.splice(1); draft.value = ''; sending.value = false;
		emit('session-reset');
	}, () => props.sessionAccount);
const { notice: sessionNotice, failed: sessionFailed, restoring } = session;
const clearSession = () => { void session.clear(); };
const retrySession = () => { void session.flush(); };

const lastMessageId = computed(() => (messages.length ? messages[messages.length - 1].id : ''));

function formatNow() {
	const d = new Date();
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	return `${hh}:${mm}`;
}

function toggleThinking(msgId: string) {
	for (const msg of messages) {
		if (msg.id === msgId) {
			msg.showThinking = !msg.showThinking;
			break;
		}
	}
}

function pushMessage(role: Role, text: string, status?: string) {
	messages.push({
		id: `msg-${messages.length + 1}-${Date.now()}`,
		role,
		text,
		time: formatNow(),
		status,
	});
	nextTick(() => {
		scrollTop.value += 200; // ensure scroll-view moves down
	});
}

async function handleSend() {
	const text = draft.value.trim();
	if (!text || sending.value || archiveBusy.value || restoring.value) return;
	sending.value = true;
	pushMessage('user', text);
	emit('send', text);
	draft.value = '';
}

// 创建等待状态的助手消息
function createWaitingMessage() {
	const newMsg: Message = {
		id: `msg-${messages.length + 1}-${Date.now()}`,
		role: 'assistant',
		text: '',
		time: formatNow(),
		status: 'waiting',
		thinking: '',
		showThinking: true,
	};
	messages.push(newMsg);
	nextTick(() => {
		scrollTop.value += 200;
	});
	return newMsg;
}

// 获取或创建最后一条助手消息（用于流式更新）
function getOrCreateLastAssistantMessage() {
	const lastMsg = messages[messages.length - 1];
	// 如果是等待状态，转换为流式状态
	if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'waiting') {
		lastMsg.status = 'stream';
		lastMsg.text = '';
		return lastMsg;
	}
	// 如果已经是流式状态，直接返回
	if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'stream') {
		return lastMsg;
	}
	// 创建新的助手消息
	const newMsg: Message = {
		id: `msg-${messages.length + 1}-${Date.now()}`,
		role: 'assistant',
		text: '',
		time: formatNow(),
		status: 'stream',
	};
	messages.push(newMsg);
	nextTick(() => {
		scrollTop.value += 200;
	});
	return newMsg;
}

// 完成流式更新（将状态从 stream 改为 ready）
function finishStreaming() {
	const lastMsg = messages[messages.length - 1];
	if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'stream') {
		lastMsg.status = 'ready';
	}
	sending.value = false;
}

type ChatArchiveV1 = {
	v: 1;
	kind: 'chat';
	savedAt: string;
	messages: Array<{
		role: Role;
		text: string;
		time: string;
	}>;
};

const ARCHIVE_HANDLE_KEY = 'chat_archive_handle_v1';
const ARCHIVE_FALLBACK_KEY = 'chat_archive_last_v1';
const ARCHIVE_HANDLE_STALE_KEY = 'chat_archive_handle_stale_v1';

const archiveBusy = ref(false);
let archiveOperation = 0;

function buildArchivePayload(): ChatArchiveV1 {
	const exported: ChatArchiveV1 = {
		v: 1,
		kind: 'chat',
		savedAt: new Date().toISOString(),
		messages: [],
	};
	for (const msg of messages) {
		if (msg.id === 'm-1') continue;
		if (msg.status === 'waiting' || msg.status === 'stream' || msg.status === 'error') continue;
		if (!msg.text || !msg.text.trim()) continue;
		exported.messages.push({
			role: msg.role,
			text: msg.text,
			time: msg.time,
		});
	}
	return exported;
}

function parseArchivePayload(text: string): ChatArchiveV1 {
	if (!text.trim()) throw new Error('档案文件为空');
	let archive: any;
	try {
		archive = JSON.parse(text);
	} catch {
		throw new Error('档案内容无法解析，请选择有效的 JSON 文件');
	}
	if (
		!archive || archive.v !== 1 || archive.kind !== 'chat' || typeof archive.savedAt !== 'string' ||
		!Array.isArray(archive.messages) || archive.messages.some((item: any) =>
			!item || (item.role !== 'user' && item.role !== 'assistant') ||
			typeof item.text !== 'string' || !item.text.trim() || typeof item.time !== 'string')
	) {
		throw new Error('记录格式不正确');
	}
	return archive;
}

function applyArchivePayload(archive: ChatArchiveV1) {
	const restored: Message[] = [
		{
			id: 'm-1',
			role: 'assistant',
			text: '你好，我是你的 AI 助手，可以随时发问。',
			time: formatNow(),
			status: 'ready',
		},
	];
	for (const item of archive.messages) {
		restored.push({
			id: `msg-${restored.length + 1}-${Date.now()}`,
			role: item.role,
			text: item.text,
			time: item.time,
			status: 'ready',
		});
	}
	messages.splice(0, messages.length, ...restored);
	nextTick(() => {
		scrollTop.value += 9999;
	});
}

async function writeTextToFileHandle(handle: any, text: string) {
	const writable = await handle.createWritable();
	await writable.write(text);
	await writable.close();
}

async function readTextFromFileHandle(handle: any): Promise<string> {
	const file = await handle.getFile();
	return file.text();
}

async function pickFileTextByInput(): Promise<string> {
	if (typeof window === 'undefined') {
		throw new Error('not supported');
	}
	return new Promise<string>((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.hidden = true;
		const cleanup = () => {
			input.onchange = null;
			input.oncancel = null;
			input.remove();
		};
		const cancel = () => {
			cleanup();
			reject(new DOMException('已取消选择', 'AbortError'));
		};
		input.oncancel = cancel;
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return cancel();
			cleanup();
			try {
				const text = await file.text();
				resolve(text);
			} catch (e) {
				reject(e);
			}
		};
		try {
			// Keep the filechooser's target alive until selection or cancellation.
			document.body.appendChild(input);
			input.click();
		} catch (e) {
			cleanup();
			reject(e);
		}
	});
}

async function rememberArchive(text: string, handle: any = null) {
	// Caching is optional: a completed file operation must not fail with the cache.
	try {
		// Invalidate the previous handle before replacing its backup. If IndexedDB
		// rejects the update, reopening must use this backup rather than the old file.
		setPersistentItem(ARCHIVE_HANDLE_STALE_KEY, true, 0);
		setPersistentItem(ARCHIVE_FALLBACK_KEY, text, 365 * 24 * 60 * 60 * 1000);
	} catch { /* Storage may be full or unavailable. */ }
	try {
		// A download/input import has no reusable handle; discard any older one.
		await idbSetItem(ARCHIVE_HANDLE_KEY, handle);
		setPersistentItem(ARCHIVE_HANDLE_STALE_KEY, false, 0);
	} catch { /* File handles are not supported in every browser. */ }
}

function handleSaveArchive() {
	return saveArchive(true);
}

function handleDownloadArchive() {
	return saveArchive(false);
}

async function saveArchive(preferNativePicker: boolean) {
	if (archiveBusy.value || sending.value) return;
	archiveOperation++;
	archiveBusy.value = true;
	try {
		const archive = buildArchivePayload();
		const archiveText = JSON.stringify(archive);
		const filename = `ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
		let archiveHandle: any = null;

		const win = typeof window !== 'undefined' ? (window as any) : null;
		if (preferNativePicker && win?.showSaveFilePicker) {
			const handle = await win.showSaveFilePicker({
				suggestedName: filename,
				types: [
					{
						description: 'JSON',
						accept: { 'application/json': ['.json'] },
					},
				],
			});
			await writeTextToFileHandle(handle, archiveText);
			archiveHandle = handle;
		} else {
			if (!win || typeof document === 'undefined') throw new Error('当前环境不支持文件下载');
			downloadTextFile(archiveText, filename, 'application/json;charset=utf-8');
		}
		await rememberArchive(archiveText, archiveHandle);
		uni.showToast({
			title: archiveHandle ? '已保存' : '已发起聊天档案下载',
			icon: archiveHandle ? 'success' : 'none',
		});
	} catch (e: any) {
		if (e?.name !== 'AbortError') uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
	} finally {
		archiveBusy.value = false;
	}
}

function handleRestoreArchive() {
	return restoreArchive(true);
}

function handleImportArchive() {
	return restoreArchive(false);
}

async function restoreArchive(preferNativePicker: boolean) {
	if (archiveBusy.value || sending.value) return;
	archiveOperation++;
	archiveBusy.value = true;
	try {
		let text: string | null = null;
		let archiveHandle: any = null;
		const win = typeof window !== 'undefined' ? (window as any) : null;
		// Manual restore always offers a file choice; remembered handles are for auto-restore.
		if (preferNativePicker && win?.showOpenFilePicker) {
			const handles = await win.showOpenFilePicker({
				multiple: false,
				types: [
					{
						description: 'JSON',
						accept: { 'application/json': ['.json'] },
					},
				],
			});
			const handle = handles?.[0];
			if (!handle) throw new DOMException('已取消选择', 'AbortError');
			text = await readTextFromFileHandle(handle);
			archiveHandle = handle;
		}

		if (text === null && (win || !preferNativePicker)) {
			// An explicitly selected file must either restore or report its own failure.
			text = await pickFileTextByInput();
		}

		if (text === null) {
			const fallback = getPersistentItem<string>(ARCHIVE_FALLBACK_KEY);
			if (fallback) text = fallback;
		}

		if (text === null) {
			throw new Error('未找到可恢复的记录');
		}

		const archive = parseArchivePayload(text);
		applyArchivePayload(archive);
		await rememberArchive(text, archiveHandle);
		uni.showToast({ title: '已恢复', icon: 'success' });
	} catch (e: any) {
		if (e?.name !== 'AbortError') uni.showToast({ title: e?.message || '恢复失败', icon: 'none' });
	} finally {
		archiveBusy.value = false;
	}
}

async function tryAutoRestoreOnOpen() {
	const operation = archiveOperation;
	const canRestore = () => operation === archiveOperation && !props.sessionIdentity && !props.disableAutoRestore && !sending.value && !archiveBusy.value && messages.length === 1;
	if (!canRestore()) return;
	try {
		try {
			const handle = getPersistentItem<boolean>(ARCHIVE_HANDLE_STALE_KEY) ? null : await idbGetItem<any>(ARCHIVE_HANDLE_KEY);
			if (handle) {
				const permission = (await handle.queryPermission?.({ mode: 'read' })) || 'prompt';
				if (permission === 'granted') {
					const text = await readTextFromFileHandle(handle);
					const archive = parseArchivePayload(text);
					if (canRestore()) applyArchivePayload(archive);
					return;
				}
			}
		} catch {
			// Cached handles may expire independently of the local archive backup.
		}
		const fallback = getPersistentItem<string>(ARCHIVE_FALLBACK_KEY);
		if (fallback) {
			const archive = parseArchivePayload(fallback);
			if (canRestore()) applyArchivePayload(archive);
		}
	} catch {
		return;
	}
}

// 获取所有消息（用于构建对话历史）
function getMessages() {
	return messages;
}

// 对外暴露一个方法，便于上层在拿到模型回复后调用
const panelActions = {
	createWaitingMessage,
	appendAssistant(text: string, status?: string, thinking?: string) {
		if (status === 'stream') {
			const lastMsg = getOrCreateLastAssistantMessage();
			if (thinking !== undefined) {
				lastMsg.thinking = (lastMsg.thinking || '') + thinking;
			}
			if (text) {
				lastMsg.text += text;
			}
			nextTick(() => {
				scrollTop.value += 200;
			});
		} else {
			const lastMsg = messages[messages.length - 1];
			if (status === 'error' && lastMsg?.role === 'assistant' && lastMsg.status === 'stream') {
				lastMsg.text = lastMsg.text ? `${lastMsg.text}\n\n${text}` : text;
				lastMsg.status = 'error';
				sending.value = false;
				return;
			}
			if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'waiting') {
				messages.pop();
			}
			pushMessage('assistant', text, status);
			sending.value = false;
		}
	},
	appendThinking(text: string) {
		const lastMsg = messages[messages.length - 1];
		if (lastMsg && lastMsg.role === 'assistant' && (lastMsg.status === 'waiting' || lastMsg.status === 'stream')) {
			lastMsg.thinking = (lastMsg.thinking || '') + text;
			lastMsg.status = 'stream';
			nextTick(() => {
				scrollTop.value += 200;
			});
		}
	},
	setSending(flag: boolean) {
		sending.value = flag;
	},
	finishStreaming,
	getMessages,
	handleRestoreArchive,
	handleSaveArchive,
	handleImportArchive,
	handleDownloadArchive,
	archiveBusy,
};
defineExpose({ ...panelActions, flushSession: session.flush,
  captureSession() {
    const epoch = sessionEpoch;
    const current = () => epoch === sessionEpoch;
    return {
      isCurrent: current,
      getMessages: () => current() ? getMessages() : [],
      flushSession: () => current() ? session.flush() : Promise.resolve(false),
      ...Object.fromEntries(Object.entries(panelActions).filter(([, value]) => typeof value === 'function').map(([key, value]) =>
        [key, (...args: any[]) => { if (current()) return (value as (...values: any[]) => any)(...args); }])),
    };
  },
});

onMounted(() => {
	tryAutoRestoreOnOpen();
});
</script>

<style scoped>
.chat-page {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-height: 0;
	min-width: 0;
	overflow: hidden;
	background: #f7f8fd;
}

.chat-body {
	flex: 1;
	height: 0;
	width: 100%;
	min-height: 0;
	scrollbar-width: thin;
	scrollbar-color: #c6c8de transparent;
}

.chat-messages {
	display: flex;
	flex-direction: column;
	width: 100%;
	min-height: 100%;
	padding: 24px;
}

.chat-body :deep(::-webkit-scrollbar) {
	width: 6px;
	display: block;
}

.chat-body :deep(::-webkit-scrollbar-track) {
	background: transparent;
}

.chat-body :deep(::-webkit-scrollbar-thumb) {
	background: #c6c8de;
	border-radius: 999px;
}

.chat-item {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	width: 100%;
	min-width: 0;
	margin-bottom: 20px;
}

.chat-item:last-child {
	margin-bottom: 0;
}

.chat-item.from-user {
	flex-direction: row-reverse;
}

.avatar {
	width: 32px;
	height: 32px;
	border-radius: 11px;
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
	font-size: 12px;
	font-weight: 600;
	flex-shrink: 0;
}

.chat-item.from-bot .avatar {
	background: linear-gradient(135deg, #6079ec 0%, #8760cf 100%);
	color: #ffffff;
}

.chat-item.from-user .avatar {
	background: #e8e9fa;
	color: #6960aa;
}

.bubble {
	display: flex;
	flex-direction: column;
	min-width: 0;
	max-width: 78%;
	padding: 12px 16px;
	border-radius: 16px;
	box-shadow: 0 2px 6px rgba(56, 56, 106, 0.04);
}

.chat-item.from-bot .bubble {
	background: #ffffff;
	color: #343b55;
	border: 1px solid #eceef7;
	border-top-left-radius: 4px;
	margin-left: 10px;
}

.chat-item.from-user .bubble {
	background: linear-gradient(120deg, #5d75e8 0%, #8157c9 100%);
	color: #ffffff;
	border-top-right-radius: 4px;
	margin-right: 10px;
}

.bubble-text {
	font-size: 14px;
	line-height: 1.75;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.waiting-container {
	display: flex;
	flex-direction: row;
	align-items: center;
}

.waiting-text {
	color: #7e83a0;
}

.waiting-dots {
	color: #7e83a0;
	animation: blink 1.5s infinite;
}

.thinking-section {
	margin-bottom: 6px;
}

.thinking-content {
	background: #f2f2fd;
	border-radius: 10px;
	padding: 8px 10px;
	border-left: 3px solid #aaa3e8;
}

.thinking-header {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
	gap: 16px;
	margin-bottom: 4px;
}

.thinking-label {
	font-size: 12px;
	color: #7464ac;
	font-weight: 600;
}

.thinking-toggle {
	font-size: 11px;
	color: #7669ba;
}

.thinking-text {
	font-size: 12px;
	color: #6b7280;
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.thinking-section-done {
	margin-top: 8px;
	border-top: 1px dashed #e5e7eb;
	padding-top: 8px;
}

.thinking-toggle-bar {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
	gap: 16px;
	padding: 4px 0;
}

.thinking-toggle-label {
	font-size: 12px;
	color: #9ca3af;
}

@keyframes blink {
	0%, 100% {
		opacity: 0.3;
	}
	50% {
		opacity: 1;
	}
}

.meta {
	margin-top: 7px;
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 8px;
	font-size: 11px;
	line-height: 1.4;
}

.chat-item.from-bot .meta {
	color: #9297ac;
}

.chat-item.from-user .meta {
	color: rgba(255, 255, 255, 0.75);
}

.status-error {
	color: #bb4561;
}

.chat-input-bar {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	flex-shrink: 0;
	align-items: flex-end;
	gap: 12px;
	padding: 16px 24px calc(16px + var(--safe-bottom));
	background: #ffffff;
	border-top: 1px solid #e8eaf5;
}

.chat-input {
	flex: 1;
	width: 0;
	min-width: 0;
	min-height: 46px;
	max-height: 120px;
	padding: 11px 14px;
	border-radius: 14px;
	border: 1px solid #e0e3f0;
	background: #f9faff;
	font-size: 14px;
	line-height: 22px;
	color: #343b55;
	transition: border-color 0.2s, box-shadow 0.2s;
}

.chat-input:focus-within {
	border-color: #8a88dc;
	box-shadow: 0 0 0 3px rgba(113, 100, 206, 0.1);
}

/* H5 wraps a real textarea; reset the shared form padding on that inner control. */
.chat-input :deep(textarea) {
	min-height: 0;
	padding: 0;
	border: 0;
	box-shadow: none;
}

.chat-input :deep(.uni-textarea-wrapper) {
	min-height: 22px;
	/* Match the composer's 160px cap after its padding and border. */
	max-height: 136px;
}

.chat-input :deep(.uni-textarea-textarea) {
	/* uni auto-height writes overflow-y:hidden inline, hiding long drafts. */
	overflow-y: auto !important;
}

.chat-input :deep(.uni-textarea-placeholder) {
	color: #969bb0;
}

.chat-send {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
	width: 88px;
	flex-shrink: 0;
	border: none;
	border-radius: 14px;
	background: linear-gradient(120deg, #596fea 0%, #8054c8 100%);
	color: #ffffff;
	font-size: 14px;
	font-weight: 600;
	height: 46px;
	min-height: 46px;
	line-height: 1;
	margin: 0;
	padding: 0 8px;
	white-space: nowrap;
}

.chat-send::after {
	border: 0;
}

.chat-send:active {
	filter: brightness(0.95);
}

.chat-send:disabled {
	background: #e3e5f2;
	color: #9699b6;
	box-shadow: none;
	transform: none;
}

@media (max-width: 640px) {
	.chat-messages {
		padding: 18px 14px;
	}

	.bubble {
		max-width: calc(100% - 42px);
		padding: 10px 12px;
	}

	.chat-input-bar {
		gap: 8px;
		padding: 12px 14px calc(12px + var(--safe-bottom));
	}

	.chat-send {
		width: 74px;
		font-size: 13px;
	}

	.chat-input {
		padding-left: 11px;
		padding-right: 11px;
	}
}

@media (max-width: 360px) {
	.chat-messages {
		padding-left: 10px;
		padding-right: 10px;
	}

	.avatar {
		width: 28px;
		height: 28px;
		border-radius: 9px;
	}

	.bubble {
		max-width: calc(100% - 38px);
	}

	.chat-input-bar {
		padding-left: 10px;
		padding-right: 10px;
	}

	.chat-send {
		width: 68px;
	}
}

.session-notice { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:8px 14px; font-size:11px; line-height:1.6; color:#43536a; background:#f1f5f9; flex-shrink:0; }
.chat-page { display:flex; flex-direction:row; flex-direction:column; height:100%; min-height:0; color:var(--x-ink); background:var(--x-paper); }
.chat-header { display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; padding:18px 23px; border-bottom:1px solid var(--x-line); flex-shrink:0; }
.header-left { display:flex; flex-direction:row; flex-direction:column; gap:5px; }
.chat-title { font-size:16px; font-weight:600; }
.chat-subtitle { font-size:11px; color:var(--x-muted); }
.header-right { display:flex; flex-direction:row; align-items:center; gap:13px; flex-wrap:wrap; justify-content:flex-end; }
.quota-item { font-size:11px; color:var(--x-muted); white-space:nowrap; }
.header-actions { display:flex; flex-direction:row; gap:6px; }
.header-btn { display:flex; flex-direction:row; align-items:center; min-height:33px; padding:0 12px; border:1px solid var(--x-line); background:var(--x-paper); color:var(--x-body); border-radius:7px; font-size:11px; }
.header-btn[disabled] { opacity:.5; }
.chat-body { flex:1; min-height:0; height:0; padding:23px; background:linear-gradient(180deg,var(--x-bg),var(--x-paper)); }
.chat-item { display:flex; flex-direction:row; align-items:flex-start; gap:11px; margin-bottom:22px; }
.from-user { flex-direction:row-reverse; }
.avatar { width:32px; height:32px; flex-shrink:0; border-radius:11px; background:var(--x-gradient-soft); color:var(--x-accent); display:flex; flex-direction:row; align-items:center; justify-content:center; font-size:11px; }
.bubble { max-width:83%; padding:15px 18px; border:1px solid var(--x-line); border-radius:2px 14px 14px; background:var(--x-paper); }
.from-user .bubble { background:var(--x-gradient); border:0; color:white; border-radius:14px 2px 14px 14px; }
.bubble-text { font-size:13px; line-height:1.9; white-space:pre-wrap; overflow-wrap:anywhere; }
.meta { display:flex; flex-direction:row; gap:10px; margin-top:9px; font-size:9px; opacity:.65; }
.has-error .bubble { background:#fff6f3; color:#a54536; border-color:#efc6bf; }
.waiting-container { display:flex; flex-direction:row; align-items:center; gap:5px; color:var(--x-muted); }
.waiting-dots { animation:blink 1.5s infinite; }
.chat-input-bar { display:flex; flex-direction:row; align-items:flex-end; gap:13px; padding:17px 22px; border-top:1px solid var(--x-line); background:var(--x-paper); flex-shrink:0; }
.chat-input { flex:1; width:0; min-width:0; min-height:60px; max-height:160px; padding:11px 13px; border:1px solid var(--x-line); border-radius:10px; background:var(--x-bg); font-size:13px; color:var(--x-ink); }
.chat-input :deep(textarea),.chat-input :deep(.uni-textarea-placeholder) { padding:0!important; font:inherit; }
.chat-send { padding:0 22px; min-height:42px; border-radius:9px; background:var(--x-gradient); color:white; font-size:12px; display:flex; flex-direction:row; align-items:center; }
.chat-send[disabled] { opacity:.5; }
@keyframes blink { 0%,100% { opacity:.3; } 50% { opacity:1; } }
@media(max-width:600px) { .chat-header { padding:14px; align-items:flex-start; } .header-right { gap:6px; } .header-left { min-width:63px; } .chat-subtitle { display:none; } .chat-title { font-size:14px; } .chat-body { padding:16px 12px; } .chat-item { gap:7px; } .bubble { padding:12px; max-width:85%; } .chat-input-bar { padding:12px; gap:8px; } .chat-send { padding:0 14px; } .bubble-text { font-size:12px; } .header-btn { padding:0 8px; font-size:10px; } }

.session-notice { display:flex; flex-flow:row wrap; gap:8px; align-items:center; padding:8px 18px; font-size:11px; color:var(--x-muted); }
</style>
