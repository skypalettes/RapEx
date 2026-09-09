# Rapid Experience (RapEx)

> 思考から遷移までのラグをゼロに。

Salesforce 向けの、シンプルなコマンドパレット型ランチャー（Chrome 拡張機能 / Manifest V3）。
`Ctrl + Shift + K`（Mac は `⌘ + Shift + K`）で画面中央に検索ボックスを出し、
**ローマ字でも・ひらがなでも・英語でも**、入力モードを気にせず目的の画面へ一発で飛べます。

```
torihiki  →  取引先
とりひき   →  取引先
account   →  取引先
acc       →  取引先
om        →  オブジェクトマネージャ
shodan    →  商談
取引先 新規 →  取引先 を新規作成
```

## インストール（開発版）

1. Chrome で `chrome://extensions` を開く
2. 右上の **デベロッパーモード** を ON
3. **パッケージ化されていない拡張機能を読み込む** で、このリポジトリのルートを選択
4. Salesforce の画面を開き直して `Ctrl + Shift + K`

ショートカットキーは `chrome://extensions/shortcuts` から変更できます
（パレット内で `> ショートカット` と入力しても開けます）。

## 使い方

| 操作 | キー |
| --- | --- |
| パレットを開く / 閉じる | `Ctrl(⌘) + Shift + K` |
| 候補を選ぶ | `↑` `↓` / `Tab` / `Ctrl + N` `Ctrl + P` |
| 移動する | `Enter` |
| 新しいタブで開く | `Ctrl(⌘) + Enter` |
| 閉じる | `Esc` |

### 入力のプレフィクス

| 入力 | 意味 |
| --- | --- |
| （なし） | 設定画面・オブジェクト・レコードを横断検索 |
| `> ` | コマンド（キャッシュ再取得、ID コピー、ログアウトなど） |
| `? ` | レコードのグローバル検索を強制する |

空白区切りは AND 条件です（`商談 新規` / `apex test`）。

## 仕組み

```
manifest.json           Manifest V3・権限・ショートカット定義
src/content.js          Shadow DOM への UI 注入とキー入力の制御
src/background.js       Service Worker: Cookie(sid) 取得・Salesforce API・キャッシュ
src/style.css           コマンドパレットのスタイル（ライト / ダーク対応）
src/lib/org.js          組織ドメインの解決と遷移先 URL の生成
src/lib/kana.js         日本語入力のゆらぎ吸収（かな ⇄ ローマ字の正準化）
src/lib/search.js       候補のスコアリング
src/data/dictionary.js  静的辞書（設定画面・標準オブジェクト）
test/run.js             自己検証スクリプト
```

### ゆらぎ吸収の考え方

辞書側もクエリ側も、**素の正規化文字列**と**訓令式ベースのローマ字正準形**の 2 面を持ちます。

1. NFKC 正規化 → カタカナをひらがなへ → 小文字化
2. かなを含む文字列は訓令式ローマ字へ変換
3. 打鍵されたローマ字（ヘボン式・長音・促音のゆれを含む）も同じ正準形へ寄せる

`shoudan` / `shodan` / `syoudan` / `しょうだん` / `ショウダン` はすべて `syodan` に落ちます。
英語ラベル（`Account`）を壊さないよう、ローマ字面は素の文字列とは別のキーとして評価します。

### ドメインの正規化

Salesforce は拡張ドメイン (Enhanced Domains) で 1 組織に用途別の複数ホストを払い出します。

| 用途 | ホスト |
| --- | --- |
| Lightning | `MyDomain.lightning.force.com` |
| 設定 (Setup) | `MyDomain.my.salesforce-setup.com` |
| API / Classic | `MyDomain.my.salesforce.com` |
| Visualforce | `MyDomain--pkg.vf.force.com` |

遷移元のホストをそのままベース URL に使うと、設定画面から起動したときに壊れます
（設定ドメインは通常オブジェクトのパスを解釈できません）。そこで `src/lib/org.js` の
`splitHost()` で**接尾辞を剥がして「組織を表す部分」を取り出し、用途に応じて付け直します**。
設定ドメインの `.my` を残したまま置換すると実在しない `MyDomain.my.lightning.force.com` に
なるため、単純な文字列置換ではなく接尾辞テーブルで扱っています。

遷移先の振り分けは 2 通りだけです。

- `/lightning/` `/ltng/` 配下 → **Lightning ドメイン**。設定画面 (`/lightning/setup/...`) も
  ここ宛てで構いません。Salesforce 側が設定ドメインへリダイレクトするため、
  拡張機能が「設定かどうか」を判定する必要はありません。
- それ以外（`/_ui/...` の開発者コンソール、`/secur/logout.jsp` など）→ **API / Classic ドメイン**。

### マルチ組織とセキュリティ

- 組織固有のメタデータ（カスタムオブジェクト一覧など）は **`chrome.storage.session`（インメモリ）** にのみ保持します。
- キーは **組織のドメイン**。本番 / Sandbox / スクラッチを行き来しても混ざりません。
- ディスク（`storage.local` / `storage.sync`）には一切書きません。**ブラウザを閉じると全キャッシュが破棄されます。**
- セッション ID は API ドメイン（`*.my.salesforce.com`）の `sid` Cookie から都度読み出し、保存しません。

キャッシュを明示的に捨てたいときは、パレットで `> 再取得` を実行してください。

## 実装フェーズの対応状況

| フェーズ | 内容 | 状態 |
| --- | --- | --- |
| 1 | 静的データでのコア UI・ゆらぎ吸収 | ✅ |
| 2 | カスタムオブジェクトの動的取得とセッションキャッシュ | ✅ |
| 3 | SOSL によるレコードのグローバル検索 | ✅ |
| 4 | コンテキスト認識・コマンド機能（`>`） | ✅ |

フェーズ 4 のうち、`> login as` と `> create` は未実装です。

## テスト

```bash
node test/run.js     # または npm test
```

かな⇄ローマ字の変換、検索ランキング、URL 生成、辞書の健全性、
manifest と実装の配線を検証します（依存パッケージなし）。

## 辞書を増やす

`src/data/dictionary.js` の `SETUP` / `NAVIGATION` / `STANDARD_OBJECTS` に 1 行足すだけです。
`keywords` には **読みがな（ひらがな）** を入れてください。ローマ字への展開は自動で行われます。

```js
['setup-flows', 'フロー', '/lightning/setup/Flows/home', ['ふろー', 'flows', 'flow builder', 'じどうか']],
```
