# Claude API Examples

n8nのHTTP RequestノードからClaude API（Messages API相当）を呼ぶ際の、リクエスト/レスポンスの
サンプルJSON集。目的は「Claude API呼び出しの実装者が、フィールド名やネストの形で迷わないこと」。

呼び出し方式の全体像は [`docs/n8n-workflows.md`](n8n-workflows.md#claude-api-call-contract) を参照。
本ドキュメントに載せる値は**すべてサンプル**であり、実際のAPIキー・実URL・実モデルIDは含まない。

## 共通ルール

- `system` フィールドには、対応する `prompts/*.md` の全文をそのまま渡す（本ドキュメントでは長いため`<...>`で省略表記する）。
- `messages[0].content` には、Build Payloadノードの出力JSON（`docs/n8n-workflows.md`の各Flow参照）を
  **JSON文字列化したもの**を渡す。以下のサンプルでは可読性のため展開して示す。
- Claudeからの応答は Messages API の標準形（`content[0].text`にテキストが入る）で返る。
  `content[0].text` の中身をさらに `JSON.parse` したものが、各エージェントの
  「Output JSON schema」（`prompts/*.md`参照）に一致する。

## 1. Acquisition Agent

### Request example

```json
{
  "model": "<n8n側で選択するモデルID。例: claude-sonnet-5>",
  "max_tokens": 4096,
  "system": "<prompts/acquisition.md の全文>",
  "messages": [
    {
      "role": "user",
      "content": "{\"parent\":{\"seminar_id\":\"sem_2026_001\",\"seminar_name\":\"AI活用で広告費を半分にする無料セミナー\",\"target_audience\":\"中小企業のマーケティング責任者\",\"main_message\":\"広告改善\",\"title_type\":\"problem-solution\",\"main_problem\":\"広告費が高騰しているのに成果が伸びない\",\"promised_value\":\"AIで広告運用を効率化する具体的な手法がわかる\",\"primary_cta\":\"無料個別相談を予約する\",\"secondary_cta\":\"資料をダウンロードする\"},\"x_ads\":[],\"lp\":[]}"
    }
  ]
}
```

`messages[0].content` を展開した実体（参考。実送信時は文字列化する）:

```json
{
  "parent": {
    "seminar_id": "sem_2026_001",
    "seminar_name": "AI活用で広告費を半分にする無料セミナー",
    "target_audience": "中小企業のマーケティング責任者",
    "main_message": "広告改善",
    "title_type": "problem-solution",
    "main_problem": "広告費が高騰しているのに成果が伸びない",
    "promised_value": "AIで広告運用を効率化する具体的な手法がわかる",
    "primary_cta": "無料個別相談を予約する",
    "secondary_cta": "資料をダウンロードする"
  },
  "x_ads": [],
  "lp": []
}
```

### Response example（Claude Messages APIの生レスポンス）

```json
{
  "id": "msg_01ExampleId",
  "type": "message",
  "role": "assistant",
  "model": "<リクエストで指定したモデルID>",
  "content": [
    {
      "type": "text",
      "text": "{\"x_ads\":[{\"ad_id\":\"\",\"seminar_id\":\"sem_2026_001\",\"objective\":\"registration\",\"target_audience\":\"中小企業のマーケ責任者\",\"main_message\":\"広告改善\",\"title_type\":\"problem-solution\",\"core_benefit\":\"広告費を増やさずに成果を伸ばす方法がわかる\",\"offer\":\"無料AIセミナー\",\"primary_cta\":\"今すぐ申し込む\",\"creative_type\":\"image\",\"test_variable\":\"headline\",\"hypothesis\":\"課題訴求型の見出しの方がベネフィット訴求型より申込率が高い\"}],\"lp\":{\"hero_title\":\"広告費を増やさずに成果を伸ばす、AI活用の具体策\",\"core_benefit\":\"AIを使った広告運用の効率化手法がわかる\",\"primary_cta\":\"無料で申し込む\",\"test_variable\":\"hero\",\"hypothesis\":\"課題提起型のhero_titleの方が申込率が高い\"},\"next_test_recommendation\":{\"target\":\"lp\",\"variable\":\"hero\",\"reason\":\"heroパターンが未検証のため\"}}"
    }
  ],
  "stop_reason": "end_turn"
}
```

`content[0].text` を `JSON.parse` した結果（Validate Outputノードに渡すオブジェクト。
`prompts/acquisition.md` の Output JSON schemaに一致）:

```json
{
  "x_ads": [
    {
      "ad_id": "",
      "seminar_id": "sem_2026_001",
      "objective": "registration",
      "target_audience": "中小企業のマーケ責任者",
      "main_message": "広告改善",
      "title_type": "problem-solution",
      "core_benefit": "広告費を増やさずに成果を伸ばす方法がわかる",
      "offer": "無料AIセミナー",
      "primary_cta": "今すぐ申し込む",
      "creative_type": "image",
      "test_variable": "headline",
      "hypothesis": "課題訴求型の見出しの方がベネフィット訴求型より申込率が高い"
    }
  ],
  "lp": {
    "hero_title": "広告費を増やさずに成果を伸ばす、AI活用の具体策",
    "core_benefit": "AIを使った広告運用の効率化手法がわかる",
    "primary_cta": "無料で申し込む",
    "test_variable": "hero",
    "hypothesis": "課題提起型のhero_titleの方が申込率が高い"
  },
  "next_test_recommendation": {
    "target": "lp",
    "variable": "hero",
    "reason": "heroパターンが未検証のため"
  }
}
```

このJSONは `node scripts/validate-agent-output.js acquisition <このJSONを保存したファイル>` でそのまま検証できる。

## 2. Seminar Content Agent

### Request example

```json
{
  "model": "<n8n側で選択するモデルID>",
  "max_tokens": 4096,
  "system": "<prompts/seminar-content.md の全文>",
  "messages": [
    {
      "role": "user",
      "content": "{\"parent\":{\"seminar_id\":\"sem_2026_001\",\"target_audience\":\"中小企業の経営者・マーケ責任者\",\"main_message\":\"広告改善\",\"main_problem\":\"広告費が高騰しているのに成果が伸びない\",\"promised_value\":\"AIで広告運用を効率化する具体的な手法がわかる\"},\"talk\":[],\"slides\":[]}"
    }
  ]
}
```

レスポンス形式はAcquisition Agentと同様（`content[0].text`をパースした結果が
`prompts/seminar-content.md` の Output JSON schema、`talk` / `slides` / `content_adjustment_recommendation`
に一致する）。`node scripts/validate-agent-output.js seminar-content <output.json>` で検証する。

## 3. Follow-up Agent

### Request example

```json
{
  "model": "<n8n側で選択するモデルID>",
  "max_tokens": 4096,
  "system": "<prompts/follow-up.md の全文>",
  "messages": [
    {
      "role": "user",
      "content": "{\"parent\":{\"seminar_id\":\"sem_2026_001\",\"promised_value\":\"AIで広告運用を効率化する具体的な手法がわかる\",\"primary_cta\":\"無料個別相談を予約する\",\"proposed_offer\":\"AI広告診断サービス（AIS）\"},\"follow_up\":[]}"
    }
  ]
}
```

レスポンス形式はAcquisition Agentと同様（`content[0].text`をパースした結果が
`prompts/follow-up.md` の Output JSON schema、`follow_up_scenarios` / `improvement_recommendation`
に一致する）。`node scripts/validate-agent-output.js follow-up <output.json>` で検証する。

## Guardrails

- **実secretを入れない**: `x-api-key`・実エンドポイントURL・実モデルIDは、本ドキュメント・本リポジトリの
  どこにも記載しない。n8nのCredentials機能または環境変数で注入する（`docs/n8n-workflows.md`参照）。
- **promptは`prompts/*.md`を参照して管理する**: `system`フィールドの内容をn8nワークフローJSON内に
  ハードコードでコピー&ペーストしない（更新時に二重管理になりズレる）。n8n側で`prompts/*.md`の内容を
  都度読み込む、またはワークフロー実行前に同期する仕組みを用いる。
- **JSON parseしやすい返却形式を強制する**: 各`prompts/*.md`のGuardrailsに記載の
  「出力は指定のJSON schemaに厳密に従い、余計な説明文をJSON外に含めない」を`system`プロンプトの一部として
  必ず含める。Claudeがコードフェンス（` ```json `）付きで返す場合に備え、Parse Claude ResponseノードでJSON
  抽出処理（コードフェンス除去等）を入れることを推奨する。
- **検証を必ず通す**: Claudeの応答をシートに書き込む前に、必ず`scripts/validate-agent-output.js`相当の
  チェックを通す（`docs/n8n-workflows.md`の各Flow「Validate Output」参照）。
