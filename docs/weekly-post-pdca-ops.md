# X広告×LP 週次PDCA運用仕様書

## 目的

無料AIセミナーの申込み数を最大化するため、X広告とLPを週次で改善する運用仕様を定義する。
KPIはセミナー申込み数であり、LPのフォーム送信数と同義とする。

## 全体構成

本仕組みは以下の3要素で構成する。

1. **X広告** — キャンペーン内で広告用ポストA/Bを配信する。
2. **LP** — セミナー申込み用LPを使用する。
   - 現行対象LP: `https://luvira.co.jp/seminar/index.html`
3. **週次PDCAスクリプト** — Node.jsスクリプト [`scripts/weekly-post-pdca.js`](../scripts/weekly-post-pdca.js) を使用する。
   実装の詳細（関数・判定ロジック）は [`docs/acquisition-automation.md`の「毎週の投稿PDCA」セクション](acquisition-automation.md#毎週の投稿pdcascriptsweekly-post-pdcajs)を参照。

## 運用の基本思想

- PDCAは「1週間」を1サイクルとして回す。
- 比較に使う主要指標は以下の2つとする。
  - CTR
  - signups（申込み数）
- 週次で今週と前週を比較し、必要に応じて以下を変更する。
  - X広告のポスト文面
  - LPの訴求内容

## KPI定義

### 1. CTR

CTRはX広告のクリック率とする。X Ads上の表示回数とURLクリック数から計算する。

```
CTR = url_clicks / impressions
```

### 2. signups

signupsはLPからのフォーム送信件数とする。これはセミナー申込み件数と同義であり、本運用の最重要KPIである。

## 週次入力データ仕様

毎週、PDCAスクリプトには以下のJSONを渡す。

```json
{
  "week": "YYYY-MM-DD週",
  "ctr": 0.018,
  "signups": 3,
  "prev_ctr": 0.015,
  "prev_signups": 0
}
```

### 各項目の意味

- `week` — 対象週のラベル
- `ctr` — 今週のCTR
- `signups` — 今週の申込み数
- `prev_ctr` — 前週のCTR
- `prev_signups` — 前週の申込み数

### 初週の扱い

前週データがない初週は、以下のように `null` を入れる。

```json
{
  "week": "2026-07-13週",
  "ctr": 0.015,
  "signups": 0,
  "prev_ctr": null,
  "prev_signups": null
}
```

この場合、比較判定は行わず、ベースライン生成モードになる。

## スクリプト実行方法

```bash
node scripts/weekly-post-pdca.js '{"week":"2026-07-13週","ctr":0.015,"signups":0,"prev_ctr":null,"prev_signups":null}'
```

- 引数はJSON文字列1つ
- 出力はJSONオブジェクト1つ

## スクリプト出力仕様

出力の基本形は以下とする。

```json
{
  "week": "2026-07-13週",
  "status": "baseline",
  "reason": "前週データがなく比較対象がないため、今週の実績をベースラインとして扱い、A/Bテスト用の投稿案を作成します。",
  "next_post_A": "・・・",
  "next_post_B": "・・・",
  "lp_suggestions": []
}
```

### 項目説明

- `week` — 対象週
- `status` — 判定結果
- `reason` — 判定理由
- `next_post_A` — 次週に使う投稿案A
- `next_post_B` — 次週に使う投稿案B
- `lp_suggestions` — LP改善案の配列。不要な場合は空配列

## status定義

### 1. baseline

前週データが存在しない場合の初週用ステータス。

**動作:**
- 投稿A/Bを生成する
- LP改善案は出さない
- 今週の数値をベースラインとして記録する

### 2. keep

今週のCTR・申込み数が前週比で悪化しておらず、現状の訴求を維持すべきと判断した場合のステータス。

**動作:**
- 基本訴求は維持
- ポストは軽微調整のみ
- LPも原則据え置き

### 3. replace_post

CTRが前週より悪化しており、広告文面の訴求軸に問題がある可能性が高い場合のステータス。

**動作:**
- 投稿A/Bを新規生成して差し替える
- LPは原則据え置き

### 4. improve_lp

CTRは確保できているが申込み数が弱く、LP側がボトルネックになっていると考えられる場合のステータス。

**動作:**
- LP改善案を `lp_suggestions` に出力
- 投稿は基本維持

### 5. replace_post_and_improve_lp

CTRも申込み数も弱く、広告・LPの両方に改善が必要と判断した場合のステータス。

**動作:**
- 投稿A/Bを差し替える
- LP改善案も出力する

## 現在の初週生成仕様

初週は `baseline` と判定し、投稿A/Bを生成する仕様とする。実行確認済みの出力例は以下である。

```json
{
  "week": "2026-07-13週",
  "status": "baseline",
  "reason": "前週データがなく比較対象がないため、今週の実績をベースラインとして扱い、A/Bテスト用の投稿案を作成します。",
  "next_post_A": "AIの必要性はわかっているのに、自社でどこから始めるべきか判断がつかず、止まっていませんか？\n\n・自社の業務のどこにAIを使うべきかが整理できる\n・「まず着手すべき1つの領域」とその理由が明確になる\n・個別相談で自社に合った次の一手まで相談できる\n\n60分で、自社にとっての「初手の判断軸」を整理できる無料セミナーです。\n\n詳細・お申込みはこちら▼ {{LP_URL}}",
  "next_post_B": "人手不足と属人化で、現場がもう限界に近づいていませんか？\n\n・属人化している業務の棚卸しができる\n・AIで巻き取れる業務の見極め方がわかる\n・少ない人数でも回る仕組みづくりの第一歩がわかる\n\n60分で、自社にとっての「初手の判断軸」を整理できる無料セミナーです。\n\n詳細・お申込みはこちら▼ {{LP_URL}}",
  "lp_suggestions": []
}
```

## 投稿文の運用ルール

- `next_post_A` / `next_post_B` はX広告の広告用ポストとして使用する。
- `{{LP_URL}}` は実際のLP URLに置換する（`node scripts/weekly-post-pdca.js`呼び出し時に`lpUrl`オプションを渡すか、出力後に手動で置換する）。
- 文字数制限に応じて短縮版を作成してもよい。
- A/Bの差は訴求軸で分ける。

### 現在の訴求軸

- **投稿A** — 「AI導入の初手が決められず止まっている経営者向け」
- **投稿B** — 「人手不足・属人化で現場負荷が高い企業向け」

## X広告運用ルール

### 実務上の考え方

- PDCAの中心はポスト文面である。
- ただし、実際の配信はキャンペーンの中で行う。

### 実務フロー

1. キャンペーンを作成する
2. キャンペーン内で広告用ポストA/Bを設定する
3. 同条件で1週間配信する
4. 週次で成果を集計する

### 基本設定

- 目的: ウェブサイト訪問数（ウェブサイトトラフィック）
- 期間: 1週間
- 初期予算: 5000円

## LP運用ルール

### 現在の扱い

現時点のLPは以下を前提とする。

- URL: `https://luvira.co.jp/seminar/index.html`
- 静的HTMLで管理
- 初週はLPを変更しない

### 現状のLPの役割

現LPは以下の訴求を含んでいる。

- AI導入の必要性は感じるが、どこから始めるか決められない層への共感
- 人手不足、属人化、採用難の構造的課題の提示
- 1業務 → 短期実証 → 効果確認 → 横展開という進め方
- セミナーの内容、対象、講師、CTA

### LPを変更する条件

スクリプト出力の `status` が以下の場合にLP改善を検討する。

- `improve_lp`
- `replace_post_and_improve_lp`

## 週次PDCAフロー

### 初週

1. 前週値を `null` で入力する
2. スクリプトを実行する
3. `baseline` 判定を受ける
4. 投稿A/Bを広告に設定する
5. LPは現状維持で配信する

### 2週目以降

1. 今週のCTRと申込み数を集計する
2. 前週実績を `prev_ctr` / `prev_signups` に入れる
3. スクリプトを実行する
4. `status` に応じて以下を実施する
   - `keep` — 現状訴求を維持する
   - `replace_post` — 投稿A/Bを差し替える
   - `improve_lp` — LPを改善する
   - `replace_post_and_improve_lp` — 投稿A/BとLPの両方を改善する
5. 今週の値を来週の `prev_*` に引き継ぐ

## 人間とAIの役割分担

### 人間がやること

- 予算を決める
- 配信期間を決める
- X Adsに入稿する
- LPを更新する
- 週次で実績を記録する
- スクリプトを実行する

### AI / スクリプトがやること

- 前週比を見て判定する
- 投稿A/Bを生成する
- LP改善案を出す
- 初週の冷スタートにも対応する

## 前提条件と注意点

- KPIは申込み数であり、単なるクリック数ではない。
- ただし、CTRが弱い場合は広告訴求自体の見直し対象とする。
- 前週データがない場合でも、AIは停止せずベースライン投稿を生成する。
- 予算は人間側が決め、AIは配分や期間の改善提案対象とする。
- CPA目標は500円を前提とする（`scripts/acquisition-agent.js`の`CPA_TARGET`定数、`docs/acquisition-automation.md`参照）。

## 今後ドキュメントに追記すべきもの

このドキュメントは現時点での「運用仕様」をまとめたものであり、以下は今後追記対象とする。

- 実コード上のしきい値（`classifyWeek`の判定条件は現状「前週以上か未満か」のみで、`diagnoseBottleneck`のような数値閾値は未導入）
- `keep` / `replace_post` / `improve_lp` / `replace_post_and_improve_lp` の厳密な分岐条件の再検証
- LP改善案のテンプレート（現状は汎用的な改善観点。実LP本文に基づく具体案への精緻化は未実装）
- X Adsのレポート取得手順（X Ads API連携は`docs/x-ads-integration.md`参照、未接続）

## Google Sheets 標準シート構成（n8n自動運用専用、確定）

`docs/weekly-pdca-n8n-workflow.json`のn8n自動化専用のシート構成。Parent/X_ads_ops/LPs（`docs/schema.md`、
セミナー1件ごとの企画・広告案管理用）とは別の、週次PDCAの実行ログ・状態管理に特化したシート。
同一スプレッドシート内に以下2タブを作成する。

### タブ1: `weekly_pdca_log`（週次実行のログ。1週間＝1行、append専用）

| column | 型 | 説明 |
|---|---|---|
| week | string | 対象週ラベル（例: "2026-07-13週"） |
| run_at | datetime | ワークフロー実行日時（ISO8601、自動記録） |
| ctr | number | 今週のCTR |
| signups | number | 今週の申込数 |
| prev_ctr | number | 前週のCTR（初週は空） |
| prev_signups | number | 前週の申込数（初週は空） |
| status | string | baseline / keep / replace_post / improve_lp / replace_post_and_improve_lp |
| reason | string | 判定理由 |
| next_post_A | string | 投稿A案（差し替え対象週のみ、それ以外は空） |
| next_post_B | string | 投稿B案（差し替え対象週のみ、それ以外は空） |
| lp_suggestions | string | LP改善案（複数ある場合は" / "区切りの1セル） |

### タブ2: `pdca_state`（前週比較用の最小限の状態。常に1行のみ、上書き）

| column | 型 | 説明 |
|---|---|---|
| row_key | string | 固定値`"current"`。n8nのappendOrUpdate操作でこの列をキーに単一行を維持する |
| prev_ctr | number | 直近実行時のCTR（次回実行時に読み込まれ`prev_ctr`として使われる） |
| prev_signups | number | 直近実行時の申込数（次回実行時に`prev_signups`として使われる） |
| last_status | string | 直近判定のstatus（参考情報、PDCAロジックの入力には使わない） |
| updated_at | datetime | 最終更新日時（ISO8601） |

**初期セットアップ時の注意**: `pdca_state`シートは、初回ワークフロー実行前に手動でヘッダー行＋
`row_key="current"`のデータ行を1行だけ作成しておくこと（他の列は空でよい）。これにより初回実行時の
「読み込み対象行が存在しない」エラーを避けられる。2回目以降はn8n側の`appendOrUpdate`操作が自動的に
この行を上書きするため、手動操作は不要。

### n8nノードとの対応

| n8nノード | 操作 | 対象タブ | 内容 |
|---|---|---|---|
| Load Previous Week Metrics | read（range: `A2:E2`） | pdca_state | 前週のprev_ctr/prev_signupsを読む |
| Append Weekly Log | append | weekly_pdca_log | 今週の実績・判定結果を1行追記 |
| Update State for Next Week | appendOrUpdate（matchingColumns: `row_key`） | pdca_state | row_key="current"行を次回用に上書き |

詳細な`parameters`定義は`docs/weekly-pdca-n8n-workflow.json`の該当ノードを参照。
