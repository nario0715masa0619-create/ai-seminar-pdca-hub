# X Ads API Integration (設計、未接続)

X_ads_opsシートで`status=approved`になった広告案を、将来的にX Ads APIへ自動入稿し、実績（インプレッション/クリック/消化金額）を
取得してシートに書き戻すための連携設計。**現時点ではX Ads APIへの実接続は行わない。**

`docs/n8n-workflows.md`のClaude API連携と同じ方針を踏襲する: 実APIキー・実トークンは本リポジトリに一切保存せず、
n8nのCredentials（またはそれに準ずる外部シークレット管理）に保持する。本リポジトリが持つのは
「承認済み行のフィルタリング」「実績データのシート書き戻し」「PDCA診断」という決定的ロジックと、
X Ads APIを呼ぶ側（n8nのHTTP Requestノード等）が実装すべきI/O契約のドキュメントのみ。

## 全体像

```
[X_ads_ops: status=approved の行を抽出]  … scripts/acquisition-agent.js の getApprovedXAds()（実装済み）
        v
[X Ads API: campaign/adset/ad作成]        … 未実装。n8n等の外部でX Ads APIキーを使って実行する想定
        v
[発行された x_campaign_id/x_adset_id/x_ad_id をX_ads_opsに書き戻す]
        … scripts/acquisition-agent.js の writeAdIdentifiers()（実装済み、Sheets書き込みのみ）
        v
[配信開始後、一定期間ごとにX Ads APIから実績取得]  … 未実装。n8n等の外部で実行する想定
        v
[impressions/clicks/spendをX_ads_opsに書き戻す]
        … scripts/acquisition-agent.js の writeAdMetrics()（実装済み、Sheets書き込みのみ）
        v
[PDCA診断: CTR/CPC/LP CVR/CPAを算出し、ボトルネックを判定してParent.notesに追記]
        … scripts/acquisition-agent.js の runPdcaCheck()（実装済み、Sheets非依存の純粋計算+書き戻し）
```

## 承認済み行のフィルタリング（実装済み）

`getApprovedXAds(seminarId)`（`scripts/acquisition-agent.js`）が、X_ads_opsシートから
指定`seminar_id`かつ`status=approved`の行だけを抽出する。X Ads APIへの入稿対象は必ずこの関数の
戻り値に限定すること（`proposed`のまま人間が未承認の広告案を誤って入稿しないため）。

## X Ads API呼び出しのI/O契約（未実装、n8n側で実装する想定）

以下は、n8nのHTTP Requestノード（またはそれに相当する外部サービス）がX Ads APIを呼ぶ際に
実装すべき入出力の形。実際のエンドポイントURL・OAuth認証情報はここには書かない。

### 1. キャンペーン/広告セット/広告の作成

- **Input**（`getApprovedXAds()`の1件分から組み立てる）:
  ```json
  {
    "seminar_id": "2026-08-07-1000-ai-first-step",
    "ad_id": "2026-08-07-1000-ai-first-step-ad-1",
    "ad_headline": "...",
    "ad_body": "...",
    "creative_direction": "...",
    "cta_text": "...",
    "budget_total": 5000,
    "budget_currency": "JPY",
    "budget_strategy": "lifetime",
    "flight_start_date": "2026-07-31",
    "flight_end_date": "2026-08-06"
  }
  ```
- **Output**（X Ads APIのレスポンスから抽出し、`writeAdIdentifiers(adId, ids)`でX_ads_opsに書き戻す）:
  ```json
  { "x_campaign_id": "...", "x_adset_id": "...", "x_ad_id": "..." }
  ```

### 2. 実績取得

- **Input**: `x_campaign_id` / `x_adset_id` / `x_ad_id`（X_ads_opsから読む）、取得対象期間
- **Output**（`writeAdMetrics(adId, metrics)`でX_ads_opsに書き戻す）:
  ```json
  { "impressions": 12000, "clicks": 180, "spend": 3200 }
  ```

## PDCA診断（実装済み、Sheets非依存の純粋関数が中心）

実績データ（X_ads_opsの`impressions`/`clicks`/`spend`、Parentの`lp_visits`/`registrations`）が揃った時点で、
`runPdcaCheck(seminarId)`が以下を行う:

1. `getApprovedXAds()`で承認済み広告の実績を集計し、CTR・CPCを算出する（`aggregateAdMetrics`）。
2. Parentの`lp_visits`/`registrations`からLP CVRを算出する（`computeFunnelMetrics`）。
3. 広告費総額とregistrationsからCPAを算出する（`computeCPA`）。
4. CTR・LP CVRを既定の目安値（`diagnoseBottleneck`内、暫定値: CTR 1% / LP CVR 20%。実データが
   溜まってきたら実績ベースの閾値に調整すること）と比較し、広告側・LP側どちらがボトルネックかを判定する。
5. 診断結果をParentの`notes`に日付付きで追記する（`appendToParentNotes`、既存notesは残したまま追記）。

診断結果（`diagnosis.bottleneck`が`"ad"`か`"lp"`か）を踏まえて、新しい広告案・LP改訂案を生成するかどうかは
人間またはClaude（このセッション）が判断する。**新しい広告コピー/LPコピーそのものの生成は
`runPdcaCheck`の責務外**とし、既存の`writeAdCandidatesToXAds` / `writeLpCandidateToLPs`
（`docs/acquisition-automation.md`参照）を使って追加する。

## 現状の制約・TODO

- X Ads APIへの実接続（入稿・実績取得）は未実装。実装時は、Claude API連携（`docs/n8n-workflows.md`）と
  同様にn8n等の外部サービス側にAPIキーを持たせ、本リポジトリにはハードコードしないこと。
- `diagnoseBottleneck`の閾値（CTR 1% / LP CVR 20%）は暫定値。実績データが蓄積したら、業界平均や
  自社の過去実績を踏まえて調整すること。
- 新しい広告案/LP改訂案の自動生成（Actフェーズ）は、診断結果を受けて人間またはClaudeが判断して実行する
  半自動フローのまま。完全自動化する場合は、診断結果をトリガーにn8n経由でClaude APIを呼ぶ
  ワークフロー（`n8n/workflows/ai-seminar-pdca-acquisition.json`相当）を追加する。
