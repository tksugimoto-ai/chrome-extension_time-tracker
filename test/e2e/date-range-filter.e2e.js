// 集計結果を期間 (開始日～終了日、今月・先月ボタン) で絞れることを確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isoDate, launchExtension, resetStorage} from './extension.js';

test('集計結果を期間で絞り込める', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	await page.goto(`${base}/main.html`);
	const now = new Date();
	const at = (monthOffset, day, hour) => new Date(now.getFullYear(), now.getMonth() + monthOffset, day, hour).getTime();
	// 2か月前: 1時間, 先月1日: 2時間, 先月末日: 3時間, 今月1日: 4時間
	const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
	const records = [
		{start: at(-2, 10, 9), end: at(-2, 10, 10), type: '開発', title: '2か月前'},
		{start: at(-1, 1, 9), end: at(-1, 1, 11), type: '開発', title: '先月初日'},
		{start: at(-1, lastMonthEnd, 9), end: at(-1, lastMonthEnd, 12), type: '開発', title: '先月末日'},
		{start: at(0, 1, 9), end: at(0, 1, 13), type: '開発', title: '今月初日'},
	];
	await resetStorage(page, {
		type: [{name: '開発'}],
		record: records,
	});
	await page.reload();
	await page.waitForTimeout(800);
	const total = () => page.evaluate(() => document.body.innerText.match(/勤務時間Total: (\S+)/)[1]);
	const sticky = page.locator('h2:text("集計結果") + .sticky');
	const [startInput, endInput] = [sticky.locator('input[type=date]').nth(0), sticky.locator('input[type=date]').nth(1)];

	// 既定: 今日以降、終了日なし
	assert.equal(await endInput.inputValue(), '');

	await sticky.locator('button:text("先月")').click();
	assert.equal(await startInput.inputValue(), isoDate(at(-1, 1, 0)));
	assert.equal(await endInput.inputValue(), isoDate(at(-1, lastMonthEnd, 0)));
	const lastMonthText = await total();
	let body = await page.evaluate(() => document.body.innerText);
	assert.match(lastMonthText, /^5時間00分00秒$/); // 2h + 3h
	assert.ok(!body.split('集計結果')[1].includes('今月初日'));

	await sticky.locator('button:text("今月")').click();
	assert.equal(await startInput.inputValue(), isoDate(at(0, 1, 0)));
	assert.match(await total(), /^4時間00分00秒$/);

	// 終了日を空にすると上限なし (開始日以降すべて)
	await sticky.locator('button:text("先月")').click();
	await endInput.fill('');
	assert.match(await total(), /^9時間00分00秒$/);

	// 終了日を手で入力 (先月1日だけ)
	await endInput.fill(isoDate(at(-1, 1, 0)));
	assert.match(await total(), /^2時間00分00秒$/);

	// 年の欄に5桁以上打っても落ちない (読めない日付は無視して直前の期間のまま)
	await endInput.click();
	await page.keyboard.press('Home');
	await page.keyboard.type('20261');
	await startInput.click();
	await page.keyboard.press('Home');
	await page.keyboard.type('20261015');
	await page.waitForTimeout(300);
	assert.ok(await page.locator('h2:text("集計結果")').isVisible());
	assert.match(await total(), /^2時間00分00秒$/);

	assert.deepEqual(errors, []);
});
