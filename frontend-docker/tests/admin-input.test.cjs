const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement']) global[key] = dom.window[key];
const { createApp, nextTick } = require('vue');
const src = path.resolve(__dirname, '../../backend-docker/admin-ui/src');
const componentPath = path.join(src, 'components/yx-admin-input/yx-admin-input.vue');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(src, request.slice(2)) : request, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
require.extensions['.vue'] = (module, filename) => {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  descriptor.template.content = descriptor.template.content.replace(/(<\/?)(view|text|button)(?=[\s>])/g, '$1uni-$2');
  descriptor.template.ast = undefined;
  const compiled = compileScript(descriptor, { id: 'admin-input', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => tag.startsWith('uni-') } } });
  module._compile(ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
};
async function mount(props = {}) {
  assert.ok(fs.existsSync(componentPath), 'the redesigned admin input component exists');
  global.uni = { upx2px: value => value / 2 };
  const calls = { model: [], input: [], clear: [], confirm: [], focus: [], blur: [] };
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp(require(componentPath).default, {
    ...props,
    'onUpdate:modelValue': value => calls.model.push(value),
    onInput: value => calls.input.push(value), onClear: () => calls.clear.push(true),
    onConfirm: value => calls.confirm.push(value), onFocus: () => calls.focus.push(true), onBlur: () => calls.blur.push(true),
  });
  app.mount(host); await nextTick();
  return { host, calls, dispose() { app.unmount(); host.remove(); } };
}
async function input(el, value) {
  el.value = value;
  const event = new dom.window.Event('input', { bubbles: true });
  Object.defineProperty(event, 'detail', { value: { value } });
  el.dispatchEvent(event); await nextTick();
}
async function press(el, key = 'Enter') {
  assert.ok(el, 'the control exists');
  for (const type of ['keydown', 'keyup']) el.dispatchEvent(new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  await nextTick();
}
test('text input keeps model updates and old input(value) events compatible', async () => {
  const page = await mount({ modelValue: 'before', label: '配置名称', required: true });
  try {
    const field = page.host.querySelector('input');
    assert.equal(field.value, 'before'); assert.equal(field.getAttribute('aria-label'), '配置名称');
    assert.ok(page.host.querySelector('.admin-input-label').textContent.includes('配置名称'));
    assert.equal(field.getAttribute('aria-required'), 'true');
    await input(field, 'after');
    assert.deepEqual(page.calls.model, ['after']); assert.deepEqual(page.calls.input, ['after']);
    assert.equal(page.host.querySelector('input').value, 'after');
  } finally { page.dispose(); }
});
test('number modifier converts only the model value and preserves empty values', async () => {
  const page = await mount({ type: 'number', modelModifiers: { number: true } });
  try {
    await input(page.host.querySelector('input'), '25'); await input(page.host.querySelector('input'), '');
    assert.deepEqual(page.calls.model, [25, '']); assert.deepEqual(page.calls.input, ['25', '']);
  } finally { page.dispose(); }
});
test('textarea is a real multiline field and honors text limits including zero', async () => {
  const page = await mount({ type: 'textarea', modelValue: 'line one\nline two', height: 88, maxlength: 12, monospace: true });
  try {
    const field = page.host.querySelector('textarea'); assert.ok(field); assert.equal(page.host.querySelector('input'), null);
    assert.equal(field.value, 'line one\nline two'); assert.equal(field.maxLength, 12);
    assert.ok(parseFloat(field.style.height) >= 140); assert.ok(page.host.querySelector('.is-monospace'));
    await input(field, 'abcdefghijklmno'); assert.equal(page.calls.model.at(-1), 'abcdefghijkl');
  } finally { page.dispose(); }
  const zero = await mount({ maxlength: 0 });
  try { await input(zero.host.querySelector('input'), 'x'); assert.equal(zero.calls.model.at(-1), ''); assert.equal(zero.host.querySelector('input').maxLength, 0); }
  finally { zero.dispose(); }
});
test('disabled and readonly inputs cannot change or clear values', async () => {
  for (const mode of ['disabled', 'readonly']) {
    const page = await mount({ [mode]: true, modelValue: 'protected', clearable: true, type: 'password' });
    try {
      assert.equal(page.host.querySelector('input')[mode === 'readonly' ? 'readOnly' : 'disabled'], true);
      await input(page.host.querySelector('input'), 'replacement');
      assert.deepEqual(page.calls.model, []); assert.deepEqual(page.calls.input, []);
      assert.equal(page.host.querySelector('[aria-label="清空输入"]'), null);
      if (mode === 'disabled') { await press(page.host.querySelector('[aria-label="显示密码"]')); assert.equal(page.host.querySelector('input').type, 'password'); }
    } finally { page.dispose(); }
  }
});
test('keyboard clear updates model, input listeners and clear event once', async () => {
  const page = await mount({ modelValue: 'search', clearable: true });
  try {
    await press(page.host.querySelector('[aria-label="清空输入"]'), ' ');
    assert.deepEqual(page.calls.model, ['']); assert.deepEqual(page.calls.input, ['']); assert.equal(page.calls.clear.length, 1);
    assert.equal(page.host.querySelector('input').value, '');
  } finally { page.dispose(); }
});
test('both password APIs hide by default and can be toggled from the keyboard', async () => {
  for (const props of [{ type: 'password' }, { password: true }]) {
    const page = await mount({ ...props, modelValue: 'secret' });
    try {
      assert.equal(page.host.querySelector('input').type, 'password');
      await press(page.host.querySelector('[aria-label="显示密码"]'));
      assert.equal(page.host.querySelector('input').type, 'text');
      await press(page.host.querySelector('[aria-label="隐藏密码"]'));
      assert.equal(page.host.querySelector('input').type, 'password'); assert.deepEqual(page.calls.model, []);
    } finally { page.dispose(); }
  }
});
test('focus, blur and confirm preserve the original event contracts', async () => {
  const page = await mount({ modelValue: 'query' });
  try {
    const field = page.host.querySelector('input');
    field.dispatchEvent(new dom.window.Event('focus')); field.dispatchEvent(new dom.window.Event('blur'));
    field.dispatchEvent(new dom.window.Event('confirm')); await nextTick();
    assert.equal(page.calls.focus.length, 1); assert.equal(page.calls.blur.length, 1); assert.deepEqual(page.calls.confirm, ['query']);
  } finally { page.dispose(); }
});
test('legacy presentation props do not leak onto native inputs and empty labels remain absent', async () => {
  const page = await mount({ margin: [0, 0], padding: [24, 24], round: 999, fontSize: 28, border: 1, showConfirmBar: true });
  try {
    assert.equal(page.host.querySelector('.admin-input-label'), null);
    const field = page.host.querySelector('input');
    for (const attr of ['margin', 'padding', 'round', 'font-size', 'fontsize', 'border', 'showconfirmbar']) assert.equal(field.hasAttribute(attr), false, attr);
    assert.equal(field.getAttribute('maxlength'), '-1', 'explicit -1 disables uni-app default character limit');
  } finally { page.dispose(); }
});

test('textarea height accepts taller rpx values without shrinking multiline fields', async () => {
  const page = await mount({ type: 'textarea', height: 600 });
  try { assert.equal(page.host.querySelector('textarea').style.height, '300px'); }
  finally { page.dispose(); }
});

test('compact labeled fields keep accessible names and display a noneditable suffix', async () => {
  const page = await mount({ label: '天', hideLabel: true, suffixLabel: '天', type: 'number', modelValue: 3 });
  try {
    assert.equal(page.host.querySelector('.admin-input-label'), null);
    assert.equal(page.host.querySelector('input').getAttribute('aria-label'), '天');
    assert.equal(page.host.querySelector('.admin-input-suffix').textContent, '天');
    assert.equal(page.host.querySelectorAll('input').length, 1);
    await input(page.host.querySelector('input'), '12');
    assert.deepEqual(page.calls.model, ['12']);
  } finally { page.dispose(); }
});
