# ai-seminar-pdca-hub

## プロジェクト概要
「X広告 → LP → トークスクリプト → スライド → 終了後フォロー」の5点セットを、無料AIセミナーを中心にClaude CodeエージェントでPDCAするための基盤リポジトリです。

## 5点セットの説明
1. **X広告**: セミナーへの集客を行うための広告クリエイティブおよびテキスト。
2. **LP (ランディングページ)**: 広告から流入したユーザーをコンバージョン（申し込み）に導くページ。
3. **トークスクリプト**: セミナー当日に登壇者が話す内容の台本。
4. **スライド**: セミナー当日に使用するプレゼンテーション資料。
5. **終了後フォロー**: セミナー参加者に対する事後アンケートや商談化のためのフォローアップ連絡。

## リポジトリ構成
| ディレクトリ | 内容 |
|---|---|
| `docs/` | スキーマ定義（`schema.md`）、エージェント設計（`agent-design.md`）、n8nワークフローのI/O契約（`n8n-workflows.md`）、X広告自律集客の設計（`acquisition-automation.md`）、X Ads API連携設計（`x-ads-integration.md`）、週次PDCA運用仕様（`weekly-post-pdca-ops.md`） |
| `prompts/` | 4エージェント（Acquisition / Seminar Content / Diagnostics / Follow-up）のプロンプト雛形 |
| `scripts/` | ペイロード生成・Sheets同期・スキーマ整合性チェックなどのNode.jsスクリプト（`npm test` / `npm run check-schema` で検証可能） |
| `tests/` | `scripts/` 配下の単体テスト（`node:test`、`npm test` で実行） |
| `config/` | `sheets.example.json`（実設定 `sheets.json` は `.gitignore` 対象） |
| `n8n/` | n8nワークフロー雛形と設計メモ（`n8n/README.md`） |
| `sheets/` | 各シートのヘッダー行CSV（`docs/schema.md` と `npm run check-schema` で同期を検証） |
| `workflows/` | n8nワークフローの別置き場（`n8n/workflows/` と重複。新規ワークフローは`n8n/workflows/`に追加する方針で確定、`workflows/`は非推奨） |
| `.github/workflows/` | CI（push/PR時に `npm test` と `npm run check-schema` を自動実行） |

## セットアップ
実運用（Google Sheetsへの実書き込み）には、`config/sheets.example.json` をコピーして
`config/sheets.json` を作成し、実際の `spreadsheetId` とシート名を埋めてください。
`config/sheets.json` は `.gitignore` で除外されているため、コミットされません。

対象スプレッドシート側には、`parent` / `x_ads` / `lp` / `talk` / `slides` / `follow_up` の
6タブ（シート名は`config/sheets.json`の`sheets`マッピングと一致させる）をあらかじめ作成しておく必要があります。
各シートのヘッダー行（`docs/schema.md`のカラム名がそのまま1行目に追記される）は、以下のコマンドで初期化できます。

```
node scripts/sync-sheets.js init-headers <sheetKey>   # 例: init-headers parent
node scripts/sync-sheets.js init-all-headers           # 6シートすべてを一括初期化
node scripts/sync-sheets.js append-test-row            # parentシートにE2E接続確認用のテスト行を1行追加
node scripts/sync-sheets.js clean-test-rows            # 全シートから seminar_id が "test-e2e-" で始まる行を削除
```

n8n Cloudで `ai-seminar-pdca-acquisition` を動かすには、
[`n8n/workflows/ai-seminar-pdca-acquisition.json`](n8n/workflows/ai-seminar-pdca-acquisition.json) をimportし、
HTTP RequestノードにClaude用Credential（名前: `Claude HTTP`）を紐付けてください。

## 今後の予定
- **MVPフェーズ**: X広告 ＋ LP ＋ セミナー1本 の検証サイクルを構築・運用。
