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

## スライドテンプレの入力項目
- タイトルスライド
- アジェンダスライド
- コンテンツスライド（図解、テキスト）
- まとめスライド
- CTAスライド

## 終了後フォローテンプレの入力項目
- お礼メール本文
- アンケートリンク
- 特典の配布リンク
- 個別相談（商談）への誘導文
