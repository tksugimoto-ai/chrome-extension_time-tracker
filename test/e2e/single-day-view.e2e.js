// 集計結果の「今日」「前日」「翌日」ボタンで 1 日だけを表示できることを確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isoDate, launchExtension, resetStorage} from './extension.js';

test('集計結果で 1 日だけを表示できる', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	await page.goto(`${base}/main.html`);
	const now = new Date();
	const at = (dayOffset, hour) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour).getTime();
	// 一昨日: 1時間, 昨日: 2時間, 今日: 3時間 (終了済み)
	const records = [
		{start: at(-2, 1), end: at(-2, 2), type: '開発', title: '一昨日'},
		{start: at(-1, 1), end: at(-1, 3), type: '開発', title: '昨日'},
		{start: at(0, 0) + 1000, end: at(0, 3) + 1000, type: '開発', title: '今日'},
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
	const check = async (label, dayOffset, hours) => {
		const t = await total();
		assert.equal(await startInput.inputValue(), isoDate(at(dayOffset, 0)), label);
		assert.equal(await endInput.inputValue(), isoDate(at(dayOffset, 0)), label);
		assert.match(t, new RegExp(`^${hours}時間00分00秒$`), label);
	};
	const click = name => sticky.locator(`button:text-is("${name}")`).click();

	await click('前日'); await check('前日', -1, 2);
	await click('前日'); await check('前々日', -2, 1);
	await click('翌日'); await check('翌日', -1, 2);
	await click('今日'); await check('今日', 0, 3);
	// 先月ボタンのあとでも、前日は開始日 (先月1日) の前日になる
	await click('先月');
	await click('前日');
	const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	assert.equal(await startInput.inputValue(), isoDate(new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth(), 0)));
	assert.equal(await endInput.inputValue(), await startInput.inputValue());
	// 手入力した日付から翌日
	await startInput.fill(isoDate(at(-2, 0)));
	await click('翌日'); await check('手入力の翌日', -1, 2);
	assert.deepEqual(errors, []);
});
