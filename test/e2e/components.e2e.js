// main.js のコンポーネント・関数を、拡張のページで 1 つずつ動かして確かめる
// main.html が読み込んだ main.js を import し直す（同じ URL なので同じモジュールが返り、もう一度は実行されない）
import {afterEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {launchExtension} from './extension.js';

const {ctx, base, errors} = await launchExtension();
const page = await ctx.newPage();
// LazyInput の待ち時間をテストから進める
await page.clock.install();
await page.goto(`${base}/main.html`);
await page.evaluate(async base => {
	window.main = await import(`${base}/main.js`);
	window.mounted = [];
	// テストごとに別の要素へ描画する。コールバックの呼び出しは window.calls[name] に残す
	window.calls = {};
	window.spy = name => (...args) => (window.calls[name] ??= []).push(args);
	window.render = element => {
		const container = document.createElement('div');
		container.id = 'component-under-test';
		document.body.append(container);
		const root = ReactDOM.createRoot(container);
		root.render(element);
		window.mounted.push(() => {
			root.unmount();
			container.remove();
		});
	};
}, base);
// ここから時計を止め、runFor で進めた分だけ時間がたつようにする
await page.clock.pauseAt(Date.now() + 1000);
const container = page.locator('#component-under-test');
const calls = name => page.evaluate(name => window.calls[name] ?? [], name);

afterEach(async () => {
	await page.evaluate(() => {
		window.mounted.splice(0).forEach(unmount => unmount());
		window.calls = {};
		delete window.setLazyInputValue;
	});
	// エラーは、起きたテストで失敗させる
	assert.deepEqual(errors.splice(0), []);
});

describe('LazyInput', () => {
	const mount = value => page.evaluate(value => window.render(React.createElement(window.main.LazyInput, {
		value,
		onCommit: window.spy('commit'),
	})), value);
	const input = container.locator('input');

	test('入力中は onCommit を呼ばず、止まって 1 秒たったら 1 回だけ呼ぶ', async () => {
		await mount('a');
		assert.equal(await input.inputValue(), 'a');
		await input.focus();
		await input.pressSequentially('bcd');
		await page.clock.runFor(999);
		assert.deepEqual(await calls('commit'), []);
		await page.clock.runFor(1);
		assert.deepEqual(await calls('commit'), [['abcd']]);
		await page.clock.runFor(5000);
		assert.deepEqual(await calls('commit'), [['abcd']]);
	});

	test('入力欄から離れるとすぐ onCommit を呼び、そのあとは呼ばない', async () => {
		await mount('');
		await input.focus();
		await input.pressSequentially('x');
		await input.blur();
		assert.deepEqual(await calls('commit'), [['x']]);
		await page.clock.runFor(5000);
		assert.deepEqual(await calls('commit'), [['x']]);
	});

	test('ページが隠れるとすぐ onCommit を呼ぶ', async () => {
		await mount('');
		await input.focus();
		await input.pressSequentially('y');
		// headless では実際にページを隠せないので、visibilityState を一時的に hidden にして知らせる
		await page.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
			try {
				document.dispatchEvent(new Event('visibilitychange'));
			} finally {
				delete document.visibilityState;
			}
		});
		assert.deepEqual(await calls('commit'), [['y']]);
	});

	test('外から value が変わると表示も変わる', async () => {
		await page.evaluate(() => window.render(React.createElement(() => {
			const [value, setValue] = React.useState('before');
			window.setLazyInputValue = setValue;
			return React.createElement(window.main.LazyInput, {value, onCommit: () => {}});
		})));
		assert.equal(await input.inputValue(), 'before');
		await page.evaluate(() => window.setLazyInputValue('after'));
		// 時計を止めているので、requestAnimationFrame ではなく一定の間隔で見る
		await page.waitForFunction(() => document.querySelector('#component-under-test input').value === 'after', undefined, {polling: 100});
	});
});

test('Checkbox: チェックすると onChange に true を渡す', async () => {
	await page.evaluate(() => window.render(React.createElement(window.main.Checkbox, {
		checked: false,
		onChange: window.spy('change'),
	}, 'チェックボックスのテスト')));
	await container.getByText('チェックボックスのテスト').click();
	assert.deepEqual(await calls('change'), [[true]]);
});

test('EditModeTab: 選んでいるタブに selected が付き、押すと onChange を呼ぶ', async () => {
	await page.evaluate(() => window.render(React.createElement(window.main.EditModeTab, {
		checked: true,
		onChange: window.spy('change'),
	}, 'タブの中身')));
	const tabs = container.locator('button.tab');
	await tabs.first().waitFor();
	assert.deepEqual(await tabs.evaluateAll(buttons => buttons.map(b => [b.textContent, b.classList.contains('selected')])), [
		['表示モード', false],
		['編集モード', true],
	]);
	await tabs.first().click();
	assert.deepEqual(await calls('change'), [[false]]);
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
