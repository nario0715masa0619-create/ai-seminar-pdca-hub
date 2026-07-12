# n8n Workflows

Claude Agentの呼び出しは **n8n の HTTP Request ノードから Claude API を直接叩く** 方式で統一する。
Claude APIキーは **n8nのCredentials機能に保持**し、本リポジトリには一切保存しない
（`config/sheets.json`と同様、実secretはこのリポジトリの外に置く）。

本リポジトリが責務を持つのは次の4点のみ:
- `prompts/` — 各エージェントのシステムプロンプト
- `docs/schema.md` — シートのカラム定義
- `scripts/sync-sheets.js` — Google Sheetsへの読み書き
- `n8n/workflows/` と本ドキュメント — n8nワークフローの構造とI/O契約

n8n上のワークフロー本体（ノード配置・接続・Credentials設定）は
[n8n/workflows/](../n8n/workflows/) にJSONとして置く（`workflows/`ディレクトリは重複のため非推奨、
新規ワークフローは`n8n/workflows/`に追加すること）。本ドキュメントはそれを補完し、
各ノードが「どんなJSONを受け取り、どんなJSONを返すか」というI/O契約に焦点を当てる。

## Overview

基本フロー: 「Parent Sheetに行が追加/更新されたら、対応するClaude Agentを呼び、結果を各シートに書き込む」

```
[Trigger] --> [Build Payload] --> [Call Claude Agent (HTTP Request)] --> [Validate Output] --> [Save to Sheets]
```

- **Trigger**: Webhook（外部からの新規セミナー登録等）または手動実行（n8nのManual Trigger）。
  Diagnostics Flowのみスケジュール実行も想定。
- **Build Payload**: 対象 `seminar_id` に紐づく Parent Sheet 行および関連テンプレ行を集約し、
  各エージェントの Inputs（`docs/agent-design.md` の Agent I/O 参照）に合わせたJSONを組み立てる。
  ローカルでの検証には `scripts/build-payload.js` の `buildPayload(seminarId)` を参照する。
- **Call Claude Agent**: n8nのHTTP RequestノードでClaude APIを直接呼ぶ。ノード構成の詳細は
  [Claude API Call Contract](#claude-api-call-contract) を参照。システムプロンプトは対応する
  `prompts/*.md` の全文、ユーザー入力は Build Payload の出力JSON。レスポンスは各 `prompts/*.md` の
  「Output JSON schema」セクションに定義された形。
- **Validate Output**: レスポンスJSONが期待するキー・型を持つかを検証する。ロジックは
  [`scripts/validate-agent-output.js`](../scripts/validate-agent-output.js) を参照（詳細は後述）。
- **Save to Sheets**: `scripts/sync-sheets.js` の `appendRow({ sheetKey, values })` と同じ契約で、
  `payloadToRow(sheetKey, data)` を使って行データに変換した上でシートに追記する。n8n側では
  Google Sheetsノード、または本リポジトリのスクリプトをHTTP経由で呼ぶ別サービスのいずれかを想定
  （未確定、[未確定事項](#未確定事項todo)参照）。

## Acquisition Flow

Acquisition Agent（`prompts/acquisition.md`）を呼び、X広告案とLP構成案を生成して書き戻す。

1. **Trigger**: Webhook（新規セミナー登録）または手動実行
   - Input: `{ "seminar_id": "string" }`
2. **Build Payload**
   - Input: Trigger の出力（`seminar_id`）
   - Output（`prompts/acquisition.md` の Inputs と対応）:
     ```json
     {
       "parent": { "...Parent Sheetの該当行（docs/schema.md準拠）" },
       "x_ads": ["...X Ads Templateの既存行（あれば、複数可）"],
       "lp": ["...LP Templateの既存行（あれば、複数可）"]
     }
     ```
3. **Call Claude Agent**（HTTP Request node、[contract](#claude-api-call-contract)参照）
   - system: `prompts/acquisition.md` の全文
   - user message: 上記 Build Payload の出力JSONを文字列化したもの
   - Output（`prompts/acquisition.md` の Output JSON schema）:
     ```json
     {
       "x_ads": [{ "objective": "...", "primary_cta": "...", "test_variable": "...", "hypothesis": "...", "...": "..." }],
       "lp": { "hero_title": "...", "test_variable": "...", "hypothesis": "...", "...": "..." },
       "next_test_recommendation": { "target": "x_ads | lp", "variable": "...", "reason": "..." }
     }
     ```
4. **Validate Output**
   - `node scripts/validate-agent-output.js acquisition <output.json>` と同等のチェック
     （`x_ads`が配列であること、`lp`がオブジェクトであること、両方に`test_variable`/`hypothesis`が含まれること）
5. **Save to Sheets**
   - `output.x_ads` の各要素について `appendRow({ sheetKey: "x_ads", values: payloadToRow("x_ads", entry) })`
   - `output.lp` について `appendRow({ sheetKey: "lp", values: payloadToRow("lp", output.lp) })`

## Seminar Content Flow

Seminar Content Agent（`prompts/seminar-content.md`）を呼び、トークスクリプトとスライド構成を生成して書き戻す。

1. **Trigger**: Webhook（新規セミナー登録）または手動実行
   - Input: `{ "seminar_id": "string" }`
2. **Build Payload**
   - Output（`prompts/seminar-content.md` の Inputs と対応）:
     ```json
     {
       "parent": { "...Parent Sheetの該当行" },
       "talk": ["...Talk Script Templateの既存行（あれば）"],
       "slides": ["...Slide Templateの既存行（あれば）"]
     }
     ```
3. **Call Claude Agent**（HTTP Request node）
   - system: `prompts/seminar-content.md` の全文
   - user message: 上記 Build Payload の出力JSON
   - Output（`prompts/seminar-content.md` の Output JSON schema）:
     ```json
     {
       "talk": { "outline": "...", "test_variable": "...", "hypothesis": "...", "...": "..." },
       "slides": { "outline": "...", "test_variable": "...", "hypothesis": "...", "...": "..." },
       "content_adjustment_recommendation": { "target": "talk | slides", "part": "...", "action": "trim | expand", "reason": "..." }
     }
     ```
4. **Validate Output**
   - `node scripts/validate-agent-output.js seminar-content <output.json>` と同等のチェック
     （`talk.outline` / `slides.outline` が空文字でないこと）
5. **Save to Sheets**
   - `appendRow({ sheetKey: "talk", values: payloadToRow("talk", output.talk) })`
   - `appendRow({ sheetKey: "slides", values: payloadToRow("slides", output.slides) })`

## Follow-up Flow

Follow-up Agent（`prompts/follow-up.md`）を呼び、セグメント別フォローシナリオを生成して書き戻す。

1. **Trigger**: Webhook（セミナー終了イベント）または手動実行
   - Input: `{ "seminar_id": "string" }`
2. **Build Payload**
   - Output（`prompts/follow-up.md` の Inputs と対応）:
     ```json
     {
       "parent": { "...Parent Sheetの該当行" },
       "follow_up": ["...Follow-up Templateの既存行（セグメント別、あれば）"]
     }
     ```
3. **Call Claude Agent**（HTTP Request node）
   - system: `prompts/follow-up.md` の全文
   - user message: 上記 Build Payload の出力JSON
   - Output（`prompts/follow-up.md` の Output JSON schema）:
     ```json
     {
       "follow_up_scenarios": [
         { "segment": "...", "trigger": "...", "test_variable": "...", "hypothesis": "...", "...": "..." }
       ],
       "improvement_recommendation": { "segment": "...", "variable": "...", "reason": "..." }
     }
     ```
4. **Validate Output**
   - `node scripts/validate-agent-output.js follow-up <output.json>` と同等のチェック
     （`follow_up_scenarios`の各要素に`segment`/`trigger`/`test_variable`が含まれること）
5. **Save to Sheets**
   - `output.follow_up_scenarios` の各要素について
     `appendRow({ sheetKey: "follow_up", values: payloadToRow("follow_up", entry) })`

## Diagnostics Flow

Diagnostics Agent（`prompts/diagnostics.md`）を呼び、KPI診断とテンプレ改善優先度を算出する。
**主体はParent SheetのKPI診断であり、Claude呼び出しは「診断結果の言語化・優先度付け」を担う任意レイヤーである。**
KPIの単純な算出（申込率・参加率など、`prompts/diagnostics.md`のProcess 1〜3）はn8nのCodeノードで
決定的に計算可能なため、Claude呼び出しなしでも動作しうる。ボトルネックの所見文（`bottlenecks[].diagnosis`）や
改善優先度の理由付け（`improvement_priorities[].reason`）など、定型化しにくい判断を伴う部分にのみ
Claude呼び出しが必須となる。MVPでは簡略化のため「KPI算出はCodeノード、診断・優先度付けはClaude呼び出し」の
2段構成を推奨する。

**シートへの書き戻しは行わない**（レポート出力のみ。将来的にはこの出力を Orchestrator Agent が受け取り、
他エージェントの呼び出し判断に使う想定 — `docs/agent-design.md` の Orchestrator Agent セクション参照）。

1. **Trigger**: スケジュール実行（例: 毎週月曜）または手動実行
   - Input: なし（全セミナーを対象とするため）
2. **Build Payload**
   - Output:
     ```json
     { "parent_rows": ["...Parent Sheetの全行"] }
     ```
3. **Call Claude Agent**（HTTP Request node、任意レイヤー。上記参照）
   - system: `prompts/diagnostics.md` の全文
   - user message: 上記 Build Payload の出力JSON（Codeノードで算出済みのKPI値を含めてもよい）
   - Output（`prompts/diagnostics.md` の Output JSON schema）:
     ```json
     {
       "seminar_kpis": [{ "seminar_id": "...", "registration_rate": 0.0, "...": "..." }],
       "benchmark": { "avg_registration_rate": 0.0, "...": "..." },
       "bottlenecks": [{ "seminar_id": "...", "funnel_stage": "...", "metric": "...", "diagnosis": "..." }],
       "improvement_priorities": [{ "priority": 1, "template": "x_ads | lp | talk_script | slides | follow_up", "reason": "..." }]
     }
     ```
4. **Validate Output**
   - `node scripts/validate-agent-output.js diagnostics <output.json>` と同等のチェック
     （`improvement_priorities`の各要素の`template`が許容値のいずれかであること）
5. **後続処理（Sheets書き込みなし）**
   - Slack通知、またはOrchestrator Agentへの引き渡し（未実装）。

## Claude API Call Contract

n8nのHTTP RequestノードからClaude API（Messages API相当）を呼ぶ際の最低限の構成。
**実APIキー・実エンドポイントURLは本ドキュメント・本リポジトリのいずれにも記載しない。**
n8nのCredentials機能（またはn8n環境変数・Workflow変数）で注入すること。

- **Method**: `POST`
- **Endpoint**: Claude Messages API相当のURL（n8n Credential / 環境変数 / Workflow変数で注入。値はここに書かない）
- **Headers**:
  - `x-api-key`: n8n Credentialsから注入（値はここに書かない）
  - `anthropic-version`: 使用するAPIバージョン文字列（n8n側で固定値として設定）
  - `content-type`: `application/json`
- **Body**（JSON）:
  ```json
  {
    "model": "n8n側で選択するモデル名（例: claude-sonnet-5 系）",
    "max_tokens": "n8n側で設定する整数値",
    "system": "対応する prompts/*.md の全文をそのまま渡す",
    "messages": [
      { "role": "user", "content": "Build Payloadノードの出力JSONを文字列化したもの" }
    ]
  }
  ```
- **レスポンスの扱い**: Claudeのレスポンス本文からJSON部分を抽出し、対応するFlowの
  「Output JSON schema」としてパースする。Claude側にJSONのみを返させたい場合、
  systemプロンプト（`prompts/*.md`）の「Output JSON schema」セクションと「Guardrails」の
  「出力は指定のJSON schemaに厳密に従い、余計な説明文をJSON外に含めない」という指示に従わせる。

具体的なリクエスト/レスポンスのサンプルJSONは [`docs/claude-api-examples.md`](claude-api-examples.md) を参照。

## Validate Output の実装

各Flowの「Validate Output」で説明したチェックは、[`scripts/validate-agent-output.js`](../scripts/validate-agent-output.js)
に実装として固定化されている。n8n側では、Call Claude Agentノードのレスポンスをこのロジックと同等の
Functionノード（またはHTTP経由でこのスクリプトを呼ぶ別サービス）に通す想定。

```
node scripts/validate-agent-output.js <agentKey> <path-to-output.json>
# agentKey: acquisition | seminar-content | diagnostics | follow-up
# 標準出力: { "valid": boolean, "errors": string[] }、exit code: valid=1のとき非0
```

チェック内容を変更する場合は、`scripts/validate-agent-output.js` と本ドキュメントの各Flowの
「Validate Output」セクションの両方を更新すること。

## 未確定事項（TODO）

- Build Payload ノードが Google Sheets から直接読むか、`scripts/build-payload.js` 相当のロジックを
  HTTP経由で呼ぶ別サービスにするかは未確定。
- Save to Sheets ノードが n8n標準の Google Sheets ノードを使うか、`scripts/sync-sheets.js` をHTTP経由で
  呼ぶ別サービスにするかは未確定。
- Diagnostics Flow の「Codeノードによる決定的なKPI算出」部分の実装（n8n Code node内のJS、または
  別サービス呼び出し）は未着手。
