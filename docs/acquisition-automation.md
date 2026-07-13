# Acquisition Automation (X広告集客の自律PDCA)

X広告を使ったセミナー集客のPDCAを、できる限り自律的に回すための仕組み。
`docs/agent-design.md` / `docs/n8n-workflows.md` で定義した5点セット全体のフローとは別に、
「X広告＋LP」に特化した、ステータス管理・将来のX API連携を前提とした軽量な運用レイヤーとして設計する。

## シート構造

### Parent Sheet（拡張）

既存のParent Sheet（`docs/schema.md`参照）に、広告予算まわりの6カラムを追加している。

| column | description |
|---|---|
| ad_budget_total | 広告予算の総額（例: 5000） |
| ad_budget_currency | 通貨（例: JPY） |
| ad_budget_strategy | 予算消化方針（例: lifetime） |
| ad_flight_start_date | 配信開始日（自律集客ロジックが提案） |
| ad_flight_end_date | 配信終了日（自律集客ロジックが提案） |
| ad_budget_status | proposed / approved |

### X_ads Sheet（新規、テンプレキー `x_ads_ops`、実タブ名 `X_ads_ops`）

1行＝1広告案。`docs/schema.md`の「X_ads Sheet (Acquisition Automation)」参照。
既存の「X Ads Template」（テンプレキー`x_ads`、5点セットのA/Bテスト記録用）とは別物。
Google Sheetsはシート名の大文字小文字を区別しないため、実際のタブ名は`X_ads`ではなく`X_ads_ops`にしている
（本ドキュメント中では読みやすさのため概念名として「X_ads」と表記する）。

### LPs Sheet（新規、テンプレキー `lps`）

1行＝1LP案。`docs/schema.md`の「LPs Sheet (Acquisition Automation)」参照。
既存の「LP Template」（テンプレキー`lp`）とは別物。

## 関数の役割分担（`scripts/acquisition-agent.js` / `scripts/sheet-rows.js`）

| 関数 | 役割 |
|---|---|
| `getSeminarRow(seminarId)` | Parentから対象seminar_idの行を読む |
| `proposeAdFlight(seminarRow, options)` | 予算・開催日から配信期間を提案する（純粋関数、Sheets非依存） |
| `updateParentBudgetProposal(seminarId, proposal, seminarRow)` | 提案した配信期間をParentに書き込む（`ad_budget_status`は空の場合のみ`proposed`を書く。既に`approved`なら上書きしない） |
| `writeAdCandidatesToXAds(seminarId, candidates)` | X広告案（複数）をX_adsシートに`status=proposed`で書き込む |
| `writeLpCandidateToLPs(seminarId, candidate)` | LP案（1件）をLPsシートに`status=proposed`で書き込む |
| `runAutonomousAcquisition(seminarId, params)` | 上記（企画〜案出し）を束ねるオーケストレータ |
| `getApprovedXAds(seminarId)` | X_ads_opsから`status=approved`の広告だけを抽出する（X Ads API入稿対象の絞り込み） |
| `writeAdIdentifiers(adId, ids)` / `writeAdMetrics(adId, metrics)` | X Ads APIから得たキャンペーンID/実績をX_ads_opsに書き戻す（API呼び出し自体は含まない） |
| `computeAdMetrics` / `aggregateAdMetrics` / `computeFunnelMetrics` / `computeCPA` / `diagnoseBottleneck` | CTR/CPC/LP CVR/CPAの算出とボトルネック判定（すべて純粋関数） |
| `evaluateCPA(cpa, target?)` / `CPA_TARGET`（=500円） | CPAを目標値と比較し、目標内/超過を判定する（純粋関数。閾値は`CPA_TARGET`定数に集約） |
| `appendToParentNotes(seminarId, note)` | 日付付きの1行をParent.notesに追記（既存メモは保持） |
| `runPdcaCheck(seminarId)` | 上記（実績集計〜診断〜notes追記）を束ねるPDCA「Check」オーケストレータ |
| `getRowBySeminarId` / `findAllRowsByValue` / `updateRowFields` / `extendSheetHeader` / `createSheetIfNotExists`（`scripts/sheet-rows.js`） | 汎用の行検索（単数/複数）・部分更新・シートタブ作成ヘルパー |

**広告コピー/LPコピーそのものの生成（自然言語生成）は`runAutonomousAcquisition`の責務外**とし、
呼び出し側が`xAdsCandidates` / `lpCandidate`として生成済みのデータを渡す設計にしている。
現状は「このseminar_idで自律集客開始」という指示を受けたClaude（このリポジトリを操作するセッション）が
Parentの実データを読んだ上で広告コピーを生成し、`runAutonomousAcquisition`を呼び出す。
将来的には、この生成部分を`n8n/workflows/ai-seminar-pdca-acquisition.json`のようなn8n経由のClaude API呼び出しに
置き換えることを想定している（`docs/n8n-workflows.md`参照）。

## 配信期間の提案ロジック

`proposeAdFlight()`は、一般的なウェビナー集客の傾向（申込がセミナー直前の数日〜1週間に集中しやすい）を踏まえ、

- 配信終了日 = 開催日の前日
- 配信開始日 = 配信終了日から `flightDays`（デフォルト7日）遡った日

というヒューリスティックで日付を算出する純粋関数。`ad_budget_strategy = lifetime`（予算を配信期間全体で使い切る）を
前提にしており、将来的に他の予算方針（例: `daily`）を追加する場合は`proposeAdFlight`にロジックを追加する。

## トリガーと運用フロー

**人間がやること:**
1. Parentに新しいセミナー行を1つ追加する
2. `ad_budget_total`（と、ざっくりした配信期間の希望）を入力する
3. 「このseminar_idで自律集客開始」とClaude Codeに指示する
4. `X_ads.status`を`proposed → approved`に変更して広告案を承認する
5. `ad_budget_status`を`proposed → approved`に変更して予算案を承認する

**Claude Codeが自動でやること（`runAutonomousAcquisition`）:**
1. 指定seminar_idのParent行から企画情報・予算情報を読む
2. 配信期間を提案し、Parentに書き込む（`ad_budget_status`は空なら`proposed`）
3. X広告案を3パターン生成し、X_adsに`status=proposed`で書き込む
4. LP案を1パターン生成し、LPsに`status=proposed`で書き込む

## Status ライフサイクル

- **`ad_budget_status`**（Parent）: `proposed` → 人間が`approved`に変更 → （将来）Xキャンペーン作成のトリガー
- **`X_ads.status`**: `proposed` → 人間が`approved`に変更 → （将来）X広告として入稿 → 実績が溜まったら`paused_auto`（自動停止）または`winner`（勝ちパターン）に遷移
- **`LPs.status`**: `proposed` → 人間が`approved`に変更 → （将来）実LPとして公開

## 毎週の投稿PDCA（`scripts/weekly-post-pdca.js`）

Google Sheetsとは独立した軽量ユーティリティ。毎週 `{ week, ctr, signups, prev_ctr, prev_signups }`
（KPIは`signups`=LPからのセミナー申込数）を渡すと、状態を判定し、次の投稿案・LP改善案を含む
レポートJSONを返す。

```
node scripts/weekly-post-pdca.js '{"week":"2026-07-13週","ctr":0.015,"signups":12}'
```

### 判定ロジック（`classifyWeek`、純粋関数）

| 条件 | status | 内容 |
|---|---|---|
| `prev_ctr`/`prev_signups`が無い（初週） | `baseline` | ベースライン確立。投稿A/B案を新規生成 |
| `signups >= prev_signups` かつ `ctr >= prev_ctr` | `keep` | 現状維持。軽微な文言改善のみ |
| `signups >= prev_signups` かつ `ctr < prev_ctr` | `replace_post` | 投稿差し替え（LPは維持） |
| `signups < prev_signups` かつ `ctr >= prev_ctr` | `improve_lp` | LP改善優先（投稿の軸は維持、新規投稿コピーなし） |
| `signups < prev_signups` かつ `ctr < prev_ctr` | `replace_post_and_improve_lp` | 投稿差し替え＋LP改善の両方 |

投稿案は固定2軸（`POST_AXES`: A=「AI導入の着手点で止まっている経営者向け」、
B=「人手不足・属人化で限界に近い現場向け」）から`buildPostText()`で組み立てる
（280〜300文字のX広告制限内、末尾に`{{LP_URL}}`プレースホルダ）。LP改善案（見出し/導入文/ベネフィット順）は
`generateLpSuggestions()`が返す。実LP本文（`lpExcerpt`）を渡すとより具体的な示唆に精緻化できる余地を
残しているが、現状は汎用的な改善観点を返す実装にとどまる。

Sheets（Parent/X_ads_ops/LPs）への書き込みは行わない。将来的に自動化する場合は、
`scripts/acquisition-agent.js`側からこのモジュールの関数を呼び出す形で組み込む想定。

## 将来のX API連携（未実装、設計のみ）

詳細なI/O契約・実装状況は [`docs/x-ads-integration.md`](x-ads-integration.md) を参照。
現時点ではX APIそのものへの接続・入稿は行わない。ただし将来的に以下のフローを組む前提で
データ構造・命名（`x_campaign_id` / `x_adset_id` / `x_ad_id` / `impressions` / `clicks` / `spend`）を
X_adsシートに用意済み。

1. **入稿**: X_adsで`status=approved`の行だけを対象に、X広告キャンペーン/広告セット/広告を自動作成し、
   発行された`x_campaign_id` / `x_adset_id` / `x_ad_id`をX_adsの該当行に書き戻す。
2. **実績取得（Check）**: X APIまたはn8n経由で`impressions` / `clicks` / `spend`を取得し、X_adsとParent
   （`lp_visits` / `registrations`等）に書き戻す。
3. **診断（Check）**: 配信期間終了時、または一定のインプレッション/クリックが溜まったタイミングで、
   CTR・CPC・LP CVR・CPAを算出し、ボトルネックが広告側かLP側かを判定する（`docs/agent-design.md`の
   Diagnostics Agentのロジックを流用・拡張する想定）。
4. **改善（Act）**: 判定結果に基づき、
   - 新しい広告案をX_adsに`status=proposed`で追加
   - LPコピーの改訂案をLPsに追加
   - Parentの`notes`に「次にどこを改善すべきか」を追記
   することで、PDCAの「Check」「Act」を自動化する。

## 現状の制約・TODO

- X API連携（入稿・実績取得）は未実装。
- 広告コピー/LPコピーの生成は、現状Claude（このセッション）による都度実行に依存している。
  n8n経由でClaude APIを呼ぶ自動生成フローへの置き換えは今後の課題。
- `Ads_settings`シート（予算・期間の詳細設定用）は、現時点ではParentの`ad_budget_*`/`ad_flight_*`カラムで
  代替できているため作成していない。予算方針が複雑化した場合に切り出しを検討する。
