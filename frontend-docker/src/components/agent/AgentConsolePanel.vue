<template>
	<view class="console-panel">
		<view class="agent-console">
			<view v-if="pendingAction" class="action-banner">
				<view class="action-banner__text">
					<text class="action-banner__title">下一步建议</text>
					<text class="action-banner__body">{{ pendingAction.reason || pendingAction.label }}</text>
				</view>
				<button class="action-btn" v-bind="h5Button(applyPending, sending)" :disabled="sending" @tap="applyPending">{{ pendingAction.label }}</button>
			</view>

			<view v-if="contextItems.length" class="context-banner">
				<text class="context-banner__title">已关联盘面</text>
				<view class="context-banner__items">
					<text v-for="item in contextItems" :key="item" class="context-banner__item">{{ item }}</text>
				</view>
			</view>

			<scroll-view
				v-if="visibleMessages.length"
                class="message-list"
				scroll-y
				:scroll-with-animation="true"
				:scroll-into-view="lastMessageId"
			>
				<view
					v-for="msg in visibleMessages"
					:id="msg.id"
					:key="msg.id"
					class="message-item"
					:class="[
						msg.role === 'user' ? 'message-item--user' : 'message-item--assistant',
						msg.status === 'error' ? 'message-item--error' : '',
					]"
				>
					<view class="message-avatar">
						<text class="message-avatar__text">{{ msg.role === 'user' ? '我' : 'AI' }}</text>
					</view>
					<view class="message-bubble">
						<view v-if="msg.status === 'waiting'" class="waiting-indicator">
							<text class="waiting-indicator__text">正在整理操作建议</text>
							<text class="waiting-indicator__dots">...</text>
						</view>
						<text v-else class="message-text" selectable user-select>{{ msg.text }}</text>
						<text class="message-meta">{{ msg.time }}</text>
					</view>
				</view>
			</scroll-view>

			<view class="compose-box">
				<textarea
					v-model="draftValue"
					v-bind="composeKeyboardEvents"
					class="compose-input"
					auto-height
					maxlength="-1"
					:disabled="sending"
					placeholder="最近有什么想了解的？例如：我正在考虑换工作，该从哪个角度看看……"
					confirm-type="send"
					@confirm="sendMessage"
				/>
				<view class="compose-actions">
					<text class="compose-tip">{{ composeTip }}</text>
					<button class="send-btn" v-bind="h5Button(sendMessage, sendDisabled)" :disabled="sendDisabled" @tap="sendMessage">
						{{ sending ? '发送中...' : '开始探索 ↗' }}
					</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NavigateAction, UiMessage } from '@/features/agent/types';
import { h5Button } from '@/utils/keyboard';

const props = defineProps<{
	subtitle: string;
	pendingAction: NavigateAction | null;
	contextItems: string[];
	messages: UiMessage[];
	lastMessageId: string;
	modelValue: string;
	sending: boolean;
	composeTip: string;
}>();

const emit = defineEmits<{
	(event: 'update:modelValue', value: string): void;
	(event: 'send'): void;
	(event: 'apply-pending'): void;
}>();

const draftValue = computed({
	get: () => props.modelValue,
	set: (value: string) => emit('update:modelValue', value),
});

const visibleMessages = computed(() => props.messages.filter(message => !message.seed));
const sendDisabled = computed(() => props.sending || !draftValue.value.trim());
const sendMessage = () => {
	if (!sendDisabled.value) emit('send');
};
const applyPending = () => {
	if (!props.sending && props.pendingAction) emit('apply-pending');
};

const composeKeyboardEvents = (() => {
	let events: Record<string, unknown> = {};
	// #ifdef H5
	events = {
		onKeyup: (event: KeyboardEvent) => {
			// uni textarea emits confirm before its Enter keyup bubbles to a newly opened modal.
			if (event.key === 'Enter') event.stopPropagation();
		},
	};
	// #endif
	return events;
})();
</script>

<style scoped>
.console-panel { border:1px solid var(--x-line); background:var(--x-paper); border-radius:17px; box-shadow:0 6px 26px #276b7510; overflow:hidden; }
.agent-console { display:flex; flex-direction:row; flex-direction:column; }
.compose-box { padding:21px 23px 16px; background:var(--x-paper); }
.compose-input { width:100%; min-height:84px; font-size:14px; line-height:1.8; color:var(--x-ink); background:transparent; padding:0; }
.compose-input :deep(textarea), .compose-input :deep(.uni-textarea-placeholder) { padding:0!important; font:inherit; line-height:1.8; }
.compose-actions { display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:20px; padding-top:12px; }
.compose-tip { font-size:10px; color:var(--x-muted); line-height:1.7; flex:1; }
.send-btn,.action-btn { background:var(--x-gradient); color:white; border:0; padding:0 19px; min-height:40px; border-radius:9px; font-size:12px; display:flex; flex-direction:row; align-items:center; justify-content:center; flex-shrink:0; }
.send-btn[disabled],.action-btn[disabled] { opacity:.5; }
.action-banner,.context-banner { display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; gap:10px; padding:14px 22px; background:var(--x-gradient-soft); border-bottom:1px solid var(--x-line); }
.action-banner__text { display:flex; flex-direction:row; flex-direction:column; flex:1; gap:5px; }
.action-banner__title,.context-banner__title { font-size:11px; font-weight:600; color:var(--x-accent); }
.action-banner__body { font-size:12px; color:var(--x-body); }
.context-banner { background:var(--x-paper); }
.context-banner__items { display:flex; flex-direction:row; flex-wrap:wrap; gap:5px; min-width:0; max-width:100%; flex-shrink:1; }
.context-banner__item { padding:4px 8px; background:var(--x-tint); border-radius:6px; font-size:10px; color:var(--x-body); max-width:100%; overflow-wrap:anywhere; line-height:1.6; }
.message-list { height:340px; max-height:48vh; padding:20px; border-bottom:1px solid var(--x-line); background:var(--x-bg); }
.message-item { display:flex; flex-direction:row; align-items:flex-start; gap:10px; margin-bottom:18px; }
.message-item--user { flex-direction:row-reverse; }
.message-avatar { display:flex; flex-direction:row; align-items:center; justify-content:center; background:var(--x-gradient-soft); color:var(--x-accent); width:30px; height:30px; border-radius:10px; flex-shrink:0; font-size:11px; }
.message-bubble { display:flex; flex-direction:row; flex-direction:column; gap:8px; padding:13px 17px; max-width:85%; background:var(--x-paper); border:1px solid var(--x-line); border-radius:2px 13px 13px; }
.message-item--user .message-bubble { background:var(--x-gradient); border:0; color:white; border-radius:13px 2px 13px 13px; }
.message-text { font-size:13px; line-height:1.85; white-space:pre-wrap; overflow-wrap:anywhere; }
.message-meta { font-size:9px; opacity:.65; }
.message-item--error .message-bubble { border-color:#efc6bf; background:#fff6f3; color:#a54536; }
.waiting-indicator { display:flex; flex-direction:row; gap:8px; font-size:12px; color:var(--x-muted); }
@media(max-width:600px) { .compose-box { padding:18px 16px 15px; } .compose-input { font-size:13px; min-height:100px; } .compose-actions { gap:12px; align-items:flex-end; } .compose-tip { font-size:9px; } .send-btn { padding:0 13px; font-size:11px; } .message-list { padding:14px; } }
</style>
