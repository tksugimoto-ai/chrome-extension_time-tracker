# lib

npm パッケージに入っているファイルを、中身を変えずにそのまま置いている。

| ファイル | 取得元パッケージ | パッケージ内のパス | SHA-256 |
| --- | --- | --- | --- |
| `react@18.3.1.production.min.js` | [react@18.3.1](https://www.npmjs.com/package/react/v/18.3.1) | `umd/react.production.min.js` | `d949f1c3687aedadcedac85261865f29b17cd273997e7f6b2bfc53b2f9d4c4dd` |
| `react-dom@18.3.1.production.min.js` | [react-dom@18.3.1](https://www.npmjs.com/package/react-dom/v/18.3.1) | `umd/react-dom.production.min.js` | `35f4f974f4b2bcd44da73963347f8952e341f83909e4498227d4e26b98f66f0d` |

- tarball: <https://registry.npmjs.org/react/-/react-18.3.1.tgz>, <https://registry.npmjs.org/react-dom/-/react-dom-18.3.1.tgz>
- ライセンス: MIT（各ファイル先頭のコメント）
- production build を使う理由: development build は約 1.2MB あり、毎秒の再描画にかかる時間も倍以上になる。React の警告を見たいときは、同じパッケージの `umd/*.development.js` に一時的に差し替える。

## 取り直し方

```sh
npm pack react@18.3.1 react-dom@18.3.1
tar xzf react-18.3.1.tgz package/umd/react.production.min.js -O > react@18.3.1.production.min.js
tar xzf react-dom-18.3.1.tgz package/umd/react-dom.production.min.js -O > react-dom@18.3.1.production.min.js
sha256sum *.production.min.js
```

React 19 以降は UMD が配布されないので、この方法では取得できない。
