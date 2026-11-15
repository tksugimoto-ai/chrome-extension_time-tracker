// 記録の月ごとのキー分割 (perf/split-records-by-month) の確認
//   以前の形式 (record に全件) の 4,417 件・ToDo 544 件を入れて main.html を開き、
//   - 月ごとのキー record.YYYY-MM に移ること
//   - タイトルを入力したときに、その記録の月のキーだけを書き込むこと
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension, readRecords, resetStorage} from './extension.js';
import {recordKeyOf} from '../../chrome-extension/record-storage.js';

const RECORD_COUNT = 4417;
const DAYS = 217;
const TODO_COUNT = 544;
const types = ['開発', 'ミーティング', 'レビュー', '調査', '昼休憩'];

/** 決まった乱数（毎回同じデータにする） */
let seed = 1;
const rand = n => {
	seed = (seed * 1103515245 + 12345) % 2147483648;
	return seed % n;
};

const makeData = () => {
	const todo = Array.from({length: TODO_COUNT}, (_, i) => ({type: types[i % 4], title: `ToDo ${i} のタイトル（${'あいう'.repeat(1 + i % 3)}）`}));
	const today0 = new Date();
	today0.setHours(0, 0, 0, 0);
	const record = [];
	// 平日だけ DAYS 日ぶん遡り、1日あたり約20件
	const days = [];
	for (const date = new Date(today0); days.length < DAYS;) {
		date.setDate(date.getDate() - 1);
		if (date.getDay() !== 0 && date.getDay() !== 6) days.unshift(date.getTime());
	}
	days.forEach((day, d) => {
		const count = Math.floor(RECORD_COUNT * (d + 1) / DAYS) - Math.floor(RECORD_COUNT * d / DAYS);
		let start = day + 9 * 3600e3;
		for (let i = 0; i < count; i++) {
			const end = start + (10 + rand(40)) * 60e3;
			const t = todo[rand(TODO_COUNT)];
			const r = {start, end, type: t.type, title: t.title};
			if (rand(5) === 0) r.memo = `メモ ${rand(1000)}`;
			record.push(r);
			start = end;
		}
	});
	// 今日の計測中の記録（タイトルを入力する）
	record.push({start: Date.now() - 60e3, type: '開発'});
	return {
		type: types.map(name => ({name})),
		todo,
		record,
	};
};

test('記録を月ごとのキーに移して保存する', async () => {
	const {ctx, base, errors} = await launchExtension();
	const page = await ctx.newPage();
	page.on('dialog', d => d.accept());
	await page.goto(`${base}/main.html`);
	const data = makeData();
	await resetStorage(page, data);
	const total = `履歴総数: ${data.record.length}`;
	const waitForRecords = () => page.waitForFunction(total => document.body.innerText.includes(total), total);

	// 開くと月ごとのキーに移る
	await page.reload();
	await waitForRecords();
	await page.waitForTimeout(500);
	const keys = Object.keys(await page.evaluate(() => chrome.storage.local.get(null)));
	const monthKeys = keys.filter(key => key.startsWith('record.'));
	assert.ok(!keys.includes('record'), '以前のキーが消えていない');
	assert.ok(monthKeys.length >= 10, `月ごとのキー: ${monthKeys}`);
	assert.deepEqual(await readRecords(page), data.record, '移行で記録が変わった');

	// 計測中の記録のタイトルを入力すると、その記録の月のキーだけを書き込む
	await page.evaluate(() => {
		window.changedKeys = [];
		chrome.storage.onChanged.addListener(changes => window.changedKeys.push(...Object.keys(changes)));
	});
	const input = page.locator('input[placeholder="タイトル"]').first();
	// 計測中の記録の行は経過時間が毎秒変わって位置がずれ、click() は stable を待ち続けるので focus() にする
	await input.focus();
	const text = 'abcdefghijklmnopqrst';
	await input.pressSequentially(text, {delay: 150});
	await page.waitForTimeout(1500);
	const running = data.record.find(record => record.end == null);
	assert.deepEqual([...new Set(await page.evaluate(() => window.changedKeys))], [recordKeyOf(running.start)]);

	// 再読み込みしても入力したタイトルが残る
	await page.reload();
	await waitForRecords();
	assert.equal(await page.locator('input[placeholder="タイトル"]').first().inputValue(), text);
	assert.deepEqual(errors, []);
});
