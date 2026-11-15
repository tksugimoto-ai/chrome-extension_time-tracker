// E2E 用: 拡張を読み込んだ Chromium の起動と、storage の読み書き
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {after} from 'node:test';
import {chromium} from 'playwright';
import {loadRecords} from '../../chrome-extension/record-storage.js';

const extensionDir = fileURLToPath(new URL('../../chrome-extension', import.meta.url));

/**
 * 拡張を読み込んだ Chromium を起動する。テストが失敗しても、ファイルのテストが終わったら閉じる
 * @param {import('playwright').BrowserContextOptions} [options]
 * @returns {Promise<{
 * 	ctx: import('playwright').BrowserContext;
 * 	base: string;
 * 	errors: string[];
 * }>} errors は全ページの例外とコンソールのエラー
 */
export const launchExtension = async (options = {}) => {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'time-tracker-e2e-'));
	// headless shell (channel なし) では拡張の service worker が起動しない
	const ctx = await chromium.launchPersistentContext(userDataDir, {
		...options,
		headless: true,
		channel: 'chromium',
		args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
	});
	after(async () => {
		await ctx.close();
		fs.rmSync(userDataDir, {recursive: true, force: true});
	});
	const errors = [];
	ctx.on('weberror', e => errors.push(e.error().message));
	ctx.on('console', m => m.type() === 'error' && errors.push(m.text()));
	let [sw] = ctx.serviceWorkers();
	if (!sw) sw = await ctx.waitForEvent('serviceworker');
	const base = `chrome-extension://${new URL(sw.url()).host}`;
	return {ctx, base, errors};
};

/**
 * storage を空にしてから items を入れる
 * @param {import('playwright').Page} page 拡張のページ
 * @param {Object<string, any>} items
 */
export const resetStorage = (page, items) => page.evaluate(items => chrome.storage.local.clear().then(() => chrome.storage.local.set(items)), items);

/**
 * storage の内容から記録を取り出す（月ごとのキーをまとめる）
 * @param {Object<string, any>} items
 */
export const recordsOf = items => loadRecords(items).records;

/**
 * @param {import('playwright').Page} page 拡張のページ
 */
export const readRecords = async page => recordsOf(await page.evaluate(() => chrome.storage.local.get(null)));

/**
 * 日付入力欄の値の形 (YYYY-MM-DD、ローカル時刻)
 * @param {number | Date} date
 */
export const isoDate = date => new Date(date).toLocaleDateString('sv-SE');
