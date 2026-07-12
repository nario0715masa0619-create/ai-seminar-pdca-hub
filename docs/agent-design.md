# Agent Design

`ai-seminar-pdca-hub` は、1つのセミナーに対して「5点セット（X広告、LP、トーク、スライド、終了後フォロー）」を一気通貫でPDCAするためのClaude Codeエージェント群で構成される。

## Agents Overview

- Acquisition Agent  
  - 役割: 集客まわり（X広告、LP）の生成と改善提案
- Seminar Content Agent  
  - 役割: トークスクリプト、スライドの生成と改善提案
- Diagnostics Agent  
  - 役割: 親シートのKPIからボトルネック診断 & 「次に直すべき箇所」の特定
- Follow-up Agent  
  - 役割: 終了後フォローのシナリオと文面の生成・改善

- Orchestrator Agent（設計のみ、未実装）
  - 役割: Diagnostics Agent の診断結果をもとに、どのサブエージェント（Acquisition / Seminar Content / Follow-up）をどの順で呼び出すかを決定し、実行結果を統合レポートとしてまとめる

## Agent I/O

### Acquisition Agent

- Inputs
  - Parent Sheet row
  - X Ads Template
  - LP Template
- Outputs
  - X広告案（複数パターン）
  - LP構成案
  - 「どのテスト変数を次に変すべきか」の提案

### Seminar Content Agent

- Inputs
  - Parent Sheet row
  - Talk Script Template
  - Slide Template
- Outputs
  - トークスクリプト草案
  - スライド構成（セクションごとのスライド一覧と要点）
  - 「どのパートを削る/厚くするか」の提案

### Diagnostics Agent

- Inputs
  - Parent Sheet 全行
- Outputs
  - セミナー別のKPI（申込率・参加率・アンケ回答率・商談化率・受注率）
  - ボトルネックの診断（例: 「参加率が平均より低い」）
  - 「次回はどのテンプレを改善すべきか」の優先度

### Follow-up Agent

- Inputs
  - Parent Sheet row
  - Follow-up Template
- Outputs
  - セグメント別フォローメール草案
  - フォロー施策の改善案（タイミング・件名・CTAなど）

### Orchestrator Agent（設計のみ、未実装）

Diagnostics Agent の診断結果を起点に、他のサブエージェントを呼び出す司令塔。単体では生成物を持たず、
既存4エージェントの入出力（本ドキュメントの定義）をそのまま利用する。

- Inputs
  - Diagnostics Agent の Output（`bottlenecks` / `improvement_priorities`、`prompts/diagnostics.md` 参照）
  - Parent Sheet row（対象セミナー）
- Process
  1. Diagnostics Agent の `improvement_priorities` を優先度順に読む。
  2. `template` の値（`x_ads` / `lp` → Acquisition Agent、`talk_script` / `slides` → Seminar Content Agent、`follow_up` → Follow-up Agent）に応じて、呼び出すサブエージェントを決定する。
  3. 優先度1位のサブエージェントを呼び出し、対応する Inputs（各エージェント定義を参照）を渡す。
  4. サブエージェントの Output を受け取り、後述の統合レポート形式にまとめる。
  5. 必要に応じて優先度2位以降も同様に呼び出す（同一実行内で複数呼ぶか、次回実行に回すかは運用側の判断とする）。
- Outputs
  - `invoked_agents`: 今回呼び出したサブエージェント名の配列
  - `agent_outputs`: 各サブエージェントの Output をそのまま格納したオブジェクト（キーはエージェント名）
  - `summary`: 今回の実行で何を改善しようとしたか（診断結果と紐づけた要約）
- Guardrails
  - Diagnostics Agent を経由せずにサブエージェントを直接呼び出す通常フロー（人手でのテンプレ改善依頼など）を妨げない。あくまで「診断→自動呼び出し」を高速化するための追加ルート。
  - 1回の実行で全サブエージェントを無条件に呼び出さない。`improvement_priorities` に基づく呼び出し対象の絞り込みを必須とする。
  - 実装（呼び出し方式・n8nワークフローとの連携）は `n8n/README.md` を参照。本セクションはエージェント間のI/O契約の定義に留める。
