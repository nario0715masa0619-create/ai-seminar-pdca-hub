# n8n Integration

`ai-seminar-pdca-hub` の自動化を n8n 上で実行するためのワークフロー定義を置くディレクトリ。

## 想定アーキテクチャ

```
[Trigger]
   |  (Webhook or 手動実行 / スケジュール)
   v
[Build Payload]
   |  Parent Sheet + 5点セット各シートから対象セミナーの1行ずつを取得し、
   |  scripts/build-payload.js の buildPayload() と同じ形の統合ペイロードJSONを組み立てる
   v
[Call Claude Agent]
   |  n8n の HTTP Request ノードで Claude API を直接呼ぶ（方式確定済み）。
   |  prompts/{acquisition,seminar-content,diagnostics,follow-up}.md のいずれかを
   |  システムプロンプトとして、統合ペイロードJSONをユーザー入力として渡す。
   |  APIキーは n8n の Credentials に保持し、本リポジトリには一切保存しない。
   v
[Validate Output]
   |  エージェントの出力JSONが、対応する prompts/*.md の
   |  Output JSON schema に一致するか検証する（scripts/validate-agent-output.js 相当）
   v
[Save to Sheets]
   |  scripts/sync-sheets.js の appendRow({ sheetKey, values }) 相当の処理で、
   |  検証済みの出力を対応するシートに書き戻す
   v
[Notify]
      Slack等に「生成完了・要レビュー」の通知を送る（任意）
```

詳細なI/O契約（各ノードが何を受け取り何を返すか）は
[`docs/n8n-workflows.md`](../docs/n8n-workflows.md) を、
Claude API呼び出しの具体的なリクエスト/レスポンスJSON例は
[`docs/claude-api-examples.md`](../docs/claude-api-examples.md) を参照。

## ワークフローとエージェントの対応

| ワークフロー | 使用する prompts/*.md | 書き戻し先シート |
|---|---|---|
| 集客改善 | `prompts/acquisition.md` | X Ads Template, LP Template |
| コンテンツ改善 | `prompts/seminar-content.md` | Talk Script Template, Slide Template |
| 診断 | `prompts/diagnostics.md` | （書き戻しなし、レポート出力のみを想定） |
| フォロー改善 | `prompts/follow-up.md` | Follow-up Template |

## ディレクトリ構成

`n8n/workflows/*.json` — n8n にインポート可能なワークフロー定義（エクスポート形式）。
いずれも Webhook → Build Claude Input → Call Claude API（HTTP Request）→ Parse Claude Response →
Save to Sheet(s) の骨組みで、認証情報・実URL・実APIキーは含まない（各ノードの`notes`にTODOを明記）。

| ファイル | 対応エージェント | 書き戻し先シート |
|---|---|---|
| [`acquisition-webhook-to-claude-to-sheets.json`](workflows/acquisition-webhook-to-claude-to-sheets.json) | `prompts/acquisition.md` | x_ads, lp |
| [`seminar-content-webhook-to-claude-to-sheets.json`](workflows/seminar-content-webhook-to-claude-to-sheets.json) | `prompts/seminar-content.md` | talk, slides |
| [`follow-up-webhook-to-claude-to-sheets.json`](workflows/follow-up-webhook-to-claude-to-sheets.json) | `prompts/follow-up.md` | follow_up |
| [`generate-five-set.workflow.json`](workflows/generate-five-set.workflow.json) | （初期スケッチ、上記3本に分割済みのため参考用） | - |

Diagnostics Agent（`prompts/diagnostics.md`）はシートへの書き戻しがなく、KPI算出はCodeノードで
決定的に計算可能なため、ワークフローJSON化の優先度は低い（詳細は
[`docs/n8n-workflows.md`のDiagnostics Flow](../docs/n8n-workflows.md#diagnostics-flow)参照）。

## 現状の制約・TODO

- Google Sheets 認証情報（サービスアカウント）を n8n の Credential として別途登録する必要がある
  （このリポジトリのローカル実行では `config/sheets.json` + `GOOGLE_APPLICATION_CREDENTIALS` で完結済み、
  n8n側は別途設定が必要）。
- Claude API の Credential（`x-api-key`）を n8n の Credentials（例: Header Auth）として登録する必要がある。
- 各ワークフローJSONの「Build Claude Input」ノードは、実際にはGoogle Sheetsから該当行を読む処理に
  差し替える必要がある（現状はプレースホルダの空データ）。
- 各ワークフローJSONの「Save to Sheet」系ノードは、実際にはGoogle Sheetsノード（またはHTTP経由で
  `scripts/sync-sheets.js`を呼ぶ別サービス）に差し替える必要がある（現状はNoOpプレースホルダ）。
