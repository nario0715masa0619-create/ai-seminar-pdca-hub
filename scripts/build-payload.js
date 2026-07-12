#!/usr/bin/env node
/**
 * build-payload.js
 *
 * 現時点では Google Sheets との実接続は行わず、docs/schema.md のカラム定義に沿った
 * ダミーデータを使って、1セミナー分の「統合ペイロードJSON」の形を決めるためのモック。
 * 後日、Sheets API から取得した実データに差し替える想定（scripts/sync-sheets.js 参照）。
 *
 * Usage: node scripts/build-payload.js
 */

/**
 * ダミーデータで統合ペイロードJSONを組み立てる。
 * seminarId を指定すると、全テンプレの seminar_id をそれに揃える
 * （E2Eテストで "test-e2e-xxx" のようなテスト値に差し替える用途を想定）。
 * @param {string} [seminarId]
 * @returns {{ parent: object, x_ads: object, lp: object, talk: object, slides: object, follow_up: object }}
 */
function buildPayload(seminarId = "sem_2026_001") {
  // docs/schema.md > 親シートの項目 (Parent Sheet)
  const parent = {
    seminar_id: seminarId,
    seminar_name: "AI活用で広告費を半分にする無料セミナー",
    event_date: "2026-08-05",
    target_audience: "中小企業のマーケティング責任者",
    main_message: "広告改善",
    title_type: "problem-solution",
    main_problem: "広告費が高騰しているのに成果が伸びない",
    promised_value: "AIで広告運用を効率化する具体的な手法がわかる",
    primary_cta: "無料個別相談を予約する",
    secondary_cta: "資料をダウンロードする",
    proposed_offer: "AI広告診断サービス（AIS）",
    acquisition_channel: "x_ads",
    lp_visits: 1200,
    registrations: 180,
    attendees: 96,
    survey_responses: 60,
    consultation_requests: 18,
    opportunities: 12,
    wins: 3,
    notes: "モックデータ（build-payload.jsによる生成）",
  };

  // docs/schema.md > X Ads Template
  const x_ads = {
    ad_id: "ad_2026_001_a",
    seminar_id: seminarId,
    objective: "registration",
    target_audience: "中小企業のマーケ責任者",
    main_message: "広告改善",
    title_type: "problem-solution",
    core_benefit: "広告費を増やさずに成果を伸ばす方法がわかる",
    offer: "無料AIセミナー",
    primary_cta: "今すぐ申し込む",
    creative_type: "image",
    landing_url: "https://example.com/lp/sem_2026_001",
    test_variable: "headline",
    hypothesis: "課題訴求型の見出しの方がベネフィット訴求型より申込率が高い",
  };

  // docs/schema.md > LP Template
  const lp = {
    lp_id: "lp_2026_001_a",
    seminar_id: seminarId,
    target_audience: "中小企業のマーケ責任者",
    main_message: "広告改善",
    title_type: "problem-solution",
    hero_title: "広告費を増やさずに成果を伸ばす、AI活用の具体策",
    hero_subtitle: "無料セミナーで、明日から使える広告改善のヒントを解説",
    core_benefit: "AIを使った広告運用の効率化手法がわかる",
    key_takeaways: "1. AIで広告分析を自動化する方法\n2. 少ない工数で改善サイクルを回すコツ\n3. 明日から使えるチェックリスト",
    primary_cta: "無料で申し込む",
    secondary_cta: "資料だけ受け取る",
    event_summary: "2026年8月5日 20:00-21:00 / オンライン開催 / 参加費無料",
    speaker_info: "広告運用歴10年、AI活用支援実績多数のマーケター",
    social_proof: "累計200社以上の広告運用を支援",
    faq: "Q. 録画視聴は可能ですか？ A. 可能です。",
    form_field_count: 3,
    form_note: "入力はメールアドレスとお名前だけ、1分で完了します",
    test_variable: "hero",
    hypothesis: "課題提起型のhero_titleの方が申込率が高い",
  };

  // docs/schema.md > Talk Script Template
  const talk = {
    script_id: "script_2026_001_a",
    seminar_id: seminarId,
    target_audience: "中小企業の経営者・マーケ責任者",
    main_message: "広告改善",
    title_type: "problem-solution",
    seminar_goal: "個別相談獲得",
    main_problem: "広告費が高騰しているのに成果が伸びない",
    core_message: "AIを使えば、少ない工数でも広告改善のPDCAを高速で回せる",
    outline: "intro -> problem -> solution -> case -> offer -> qanda",
    duration_minutes: 60,
    primary_cta: "個別相談を申し込む",
    secondary_cta: "資料ダウンロード",
    tone: "friendly",
    test_variable: "intro",
    hypothesis: "冒頭で共感を得るエピソードを増やすと最後まで視聴する割合が上がる",
  };

  // docs/schema.md > Slide Template
  const slides = {
    deck_id: "deck_2026_001_a",
    seminar_id: seminarId,
    target_audience: "中小企業のマーケ責任者",
    main_message: "広告改善",
    title_type: "problem-solution",
    deck_goal: "個別相談誘導",
    core_message: "AIを使えば、少ない工数でも広告改善のPDCAを高速で回せる",
    outline: "cover -> agenda -> intro -> problem -> solution -> case -> service -> closing -> qanda",
    duration_minutes: 60,
    slide_count: 45,
    opener_elements: "表紙、注意事項、自己紹介、今日わかること、アジェンダ",
    problem_story: "広告費だけ増えて成果が伸びない企業のあるあるパターンを紹介",
    solution_story: "AIを使った広告分析・改善のフレームワークを解説",
    case_story: "導入前後で広告費を維持しながらCVが1.8倍になった事例",
    service_intro: "AIS（AI広告診断サービス）の概要を3枚程度で紹介",
    closing_elements: "要点まとめ、アンケ案内、個別相談CTA",
    primary_cta: "個別相談を予約する",
    secondary_cta: "次回ウェビナーに申し込む",
    visual_guideline: "シンプル、図多め、文字少なめ",
    one_slide_one_message: true,
    device_assumption: "pc_mobile_mix",
    test_variable: "closing_cta_slide",
    hypothesis: "クロージングでCTAスライドを2枚に分けると相談希望率が上がる",
  };

  // docs/schema.md > Follow-up Template
  const follow_up = {
    followup_id: "followup_2026_001_attendee",
    seminar_id: seminarId,
    segment: "attendee",
    lead_temperature: "warm",
    trigger: "webinar_attended",
    send_timing: "same_day",
    main_message: "本日はご参加ありがとうございました",
    summary: "AIを使った広告改善の具体手法と事例を解説しました",
    offer: "アーカイブ動画と当日資料",
    primary_cta: "個別相談を予約する",
    secondary_cta: "アーカイブを見る",
    suggested_product: "AIS",
    subject_pattern: "archive_focus",
    channel: "email",
    branching_condition: "attendees=true",
    test_variable: "subject",
    hypothesis: "件名にアーカイブ訴求を入れると開封率が上がる",
  };

  return { parent, x_ads, lp, talk, slides, follow_up };
}

module.exports = { buildPayload };

if (require.main === module) {
  console.log(JSON.stringify(buildPayload(), null, 2));
}
