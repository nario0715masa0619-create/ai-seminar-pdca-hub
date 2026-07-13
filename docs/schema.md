# Schema Definition

## 親シートの項目 (Parent Sheet)

1セミナーを1行で管理する親シート。  
X広告、LP、トークスクリプト、スライド、終了後フォローの各テンプレは、`seminar_id` をキーにこのシートへ紐づく。

### Required Columns

| column | description |
|---|---|
| seminar_id | セミナーの一意ID |
| seminar_name | セミナー名 |
| event_date | 開催日 |
| target_audience | 対象者 |
| main_message | メイン訴求 |
| title_type | タイトル型 |
| main_problem | 主要課題 |
| promised_value | 提供価値 |
| primary_cta | 主CTA |
| secondary_cta | サブCTA |
| proposed_offer | 提案商品 |
| acquisition_channel | 流入元 |
| lp_visits | LP訪問数 |
| registrations | 申込数 |
| attendees | 参加数 |
| survey_responses | アンケ回答数 |
| consultation_requests | 相談希望数 |
| opportunities | 商談数 |
| wins | 受注数 |
| notes | メモ |
| ad_budget_total | 広告予算の総額（数値、例: 5000） |
| ad_budget_currency | 広告予算の通貨（例: JPY） |
| ad_budget_strategy | 予算消化方針（例: lifetime = 配信期間全体で使い切る） |
| ad_flight_start_date | 広告配信開始日（自律集客ロジックが提案しこの列に書き込む） |
| ad_flight_end_date | 広告配信終了日（自律集客ロジックが提案しこの列に書き込む） |
| ad_budget_status | 予算案のステータス（proposed / approved など） |

## X Ads Template

X（旧Twitter）広告クリエイティブを生成・評価するための入力スキーマ。  
1行＝1パターン（A/Bテストの各案）とする。

### Required Columns

| column | description |
|---|---|
| ad_id | 広告パターンの一意ID |
| seminar_id | 紐づくセミナーID（Parent Sheetのseminar_id） |
| objective | 広告の目的（例: lp_visit / registration） |
| target_audience | 想定ターゲット（例: 中小企業のマーケ責任者） |
| main_message | メイン訴求（例: 広告改善 / 営業自動化 / AI導入） |
| title_type | タイトル型（例: problem-solution / how-to / case-study） |
| core_benefit | 広告で約束するコアベネフィット |
| offer | オファー内容（例: 無料AIセミナー / 無料診断） |
| primary_cta | CTA文言（例: 今すぐ申し込む） |
| creative_type | クリエイティブ形式（text / image / video） |
| landing_url | 遷移先LPのURL |
| test_variable | 今回のA/Bテストで変えている要素（headline / first_line / image_text など） |
| hypothesis | テスト仮説のメモ |

## LP Template

セミナーLP（ランディングページ）の構成を生成・評価するための入力スキーマ。  
1行＝1バリエーション（A/Bテストの各案）とする。

### Required Columns

| column | description |
|---|---|
| lp_id | LPバリエーションの一意ID |
| seminar_id | 紐づくセミナーID（Parent Sheetのseminar_id） |
| target_audience | 想定ターゲット（例: 中小企業のマーケ責任者） |
| main_message | メイン訴求（例: 広告改善 / 営業自動化 / AI導入） |
| title_type | タイトル型（例: problem-solution / how-to / case-study） |
| hero_title | LPファーストビューのメインタイトル |
| hero_subtitle | LPファーストビューのサブタイトル |
| core_benefit | 参加者が得られる主要なベネフィット（1つ） |
| key_takeaways | 得られることの要点（箇条書き3点などをテキストで持つ） |
| primary_cta | 主CTAボタンの文言（例: 無料で申し込む） |
| secondary_cta | サブCTAボタンの文言（任意） |
| event_summary | 開催概要（日時・形式・参加費などのテキスト） |
| speaker_info | 登壇者情報（肩書き・実績などの要約テキスト） |
| social_proof | 実績・導入事例・参加者の声など信頼要素の要約 |
| faq | FAQ候補（1フィールドにJSONや改行区切りで持つ想定） |
| form_field_count | フォームの入力項目数（数値） |
| form_note | フォーム直前に記載する一言（安心感を出す文） |
| test_variable | 今回のA/Bテストで変えている要素（hero / cta / form_length など） |
| hypothesis | テスト仮説のメモ |

## Talk Script Template

ウェビナー本編のトークスクリプト（台本）を生成・評価するための入力スキーマ。  
1行＝1セミナーにつき1バージョン（改善前後で複数行になる想定）。

### Required Columns

| column | description |
|---|---|
| script_id | スクリプトの一意ID |
| seminar_id | 紐づくセミナーID（Parent Sheetのseminar_id） |
| target_audience | 想定ターゲット（例: 中小企業の経営者 / マーケ責任者） |
| main_message | メイン訴求（例: 広告改善 / 営業自動化 / AI導入） |
| title_type | タイトル型（problem-solution / how-to / case-study など） |
| seminar_goal | このセミナーのゴール（例: 個別相談獲得 / AIS提案 / AI研修相談） |
| main_problem | 参加者が抱えている主要課題の要約 |
| core_message | 全編を通して一番伝えたい中核メッセージ |
| outline | 章構成（例: intro → problem → solution → case → offer → qanda）をテキストで持つ |
| duration_minutes | 想定尺（分） |
| primary_cta | 本編で最も強く案内するCTA（例: 個別相談を申し込む） |
| secondary_cta | 補助的に案内するCTA（例: 資料ダウンロード） |
| tone | 話し方のトーン（例: friendly / professional / urgent） |
| test_variable | 今回の改善対象（intro / case_part / cta_part など） |
| hypothesis | 改善仮説のメモ |

## Slide Template

ウェビナー用スライド資料の構成を生成・評価するための入力スキーマ。  
1行＝1セミナーにつき1バージョン（投影用資料の全体設計）とする。

### Required Columns

| column | description |
|---|---|
| deck_id | スライドデッキの一意ID |
| seminar_id | 紐づくセミナーID（Parent Sheetのseminar_id） |
| target_audience | 想定ターゲット（例: 中小企業のマーケ責任者） |
| main_message | メイン訴求（例: 広告改善 / 営業自動化 / AI導入） |
| title_type | タイトル型（problem-solution / how-to / case-study など） |
| deck_goal | この資料のゴール（例: 理解促進 / 信頼獲得 / 個別相談誘導） |
| core_message | デッキ全体を通して一番伝えたいメッセージ |
| outline | 章構成（例: cover / agenda / intro / problem / solution / case / service / closing / qanda） |
| duration_minutes | 想定尺（分） |
| slide_count | 想定スライド枚数（例: 60） |
| opener_elements | 冒頭パートに含めたい要素（表紙・注意事項・自己紹介・今日わかること・アジェンダ 等の要約） |
| problem_story | 問題提起パートのストーリー要約（よくある失敗・あるある・データなど） |
| solution_story | 解決策パートのストーリー要約（フレームワーク・手順・考え方など） |
| case_story | 事例パートの構成要約（before / after / 数字・効果など） |
| service_intro | サービス / 会社紹介パートの要約（どこまで話すか、何枚程度か） |
| closing_elements | クロージングで必ず入れたい要素（要点まとめ・アンケ案内・次のアクションなど） |
| primary_cta | 資料内で最も強く打ち出すCTA（例: 個別相談を予約する） |
| secondary_cta | 補助CTA（例: 資料ダウンロード / 次回ウェビナーに申し込む） |
| visual_guideline | デザイン方針（例: シンプル / 図多め / 文字少なめ / 実績強め） |
| one_slide_one_message | 1スライド1メッセージ原則の適用方針（true/falseや補足メモ） |
| device_assumption | 想定視聴環境（pc_only / pc_mobile_mix など） |
| test_variable | 今回の改善対象（intro_part / problem_part / closing_cta_slide など） |
| hypothesis | 改善仮説のメモ |

## Follow-up Template

ウェビナー終了後のフォロー文面とシナリオを生成・評価するための入力スキーマ。  
1行＝1セミナー × 1セグメント × 1シナリオ（例: 参加者向けお礼メール）とする。

### Required Columns

| column | description |
|---|---|
| followup_id | フォローシナリオの一意ID |
| seminar_id | 紐づくセミナーID（Parent Sheetのseminar_id） |
| segment | 配信対象セグメント（attendee / no_show / requester など） |
| lead_temperature | リード温度感（hot / warm / cold） |
| trigger | 配信トリガー（例: webinar_attended / no_show / material_downloaded など） |
| send_timing | 送信タイミング（例: same_day / next_day / three_days / seven_days） |
| main_message | このフォローで一番伝えたいメッセージ |
| summary | セミナー内容のおさらい（1〜3行程度の要約） |
| offer | フォローで提供するもの（資料 / アーカイブ動画 / 追加コンテンツ / 次回ウェビナー案内など） |
| primary_cta | 第一CTA（例: 個別相談を予約する / 資料をダウンロードする） |
| secondary_cta | 第二CTA（例: アーカイブを見る / 次回ウェビナーに申し込む） |
| suggested_product | 提案したい商品（AIS / VIS / n8n_sales_tool / ai_training など） |
| subject_pattern | メール件名のパターン（例: archive_focus / survey_focus / urgency_focus） |
| channel | 配信チャネル（email / phone / chat, まずはemailを想定） |
| branching_condition | このシナリオに入る条件（例: survey_answered=true AND watch_time>=0.8） |
| test_variable | 今回の改善対象（subject / body / cta / timing など） |
| hypothesis | 改善仮説のメモ |

## X_ads Sheet (Acquisition Automation)

**注意**: 上記の「X Ads Template」（テンプレキー `x_ads`）とは別のシート。こちらはX広告の自律集客ワークフロー
（`docs/acquisition-automation.md`参照）専用の、ステータス管理・将来のX API連携を前提としたシート
（テンプレキー `x_ads_ops`、Google Sheets上のタブ名は `X_ads_ops`）。
Google Sheetsはシート名の大文字小文字を区別しないため、既存の `x_ads` タブと衝突しないよう
`X_ads_ops` という名前にしている。
1行＝1広告案とする。

### Required Columns

| column | description |
|---|---|
| seminar_id | 紐づくセミナーID（Parent Sheetのseminar_id） |
| ad_id | このシート内で一意な広告案ID |
| ad_headline | Xの1行目などのフック |
| ad_body | 補足説明文 |
| creative_direction | 画像・動画のイメージ説明 |
| cta_text | CTAボタン等の文言 |
| status | proposed / approved / paused_auto / winner など |
| x_campaign_id | X広告キャンペーンID（X API連携後に付与、それまでは空） |
| x_adset_id | X広告セットID（X API連携後に付与、それまでは空） |
| x_ad_id | X広告ID（X API連携後に付与、それまでは空） |
| impressions | インプレッション数（X API/n8n経由で書き戻す想定、それまでは空） |
| clicks | クリック数（X API/n8n経由で書き戻す想定、それまでは空） |
| spend | 消化金額（X API/n8n経由で書き戻す想定、それまでは空） |

## LPs Sheet (Acquisition Automation)

**注意**: 上記の「LP Template」（テンプレキー `lp`）とは別のシート。こちらはLPコピーの自律生成ワークフロー
（`docs/acquisition-automation.md`参照）専用の、ステータス管理を前提とした軽量シート
（テンプレキー `lps`、Google Sheets上のタブ名は `LPs`）。
1行＝1LP案とする。

### Required Columns

| column | description |
|---|---|
| seminar_id | 紐づくセミナーID（Parent Sheetのseminar_id） |
| lp_id | このシート内で一意なLP案ID |
| hero_title | LPのメイン見出し |
| hero_subtitle | LPのサブ見出し |
| intro_copy | 導入文 |
| benefits_bullets | ベネフィット箇条書き（1フィールドに改行区切りで持つ想定） |
| cta_text | LPのメインCTA文言 |
| status | proposed / approved など |
