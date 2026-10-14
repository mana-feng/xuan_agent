import {
	computed,
	inject,
	nextTick,
	onBeforeUnmount,
	onMounted,
	reactive,
	ref,
	watch,
	type InjectionKey,
} from 'vue';
import { types, initialRecords } from './demoData';

export type ChartType = 'bazi' | 'liuyao' | 'ziwei';
export interface DraftRecord {
	id: number;
	type: ChartType;
	title: string;
	name: string;
	gender?: string;
	question?: string;
	date: string;
	time: string;
	calendar: string;
	created: string;
	subtitle: string;
	saved: boolean;
}

export const lunarMonths = [
	'正月',
	'二月',
	'三月',
	'四月',
	'五月',
	'六月',
	'七月',
	'八月',
	'九月',
	'十月',
	'冬月',
	'腊月',
];
export function currentTime() {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Singapore',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		})
			.formatToParts(new Date())
			.map((part) => [part.type, part.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}`,
		source: 'now',
	};
}

export function createDraft() {
	const state = reactive({
		view: 'home',
		type: 'bazi' as ChartType,
		palette: 'aurora',
		navOpen: false,
		mobile: false,
		filter: 'all',
		search: '',
		ascending: false,
		prompt: '',
		messages: [] as { text: string; reply: string; target: string; label: string }[],
		current: null as DraftRecord | null,
		nextId: 10,
		resultTab: 'chart',
		toast: '',
		records: initialRecords.map((record) => ({ ...record })) as DraftRecord[],
		birth: {
			name: '',
			gender: '男',
			calendar: '阳历',
			date: '',
			time: '',
			lunarYear: '',
			lunarMonth: '1',
			lunarDay: '',
			lunarLeap: false,
		},
		liuyao: { name: '', question: '' },
		qigua: currentTime(),
		qiguaEditing: false,
	});
	const main = ref<HTMLElement>();
	const prompt = ref<HTMLTextAreaElement>();
	const conversation = ref<HTMLElement>();
	const sidebar = ref<HTMLElement>();
	const openNav = ref<HTMLButtonElement>();
	const closeNav = ref<HTMLButtonElement>();
	const notes = ref<HTMLDialogElement>();
	const qiguaDate = ref<HTMLInputElement>();
	const qiguaClock = ref<HTMLInputElement>();
	const chartQuestion = ref<HTMLTextAreaElement>();
	const isLiuyao = computed(() => state.type === 'liuyao');
	const form = computed(() => (isLiuyao.value ? state.liuyao : state.birth));
	const isLunar = computed(() => state.birth.calendar === '阴历');
	const activeRoute = computed(() =>
		['form', 'result'].includes(state.view) ? state.type : state.view
	);
	const breadcrumb = computed(() =>
		state.view === 'home'
			? '问问 AI'
			: state.view === 'history'
				? '历史记录'
				: types[state.type].label + (state.view === 'result' ? ' / 命盘示例' : '')
	);
	const sortedRecords = computed(() =>
		[...state.records].sort((a, b) => b.created.localeCompare(a.created) || b.id - a.id)
	);
	const recentRecords = computed(() => sortedRecords.value.slice(0, 2));
	const filteredRecords = computed(() => {
		const query = state.search.trim().toLowerCase();
		const rows = sortedRecords.value.filter(
			(r) =>
				(state.filter === 'all' || r.type === state.filter) &&
				`${r.title} ${r.subtitle} ${r.date} ${r.created}`.toLowerCase().includes(query)
		);
		return state.ascending ? rows.reverse() : rows;
	});
	const validQigua = computed(() => {
		const { date, time } = state.qigua;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
		const parsed = new Date(`${date}T12:00:00Z`);
		return (
			!Number.isNaN(parsed.valueOf()) &&
			parsed.toISOString().slice(0, 10) === date &&
			date >= '1900-01-01' &&
			date <= '2099-12-30'
		);
	});
	const qiguaDateText = computed(() =>
		validQigua.value
			? state.qigua.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1 年 $2 月 $3 日')
			: '请选择完整的日期与时间'
	);
	const qiguaWeekday = computed(() =>
		validQigua.value
			? new Intl.DateTimeFormat('zh-CN', { weekday: 'long', timeZone: 'UTC' }).format(
					new Date(state.qigua.date + 'T12:00:00Z')
				)
			: ''
	);
	const qiguaHint = computed(() =>
		!validQigua.value
			? '请补全有效的日期与时间，也可以点击「恢复现在」。'
			: state.qigua.source === 'now'
				? '默认取当前时间；停留较久可点击「恢复现在」，以此处显示的时间为准。'
				: '已固定为指定时刻；点击「恢复现在」可重新取当前时间。'
	);
	const helpItems = computed(() =>
		isLiuyao.value
			? [
					'一次只围绕一件事提问。',
					'起卦时间默认当前时刻，也可指定时间。',
					'提交后查看固定卦象示例。',
				]
			: [
					'姓名为选填，可以使用昵称。',
					'先确认阳历或阴历，再填写日期。',
					'信息不确定时，可以先与 AI 聊聊。',
				]
	);

	let toastTimer: ReturnType<typeof setTimeout>;
	function toast(message: string) {
		state.toast = message;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			state.toast = '';
		}, 3000);
	}
	function restoreNow(notify = true) {
		state.qigua = currentTime();
		state.qiguaEditing = false;
		if (notify) toast('已恢复为当前时间 · 东八区');
	}
	async function toggleQigua() {
		if (
			state.qiguaEditing &&
			(!qiguaDate.value?.reportValidity() || !qiguaClock.value?.reportValidity())
		)
			return;
		state.qiguaEditing = !state.qiguaEditing;
		if (state.qiguaEditing) {
			await nextTick();
			qiguaDate.value?.focus({ preventScroll: true });
		}
	}
	async function setNavOpen(open: boolean, returnFocus = false) {
		state.navOpen = open;
		await nextTick();
		if (open) closeNav.value?.focus();
		else if (returnFocus) openNav.value?.focus();
	}
	async function navigate(route: string, focus = true) {
		if (route in types) {
			state.type = route as ChartType;
			state.view = 'form';
			if (route === 'liuyao' && state.qigua.source === 'now') restoreNow(false);
		} else state.view = ['home', 'history', 'result'].includes(route) ? route : 'home';
		state.navOpen = false;
		await nextTick();
		window.scrollTo({ top: 0, behavior: 'instant' });
		if (focus) main.value?.focus({ preventScroll: true });
	}
	async function usePrompt(text: string) {
		await navigate('home');
		state.prompt = text;
		await nextTick();
		prompt.value?.focus();
		prompt.value?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}
	async function newChat() {
		state.messages = [];
		state.prompt = '';
		await navigate('home');
		prompt.value?.focus();
	}
	async function sendMessage() {
		const text = state.prompt.trim();
		if (!text) return;
		const target = /历史|记录|回顾|上次/.test(text)
			? 'history'
			: /六爻|合作|具体问题|起卦/.test(text)
				? 'liuyao'
				: /紫微|宫位/.test(text)
					? 'ziwei'
					: 'bazi';
		const label = target === 'history' ? '查看历史记录' : types[target].label;
		const reply =
			target === 'history'
				? '可以从历史记录继续。你可以按排盘类型筛选，或搜索之前的称呼与主题。'
				: target === 'liuyao'
					? '如果你关注的是一件具体的事，可以从六爻问事开始。先把问题写清楚，再填写起卦时间。'
					: target === 'ziwei'
						? '如果你想从不同人生主题理解命盘，可以从紫微斗数开始。我们会先收集出生信息，再查看宫位结构。'
						: '如果你想了解性格与长期的人生节奏，可以先从八字开始；如果是某件具体的事，也可以选择六爻。先准备好出生日期、时间与历法。';
		state.messages.push({ text, target, label, reply });
		state.prompt = '';
		await nextTick();
		conversation.value?.scrollTo({ top: conversation.value.scrollHeight });
	}
	function promptKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			sendMessage();
		}
	}
	function submitChart() {
		const liu = isLiuyao.value,
			b = state.birth;
		const name = form.value.name.trim(),
			question = state.liuyao.question.trim();
		if (liu && !question) {
			chartQuestion.value?.focus();
			return;
		}
		if (liu && !validQigua.value) {
			state.qiguaEditing = true;
			return;
		}
		const date = liu
			? state.qigua.date
			: !isLunar.value
				? b.date
				: `${b.lunarYear}年${b.lunarLeap ? '闰' : ''}${lunarMonths[Number(b.lunarMonth) - 1]}${b.lunarDay}日`;
		state.current = {
			id: state.nextId++,
			type: state.type,
			name,
			gender: liu ? undefined : b.gender,
			question: liu ? question : '',
			calendar: liu ? '阳历' : b.calendar,
			date,
			time: liu ? state.qigua.time : b.time,
			title: liu ? question : (name || '未命名') + '的' + types[state.type].result,
			subtitle: '本次草稿创建 · 固定示例盘面',
			created: currentTime().date,
			saved: false,
		};
		state.resultTab = 'chart';
		navigate('result');
	}
	function openRecord(record: DraftRecord) {
		state.current = { ...record };
		state.type = record.type;
		state.resultTab = 'chart';
		navigate('result');
	}
	async function editChart() {
		const record = state.current;
		if (!record) return;
		// Set the recorded timestamp before navigating: entering the form must not refresh it.
		if (record.type === 'liuyao') {
			state.liuyao.name = record.name;
			state.liuyao.question = record.question || record.title;
			state.qigua = { date: record.date, time: record.time, source: 'manual' };
			state.qiguaEditing = false;
		} else {
			const b = state.birth;
			b.name = record.name;
			b.gender = record.gender || '男';
			b.calendar = record.calendar;
			b.time = record.time;
			if (record.calendar === '阳历') b.date = record.date;
			else {
				const match = record.date.match(/^(\d+)年(闰)?(.+月)(\d+)日$/);
				if (match) {
					b.lunarYear = match[1];
					b.lunarLeap = !!match[2];
					b.lunarMonth = String(lunarMonths.indexOf(match[3]) + 1);
					b.lunarDay = match[4];
				}
			}
		}
		await navigate(record.type);
	}
	function saveChart() {
		const record = state.current;
		if (!record || record.saved) return;
		record.saved = true;
		state.records.push({ ...record });
		toast('已保存到草稿历史，刷新后重置');
	}
	function tabKeydown(event: KeyboardEvent) {
		const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		event.preventDefault();
		const tabs = ['chart', 'insight', 'timeline'];
		const index = tabs.indexOf(state.resultTab);
		state.resultTab =
			tabs[
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? 2
						: (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3
			];
		nextTick(() =>
			main.value?.querySelector<HTMLButtonElement>(`#tab-${state.resultTab}`)?.focus()
		);
	}
	function backdropNotes(event: MouseEvent) {
		if (event.target !== notes.value) return;
		const rect = notes.value.getBoundingClientRect();
		if (event.clientX < rect.left || event.clientX > rect.right) notes.value.close();
	}
	function keydown(event: KeyboardEvent) {
		if (event.altKey && event.key.toLowerCase() === 'n' && !notes.value?.open) {
			event.preventDefault();
			newChat();
		}
		if (!state.navOpen) return;
		if (event.key === 'Escape') setNavOpen(false, true);
		if (event.key === 'Tab') {
			const buttons = sidebar.value?.querySelectorAll<HTMLButtonElement>('button');
			if (!buttons?.length) return;
			const first = buttons[0],
				last = buttons[buttons.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}
	let media: MediaQueryList;
	function resize() {
		state.mobile = media.matches;
		state.navOpen = false;
	}
	watch(
		() => [state.navOpen, state.mobile],
		() => {
			document.body.style.overflow = state.navOpen && state.mobile ? 'hidden' : '';
		}
	);
	watch(
		() => state.palette,
		(value) => {
			try {
				localStorage.setItem('xuan-ui-draft-palette', value);
			} catch {
				/* storage is optional */
			}
		}
	);
	onMounted(() => {
		try {
			const palette = localStorage.getItem('xuan-ui-draft-palette');
			if (palette && ['aurora', 'sunset', 'lake'].includes(palette)) state.palette = palette;
		} catch {
			/* storage is optional */
		}
		media = window.matchMedia('(max-width: 760px)');
		resize();
		media.addEventListener('change', resize);
		document.addEventListener('keydown', keydown);
	});
	onBeforeUnmount(() => {
		clearTimeout(toastTimer);
		media?.removeEventListener('change', resize);
		document.removeEventListener('keydown', keydown);
		document.body.style.overflow = '';
	});
	return {
		state,
		types,
		main,
		prompt,
		conversation,
		sidebar,
		openNav,
		closeNav,
		notes,
		qiguaDate,
		qiguaClock,
		chartQuestion,
		isLiuyao,
		form,
		isLunar,
		activeRoute,
		breadcrumb,
		recentRecords,
		filteredRecords,
		validQigua,
		qiguaDateText,
		qiguaWeekday,
		qiguaHint,
		helpItems,
		lunarMonths,
		toast,
		restoreNow,
		toggleQigua,
		setNavOpen,
		navigate,
		usePrompt,
		newChat,
		sendMessage,
		promptKeydown,
		submitChart,
		openRecord,
		editChart,
		saveChart,
		tabKeydown,
		backdropNotes,
	};
}

export const DraftKey: InjectionKey<ReturnType<typeof createDraft>> = Symbol('ui-draft');
export function useDraft() {
	const context = inject(DraftKey);
	if (!context) throw new Error('Draft components must be inside the draft page.');
	return context;
}
