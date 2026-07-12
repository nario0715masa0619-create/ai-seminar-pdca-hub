# n8n Integration

`ai-seminar-pdca-hub` の自動化を n8n 上で実行するためのワークフロー定義を置くディレクトリ。

## 想定アーキテクチャ

```
[Trigger]
   |  (手動 or Google Sheets の行追加/更新 / スケジュール)
   v
[Build Payload]
   |  Parent Sheet + 5点セット各シートから対象セミナーの1行ずつを取得し、
   |  scripts/build-payload.js と同じ形の統合ペイロードJSONを組み立てる
   v
[Call Claude Agent]
   |  prompts/{acquisition,seminar-content,diagnostics,follow-up}.md のいずれかを
   |  システムプロンプトとして、統合ペイロードJSONをユーザー入力として渡す
   |  （呼び出し方式は Claude Code CLI 経由 or Claude API 経由を今後選定）
   v
[Validate Output]
   |  エージェントの出力JSONが、対応する prompts/*.md の
   |  Output JSON schema に一致するか検証する
   v
[Sync to Sheets]
   |  scripts/sync-sheets.js の appendRow 相当の処理で、
   |  検証済みの出力を対応するシートに書き戻す
   v
[Notify]
      Slack等に「生成完了・要レビュー」の通知を送る（任意）
```

## ワークフローとエージェントの対応

| ワークフロー | 使用する prompts/*.md | 書き戻し先シート |
|---|---|---|
| 集客改善 | `prompts/acquisition.md` | X Ads Template, LP Template |
| コンテンツ改善 | `prompts/seminar-content.md` | Talk Script Template, Slide Template |
| 診断 | `prompts/diagnostics.md` | （書き戻しなし、レポート出力のみを想定） |
| フォロー改善 | `prompts/follow-up.md` | Follow-up Template |

## ディレクトリ構成

- `n8n/workflows/*.json` — n8n にインポート可能なワークフロー定義（エクスポート形式）。
  現時点ではノード構成のみを固めた雛形であり、認証情報・シートID・Claude呼び出し方式は TODO。

## 現状の制約・TODO

- Google Sheets 認証情報（サービスアカウント）を n8n の Credential として別途登録する必要がある。
- Claude Agent の呼び出しノードは、HTTP Request（Claude API）にするか、
  外部スクリプト実行（Claude Code CLI）にするかを未決定。どちらを選ぶかは要検討。
- `scripts/sync-sheets.js` 側の `SPREADSHEET_ID` / `SHEET_RANGES` が確定してから、
  n8n ワークフロー内の Google Sheets ノードのパラメータも確定させる。
