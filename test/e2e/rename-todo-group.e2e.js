// ToDo のグループ名を変更すると、グループ一覧と ToDo の group が書き換わることを確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension, resetStorage} from './extension.js';

test('ToDo グループの名前を変更できる', async () => {
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
	const renameButtonOf = name => page.locator('h3', {hasText: name}).getByRole('button', {name: '名前変更'});
	const storage = () => page.evaluate(() => chrome.storage.local.get(['todo', 'todo-group']));

	// 既存の名前には変えられない
	promptAnswer = 'B';
	await renameButtonOf('A').click();
	await page.waitForTimeout(300);
	assert.deepEqual(alerts, ['グループ「B」は既に存在します']);
	assert.deepEqual((await storage())['todo-group'], ['A', 'B']);

	// キャンセル (空) では何もしない
	promptAnswer = '';
	await renameButtonOf('A').click();
	await page.waitForTimeout(300);
	assert.deepEqual((await storage())['todo-group'], ['A', 'B']);

	// 名前変更
	promptAnswer = 'C';
	await renameButtonOf('A').click();
	await page.waitForTimeout(500);
	let s = await storage();
	assert.deepEqual(s['todo-group'], ['C', 'B']);
	assert.deepEqual(s.todo.map(t => [t.title, t.group]), [['a1', 'C'], ['b1', 'B'], ['a2', 'C']]);
	const headings = await page.locator('h3').allInnerTexts();
	assert.ok(headings[0].startsWith('C'), headings.join('|'));

	// 再読み込み後も C の下に a1・a2 がある
	await page.reload();
	await page.waitForTimeout(800);
	const body = await page.evaluate(() => document.body.innerText);
	const cPos = body.indexOf('\nC');
	assert.ok(cPos >= 0 && body.indexOf('a1', cPos) > cPos && body.indexOf('a2', cPos) > cPos, body);

	assert.deepEqual(errors, []);
});
