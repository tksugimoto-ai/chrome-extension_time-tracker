// main.js の関数 (クリップボード・分類・storage の読み書き) を、拡張のページで 1 つずつ確かめる
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {openComponentPage, readStorage, resetStorage} from './extension.js';

const {page, errors, waitFor} = await openComponentPage();
const storage = () => readStorage(page);
/** ページのコンソールのエラーは遅れて届くので、count 件そろうまで待ってから取り出す */
const takeErrors = async count => {
	while (errors.length < count) await new Promise(resolve => setTimeout(resolve, 50));
	return errors.splice(0);
};
// window.withFailingSet(fn): storage への書き込みが失敗するようにしてから fn(alerts) を呼ぶ。alerts には alert の文が入る（置き換えた alert はテストが終わると戻る）
await page.evaluate(() => {
	window.withFailingSet = async fn => {
		const set = chrome.storage.local.set;
		chrome.storage.local.set = () => Promise.reject(new Error('書き込めない'));
		const alerts = [];
		window.alert = message => alerts.push(message);
		try {
			return await fn(alerts);
		} finally {
			chrome.storage.local.set = set;
		}
	};
});

describe('readClipboardData', () => {
	/**
	 * @param {Object<string, string>} data 形式ごとのクリップボードの内容
	 */
	const read = data => page.evaluate(data => {
		const clipboardData = new DataTransfer();
		Object.entries(data).forEach(([format, value]) => clipboardData.setData(format, value));
		return window.main.readClipboardData(clipboardData);
	}, data);

	test('テキストだけなら、そのテキストを返す', async () => {
		assert.deepEqual(await read({'text/plain': 'ToDo のタイトル'}), {text: 'ToDo のタイトル'});
	});

	test('リンクが 1 つの HTML なら、リンクの文字と URL を返す', async () => {
		assert.deepEqual(await read({
			'text/plain': 'Issue のタイトル',
			'text/html': '<a href="https://example.com/issues/1">Issue のタイトル</a>',
		}), {text: 'Issue のタイトル', url: 'https://example.com/issues/1'});
	});

	test('リンクが 1 つでない HTML なら、テキストを返す', async () => {
		assert.deepEqual(await read({
			'text/plain': 'a b',
			'text/html': '<a href="https://example.com/a">a</a> <a href="https://example.com/b">b</a>',
		}), {text: 'a b'});
		assert.deepEqual(await read({
			'text/plain': '太字',
			'text/html': '<b>太字</b>',
		}), {text: '太字'});
	});

	test('テキストがなければ null を返す', async () => {
		assert.equal(await read({}), null);
		assert.equal(await read({'text/html': '<a href="https://example.com/">x</a>'}), null);
	});
});

test('is勤務外: 昼休憩と中断だけが勤務外', async () => {
	assert.deepEqual(await page.evaluate(() => ['昼休憩', '中断', '開発', 'ミーティング', ''].map(window.main.is勤務外)), [true, true, false, false, false]);
});

test('typesToNamesWithCurrent: 現在の分類が一覧になければ先頭に足す', async () => {
	const result = await page.evaluate(() => {
		const types = [{name: '開発'}, {name: 'MTG'}];
		return [
			window.main.typesToNamesWithCurrent(types, 'MTG'),
			window.main.typesToNamesWithCurrent(types, '削除した分類'),
		];
	});
	assert.deepEqual(result, [
		['開発', 'MTG'],
		['削除した分類', '開発', 'MTG'],
	]);
});

describe('storage の読み書き', () => {
	test('loadFromStorage: キーの値を渡す。ないときは undefined', async () => {
		await resetStorage(page, {a: [1, 2]});
		const values = await page.evaluate(() => Promise.all(['a', 'b'].map(key => new Promise(resolve => window.main.loadFromStorage(key, resolve)))));
		assert.deepEqual(values, [[1, 2], undefined]);
	});

	test('writeToStorage: 書き込んでから removeKeys を消す', async () => {
		await resetStorage(page, {old: 1, keep: 2});
		await page.evaluate(() => window.main.writeToStorage({new: 3}, ['old']));
		assert.deepEqual(await storage(), {keep: 2, new: 3});
		await page.evaluate(() => window.main.writeToStorage({new: 4}));
		assert.deepEqual(await storage(), {keep: 2, new: 4});
	});

	test('writeToStorage: 失敗したら alert で知らせて reject し、消さない', async () => {
		await resetStorage(page, {old: 1});
		const result = await page.evaluate(() => window.withFailingSet(async alerts => {
			try {
				await window.main.writeToStorage({new: 1}, ['old']);
				return {rejected: false, alerts};
			} catch (error) {
				return {rejected: true, message: error.message, alerts};
			}
		}));
		assert.equal(result.rejected, true);
		assert.equal(result.message, '書き込めない');
		assert.equal(result.alerts.length, 1);
		assert.match(result.alerts[0], /^保存に失敗しました。[\s\S]*書き込めない$/);
		assert.deepEqual(await storage(), {old: 1});
		// 失敗はコンソールにも出す
		assert.deepEqual((await takeErrors(1)).map(e => e.split(' ')[0]), ['保存に失敗しました']);
	});

	test('saveToStorage: 1 つのキーに書き込む。失敗しても例外を投げない', async () => {
		await resetStorage(page, {});
		await page.evaluate(() => window.main.saveToStorage('key', {a: 1}));
		await waitFor(() => chrome.storage.local.get('key').then(items => items.key?.a === 1));
		const result = await page.evaluate(() => window.withFailingSet(async alerts => {
			const unhandled = [];
			const onUnhandled = e => unhandled.push(e.reason?.message);
			window.addEventListener('unhandledrejection', onUnhandled);
			try {
				window.main.saveToStorage('key', 'x');
				// 失敗を知らせた (alert) あとの reject が拾われなければ、unhandledrejection がタスクとして届く。タスクを 2 つ待つ
				while (alerts.length === 0) await window.nextTask();
				await window.nextTask();
				await window.nextTask();
				return {alerts, unhandled};
			} finally {
				window.removeEventListener('unhandledrejection', onUnhandled);
			}
		}));
		assert.equal(result.alerts.length, 1);
		assert.deepEqual(result.unhandled, []);
		await takeErrors(1); // 失敗のログは writeToStorage のテストで確かめている
	});

	test('fetchUsage: 使っている量を返す', async () => {
		await resetStorage(page, {});
		const empty = await page.evaluate(() => window.main.fetchUsage());
		await resetStorage(page, {data: 'x'.repeat(1000)});
		const used = await page.evaluate(() => window.main.fetchUsage());
		assert.deepEqual(Object.keys(used), ['bytesInUse']);
		assert.ok(used.bytesInUse >= empty.bytesInUse + 1000, JSON.stringify({empty, used}));
	});
});
