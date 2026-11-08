import { computed, ref } from 'vue';
import { request } from '@/services/api/index';
import { LLM_REQUEST_TIMEOUT_MS } from '@/features/llm/requestPolicy';
import { useBaziStore } from '@/store/bazi';
import { executeTimeLiuyaoChart } from '@/features/liuyao/executor';
import { useLiuyaoStore } from '@/store/liuyao';
import { useUserStore } from '@/store/user';
import { useZiweiStore } from '@/store/ziwei';
import { useQimenStore } from '@/store/qimen';
import { civilToTimestamp, deviceTimeZone } from '@/utils/chartTime';
import { getStructuredChartContext } from './chartContext';
import { buildToolProtocolPrompt, type ToolCall } from './toolProtocol';
import { runToolLoop, type ToolResult } from './toolLoop';
import { getAccessToken } from '@/utils/tokenStore';
import utils from '@/libs/utils/utils';
import type { ChartInput } from '@/utils/chartInput';
import { quickPrompts, routeMap, toolCards } from './config';
import {
	buildAgentSystemPrompt,
	extractTextFromPayload,
	formatZiweiPalaceLabel,
	getFallbackTargetForAction,
	normalizeAgentGender,
	normalizeAgentName,
	normalizeError,
	normalizeLiuyaoTitle,
	normalizeZiweiPalaceName,
} from './runtime';
import type { ChatMessage, ExecutableAction, NavigateAction, UiMessage } from './types';

export function useAgentPage() {
	const userStore = useUserStore();
	const baziStore = useBaziStore();
	const liuyaoStore = useLiuyaoStore();
	const ziweiStore = useZiweiStore();
	const qimenStore = useQimenStore();

	const draft = ref('');
	const sending = ref(false);
	const pendingAction = ref<NavigateAction | null>(null);
	const messages = ref<UiMessage[]>([]);
	let loginPromptOpen = false;
	const chartIdentity = (input: ChartInput) =>
		`「${input.realname || '未命名'}」 ${input.gender === 0 ? '男' : '女'} ${input.timestamp === null ? '出生时间未设置' : utils.HideSecond(input.timestamp)}`;

	const contextItems = computed(() => {
		const items: string[] = [];

		if (baziStore.sizhu?.year && baziStore.sizhu?.month && baziStore.sizhu?.day && baziStore.sizhu?.time) {
			items.push(`八字 ${chartIdentity(baziStore.input)}；四柱 ${baziStore.sizhu.year} ${baziStore.sizhu.month} ${baziStore.sizhu.day} ${baziStore.sizhu.time}`);
		}

		if (liuyaoStore.profile?.title) {
			items.push(`六爻「${liuyaoStore.profile.title}」`);
		}

		if (ziweiStore.astrolabe) {
			items.push(`紫微 ${chartIdentity(ziweiStore.input)}`);
		}
		if (qimenStore.chart && qimenStore.input.timestamp !== null) {
			items.push(`奇门「${qimenStore.input.question || '未命名'}」`);
		}

		return items;
	});

	const accessLabel = computed(() => (userStore.isLoggedIn ? '已登录' : '登录后使用'));
	const usageLabel = computed(() => '按账号额度');
	const conversationSubtitle = computed(
		() => '登录后，Agent 可根据你的自然语言直接排盘、聚焦紫微宫位或给出下一步动作，调用使用账号额度',
	);
	const composeTip = computed(() =>
		sending.value
			? 'Agent 正在调用模型'
			: userStore.isLoggedIn
				? '支持“帮我选盘 / 直接排盘 / 聚焦紫微宫位 / 查看历史记录”'
				: '登录后可发送消息或使用快捷提示，当前输入会保留',
	);
	const lastMessageId = computed(() => {
		const current = messages.value[messages.value.length - 1];
		return current ? current.id : '';
	});

	function formatNow() {
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		return `${hh}:${mm}`;
	}

	function nextId(prefix = 'msg') {
		return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
	}

	function buildSeedText() {
		const contextText = contextItems.value.length
			? `当前可继续接手：${contextItems.value.join('；')}。`
			: '当前还没有缓存的盘面，我可以先帮你判断该走哪种排盘。';
		return `我是排盘 Agent，可以直接帮你排八字、按时间起六爻、继续聚焦紫微宫位，也可以带你去历史记录或设置页。${contextText}`;
	}

	function ensureSeedMessage() {
		const seedText = buildSeedText();
		if (!messages.value.length || !messages.value[0]?.seed) {
			messages.value = [
				{
					id: 'seed-1',
					role: 'assistant',
					text: seedText,
					time: formatNow(),
					status: 'ready',
					seed: true,
				},
			];
			return;
		}

		messages.value[0] = {
			...messages.value[0],
			text: seedText,
		};
	}

	function pushMessage(role: 'assistant' | 'user', text: string, status: UiMessage['status'] = 'ready') {
		messages.value.push({
			id: nextId(),
			role,
			text,
			time: formatNow(),
			status,
		});
	}

	function createWaitingMessage() {
		const id = nextId('waiting');
		messages.value.push({
			id,
			role: 'assistant',
			text: '',
			time: formatNow(),
			status: 'waiting',
		});
		return id;
	}

	function replaceMessage(id: string, text: string, status: UiMessage['status']) {
		const index = messages.value.findIndex((item) => item.id === id);
		if (index < 0) return;
		messages.value[index] = {
			...messages.value[index],
			text,
			status,
			time: formatNow(),
		};
	}

	function buildMessages(): ChatMessage[] {
		const payload: ChatMessage[] = [
			{
				role: 'system',
				content: buildAgentSystemPrompt(contextItems.value) + '\n\n' + buildToolProtocolPrompt(),
			},
		];

		for (const item of messages.value) {
			if (item.seed || item.status === 'waiting') continue;
			const text = String(item.text || '').trim();
			if (!text) continue;
			payload.push({
				role: item.role === 'user' ? 'user' : 'assistant',
				content: text,
			});
		}

		return payload;
	}

	function initializePage() {
		baziStore.restoreInput();
		baziStore.ensureComputed();
		ziweiStore.restoreInput();
		ziweiStore.ensureComputed();
		liuyaoStore.restoreLastResult();
		qimenStore.restoreInput();
		qimenStore.ensureComputed();
		ensureSeedMessage();
	}

	function resolveZiweiPalaceIndex(name: string) {
		if (!ziweiStore.astrolabe) return null;
		const normalized = normalizeZiweiPalaceName(name);
		if (!normalized) return null;

		for (let index = 0; index < ziweiStore.astrolabe.palaces.length; index += 1) {
			const palace = ziweiStore.astrolabe.palaces[index];
			if (normalizeZiweiPalaceName(palace?.name) === normalized) {
				return typeof palace?.index === 'number' ? palace.index : index;
			}
		}

		return null;
	}

	function applyZiweiFocusByName(name: string, strict = true) {
		const palaceIndex = resolveZiweiPalaceIndex(name);
		if (palaceIndex === null) {
			if (strict) {
				throw new Error(`未识别到可聚焦的宫位：${formatZiweiPalaceLabel(name)}`);
			}
			return false;
		}

		if (ziweiStore.focusPalaceIndex !== palaceIndex) {
			ziweiStore.setFocus(palaceIndex);
		}

		return true;
	}

	async function navigateToPage(url: string) {
		await new Promise<void>((resolve, reject) => {
			uni.navigateTo({
				url,
				success: () => resolve(),
				fail: (err) => reject(err),
			});
		});
	}

	async function executeAgentAction(action: ExecutableAction, navigate = true) {
		if (action.type === 'focus_ziwei_palace') {
			if (!ziweiStore.astrolabe) {
				throw new Error('当前还没有紫微盘，无法直接聚焦宫位');
			}

			applyZiweiFocusByName(action.payload.palace);
			if (navigate) await navigateToPage('/pages/ziwei/result');
			return;
		}

		if (action.type === 'run_liuyao_chart') {
			const hasCustomDate = String(action.payload.date || '').trim();
			const hasCustomTime = String(action.payload.time || '').trim();
			let date = new Date();

			if (hasCustomDate || hasCustomTime) {
				const zone = action.payload.timeZone || deviceTimeZone();
				const timestamp = civilToTimestamp(`${action.payload.date} ${action.payload.time}:00`, zone, 'reject');
				if (!Number.isFinite(timestamp)) {
					throw new Error('起卦时间格式无效，无法直接排六爻');
				}
				date = new Date(timestamp);
			}

			uni.showLoading({
				title: '正在起六爻盘...',
			});

			try {
				executeTimeLiuyaoChart({
					title: normalizeLiuyaoTitle(action.payload.title) || '当前问题',
					date,
					timeZone: action.payload.timeZone || deviceTimeZone(),
				});
				if (navigate) await navigateToPage('/pages/liuyao/result');
			} finally {
				uni.hideLoading();
			}

			return;
		}

		const gender = normalizeAgentGender(action.payload.gender);
		if (gender === null) {
			throw new Error('性别参数无效，无法直接排盘');
		}

		const timeZone = action.payload.timeZone || deviceTimeZone();
		const timestamp = civilToTimestamp(`${action.payload.date} ${action.payload.time}:00`, timeZone, 'reject');

		const realname = normalizeAgentName(action.payload.realname);
		const params = {
			realname,
			gender,
			timestamp,
			recordId: null,
			timeZone,
			timeZoneSource: 'explicit' as const,
		};

		uni.showLoading({
			title: action.type === 'run_bazi_chart' ? '正在生成八字盘...' : '正在生成紫微盘...',
		});

		try {
			if (action.type === 'run_bazi_chart') {
				baziStore.pull(params);
				if (navigate) await navigateToPage('/pages/index/detail');
				return;
			}

			ziweiStore.pull(params);
			if (action.payload.focusPalace) {
				applyZiweiFocusByName(action.payload.focusPalace, false);
			}
			if (navigate) await navigateToPage('/pages/ziwei/result');
		} finally {
			uni.hideLoading();
		}
	}

	function ensureAgentLogin() {
		// Re-read storage as well as reactive state so removed credentials cannot send.
		if (userStore.isLoggedIn && getAccessToken()) return true;
		if (!loginPromptOpen) {
			loginPromptOpen = true;
			uni.showModal({
				title: '登录后使用 Agent',
				content: 'Agent 需要登录并使用账号额度。登录后可继续发送，当前输入会保留。',
				confirmText: '去登录',
				cancelText: '取消',
				success: (result) => {
					if (result.confirm) {
						uni.navigateTo({ url: '/pages/auth/auth' });
					}
				},
				complete: () => {
					loginPromptOpen = false;
				},
			});
		}
		return false;
	}


	function chartContext(target: 'all' | 'bazi' | 'liuyao' | 'ziwei' | 'qimen' = 'all') {
		return getStructuredChartContext({
			bazi: baziStore, liuyao: liuyaoStore, ziwei: ziweiStore, qimen: qimenStore,
		}, target);
	}

	async function executeTool(call: ToolCall): Promise<ToolResult> {
		if (call.name === 'get_chart_context') {
			return { ok: true, name: call.name, data: chartContext(call.args.target) };
		}
		if (call.name === 'navigate') {
			pendingAction.value = {
				type: 'navigate', target: call.args.target,
				label: '打开相应页面', reason: '已为你准备好页面入口，请点击确认。',
			};
			return { ok: true, name: call.name, data: { navigationOffered: call.args.target } };
		}
		if (call.name === 'run_bazi_chart' || call.name === 'run_ziwei_chart' || call.name === 'run_liuyao_chart') {
			await executeAgentAction({ type: call.name, label: call.name, payload: call.args } as ExecutableAction, false);
			const target = call.name === 'run_bazi_chart' ? 'bazi' : call.name === 'run_ziwei_chart' ? 'ziwei' : 'liuyao';
			pendingAction.value = { type: 'navigate', target, url: target === 'bazi' ? '/pages/index/detail' : target === 'ziwei' ? '/pages/ziwei/result' : '/pages/liuyao/result', label: '查看刚生成的排盘', reason: '排盘已生成，可以打开结果页面查看。' };
			return { ok: true, name: call.name, data: chartContext(target) };
		}
		if (call.name === 'focus_ziwei_palace') {
			await executeAgentAction({ type: call.name, label: '聚焦宫位', payload: call.args }, false);
			pendingAction.value = { type: 'navigate', target: 'ziwei', url: '/pages/ziwei/result', label: '查看紫微宫位', reason: '宫位已选中，可以查看详细盘面。' };
			return { ok: true, name: call.name, data: chartContext('ziwei') };
		}
		return { ok: false, name: call.name, error: '未注册的工具' };
	}

	async function sendPrompt(text: string) {
		const content = String(text || '').trim();
		if (!content || sending.value) return;
		if (!ensureAgentLogin()) return;

		pushMessage('user', content);
		pendingAction.value = null;
		draft.value = '';
		sending.value = true;
		const waitingId = createWaitingMessage();

		try {
			const initialMessages = buildMessages();
			const sessionToken = getAccessToken();
			const result = await runToolLoop({
				messages: initialMessages,
				askModel: async (messages) => {
					if (!sessionToken || getAccessToken() !== sessionToken || !userStore.isLoggedIn) throw new Error('登录会话已改变，已停止继续调用');
					const res = await request('/api/llm/agent', {
						method: 'POST', needAuth: true, timeout: LLM_REQUEST_TIMEOUT_MS,
						data: { stream: false, messages },
					});
					if (!res?.success) throw new Error(res?.error || res?.message || '调用失败');
					const reply = extractTextFromPayload(res?.data) || (res?.data as any)?.reply || '';
					if (!String(reply).trim()) throw new Error('模型未返回可显示内容');
					return String(reply);
				},
				execute: async (call) => {
					if (getAccessToken() !== sessionToken || !userStore.isLoggedIn) throw new Error('登录会话已改变，工具执行已取消');
					return executeTool(call);
				},
				onProgress: (label) => replaceMessage(waitingId, label, 'waiting'),
			});
			replaceMessage(waitingId, result.text, result.finish === 'completed' ? 'ready' : 'error');
		} catch (err) {
			replaceMessage(waitingId, `调用失败：${normalizeError(err)}`, 'error');
		} finally {
			sending.value = false;
		}
	}

	function handleSend() {
		void sendPrompt(draft.value);
	}

	function handleQuickPrompt(prompt: string) {
		void sendPrompt(prompt);
	}

	function openTarget(target: keyof typeof routeMap) {
		pendingAction.value = null;
		if (target === 'bazi') {
			uni.reLaunch({
				url: routeMap[target],
			});
			return;
		}

		uni.navigateTo({
			url: routeMap[target],
		});
	}

	function applyPendingAction() {
		if (!pendingAction.value) return;
		const action = pendingAction.value;
		pendingAction.value = null;
		if (action.url) { void navigateToPage(action.url); return; }
		openTarget(action.target);
	}

	return {
		toolCards,
		quickPrompts,
		draft,
		sending,
		pendingAction,
		messages,
		contextItems,
		accessLabel,
		usageLabel,
		conversationSubtitle,
		composeTip,
		lastMessageId,
		initializePage,
		handleSend,
		handleQuickPrompt,
		openTarget,
		applyPendingAction,
	};
}
