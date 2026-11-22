// ToDo グループ追加フォーム: 追加後に入力がクリアされ、重複は alert で知らせて追加しないことを確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension, resetStorage} from './extension.js';

test('ToDo グループを追加すると入力がクリアされ、重複は追加しない', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	let promptAnswer = '';
	const alerts = [];
	page.on('dialog', d => {
		if (d.type() === 'prompt') return d.accept(promptAnswer);
		if (d.type() === 'alert') alerts.push(d.message());
		return d.accept();
	});
	await page.goto(`${base}/main.html`);
	await resetStorage(page, {
		type: [{name: '開発'}],
		todo: [
			{type: '開発', title: 'a1', group: 'A'},
			{type: '開発', title: 'b1', group: 'B'},
			{type: '開発', title: 'a2', group: 'A'},
		],
		'todo-group': ['A', 'B'],
		'setting.use-todo-group': true,
	});
	await page.reload();
	await page.waitForTimeout(800);
	// ToDo 側の編集モード（2つ目のタブ）
	await page.getByRole('button', {name: '編集モード'}).nth(1).click();
	const input = page.getByPlaceholder('グループ');
	const addButton = page.getByRole('button', {name: 'グループ追加'});
	const groups = async () => (await page.evaluate(() => chrome.storage.local.get('todo-group')))['todo-group'];

	// 新しいグループは追加され、入力がクリアされる
	await input.fill('C');
	await addButton.click();
	await page.waitForTimeout(300);
	assert.deepEqual(await groups(), ['A', 'B', 'C']);
	assert.equal(await input.inputValue(), '');
	assert.deepEqual(alerts, []);

	// 既存のグループは alert で知らせ、追加せず、入力は残す
	await input.fill('A');
	await addButton.click();
	await page.waitForTimeout(300);
	assert.deepEqual(alerts, ['グループ「A」は既に存在します']);
	assert.deepEqual(await groups(), ['A', 'B', 'C']);
	assert.equal(await input.inputValue(), 'A');

	assert.deepEqual(errors, []);
});
