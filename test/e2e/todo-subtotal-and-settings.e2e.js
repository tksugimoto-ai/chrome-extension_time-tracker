// ToDo の日別内訳ダイアログと、設定のチェックボックスの切り替えを確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension, resetStorage} from './extension.js';

test('ToDo の合計時間を押すと、日別内訳を表示する', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	await page.goto(`${base}/main.html`);
	const today0 = new Date(); today0.setHours(0, 0, 0, 0);
	const at = (dayOffset, hour) => today0.getTime() + dayOffset * 864e5 + hour * 3600e3;
	await resetStorage(page, {
		type: [{name: '開発'}],
		todo: [{type: '開発', title: 'レビュー'}],
		record: [
			{start: at(-2, 9), end: at(-2, 10), type: '開発', title: 'レビュー'},
			{start: at(-1, 9), end: at(-1, 11), type: '開発', title: 'レビュー'},
			{start: at(-1, 13), end: at(-1, 14), type: '開発', title: '別の作業'},
		],
	});
	await page.reload();
	await page.getByTitle('クリックで日別内訳を表示').click();
	const dialog = page.locator('dialog[open]');
	await dialog.waitFor();
	assert.equal(await dialog.locator('h3').textContent(), '開発(レビュー)');
	assert.equal(await dialog.locator('p').textContent(), '合計: 3時間00分00秒');
	const days = await dialog.locator('ol li').allTextContents();
	assert.equal(days.length, 2, days.join('\n'));
	assert.match(days[0], /: 1時間00分00秒$/);
	assert.match(days[1], /: 2時間00分00秒$/);
	assert.deepEqual(errors, []);
});

test('設定のチェックボックスを切り替えると保存され、開き直しても残る', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	await page.goto(`${base}/main.html`);
	await resetStorage(page, {
		type: [{name: '開発'}],
		todo: [{type: '開発', title: 'レビュー', group: 'A'}],
		'todo-group': ['A'],
		record: [{start: Date.now() - 3600e3, end: Date.now() - 1800e3, type: '開発', title: 'レビュー'}],
	});
	await page.reload();
	const checkbox = label => page.getByLabel(label);
	const settings = () => page.evaluate(() => chrome.storage.local.get(null).then(items => Object.fromEntries(Object.entries(items).filter(([key]) => key.startsWith('setting.')))));
	const labels = {
		'clipboard-to-todo': 'クリップボードを貼り付けでToDoを入力する',
		'use-todo-group': 'グループで管理する',
		'use-todo-deadline': '期限を管理する',
		'use-todo-estimation': '見積もりを管理する',
		'detail-visible': '詳細を表示する',
		'aggregation-visible': '同一タイトルで集約',
	};
	// 詳細を表示しないあいだは「タイトル・メモが存在しないものは省略」を選べない
	assert.equal(await checkbox('タイトル・メモが存在しないものは省略').isDisabled(), true);
	for (const label of Object.values(labels)) {
		assert.equal(await checkbox(label).isChecked(), false, label);
		await checkbox(label).check();
	}
	assert.equal(await checkbox('タイトル・メモが存在しないものは省略').isDisabled(), false);
	// 既定でオンのもの
	assert.equal(await checkbox('タイトル・メモが存在しないものは省略').isChecked(), true);
	await checkbox('タイトル・メモが存在しないものは省略').uncheck();
	await page.waitForTimeout(300);
	assert.deepEqual(await settings(), {
		...Object.fromEntries(Object.keys(labels).map(key => [`setting.${key}`, true])),
		'setting.no-title_or_memo': false,
	});
	// 設定が画面に効いている（グループの見出しが出る）
	assert.equal(await page.locator('h3', {hasText: 'A'}).count(), 1);

	await page.reload();
	await page.getByText('履歴総数: 1').waitFor();
	for (const label of Object.values(labels)) {
		assert.equal(await checkbox(label).isChecked(), true, label);
	}
	assert.equal(await checkbox('タイトル・メモが存在しないものは省略').isChecked(), false);
	assert.deepEqual(errors, []);
});
