// 「現在」の終了・一つ前を再開ボタンと、そのアクセスキー (Q / R) の確認
//   - アクセスキーが設定されている（Playwright のキー入力ではアクセスキーが発火しないため、属性で確かめてクリックで操作する）
//   - 終了で計測中の記録を終了する。停止中は終了ボタンが押せない
//   - 停止中は最後の記録を、計測中は一つ前の記録を再開する（分類・タイトル・メモを引き継ぐ）
//   - 分類のアクセスキーに Q・R は使えない
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension, resetStorage} from './extension.js';
import {recordKeyOf as monthKey} from '../../chrome-extension/record-storage.js';

test('終了・一つ前を再開をアクセスキーで操作できる', async () => {
	const {ctx, base, errors} = await launchExtension();

	const now = Date.now();
	const today0 = new Date(); today0.setHours(0, 0, 0, 0);
	const t0 = Math.max(today0.getTime(), now - 3 * 3600e3);
	const a = {start: t0, end: t0 + 600e3, type: 'A作業', title: 'A', memo: 'Aメモ'};
	const b = {start: t0 + 600e3, type: 'B作業', title: 'B'};

	const page = await ctx.newPage();
	await page.goto(`${base}/main.html`);
	await resetStorage(page, {
		type: [{name: 'A作業'}, {name: 'B作業'}],
		todo: [],
		[monthKey(a.start)]: [a, b],
	});
	await page.reload();
	const stop = page.getByRole('button', {name: '終了 (Q)'});
	const resume = page.getByRole('button', {name: '一つ前を再開 (R)'});
	await stop.waitFor();
	assert.equal(await stop.getAttribute('accesskey'), 'Q');
	assert.equal(await resume.getAttribute('accesskey'), 'R');
	const records = async () => {
		await page.waitForTimeout(1500); // 保存を待つ
		return (await page.evaluate(() => chrome.storage.local.get(null)))[monthKey(a.start)];
	};
	const plain = ({type, title, memo, end}) => ({type, title, memo, running: !end});

	// 計測中 (B) に再開 → 一つ前 (A) を再開
	await resume.click();
	let list = await records();
	assert.deepEqual(list.map(plain), [
		{type: 'A作業', title: 'A', memo: 'Aメモ', running: false},
		{type: 'B作業', title: 'B', memo: undefined, running: false},
		{type: 'A作業', title: 'A', memo: 'Aメモ', running: true},
	]);

	// 終了。停止中は終了ボタンが押せない
	await stop.click();
	list = await records();
	assert.equal(list.length, 3);
	assert.ok(list[2].end, '終了している');
	assert.equal(await stop.isDisabled(), true);

	// 停止中に再開 → 最後の記録 (A) を再開
	await resume.click();
	list = await records();
	assert.deepEqual(list.slice(3).map(plain), [{type: 'A作業', title: 'A', memo: 'Aメモ', running: true}]);
	assert.equal(await stop.isDisabled(), false);

	// 分類のアクセスキーに Q・R は使えない（入力すると不正になる）
	await page.getByRole('button', {name: '編集モード'}).first().click();
	const keyInput = page.getByPlaceholder('アクセスキーなし').first();
	for (const key of ['q', 'Q', 'r', 'R']) {
		await keyInput.fill(key);
		assert.equal(await keyInput.evaluate(e => e.validity.patternMismatch), true, key);
	}

	assert.deepEqual(errors, []);
});
