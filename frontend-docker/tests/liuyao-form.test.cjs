const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { resetPlatform } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');
const { nextTick } = require('vue');
const { useLiuyaoForm } = require('../src/features/liuyao/useLiuyaoForm.ts');
const { useLiuyaoStore } = require('../src/store/liuyao.ts');
const { useBaziStore } = require('../src/store/bazi.ts');
const { formatDateTime } = require('../src/features/liuyao/uiHelpers.ts');

let platform;
beforeEach(() => {
	platform = resetPlatform();
	global.uni.showModal = (value) => platform.toasts.push(value);
	setActivePinia(createPinia());
});

test('casting opens with a current snapshot and the picker reopens at the selected time', () => {
	const form = useLiuyaoForm();
	assert.equal(form.form.value.timeLabel, formatDateTime(new Date()));
	form.onTimeConfirm('2021/06/15 08:42');
	assert.equal(form.form.value.timeLabel, '2021-06-15 08:42');
	assert.equal(form.timeSource.value, 'manual');
	form.openTimePicker();
	assert.equal(form.timePickerDefault.value, '2021/06/15 08:42');
	form.useNowTime();
	assert.equal(form.form.value.timeLabel, formatDateTime(new Date()));
	assert.equal(form.timeSource.value, 'now');
});

test('picker accepts timestamp and event values and rejects invalid or rolled-over dates', () => {
	const form = useLiuyaoForm();
	form.onTimeConfirm(new Date(2020, 5, 15, 8, 42).getTime());
	assert.equal(form.form.value.timeLabel, '2020-06-15 08:42');
	form.onTimeConfirm({ detail: { value: '2022/07/16 09:43' } });
	assert.equal(form.form.value.timeLabel, '2022-07-16 09:43');
	form.onTimeConfirm('2022/02/31 09:43');
	assert.equal(form.form.value.timeLabel, '2022-07-16 09:43');
	form.form.value.timeLabel = 'invalid';
	form.form.value.title = '时间校验';
	form.generateAuto();
	assert.equal(form.canStart.value, false);
	form.startLiuyao();
	assert.equal(platform.routes.length, 0);
});

test('selected casting time reaches the real chart engine independently of birth time', () => {
	const birth = new Date(1990, 0, 2, 3, 4).getTime();
	useBaziStore().pull({ realname: '出生信息', gender: 0, timestamp: birth });
	const form = useLiuyaoForm();
	form.onTimeConfirm('2021/06/15 08:42');
	form.form.value.title = '这次合作如何推进';
	form.generateAuto();
	form.startLiuyao();
	assert.equal(useLiuyaoStore().castingAt, new Date(2021, 5, 15, 8, 42).getTime());
	assert.equal(useLiuyaoStore().profile.timeLabel, '2021-06-15 08:42');
	assert.equal(useBaziStore().input.timestamp, birth);
	assert.equal(platform.routes.at(-1), '/pages/liuyao/result');
});

test('changing casting time invalidates generated time parameters', async () => {
	const form = useLiuyaoForm();
	form.setMethod(3);
	await nextTick();
	form.form.value.title = '时间起卦';
	form.generateTime();
	assert.equal(form.canStart.value, true);
	form.onTimeConfirm('2021/06/15 08:42');
	await nextTick();
	assert.deepEqual([...form.form.value.timeParams], []);
	assert.equal(form.canStart.value, false);
});

test('a previous result cannot complete another method and manual yin zero is valid', async () => {
	const form = useLiuyaoForm();
	form.form.value.title = '方法切换';
	form.generateAuto();
	form.startLiuyao();
	form.setMethod(2);
	await nextTick();
	assert.equal(form.canStart.value, false);
	form.form.value.manualParams = [0, 0, 0, 0, 0, 0];
	assert.equal(form.canStart.value, true);
});

test('reset leaves every method ready to use and restores a fresh current snapshot', async () => {
	const form = useLiuyaoForm();
	form.onGuaBianChange({ detail: { value: 2 } });
	await nextTick();
	form.resetForm();
	await nextTick();
	for (const key of [
		'autoParams',
		'timeParams',
		'singleParams',
		'doubleParams',
		'charsParams',
		'guaParams',
	]) {
		assert.deepEqual([...form.form.value[key]], []);
	}
	assert.equal(form.form.value.manualParams.length, 6);
	assert.equal(form.form.value.timeLabel, formatDateTime(new Date()));
	assert.equal(form.form.value.guaMain, form.guaMarks[0].value);
	assert.equal(form.form.value.guaBian, '');
	assert.equal(form.guaBianLabel.value, '');
});

test('editing method inputs invalidates the old preview before another chart can start', async () => {
	const cases = [
		{
			index: 4,
			fill: (f) => {
				f.form.value.singleInput = '2652';
			},
			generate: (f) => f.generateSingle(),
			edit: (f) => {
				f.form.value.singleInput = '12';
			},
		},
		{
			index: 5,
			fill: (f) => {
				f.form.value.double1 = '26';
				f.form.value.double2 = '52';
			},
			generate: (f) => f.generateDouble(),
			edit: (f) => {
				f.form.value.double2 = '13';
			},
		},
		{
			index: 6,
			fill: (f) => {
				f.form.value.charsInput = '合作';
			},
			generate: (f) => f.generateChars(),
			edit: (f) => {
				f.form.value.charsInput = '工作';
			},
		},
		{
			index: 7,
			fill: () => {},
			generate: (f) => f.generateGua(),
			edit: (f) => f.onGuaMainChange({ detail: { value: 3 } }),
		},
	];
	for (const item of cases) {
		const form = useLiuyaoForm();
		form.setMethod(item.index);
		await nextTick();
		form.form.value.title = '修改后重新生成';
		item.fill(form);
		await nextTick();
		item.generate(form);
		assert.equal(form.canStart.value, true);
		item.edit(form);
		await nextTick();
		assert.equal(form.canStart.value, false, form.currentMethod.value.text);
	}
});

test('all eight displayed methods generate a six-line real chart from their own input', async () => {
	for (let index = 0; index < 8; index++) {
		setActivePinia(createPinia());
		const form = useLiuyaoForm();
		form.setMethod(index);
		await nextTick();
		form.form.value.title = `方法 ${index + 1}`;
		form.onTimeConfirm('2021/06/15 08:42');
		if (index === 0) form.generateAuto();
		if (index === 1) for (let i = 0; i < 6; i++) form.startOnlineShake();
		if (index === 2) form.form.value.manualParams = ['0', '1', '3', '4', '0', '1'];
		if (index === 3) form.generateTime();
		if (index === 4) {
			form.form.value.singleInput = '2652';
			form.generateSingle();
		}
		if (index === 5) {
			form.form.value.double1 = '26';
			form.form.value.double2 = '52';
			form.generateDouble();
		}
		if (index === 6) {
			form.form.value.charsInput = '合作';
			form.generateChars();
		}
		if (index === 7) form.generateGua();
		assert.equal(form.canStart.value, true, form.currentMethod.value.text);
		form.startLiuyao();
		assert.equal(useLiuyaoStore().compiled.params.length, 6, form.currentMethod.value.text);
		assert.equal(useLiuyaoStore().profile.method, form.currentMethod.value.text);
		assert.equal(useLiuyaoStore().profile.timeLabel, '2021-06-15 08:42');
	}
});
