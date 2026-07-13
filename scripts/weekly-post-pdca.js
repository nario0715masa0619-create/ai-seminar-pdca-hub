#!/usr/bin/env node
/**
 * weekly-post-pdca.js
 *
 * X投稿＋LPの「毎週のPDCA」を支援するモジュール。
 * 毎週 { week, ctr, signups, prev_ctr, prev_signups } を渡すと、
 * KPI（LPからのセミナー申込数=signups）を軸に状態判定を行い、
 * 次の投稿案（A/B）とLP改善案を含むレポートJSONを返す。
 *
 * Google Sheets（Parent/X_ads_ops/LPs）への書き込みは行わない、独立したユーティリティ。
 * 将来的にSheets連携が必要になった場合は、scripts/acquisition-agent.js側から
 * このモジュールの関数を呼び出す形で組み込む想定。
 *
 * Usage:
 *   node scripts/weekly-post-pdca.js '{"week":"2026-07-13週","ctr":0.015,"signups":12}'
 */

const LP_URL_PLACEHOLDER = "{{LP_URL}}";

/**
 * 投稿の2軸（docs化された固定パターン）。
 * A: AIの必要性はわかっているが着手点で止まっている経営者向け。
 * B: 人手不足・属人化で限界に近い現場向け。
 */
const POST_AXES = {
  A: {
    hook: "AIの必要性はわかっているのに、自社でどこから始めるべきか判断がつかず、止まっていませんか？",
    bullets: [
      "自社の業務のどこにAIを使うべきかが整理できる",
      "「まず着手すべき1つの領域」とその理由が明確になる",
      "個別相談で自社に合った次の一手まで相談できる",
    ],
  },
  B: {
    hook: "人手不足と属人化で、現場がもう限界に近づいていませんか？",
    bullets: [
      "属人化している業務の棚卸しができる",
      "AIで巻き取れる業務の見極め方がわかる",
      "少ない人数でも回る仕組みづくりの第一歩がわかる",
    ],
  },
};

const BENEFIT_LINE = "60分で、自社にとっての「初手の判断軸」を整理できる無料セミナーです。";

/**
 * 投稿案生成ルールに沿って、指定軸(A|B)の投稿テキストを組み立てる。
 * 構成: 1) 誰のどんな悩みか 2) 箇条書きベネフィット2〜3個 3) ベネフィット文 4) CTA（{{LP_URL}}付き）
 * 純粋関数。
 * @param {"A"|"B"} axisKey
 * @param {{ lpUrl?: string, tweak?: string }} [options] - lpUrl省略時はプレースホルダのまま。
 *   tweakを渡すと、hook末尾に軽微な文言差分を追加する（ケースA「現状維持・小さな文言改善」用）。
 * @returns {string}
 */
function buildPostText(axisKey, options = {}) {
  const axis = POST_AXES[axisKey];
  if (!axis) {
    throw new Error(`Unknown axis: "${axisKey}". Expected "A" or "B".`);
  }
  const lpUrl = options.lpUrl || LP_URL_PLACEHOLDER;
  const hook = options.tweak ? `${axis.hook}${options.tweak}` : axis.hook;
  const bullets = axis.bullets.map((b) => `・${b}`).join("\n");
  return `${hook}\n\n${bullets}\n\n${BENEFIT_LINE}\n\n詳細・お申込みはこちら▼ ${lpUrl}`;
}

/**
 * KPI（signups）とCTRの週次比較から、状態(status)と判定理由を決定する。
 * 純粋関数（生成処理は含まない）。
 * @param {{ ctr: number, signups: number, prev_ctr?: number|null, prev_signups?: number|null }} input
 * @returns {{ status: "baseline"|"keep"|"replace_post"|"improve_lp"|"replace_post_and_improve_lp", reason: string }}
 */
function classifyWeek(input) {
  const { ctr, signups, prev_ctr, prev_signups } = input;

  const isBaseline =
    prev_ctr === null || prev_ctr === undefined || prev_signups === null || prev_signups === undefined;

  if (isBaseline) {
    return {
      status: "baseline",
      reason: "前週データがなく比較対象がないため、今週の実績をベースラインとして扱い、A/Bテスト用の投稿案を作成します。",
    };
  }

  const signupsOk = signups >= prev_signups;
  const ctrOk = ctr >= prev_ctr;

  if (signupsOk && ctrOk) {
    return {
      status: "keep",
      reason: `申込数(${signups}件、前週${prev_signups}件)・CTR(${ctr}、前週${prev_ctr})ともに前週以上のため、現状維持とし、軽微な文言改善のみ行います。`,
    };
  }
  if (signupsOk && !ctrOk) {
    return {
      status: "replace_post",
      reason: `申込数(${signups}件)は前週(${prev_signups}件)以上を維持していますが、CTRが前週(${prev_ctr})より悪化(${ctr})しているため、投稿文を差し替えます。`,
    };
  }
  if (!signupsOk && ctrOk) {
    return {
      status: "improve_lp",
      reason: `CTRは前週(${prev_ctr})以上を維持(${ctr})していますが、申込数が前週(${prev_signups}件)より減少(${signups}件)しているため、投稿の軸は維持しつつLP改善を優先します。`,
    };
  }
  return {
    status: "replace_post_and_improve_lp",
    reason: `CTR(${ctr} < 前週${prev_ctr})・申込数(${signups}件 < 前週${prev_signups}件)がともに悪化しているため、投稿差し替えとLP改善の両方を行います。`,
  };
}

/**
 * LP改善案（テキスト案）を生成する。
 * lpExcerpt（index.html等からの抜粋テキスト）が渡された場合はその内容を踏まえた示唆にする余地を残すが、
 * 現状は軸の一般的な改善観点に基づく3項目（見出し/導入文/ベネフィット順）を返す。
 * 実LP本文を踏まえた具体的な書き換え案が必要な場合は、lpExcerptを渡した上で呼び出し側
 * （Claudeによる都度生成、または将来のClaude API連携）で個別に精緻化することを想定する。
 * @param {{ lpExcerpt?: string }} [options]
 * @returns {string[]}
 */
function generateLpSuggestions(options = {}) {
  if (!options.lpExcerpt) {
    return [
      "見出し改善案: 「AI導入、何から始める？を60分で言語化する無料セミナー」のように、所要時間と得られる結果を見出しに明示する。",
      "導入文改善案: 冒頭1文目で「何から手をつければいいか分からない」という悩みに具体的に共感し、2文目で本セミナーが提供する解決の方向性を提示する。",
      "ベネフィット順改善案: 最も刺さりやすい「最初の一手が明確になる」ベネフィットを先頭に配置し、次に個別相談導線、最後に信頼要素（実績・登壇者情報）の順に並べる。",
    ];
  }
  // TODO: lpExcerptの実テキストを踏まえた個別具体的な書き換え案の生成は今後実装する。
  return [
    "見出し改善案: 提供されたLP抜粋を踏まえ、所要時間と得られる結果を見出しに明示する形に書き換える。",
    "導入文改善案: 提供されたLP抜粋の冒頭1文目を、ターゲットの悩みへの共感から始まる形に書き換える。",
    "ベネフィット順改善案: 提供されたLP抜粋のベネフィット箇条書きを、最も刺さりやすい項目が先頭に来るよう並び替える。",
  ];
}

/**
 * 毎週のPDCAレポート（指定JSON形式）を生成する。
 * @param {{ week: string, ctr: number, signups: number, prev_ctr?: number|null, prev_signups?: number|null }} input
 * @param {{ lpUrl?: string, lpExcerpt?: string }} [options]
 * @returns {{
 *   week: string,
 *   status: string,
 *   reason: string,
 *   next_post_A: string|null,
 *   next_post_B: string|null,
 *   lp_suggestions: string[]
 * }}
 */
function generateWeeklyReport(input, options = {}) {
  const { status, reason } = classifyWeek(input);

  let next_post_A = null;
  let next_post_B = null;
  let lp_suggestions = [];

  switch (status) {
    case "baseline":
    case "replace_post":
    case "replace_post_and_improve_lp":
      next_post_A = buildPostText("A", options);
      next_post_B = buildPostText("B", options);
      break;
    case "keep":
      // 現状維持: 軸は変えず、小さな文言改善のみ（末尾に軽微な訴求を追加する形の差分）
      next_post_A = buildPostText("A", { ...options, tweak: "（今なら個別相談も無料）" });
      next_post_B = buildPostText("B", { ...options, tweak: "（今なら個別相談も無料）" });
      break;
    case "improve_lp":
      // 投稿の軸は維持するため、新しい投稿コピーは生成しない
      next_post_A = null;
      next_post_B = null;
      break;
    default:
      throw new Error(`Unhandled status: "${status}"`);
  }

  if (status === "improve_lp" || status === "replace_post_and_improve_lp") {
    lp_suggestions = generateLpSuggestions(options);
  }

  return {
    week: input.week,
    status,
    reason,
    next_post_A,
    next_post_B,
    lp_suggestions,
  };
}

module.exports = {
  LP_URL_PLACEHOLDER,
  POST_AXES,
  buildPostText,
  classifyWeek,
  generateLpSuggestions,
  generateWeeklyReport,
};

if (require.main === module) {
  const inputJson = process.argv[2];
  if (!inputJson) {
    console.error(
      'Usage: node scripts/weekly-post-pdca.js \'{"week":"2026-07-13週","ctr":0.015,"signups":12}\''
    );
    process.exit(1);
  }
  const input = JSON.parse(inputJson);
  console.log(JSON.stringify(generateWeeklyReport(input), null, 2));
}
