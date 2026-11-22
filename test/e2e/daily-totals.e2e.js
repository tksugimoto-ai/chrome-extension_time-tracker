// 集計結果の「日ごとの合計」ダイアログで、日ごとの勤務時間とその内訳を確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isoDate, launchExtension, resetStorage} from './extension.js';

test('日ごとの合計で、各日の勤務時間と分類・タイトルごとの内訳を表示する', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	await page.goto(`${base}/main.html`);
	const today0 = new Date(); today0.setHours(0, 0, 0, 0);
	const at = (dayOffset, hour) => new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() + dayOffset, hour).getTime();
	// 3日前: 昼休憩のみ, 一昨日: 開発1h + 会議30m, 昨日: 開発2h + 昼休憩1h (勤務外)
	await resetStorage(page, {
		type: [{name: '開発'}, {name: '会議'}, {name: '昼休憩'}],
		record: [
			{start: at(-3, 1), end: at(-3, 2), type: '昼休憩'},
			{start: at(-2, 1), end: at(-2, 2), type: '開発'},
			{start: at(-2, 2), end: at(-2, 2) + 30 * 60e3, type: '会議'},
			{start: at(-1, 1), end: at(-1, 3), type: '開発', title: 'レビュー'},
			{start: at(-1, 3), end: at(-1, 4), type: '昼休憩'},
		],
	});
	await page.reload();
	const sticky = page.locator('h2:text("集計結果") + .sticky');
	await sticky.locator('input[type=date]').nth(0).fill(isoDate(at(-5, 0)));
	const dialog = page.locator('dialog[open]');
	const openDailyTotals = async () => {
		await sticky.getByRole('button', {name: '日ごとの合計'}).click();
		await dialog.waitFor();
		return (await dialog.locator(':scope ol > li').allInnerTexts()).map(text => text.split('\n'));
	};

	// 勤務外だけの日は出ず、各日の下に分類ごと (長い順)
	const days = await openDailyTotals();
	assert.equal(await dialog.locator('h3').textContent(), '日ごとの勤務時間');
	assert.equal(await dialog.locator('p').textContent(), '合計: 3時間30分00秒');
	assert.equal(days.length, 2, days.join('\n'));
	assert.match(days[0][0], /: 1時間30分00秒$/);
	assert.deepEqual(days[0].slice(1), ['開発: 1時間00分00秒', '会議: 30分00秒']);
	assert.match(days[1][0], /: 2時間00分00秒$/);
	assert.deepEqual(days[1].slice(1), ['開発: 2時間00分00秒']);
	await dialog.getByRole('button', {name: '閉じる'}).click();

	// 同一タイトルで集約のときは、分類の下にタイトルごと
	await page.getByLabel('同一タイトルで集約').check();
	const aggregated = await openDailyTotals();
	assert.deepEqual(aggregated[0].slice(1), ['開発: 1時間00分00秒', '(タイトルなし): 1時間00分00秒', '会議: 30分00秒', '(タイトルなし): 30分00秒']);
	assert.deepEqual(aggregated[1].slice(1), ['開発: 2時間00分00秒', 'レビュー: 2時間00分00秒']);
	assert.deepEqual(errors, []);
});
