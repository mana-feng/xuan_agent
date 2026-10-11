const test = require('node:test');
const assert = require('node:assert/strict');
const { resetPlatform, loadPage } = require('./helpers/load-source.cjs');
const { createPinia, setActivePinia } = require('pinia');

for (const password of ['Sample<"Password>42', '  Sample password 42  ', 'Sample_password_42']) {
	test(`login preserves ${password.includes('<') ? 'punctuation' : password.startsWith(' ') ? 'boundary whitespace' : 'ordinary characters'} in the submitted credential`, async () => {
		const platform = resetPlatform();
		global.uni.getSystemInfoSync = () => ({ windowHeight: 800, statusBarHeight: 20 });
		setActivePinia(createPinia());
		const page = loadPage('pages/auth/auth.nvue', ['loginIdentifier', 'loginPassword', 'submitLogin']);
		page.loginIdentifier.value = 'test_user';
		page.loginPassword.value = password;
		await page.submitLogin();
		assert.equal(platform.requests.length, 1);
		assert.equal(platform.requests[0].url, '/api/auth/login');
		assert.equal(platform.requests[0].data.password, password, 'send the same credential accepted during registration');
		assert.equal(platform.requests[0].sanitizeData, false);
	});
}

test('registration sends the code with the account request so verification and creation are atomic', async () => {
	const platform = resetPlatform();
	global.uni.getSystemInfoSync = () => ({ windowHeight: 800, statusBarHeight: 20 });
	setActivePinia(createPinia());
	const page = loadPage('pages/auth/auth.nvue', ['registerUsername', 'registerEmail', 'registerPassword', 'registerPasswordConfirm', 'registerVerificationCode', 'submitRegister']);
	page.registerUsername.value = 'test_user';
	page.registerEmail.value = 'test@example.com';
	page.registerPassword.value = '  Sample<"Password>42  ';
	page.registerPasswordConfirm.value = page.registerPassword.value;
	page.registerVerificationCode.value = '123456';
	await page.submitRegister();
	assert.equal(platform.requests.length, 1, 'do not consume the code in a separate request before registration');
	assert.equal(platform.requests[0].url, '/api/auth/register');
	assert.equal(platform.requests[0].data.verification_code, '123456');
	assert.equal(platform.requests[0].data.password, page.registerPassword.value);
	assert.equal(platform.requests[0].sanitizeData, false);
});
