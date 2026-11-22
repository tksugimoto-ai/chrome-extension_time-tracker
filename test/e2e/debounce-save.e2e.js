// 実データ規模 (記録4,417件・ToDo 544件・217日) で、タイトル入力中は書き込まず、止まったときと閉じたときに保存されることを確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension, readRecords} from './extension.js';

test('入力中は保存せず、入力が止まるか閉じたときに保存する', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	page.on('dialog', d => d.accept());
	await page.goto(`${base}/main.html`);
	await page.evaluate(() => {
		const types = ['開発', 'ミーティング', 'レビュー', 'メールチェック', '昼休憩'];
		const todo = Array.from({length: 544}, (_, i) => ({type: types[i % 4], title: `ToDo タイトル ${i} ${'長めのタイトルの例'.repeat(4)}`, memo: i % 3 ? '' : `https://example.com/issues/${i}`}));
		const record = [];
		const day0 = new Date(); day0.setHours(0, 0, 0, 0);
		const days = 217;
		for (let i = 0; i < 4417; i++) {
			const d = days - Math.floor(i * days / 4417); // 古い順
			const start = day0.getTime() - d * 864e5 + 9 * 3600e3 + (i % 20) * 1200e3;
			const t = todo[i % todo.length];
			record.push({start, end: start + 1000e3, type: t.type, title: t.title, ...(i % 5 ? {} : {memo: 'メモの例'.repeat(10)})});
		}
		record.push({start: Date.now() - 60e3, type: '開発', title: ''}); // 現在の記録
		return chrome.storage.local.clear().then(() => chrome.storage.local.set({type: types.map(name => ({name})), todo, record}));
	});
	await page.reload();
	// 開いたときの、月ごとのキーへの移行の書き込みが終わるのを待つ
	await page.waitForFunction(() => chrome.storage.local.get('record').then(items => !('record' in items)));
	await page.waitForTimeout(500);

	// 別ページで書き込みを数える
	const watcher = await ctx.newPage();
	await watcher.goto(`${base}/export.html`);
	await watcher.evaluate(() => {
		window.changes = [];
		chrome.storage.onChanged.addListener(changes => {
			window.changes.push(Object.keys(changes));
		});
	});
	const changes = () => watcher.evaluate(() => window.changes);
	await page.bringToFront();

	const title = page.getByPlaceholder('タイトル').first();
	const text = 'デバウンス保存の確認用タイトル';
	// 計測中の記録の行は経過時間が毎秒変わって位置がずれ、click() は stable を待ち続けるので focus() にする
	await title.focus();
	await title.pressSequentially(text, {delay: 50});
	await page.waitForTimeout(300);
	assert.deepEqual(await changes(), [], '入力中に書き込んでいる');
	await page.waitForTimeout(1500);
	assert.equal((await changes()).length, 1, '入力が止まった後に 1 回だけ書き込む');

	const runningTitles = async page => (await readRecords(page)).filter(r => !r.end).map(r => r.title);
	assert.deepEqual(await runningTitles(page), [text]);

	// 入力してすぐ閉じても保存される
	await title.pressSequentially('X', {delay: 0});
	await page.close({runBeforeUnload: true});
	await watcher.waitForTimeout(500);
	assert.deepEqual(await runningTitles(watcher), [text + 'X']);

	// ToDo のタイトルも
	const page2 = await ctx.newPage();
	await page2.goto(`${base}/main.html`);
	await page2.waitForTimeout(2000);
	await watcher.evaluate(() => { window.changes = []; });
	await page2.getByRole('button', {name: '編集モード'}).nth(1).click();
	const todoTitle = page2.locator('input[placeholder="タイトル"][value^="ToDo タイトル 0 "]');
	const todoTitle0 = await todoTitle.inputValue();
	await todoTitle.click();
	await todoTitle.press('End');
	await todoTitle.pressSequentially('abc', {delay: 50});
	await page2.waitForTimeout(200);
	assert.deepEqual(await changes(), [], 'ToDo の入力中に書き込んでいる');
	await page2.waitForTimeout(1500);
	assert.deepEqual(await changes(), [['todo']]);
	const todo = (await watcher.evaluate(() => chrome.storage.local.get('todo'))).todo;
	assert.equal(todo[0].title, todoTitle0 + 'abc');
	assert.deepEqual(errors, []);
});
