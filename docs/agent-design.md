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

※将来的に、全体を統括する Orchestrator Agent を追加する余地を残す。

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
