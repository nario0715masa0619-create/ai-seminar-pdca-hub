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
