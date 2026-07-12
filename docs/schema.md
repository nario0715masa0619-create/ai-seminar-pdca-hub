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

## LPテンプレの入力項目
- ヒーローセクション（タイトル、サブタイトル、CTA）
- セミナーのベネフィット（参加する理由）
- プログラム内容 / タイムテーブル
- 登壇者情報
- 参加特典
- 申込フォーム項目

## トークスクリプトテンプレの入力項目
- 導入（アイスブレイク、アジェンダ）
- 本編（各セクションごとのトーク内容）
- クロージング（次回案内、アンケート誘導）
- 想定Q&A

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
