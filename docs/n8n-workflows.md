# n8n Workflows

n8n上で、Parent Sheetの更新をきっかけにClaude Agentを呼び出し、結果を各シートへ書き戻すワークフローの
「各ノードの入出力（I/O契約）」を定義する。実際の n8n ワークフローJSON（ノード配置・接続）は
[n8n/workflows/](../n8n/workflows/) を参照。本ドキュメントはそれを補完し、各ノードが
「どんなJSONを受け取り、どんなJSONを返すか」に焦点を当てる。

Claude APIのエンドポイント・パラメータ（モデル名・max_tokens等）自体は、n8nのHTTP Requestノード側で
設定する想定であり、本ドキュメントでは扱わない。API keyやn8nのベースURLも本リポジトリにはハードコードしない。

## Overview

基本フロー: 「Parent Sheetに行が追加/更新されたら、対応するClaude Agentを呼び、結果を各シートに書き込む」

```
[Trigger] --> [Build Payload] --> [Call Claude Agent] --> [Validate Output] --> [Append to Sheets]
```

- **Trigger**: Webhook（外部からの新規セミナー登録等）、Google Sheets Trigger（Parent Sheetの行追加/更新）、
  またはスケジュール実行（Diagnostics Agentのみ）を想定。
- **Build Payload**: 対象 `seminar_id` に紐づく Parent Sheet 行および関連テンプレ行を集約し、
  各エージェントの Inputs（`docs/agent-design.md` の Agent I/O 参照）に合わせたJSONを組み立てる。
  ローカルでの検証には `scripts/build-payload.js` のダミー実装を参照する。
- **Call Claude Agent**: HTTP Requestノードで Claude API を呼ぶ。システムプロンプトは対応する
  `prompts/*.md` の全文、ユーザー入力は Build Payload の出力JSON。レスポンスは各 `prompts/*.md` の
  「Output JSON schema」セクションに定義された形。
- **Validate Output**: レスポンスJSONが期待するキー・型を持つかを検証する（詳細な検証ロジックは実装時に確定）。
- **Append to Sheets**: `scripts/sync-sheets.js` の `appendRow({ sheetKey, values })` と同じ契約で、
  `scripts/sync-sheets.js` の `payloadToRow(sheetKey, data)` を使って行データに変換した上でシートに追記する。

## Acquisition Flow

Acquisition Agent（`prompts/acquisition.md`）を呼び、X広告案とLP構成案を生成して書き戻す。

1. **Trigger**: Webhook（新規セミナー登録、または手動実行）
   - Input: `{ "seminar_id": "string" }`
2. **Build Payload**
   - Input: Trigger の出力（`seminar_id`）
   - Output:
     ```json
     {
       "parent": { "...Parent Sheetの該当行（docs/schema.md準拠）" },
       "x_ads": ["...X Ads Templateの既存行（あれば、複数可）"],
       "lp": ["...LP Templateの既存行（あれば、複数可）"]
     }
     ```
3. **Call Claude Agent**
   - System prompt: `prompts/acquisition.md` の全文
   - Input（Userメッセージ）: 上記 Build Payload の出力JSON
   - Output: `prompts/acquisition.md` の Output JSON schema
     （`x_ads`: 配列, `lp`: オブジェクト, `next_test_recommendation`: オブジェクト）
4. **Validate Output**
   - `x_ads` が配列であること、`lp` がオブジェクトであること、両方に `test_variable` / `hypothesis` が
     含まれることを確認する。
5. **Append to Sheets**
   - `output.x_ads` の各要素について `appendRow({ sheetKey: "x_ads", values: payloadToRow("x_ads", entry) })`
   - `output.lp` について `appendRow({ sheetKey: "lp", values: payloadToRow("lp", output.lp) })`

## Seminar Content Flow

Seminar Content Agent（`prompts/seminar-content.md`）を呼び、トークスクリプトとスライド構成を生成して書き戻す。

1. **Trigger**: Webhook（新規セミナー登録、または手動実行）
   - Input: `{ "seminar_id": "string" }`
2. **Build Payload**
   - Output:
     ```json
     {
       "parent": { "...Parent Sheetの該当行" },
       "talk": ["...Talk Script Templateの既存行（あれば）"],
       "slides": ["...Slide Templateの既存行（あれば）"]
     }
     ```
3. **Call Claude Agent**
   - System prompt: `prompts/seminar-content.md` の全文
   - Input: 上記 Build Payload の出力JSON
   - Output: `prompts/seminar-content.md` の Output JSON schema
     （`talk`: オブジェクト, `slides`: オブジェクト, `content_adjustment_recommendation`: オブジェクト）
4. **Validate Output**
   - `talk.outline` / `slides.outline` が空文字でないことを確認する。
5. **Append to Sheets**
   - `appendRow({ sheetKey: "talk", values: payloadToRow("talk", output.talk) })`
   - `appendRow({ sheetKey: "slides", values: payloadToRow("slides", output.slides) })`

## Diagnostics Flow

Diagnostics Agent（`prompts/diagnostics.md`）を呼び、KPI診断とテンプレ改善優先度を算出する。
**他のフローと異なり、シートへの書き戻しは行わない**（レポート出力のみ。将来的にはこの出力を
Orchestrator Agent が受け取り、他エージェントの呼び出し判断に使う想定 — `docs/agent-design.md` の
Orchestrator Agent セクション参照）。

1. **Trigger**: スケジュール実行（例: 毎週月曜）または手動実行
   - Input: なし（全セミナーを対象とするため）
2. **Build Payload**
   - Output:
     ```json
     { "parent_rows": ["...Parent Sheetの全行"] }
     ```
3. **Call Claude Agent**
   - System prompt: `prompts/diagnostics.md` の全文
   - Input: 上記 Build Payload の出力JSON
   - Output: `prompts/diagnostics.md` の Output JSON schema
     （`seminar_kpis`, `benchmark`, `bottlenecks`, `improvement_priorities`）
4. **Validate Output**
   - `improvement_priorities` の各要素の `template` が
     `x_ads | lp | talk_script | slides | follow_up` のいずれかであることを確認する。
5. **後続処理（Sheets書き込みなし）**
   - Slack通知、またはOrchestrator Agentへの引き渡し（未実装）。

## Follow-up Flow

Follow-up Agent（`prompts/follow-up.md`）を呼び、セグメント別フォローシナリオを生成して書き戻す。

1. **Trigger**: Webhook（セミナー終了イベント、または手動実行）
   - Input: `{ "seminar_id": "string" }`
2. **Build Payload**
   - Output:
     ```json
     {
       "parent": { "...Parent Sheetの該当行" },
       "follow_up": ["...Follow-up Templateの既存行（セグメント別、あれば）"]
     }
     ```
3. **Call Claude Agent**
   - System prompt: `prompts/follow-up.md` の全文
   - Input: 上記 Build Payload の出力JSON
   - Output: `prompts/follow-up.md` の Output JSON schema
     （`follow_up_scenarios`: 配列, `improvement_recommendation`: オブジェクト）
4. **Validate Output**
   - `follow_up_scenarios` の各要素に `segment` / `trigger` / `test_variable` が含まれることを確認する。
5. **Append to Sheets**
   - `output.follow_up_scenarios` の各要素について
     `appendRow({ sheetKey: "follow_up", values: payloadToRow("follow_up", entry) })`

## 未確定事項（TODO）

- Claude Agent 呼び出しノードの実体（Claude APIへの直接HTTP Request か、Claude Code CLI経由か）は未確定。
  本ドキュメントの「Call Claude Agent」はどちらの実装でも通用するI/O契約として書いている。
- Validate Output の検証ロジックの厳密さ（JSON Schemaライブラリを使うか、n8nのFunctionノードで手書きするか）は未確定。
- Build Payload ノードが Google Sheets から直接読むか、`scripts/build-payload.js` 相当のロジックを
  HTTP経由で呼ぶ別サービスにするかは未確定。
