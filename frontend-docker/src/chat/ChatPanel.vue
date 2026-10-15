<template>
	<view class="chat-page">
		<view class="chat-header">
			<view class="header-left">
				<text class="chat-title">AI 对话</text>
				<text class="chat-subtitle">把盘面与生活经验，放在一起聊聊。</text>
			</view>
			<view class="header-right">
				<text class="quota-item">剩余次数： {{ remainingCountText }}</text>
				<view class="header-actions">
					<button class="header-btn" v-bind="h5Button(handleRestoreArchive, archiveBusy || sending || restoring)" :disabled="archiveBusy || sending || restoring" @tap="handleRestoreArchive">恢复对话</button>
					<button class="header-btn" v-bind="h5Button(handleSaveArchive, archiveBusy || restoring)" :disabled="archiveBusy || restoring" @tap="handleSaveArchive">保存对话</button>
					<button class="header-btn" v-bind="h5Button(clearSession, archiveBusy || restoring)" :disabled="archiveBusy || restoring" @tap="clearSession">清空对话</button>
				</view>
			</view>
		</view>
		<view class="session-notice" role="status" aria-live="polite">
			<text>{{ sessionNotice }}</text>
			<button v-if="sessionFailed" class="header-btn" v-bind="h5Button(retrySession)" @tap="retrySession">重试保存</button>
		</view>

		<scroll-view
			class="chat-body"
			scroll-y
			:show-scrollbar="true"
			:scroll-with-animation="true"
			:scroll-top="scrollTop"
			:scroll-into-view="lastMessageId"
		>
			<view
				v-for="msg in messages"
				:id="msg.id"
				:key="msg.id"
				class="chat-item"
				:class="[msg.role === 'user' ? 'from-user' : 'from-bot', { 'has-error': msg.status === 'error' }]"
			>
				<view class="avatar">
					<text>{{ msg.role === 'user' ? '我' : 'AI' }}</text>
				</view>
				<view class="bubble">
					<view v-if="msg.status === 'waiting'" class="waiting-container">
						<text class="bubble-text waiting-text">正在思考</text>
						<text class="waiting-dots">...</text>
					</view>
					<text v-else class="bubble-text" :selectable="true" :user-select="true">{{ msg.text || ' ' }}</text>
					<view class="meta">
						<text class="time">{{ msg.time }}</text>
						<text v-if="msg.status && msg.status !== 'waiting' && msg.status !== 'stream'" class="status">{{ msg.status === 'error' ? '未完成' : '已完成' }}</text>
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
				placeholder="想进一步了解什么？"
				:disabled="sending || restoring"
				confirm-type="send"
				@confirm="handleSend"
			/>
			<button class="chat-send" v-bind="h5Button(handleSend, sending || restoring || !draft.trim())" :disabled="sending || restoring || !draft.trim()" @tap="handleSend">
				{{ sending ? '发送中...' : '发送' }}
			</button>
		</view>
	</view>
</template>

<script setup lang="ts">
import { computed, nextTick, onScopeDispose, reactive, ref } from 'vue';
import { h5Button } from '@/utils/keyboard';
import { useChatSession } from './useChatSession';
import { downloadChatArchive, pickChatArchive } from './archiveFile';
import type { SessionIdentity } from './sessionSnapshot';

type Role = 'user' | 'assistant';

type Message = {
	id: string;
	role: Role;
	text: string;
	time: string;
	status?: string;
};

type QuotaInfo = {
	remainingCount: number;
};

const props = defineProps<{
	quotaInfo?: QuotaInfo | null;
	disableAutoRestore?: boolean;
	sessionIdentity?: SessionIdentity | null;
	sessionAccount?: string;
}>();

const emit = defineEmits<{
	(e: 'send', text: string): void;
	(e: 'session-reset'): void;
}>();

const localQuotaInfo = ref<QuotaInfo | null>(null);
const effectiveQuotaInfo = computed(() => props.quotaInfo ?? localQuotaInfo.value);
const remainingCountText = computed(() => {
	const value = effectiveQuotaInfo.value?.remainingCount;
	if (value === 0) return '0';
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return '--';
});

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
let quotaAccount = props.sessionAccount ?? props.sessionIdentity?.account ?? '';
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
		++sessionEpoch;
		const account = props.sessionAccount ?? props.sessionIdentity?.account ?? '';
		if (account !== quotaAccount) localQuotaInfo.value = null;
		quotaAccount = account;
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
	if (!text || sending.value || restoring.value) return;
	sending.value = true;
	pushMessage('user', text);
	draft.value = '';
	emit('send', text);
}

// 创建等待状态的助手消息
function createWaitingMessage() {
	const newMsg: Message = {
		id: `msg-${messages.length + 1}-${Date.now()}`,
		role: 'assistant',
		text: '',
		time: formatNow(),
		status: 'waiting',
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

// 更新额度信息
function updateQuotaInfo(info: QuotaInfo) {
	localQuotaInfo.value = info;
}

const archiveBusy = ref(false);

async function handleSaveArchive() {
	if (archiveBusy.value || restoring.value) return;
	archiveBusy.value = true;
	try {
		const encryptedText = await session.exportArchive();
		const filename = `ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
		// Explicit downloads avoid reusing another account's globally cached file handle.
		downloadChatArchive(encryptedText, filename);
		uni.showToast({ title: '已导出加密对话', icon: 'success' });
	} catch (error: any) {
		uni.showToast({ title: error?.message || '导出失败', icon: 'none' });
	} finally { archiveBusy.value = false; }
}

async function handleRestoreArchive() {
	if (archiveBusy.value || sending.value || restoring.value) return;
	archiveBusy.value = true;
	try {
		const text = await pickChatArchive();
		await session.importArchive(text);
		uni.showToast({ title: '已恢复', icon: 'success' });
	} catch (error: any) {
		if (error?.name !== 'AbortError') uni.showToast({ title: error?.message || '恢复失败', icon: 'none' });
	} finally { archiveBusy.value = false; }
}
// 获取所有消息（用于构建对话历史）
function getMessages() {
	return messages;
}

// 对外暴露一个方法，便于上层在拿到模型回复后调用
const panelActions = {
	// 创建等待状态的助手消息
	createWaitingMessage,
	// 追加助手消息（支持流式更新）
	appendAssistant(text: string, status?: string) {
		if (status === 'stream') {
			// 流式更新：追加到最后一条助手消息
			const lastMsg = getOrCreateLastAssistantMessage();
			lastMsg.text += text;
			nextTick(() => {
				scrollTop.value += 200;
			});
		} else {
			// 完整回复或错误：创建新消息
			// 如果最后一条是等待状态，先移除它
			const lastMsg = messages[messages.length - 1];
			if (lastMsg?.status === 'stream' && status === 'error') lastMsg.status = 'error';
			if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'waiting') {
				messages.pop();
			}
			pushMessage('assistant', text, status);
			sending.value = false;
		}
	},
	setSending(flag: boolean) {
		sending.value = flag;
	},
	finishStreaming,
	updateQuotaInfo,
	getMessages,
};

defineExpose({
	...panelActions,
	captureSession() {
		const epoch = sessionEpoch;
		return {
			...Object.fromEntries(Object.entries(panelActions).map(([key, action]) => [key, (...args: any[]) => epoch === sessionEpoch ? (action as (...values: any[]) => any)(...args) : undefined])),
			flushSession: () => session.flush(),
			isCurrent: () => epoch === sessionEpoch,
		};
	},
});


</script>

<style scoped>
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
</style>
