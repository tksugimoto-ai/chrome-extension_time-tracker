// main.js の入力部品 (LazyInput・Checkbox・EditModeTab・useDialog) を 1 つずつ動かして確かめる
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {openComponentPage} from './extension.js';

const {page, container, calls, waitFor} = await openComponentPage();

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
			window.state.setValue = setValue;
			return React.createElement(window.main.LazyInput, {value, onCommit: () => {}});
		})));
		assert.equal(await input.inputValue(), 'before');
		await page.evaluate(() => window.state.setValue('after'));
		await waitFor(() => document.querySelector('#component-under-test input').value === 'after');
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

describe('useDialog', () => {
	const mount = () => page.evaluate(() => window.render(React.createElement(() => {
		const {Dialog, showModalDialog} = window.main.useDialog();
		return React.createElement(React.Fragment, {},
			React.createElement('button', {onClick: showModalDialog}, 'ダイアログを開く'),
			React.createElement(Dialog, {}, 'ダイアログの中身'),
		);
	})));
	const dialog = container.locator('dialog');
	const isOpen = () => dialog.evaluate(d => d.open);

	test('showModalDialog で中身ごと開き、「閉じる」で閉じる', async () => {
		await mount();
		assert.equal(await isOpen(), false);
		await container.getByRole('button', {name: 'ダイアログを開く'}).click();
		assert.equal(await isOpen(), true);
		assert.equal(await dialog.evaluate(d => d.matches(':modal')), true);
		assert.match(await dialog.textContent(), /ダイアログの中身/);
		await dialog.getByRole('button', {name: '閉じる'}).click();
		assert.equal(await isOpen(), false);
	});

	test('中身の外 (背景) を押すと閉じ、中身を押しても閉じない', async () => {
		await mount();
		await container.getByRole('button', {name: 'ダイアログを開く'}).click();
		await dialog.getByText('ダイアログの中身').click();
		assert.equal(await isOpen(), true);
		// 中身の外 (背景・余白) を押したときは、クリックの target が dialog 自身になる
		await dialog.click({position: {x: 1, y: 1}});
		assert.equal(await isOpen(), false);
	});
});
