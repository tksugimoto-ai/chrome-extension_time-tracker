// 分類の編集モードの「上へ移動」「下へ移動」で分類の並びが入れ替わり、保存されることを確かめる
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension, resetStorage} from './extension.js';

test('分類を上下に並び替えられる', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	await page.goto(`${base}/main.html`);
	await resetStorage(page, {
		type: [{name: 'A'}, {name: 'B', accessKey: 'b'}, {name: 'C'}],
	});
	await page.reload();
	await page.waitForTimeout(800);
	// 分類側の編集モード（1つ目のタブ）
	await page.getByRole('button', {name: '編集モード'}).first().click();
	// ToDo はないので、開始ボタンのある行は分類の行
	const rows = page.locator('li').filter({has: page.getByRole('button', {name: /^開始/})});
	const rowOf = name => rows.filter({hasText: new RegExp(`${name}$`)});
	const names = () => rows.evaluateAll(lis => lis.map(li => li.lastChild.textContent));
	const storedTypes = () => page.evaluate(() => chrome.storage.local.get('type').then(({type}) => type));

	assert.deepEqual(await names(), ['A', 'B', 'C']);
	// 先頭は上へ、末尾は下へ動かせない
	assert.equal(await rowOf('A').getByRole('button', {name: '上へ移動'}).isDisabled(), true);
	assert.equal(await rowOf('C').getByRole('button', {name: '下へ移動'}).isDisabled(), true);

	await rowOf('A').getByRole('button', {name: '下へ移動'}).click();
	await page.waitForTimeout(300);
	assert.deepEqual(await names(), ['B', 'A', 'C']);
	assert.deepEqual(await storedTypes(), [{name: 'B', accessKey: 'b'}, {name: 'A'}, {name: 'C'}]);
	// アクセスキーの入力欄は分類と一緒に動く
	assert.equal(await rowOf('B').locator('input').inputValue(), 'b');
	assert.equal(await rowOf('A').locator('input').inputValue(), '');

	await rowOf('C').getByRole('button', {name: '上へ移動'}).click();
	await page.waitForTimeout(300);
	assert.deepEqual(await names(), ['B', 'C', 'A']);
	assert.deepEqual(await storedTypes(), [{name: 'B', accessKey: 'b'}, {name: 'C'}, {name: 'A'}]);

	// 読み込み直しても並びが残る（編集モードを抜けた通常表示でも）
	await page.reload();
	await page.waitForTimeout(800);
	assert.deepEqual(await names(), ['B', 'C', 'A']);

	assert.deepEqual(errors, []);
});
