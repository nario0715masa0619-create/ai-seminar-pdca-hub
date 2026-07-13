#!/usr/bin/env node
/**
 * acquisition-agent.js
 *
 * 「このseminar_idで自律集客開始」という指示から動く、X広告集客PDCAの起点ロジック。
 * 実際の広告コピー/LPコピーの生成そのもの（自然言語生成）はこのモジュールの責務外とし、
 * 呼び出し側（Claude / 将来的にはn8n+Claude API）が生成した候補データを受け取って
 * Sheetsへの読み書きと配信期間の提案だけを行う、という役割分担にしている。
 *
 * 役割ごとに分けた関数:
 *   - getSeminarRow(seminarId)              : Parentから対象行を読む
 *   - proposeAdFlight(seminarRow)           : 予算・開催日から配信期間を提案する（純粋関数）
 *   - updateParentBudgetProposal(...)       : 提案した配信期間・予算ステータスをParentに書き込む
 *   - writeAdCandidatesToXAds(...)          : X広告案をX_adsシートに書き込む
 *   - writeLpCandidateToLPs(...)            : LP案をLPsシートに書き込む
 *   - runAutonomousAcquisition(...)         : 上記を束ねるオーケストレータ
 */

const { getRowBySeminarId, findAllRowsByValue, updateRowFields } = require("./sheet-rows");
const { appendRow, payloadToRow } = require("./sync-sheets");

/**
 * CPA（1申込あたりのコスト）の目標値（円）。
 * 変更したくなった場合はこの定数だけを更新すればよい（他の箇所に直書きしない）。
 */
const CPA_TARGET = 500;

/**
 * Parent Sheetから、指定 seminar_id の行を読み込む。
 * @param {string} seminarId
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<Record<string, string>>} 列名をキーとしたオブジェクト
 */
async function getSeminarRow(seminarId, options = {}) {
  const found = await getRowBySeminarId(seminarId, options);
  if (!found) {
    throw new Error(`Seminar not found in Parent Sheet: seminar_id="${seminarId}"`);
  }
  return found.row;
}

/**
 * "YYYY-MM-DD" または "YYYY-MM-DD HH:mm" 形式の文字列から日付部分だけをUTCのDateとして取り出す。
 * @param {string} dateString
 * @returns {Date}
 */
function parseDateOnly(dateString) {
  const datePart = dateString.trim().split(" ")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Unrecognized date format: "${dateString}" (expected "YYYY-MM-DD" or "YYYY-MM-DD HH:mm")`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * UTCのDateを "YYYY-MM-DD" 形式の文字列に変換する。
 * @param {Date} date
 * @returns {string}
 */
function formatDateOnly(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * セミナーの開催日・予算方針から、広告配信期間（ad_flight_start_date / ad_flight_end_date）を提案する。
 * 一般的なウェビナー集客では、申込がセミナー直前の数日〜1週間に集中しやすいため、
 * 「開催日の前日を配信終了日とし、そこから遡って flightDays 日間（デフォルト7日）を配信期間とする」
 * というヒューリスティックを採用する。
 * 純粋関数（Sheets API非依存）— proposeAdFlight自体はテストしやすいようにしている。
 * @param {{ event_date: string, ad_budget_total?: string|number, ad_budget_strategy?: string }} seminarRow
 * @param {{ flightDays?: number }} [options] - flightDays省略時は7（約1週間）
 * @returns {{ ad_flight_start_date: string, ad_flight_end_date: string }}
 */
function proposeAdFlight(seminarRow, options = {}) {
  if (!seminarRow || !seminarRow.event_date) {
    throw new Error('seminarRow.event_date is required to propose an ad flight');
  }
  const flightDays = options.flightDays || 7;

  const eventDate = parseDateOnly(seminarRow.event_date);
  const endDate = new Date(eventDate);
  endDate.setUTCDate(endDate.getUTCDate() - 1); // 開催前日を配信終了日とする

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (flightDays - 1));

  return {
    ad_flight_start_date: formatDateOnly(startDate),
    ad_flight_end_date: formatDateOnly(endDate),
  };
}

/**
 * proposeAdFlight() の提案結果をParent Sheetの該当行に書き込む。
 * ad_budget_status は、既に値が入っている場合は上書きしない
 * （例えば既に "approved" になっている行を "proposed" に巻き戻さないため）。
 * 未設定の場合のみ "proposed" を書き込む。
 * @param {string} seminarId
 * @param {{ ad_flight_start_date: string, ad_flight_end_date: string }} proposal
 * @param {Record<string, string>} seminarRow - getSeminarRow() の戻り値（ad_budget_status確認用）
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 */
async function updateParentBudgetProposal(seminarId, proposal, seminarRow, options = {}) {
  const fields = { ...proposal };
  if (!seminarRow.ad_budget_status) {
    fields.ad_budget_status = "proposed";
  }
  return updateRowFields("parent", "seminar_id", seminarId, fields, options);
}

/**
 * X広告案（複数）をX_adsシートに status="proposed" で書き込む。
 * @param {string} seminarId
 * @param {Array<{ ad_id?: string, ad_headline: string, ad_body: string, creative_direction: string, cta_text: string }>} candidates
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<Array<*>>}
 */
async function writeAdCandidatesToXAds(seminarId, candidates, options = {}) {
  const results = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const row = {
      seminar_id: seminarId,
      ad_id: candidate.ad_id || `${seminarId}-ad-${i + 1}`,
      ad_headline: candidate.ad_headline,
      ad_body: candidate.ad_body,
      creative_direction: candidate.creative_direction,
      cta_text: candidate.cta_text,
      status: candidate.status || "proposed",
    };
    const values = payloadToRow("x_ads_ops", row);
    const result = await appendRow({ sheetKey: "x_ads_ops", values, config: options.config, sheets: options.sheets });
    results.push(result);
  }
  return results;
}

/**
 * LP案（1件）をLPsシートに status="proposed" で書き込む。
 * @param {string} seminarId
 * @param {{ lp_id?: string, hero_title: string, hero_subtitle: string, intro_copy: string, benefits_bullets: string, cta_text: string }} candidate
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<*>}
 */
async function writeLpCandidateToLPs(seminarId, candidate, options = {}) {
  const row = {
    seminar_id: seminarId,
    lp_id: candidate.lp_id || `${seminarId}-lp-1`,
    hero_title: candidate.hero_title,
    hero_subtitle: candidate.hero_subtitle,
    intro_copy: candidate.intro_copy,
    benefits_bullets: candidate.benefits_bullets,
    cta_text: candidate.cta_text,
    status: candidate.status || "proposed",
  };
  const values = payloadToRow("lps", row);
  return appendRow({ sheetKey: "lps", values, config: options.config, sheets: options.sheets });
}

/**
 * X_ads_opsシートから、指定seminar_idの広告のうち status="approved" の行だけを取得する。
 * X Ads APIへの入稿対象は必ずこの関数の戻り値に限定すること（未承認の案を誤って入稿しないため）。
 * docs/x-ads-integration.md 参照。
 * @param {string} seminarId
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<Array<{ rowNumber: number, row: Record<string, string> }>>}
 */
async function getApprovedXAds(seminarId, options = {}) {
  const matches = await findAllRowsByValue("x_ads_ops", "seminar_id", seminarId, options);
  return matches.filter((m) => m.row.status === "approved");
}

/**
 * X Ads APIから発行されたキャンペーン/広告セット/広告IDを、X_ads_opsの該当行（ad_idで特定）に書き戻す。
 * X Ads APIの呼び出し自体は行わない（docs/x-ads-integration.md参照、呼び出しはn8n等の外部で行う想定）。
 * @param {string} adId
 * @param {{ x_campaign_id?: string, x_adset_id?: string, x_ad_id?: string }} identifiers
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ updatedRange: string }[]>}
 */
async function writeAdIdentifiers(adId, identifiers, options = {}) {
  return updateRowFields("x_ads_ops", "ad_id", adId, identifiers, options);
}

/**
 * X Ads APIから取得した実績（impressions/clicks/spend）を、X_ads_opsの該当行（ad_idで特定）に書き戻す。
 * X Ads APIの呼び出し自体は行わない（docs/x-ads-integration.md参照）。
 * @param {string} adId
 * @param {{ impressions?: number, clicks?: number, spend?: number }} metrics
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ updatedRange: string }[]>}
 */
async function writeAdMetrics(adId, metrics, options = {}) {
  return updateRowFields("x_ads_ops", "ad_id", adId, metrics, options);
}

/**
 * 承認済み広告1件分の impressions/clicks/spend から CTR・CPC を算出する。
 * 分母が0（または未計測）の場合は null を返す（ゼロ除算を避けるため）。
 * 純粋関数（Sheets API非依存）。
 * @param {{ impressions?: string|number, clicks?: string|number, spend?: string|number }} adRow
 * @returns {{ impressions: number, clicks: number, spend: number, ctr: number|null, cpc: number|null }}
 */
function computeAdMetrics(adRow) {
  const impressions = Number(adRow.impressions) || 0;
  const clicks = Number(adRow.clicks) || 0;
  const spend = Number(adRow.spend) || 0;
  return {
    impressions,
    clicks,
    spend,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
  };
}

/**
 * 承認済み広告（複数）の impressions/clicks/spend を合算し、全体のCTR・CPCを算出する。
 * 純粋関数（Sheets API非依存）。
 * @param {Array<{ impressions?: string|number, clicks?: string|number, spend?: string|number }>} adRows
 * @returns {{ impressions: number, clicks: number, spend: number, ctr: number|null, cpc: number|null }}
 */
function aggregateAdMetrics(adRows) {
  const totals = adRows.reduce(
    (acc, row) => {
      acc.impressions += Number(row.impressions) || 0;
      acc.clicks += Number(row.clicks) || 0;
      acc.spend += Number(row.spend) || 0;
      return acc;
    },
    { impressions: 0, clicks: 0, spend: 0 }
  );
  return {
    ...totals,
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : null,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
  };
}

/**
 * Parent行の lp_visits / registrations からLP CVRを算出する。
 * 純粋関数（Sheets API非依存）。
 * @param {{ lp_visits?: string|number, registrations?: string|number }} seminarRow
 * @returns {{ lp_visits: number, registrations: number, lp_cvr: number|null }}
 */
function computeFunnelMetrics(seminarRow) {
  const lpVisits = Number(seminarRow.lp_visits) || 0;
  const registrations = Number(seminarRow.registrations) || 0;
  return {
    lp_visits: lpVisits,
    registrations,
    lp_cvr: lpVisits > 0 ? registrations / lpVisits : null,
  };
}

/**
 * 広告費総額と申込数からCPA（1申込あたりのコスト）を算出する。
 * 純粋関数（Sheets API非依存）。
 * @param {number} totalSpend
 * @param {number} registrations
 * @returns {number|null}
 */
function computeCPA(totalSpend, registrations) {
  return registrations > 0 ? totalSpend / registrations : null;
}

/**
 * CPAを目標値（CPA_TARGET）と比較し、目標内か超過かを判定する。
 * 純粋関数（Sheets API非依存）。
 * @param {number|null} cpa - computeCPA() の戻り値
 * @param {number} [target] - 省略時はCPA_TARGET（500円）
 * @returns {{ withinTarget: boolean|null, target: number, message: string }}
 */
function evaluateCPA(cpa, target = CPA_TARGET) {
  if (cpa === null) {
    return {
      withinTarget: null,
      target,
      message: `CPAが未算出のため、目標${target}円との比較はできません。`,
    };
  }
  const rounded = Math.round(cpa);
  if (cpa <= target) {
    return { withinTarget: true, target, message: `CPAが${rounded}円で目標${target}円以内です。` };
  }
  return {
    withinTarget: false,
    target,
    message: `CPAが${rounded}円で目標${target}円を超過しています（要注意）。`,
  };
}

/**
 * CTR・LP CVRを既定の目安値と比較し、ボトルネックが広告側("ad")かLP側("lp")かを判定する。
 * 目安値（CTR 1% / LP CVR 20%）は暫定値。実績データが蓄積したら調整すること
 * （docs/x-ads-integration.md参照）。純粋関数（Sheets API非依存）。
 * @param {{ ctr: number|null, lpCvr: number|null }} metrics
 * @param {{ ctrThreshold?: number, cvrThreshold?: number }} [thresholds]
 * @returns {{ bottleneck: "ad"|"lp"|"none"|"insufficient_data", issues: Array<object>, summary: string }}
 */
function diagnoseBottleneck({ ctr, lpCvr }, thresholds = {}) {
  const ctrThreshold = thresholds.ctrThreshold ?? 0.01;
  const cvrThreshold = thresholds.cvrThreshold ?? 0.2;

  if (ctr === null && lpCvr === null) {
    return {
      bottleneck: "insufficient_data",
      issues: [],
      summary: "実績データ（インプレッション/クリックやLP訪問数/申込数）がまだ揃っていないため診断できません。",
    };
  }

  const issues = [];
  if (ctr !== null && ctr < ctrThreshold) {
    issues.push({
      stage: "ad",
      metric: "ctr",
      value: ctr,
      message: `CTRが目安値${(ctrThreshold * 100).toFixed(1)}%を下回っています（実績${(ctr * 100).toFixed(2)}%）。広告クリエイティブ（見出し・訴求軸）の見直しを検討してください。`,
    });
  }
  if (lpCvr !== null && lpCvr < cvrThreshold) {
    issues.push({
      stage: "lp",
      metric: "lp_cvr",
      value: lpCvr,
      message: `LPのCVRが目安値${(cvrThreshold * 100).toFixed(1)}%を下回っています（実績${(lpCvr * 100).toFixed(2)}%）。LPコピー（hero・ベネフィット訴求）の見直しを検討してください。`,
    });
  }

  if (issues.length === 0) {
    return {
      bottleneck: "none",
      issues: [],
      summary: "現状、CTR・LP CVRともに目安値を上回っており、明確なボトルネックは見られません。",
    };
  }
  return { bottleneck: issues[0].stage, issues, summary: issues.map((i) => i.message).join(" ") };
}

/**
 * Parent Sheetの notes 列に、日付付きの1行を追記する（既存のnotesは残す）。
 * @param {string} seminarId
 * @param {string} note
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ updatedRange: string }[]>}
 */
async function appendToParentNotes(seminarId, note, options = {}) {
  const seminarRow = await getSeminarRow(seminarId, options);
  const existingNotes = seminarRow.notes || "";
  const timestamp = new Date().toISOString().slice(0, 10);
  const updatedNotes = existingNotes ? `${existingNotes}\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`;
  return updateRowFields("parent", "seminar_id", seminarId, { notes: updatedNotes }, options);
}

/**
 * PDCAの「Check」ステップ: 承認済み広告の実績とParentのファネル実績から
 * CTR/CPC/LP CVR/CPAを算出し、ボトルネックを診断してParent.notesに追記する。
 * 新しい広告案/LP改訂案の生成（「Act」ステップ）はこの関数の責務外
 * （診断結果のdiagnosis.bottleneckを見て、呼び出し側がwriteAdCandidatesToXAds/writeLpCandidateToLPsを使う）。
 * @param {string} seminarId
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ seminarId: string, adMetrics: object, funnel: object, cpa: number|null, diagnosis: object }>}
 */
async function runPdcaCheck(seminarId, options = {}) {
  const seminarRow = await getSeminarRow(seminarId, options);
  const approvedAds = await getApprovedXAds(seminarId, options);
  const adMetrics = aggregateAdMetrics(approvedAds.map((m) => m.row));
  const funnel = computeFunnelMetrics(seminarRow);
  const cpa = computeCPA(adMetrics.spend, funnel.registrations);
  const diagnosis = diagnoseBottleneck({ ctr: adMetrics.ctr, lpCvr: funnel.lp_cvr });

  const cpaEvaluation = evaluateCPA(cpa);

  const cpaText = cpa !== null ? `${Math.round(cpa)}円` : "算出不可";
  const ctrText = adMetrics.ctr !== null ? `${(adMetrics.ctr * 100).toFixed(2)}%` : "算出不可";
  const cvrText = funnel.lp_cvr !== null ? `${(funnel.lp_cvr * 100).toFixed(2)}%` : "算出不可";

  const noteLines = [
    `PDCA診断: ${diagnosis.summary} (CTR=${ctrText}, LP CVR=${cvrText}, CPA=${cpaText})`,
    cpaEvaluation.message,
  ];
  if (cpaEvaluation.withinTarget === false) {
    noteLines.push("CPA観点からも改善が必要（広告費が高すぎる）");
  }
  const note = noteLines.join("\n");
  await appendToParentNotes(seminarId, note, options);

  return { seminarId, adMetrics, funnel, cpa, cpaEvaluation, diagnosis };
}

/**
 * 「このseminar_idで自律集客開始」の起点ロジック全体を束ねるオーケストレータ。
 * 広告コピー/LPコピーそのものの生成は呼び出し側の責務（xAdsCandidates/lpCandidateとして渡す）。
 * @param {string} seminarId
 * @param {{
 *   xAdsCandidates?: Array<object>,
 *   lpCandidate?: object,
 *   flightDays?: number,
 *   config?: object,
 *   sheets?: import('googleapis').sheets_v4.Sheets
 * }} [params]
 * @returns {Promise<{ seminarId: string, flight: object, xAdsWritten: number, lpWritten: number }>}
 */
async function runAutonomousAcquisition(seminarId, params = {}) {
  const options = { config: params.config, sheets: params.sheets };

  const seminarRow = await getSeminarRow(seminarId, options);
  const flight = proposeAdFlight(seminarRow, { flightDays: params.flightDays });
  await updateParentBudgetProposal(seminarId, flight, seminarRow, options);

  let xAdsWritten = 0;
  if (params.xAdsCandidates && params.xAdsCandidates.length > 0) {
    await writeAdCandidatesToXAds(seminarId, params.xAdsCandidates, options);
    xAdsWritten = params.xAdsCandidates.length;
  }

  let lpWritten = 0;
  if (params.lpCandidate) {
    await writeLpCandidateToLPs(seminarId, params.lpCandidate, options);
    lpWritten = 1;
  }

  return { seminarId, flight, xAdsWritten, lpWritten };
}

module.exports = {
  getSeminarRow,
  proposeAdFlight,
  updateParentBudgetProposal,
  writeAdCandidatesToXAds,
  writeLpCandidateToLPs,
  getApprovedXAds,
  writeAdIdentifiers,
  writeAdMetrics,
  computeAdMetrics,
  aggregateAdMetrics,
  computeFunnelMetrics,
  computeCPA,
  evaluateCPA,
  CPA_TARGET,
  diagnoseBottleneck,
  appendToParentNotes,
  runPdcaCheck,
  runAutonomousAcquisition,
  parseDateOnly,
  formatDateOnly,
};
