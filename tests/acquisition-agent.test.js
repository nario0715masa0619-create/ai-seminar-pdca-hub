const test = require("node:test");
const assert = require("node:assert/strict");
const {
  proposeAdFlight,
  getSeminarRow,
  updateParentBudgetProposal,
  writeAdCandidatesToXAds,
  writeLpCandidateToLPs,
  getApprovedXAds,
  writeAdIdentifiers,
  writeAdMetrics,
  runAutonomousAcquisition,
} = require("../scripts/acquisition-agent");
const { getColumnNames } = require("../scripts/schema-utils");

test("proposeAdFlight ends the day before the event and spans ~1 week by default", () => {
  const result = proposeAdFlight({ event_date: "2026-08-07 10:00" });
  assert.deepEqual(result, {
    ad_flight_start_date: "2026-07-31",
    ad_flight_end_date: "2026-08-06",
  });
});

test("proposeAdFlight respects a custom flightDays option", () => {
  const result = proposeAdFlight({ event_date: "2026-08-07" }, { flightDays: 3 });
  assert.deepEqual(result, {
    ad_flight_start_date: "2026-08-04",
    ad_flight_end_date: "2026-08-06",
  });
});

test("proposeAdFlight throws without event_date", () => {
  assert.throws(() => proposeAdFlight({}), /event_date is required/);
});

function makeFakeSheetsForParentRead(row) {
  const columnNames = getColumnNames("parent");
  const values = columnNames.map((c) => row[c] ?? "");
  return {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: [columnNames, values] } }),
      },
    },
  };
}

test("getSeminarRow returns the row for a known seminar_id", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const sheets = makeFakeSheetsForParentRead({ seminar_id: "sem_001", seminar_name: "テストセミナー" });

  const row = await getSeminarRow("sem_001", { config, sheets });
  assert.equal(row.seminar_id, "sem_001");
  assert.equal(row.seminar_name, "テストセミナー");
});

test("getSeminarRow throws for an unknown seminar_id", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const sheets = makeFakeSheetsForParentRead({ seminar_id: "sem_001" });

  await assert.rejects(() => getSeminarRow("does-not-exist", { config, sheets }), /not found/);
});

test("updateParentBudgetProposal sets ad_budget_status to proposed only when it was empty", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = getColumnNames("parent");
  const rowValues = columnNames.map((c) => (c === "seminar_id" ? "sem_001" : ""));
  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 0 } }] } }),
      values: {
        get: async () => ({ data: { values: [columnNames, rowValues] } }),
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
      batchUpdate: async () => ({ data: {} }),
    },
  };

  const seminarRow = { ad_budget_status: "" };
  await updateParentBudgetProposal(
    "sem_001",
    { ad_flight_start_date: "2026-07-31", ad_flight_end_date: "2026-08-06" },
    seminarRow,
    { config, sheets }
  );

  const fieldsSet = updateCalls[0].requestBody.data.map((d) => d.values[0][0]);
  assert.ok(fieldsSet.includes("2026-07-31"));
  assert.ok(fieldsSet.includes("2026-08-06"));
  assert.ok(fieldsSet.includes("proposed"));
});

test("updateParentBudgetProposal does not overwrite an already-approved status", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = getColumnNames("parent");
  const rowValues = columnNames.map((c) => (c === "seminar_id" ? "sem_001" : ""));
  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 0 } }] } }),
      values: {
        get: async () => ({ data: { values: [columnNames, rowValues] } }),
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
      batchUpdate: async () => ({ data: {} }),
    },
  };

  const seminarRow = { ad_budget_status: "approved" };
  await updateParentBudgetProposal(
    "sem_001",
    { ad_flight_start_date: "2026-07-31", ad_flight_end_date: "2026-08-06" },
    seminarRow,
    { config, sheets }
  );

  const fieldsSet = updateCalls[0].requestBody.data.map((d) => d.values[0][0]);
  assert.ok(!fieldsSet.includes("proposed"));
});

test("writeAdCandidatesToXAds appends one row per candidate with default status/ad_id", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { x_ads_ops: "X_ads" } };
  const appendCalls = [];
  const sheets = {
    spreadsheets: {
      values: {
        append: async (request) => {
          appendCalls.push(request);
          return { data: {} };
        },
      },
    },
  };

  await writeAdCandidatesToXAds(
    "sem_001",
    [
      { ad_headline: "見出し1", ad_body: "本文1", creative_direction: "画像1", cta_text: "今すぐ申し込む" },
      { ad_headline: "見出し2", ad_body: "本文2", creative_direction: "画像2", cta_text: "詳細を見る" },
    ],
    { config, sheets }
  );

  assert.equal(appendCalls.length, 2);
  const columnNames = getColumnNames("x_ads_ops");
  const firstRow = appendCalls[0].requestBody.values[0];
  assert.equal(firstRow[columnNames.indexOf("seminar_id")], "sem_001");
  assert.equal(firstRow[columnNames.indexOf("ad_id")], "sem_001-ad-1");
  assert.equal(firstRow[columnNames.indexOf("status")], "proposed");
});

test("writeLpCandidateToLPs appends one row with default status/lp_id", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { lps: "LPs" } };
  const appendCalls = [];
  const sheets = {
    spreadsheets: {
      values: {
        append: async (request) => {
          appendCalls.push(request);
          return { data: {} };
        },
      },
    },
  };

  await writeLpCandidateToLPs(
    "sem_001",
    {
      hero_title: "見出し",
      hero_subtitle: "サブ見出し",
      intro_copy: "導入文",
      benefits_bullets: "ベネフィット1\nベネフィット2",
      cta_text: "無料で申し込む",
    },
    { config, sheets }
  );

  assert.equal(appendCalls.length, 1);
  const columnNames = getColumnNames("lps");
  const row = appendCalls[0].requestBody.values[0];
  assert.equal(row[columnNames.indexOf("lp_id")], "sem_001-lp-1");
  assert.equal(row[columnNames.indexOf("status")], "proposed");
});

test("runAutonomousAcquisition orchestrates read, flight proposal, and candidate writes", async () => {
  const config = {
    spreadsheetId: "sheet-123",
    sheets: { parent: "parent", x_ads_ops: "X_ads", lps: "LPs" },
  };
  const parentColumns = getColumnNames("parent");
  const parentRowValues = parentColumns.map((c) => {
    if (c === "seminar_id") return "sem_001";
    if (c === "event_date") return "2026-08-07 10:00";
    return "";
  });

  const appendCalls = [];
  const batchUpdateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 0 } }] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async () => ({ data: { values: [parentColumns, parentRowValues] } }),
        batchUpdate: async (request) => {
          batchUpdateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
        append: async (request) => {
          appendCalls.push(request);
          return { data: {} };
        },
      },
    },
  };

  const result = await runAutonomousAcquisition("sem_001", {
    xAdsCandidates: [
      { ad_headline: "H1", ad_body: "B1", creative_direction: "C1", cta_text: "CTA1" },
      { ad_headline: "H2", ad_body: "B2", creative_direction: "C2", cta_text: "CTA2" },
      { ad_headline: "H3", ad_body: "B3", creative_direction: "C3", cta_text: "CTA3" },
    ],
    lpCandidate: {
      hero_title: "LP見出し",
      hero_subtitle: "LPサブ",
      intro_copy: "LP導入",
      benefits_bullets: "b1\nb2",
      cta_text: "無料で申し込む",
    },
    config,
    sheets,
  });

  assert.deepEqual(result.flight, {
    ad_flight_start_date: "2026-07-31",
    ad_flight_end_date: "2026-08-06",
  });
  assert.equal(result.xAdsWritten, 3);
  assert.equal(result.lpWritten, 1);
  assert.equal(batchUpdateCalls.length, 1); // Parentへの配信期間書き込み
  assert.equal(appendCalls.length, 4); // X広告3件 + LP1件
});

function makeFakeSheetsForXAdsRead(rows) {
  return {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: rows } }),
      },
    },
  };
}

test("getApprovedXAds returns only approved rows for the given seminar_id", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { x_ads_ops: "X_ads_ops" } };
  const columnNames = getColumnNames("x_ads_ops");
  const rowFor = (adId, seminarId, status) =>
    columnNames.map((c) => {
      if (c === "ad_id") return adId;
      if (c === "seminar_id") return seminarId;
      if (c === "status") return status;
      return "";
    });
  const rows = [
    columnNames,
    rowFor("ad-1", "sem_001", "proposed"),
    rowFor("ad-2", "sem_001", "approved"),
    rowFor("ad-3", "sem_001", "approved"),
    rowFor("ad-4", "sem_002", "approved"),
  ];
  const sheets = makeFakeSheetsForXAdsRead(rows);

  const approved = await getApprovedXAds("sem_001", { config, sheets });
  assert.deepEqual(
    approved.map((r) => r.row.ad_id),
    ["ad-2", "ad-3"]
  );
});

test("writeAdIdentifiers updates the row matched by ad_id, not seminar_id", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { x_ads_ops: "X_ads_ops" } };
  const columnNames = getColumnNames("x_ads_ops");
  const rowFor = (adId, seminarId) =>
    columnNames.map((c) => {
      if (c === "ad_id") return adId;
      if (c === "seminar_id") return seminarId;
      return "";
    });
  const rows = [columnNames, rowFor("ad-1", "sem_001"), rowFor("ad-2", "sem_001")];
  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: rows } }),
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
    },
  };

  await writeAdIdentifiers(
    "ad-2",
    { x_campaign_id: "camp-1", x_adset_id: "adset-1", x_ad_id: "adid-1" },
    { config, sheets }
  );

  assert.equal(updateCalls.length, 1);
  const ranges = updateCalls[0].requestBody.data.map((d) => d.range);
  assert.ok(ranges.every((r) => r.endsWith("3"))); // ad-2 は3行目（ヘッダー+ad-1の次）
});

test("writeAdMetrics writes impressions/clicks/spend to the row matched by ad_id", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { x_ads_ops: "X_ads_ops" } };
  const columnNames = getColumnNames("x_ads_ops");
  const rowFor = (adId) => columnNames.map((c) => (c === "ad_id" ? adId : ""));
  const rows = [columnNames, rowFor("ad-1")];
  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: rows } }),
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
    },
  };

  await writeAdMetrics("ad-1", { impressions: 12000, clicks: 180, spend: 3200 }, { config, sheets });

  assert.equal(updateCalls.length, 1);
  const values = updateCalls[0].requestBody.data.map((d) => d.values[0][0]);
  assert.deepEqual(values.sort(), [180, 3200, 12000].sort());
});

const {
  computeAdMetrics,
  aggregateAdMetrics,
  computeFunnelMetrics,
  computeCPA,
  evaluateCPA,
  CPA_TARGET,
  diagnoseBottleneck,
  appendToParentNotes,
  runPdcaCheck,
} = require("../scripts/acquisition-agent");

test("computeAdMetrics calculates CTR and CPC", () => {
  const result = computeAdMetrics({ impressions: 10000, clicks: 150, spend: 3000 });
  assert.deepEqual(result, { impressions: 10000, clicks: 150, spend: 3000, ctr: 0.015, cpc: 20 });
});

test("computeAdMetrics returns null CTR/CPC when denominators are zero", () => {
  const result = computeAdMetrics({ impressions: 0, clicks: 0, spend: 0 });
  assert.equal(result.ctr, null);
  assert.equal(result.cpc, null);
});

test("aggregateAdMetrics sums multiple ad rows before computing CTR/CPC", () => {
  const result = aggregateAdMetrics([
    { impressions: 5000, clicks: 50, spend: 1000 },
    { impressions: 5000, clicks: 100, spend: 2000 },
  ]);
  assert.deepEqual(result, { impressions: 10000, clicks: 150, spend: 3000, ctr: 0.015, cpc: 20 });
});

test("aggregateAdMetrics handles an empty array without dividing by zero", () => {
  const result = aggregateAdMetrics([]);
  assert.deepEqual(result, { impressions: 0, clicks: 0, spend: 0, ctr: null, cpc: null });
});

test("computeFunnelMetrics calculates LP CVR from lp_visits/registrations", () => {
  const result = computeFunnelMetrics({ lp_visits: 500, registrations: 100 });
  assert.deepEqual(result, { lp_visits: 500, registrations: 100, lp_cvr: 0.2 });
});

test("computeCPA divides spend by registrations, or returns null when there are none", () => {
  assert.equal(computeCPA(3000, 100), 30);
  assert.equal(computeCPA(3000, 0), null);
});

test("evaluateCPA reports within-target for CPA at or below CPA_TARGET", () => {
  assert.equal(CPA_TARGET, 500);
  assert.deepEqual(evaluateCPA(50), {
    withinTarget: true,
    target: 500,
    message: "CPAが50円で目標500円以内です。",
  });
  // ちょうど目標値の場合も「目標内」扱いとする（CPA <= 500）
  assert.equal(evaluateCPA(500).withinTarget, true);
});

test("evaluateCPA reports exceeding-target for CPA above CPA_TARGET", () => {
  assert.deepEqual(evaluateCPA(700), {
    withinTarget: false,
    target: 500,
    message: "CPAが700円で目標500円を超過しています（要注意）。",
  });
});

test("evaluateCPA returns withinTarget: null when CPA is not computable", () => {
  const result = evaluateCPA(null);
  assert.equal(result.withinTarget, null);
  assert.match(result.message, /未算出/);
});

test("evaluateCPA respects a custom target override", () => {
  const result = evaluateCPA(300, 200);
  assert.equal(result.withinTarget, false);
  assert.equal(result.target, 200);
});

test("diagnoseBottleneck flags the ad side when CTR is below threshold", () => {
  const result = diagnoseBottleneck({ ctr: 0.005, lpCvr: 0.25 });
  assert.equal(result.bottleneck, "ad");
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].metric, "ctr");
});

test("diagnoseBottleneck flags the lp side when LP CVR is below threshold", () => {
  const result = diagnoseBottleneck({ ctr: 0.02, lpCvr: 0.1 });
  assert.equal(result.bottleneck, "lp");
  assert.equal(result.issues[0].metric, "lp_cvr");
});

test("diagnoseBottleneck reports no bottleneck when both metrics clear the threshold", () => {
  const result = diagnoseBottleneck({ ctr: 0.02, lpCvr: 0.3 });
  assert.equal(result.bottleneck, "none");
  assert.deepEqual(result.issues, []);
});

test("diagnoseBottleneck reports insufficient_data when both metrics are null", () => {
  const result = diagnoseBottleneck({ ctr: null, lpCvr: null });
  assert.equal(result.bottleneck, "insufficient_data");
});

test("diagnoseBottleneck respects custom thresholds", () => {
  const result = diagnoseBottleneck({ ctr: 0.015, lpCvr: 0.3 }, { ctrThreshold: 0.02 });
  assert.equal(result.bottleneck, "ad");
});

test("appendToParentNotes appends a dated line while preserving existing notes", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = getColumnNames("parent");
  const rowValues = columnNames.map((c) => {
    if (c === "seminar_id") return "sem_001";
    if (c === "notes") return "既存メモ";
    return "";
  });
  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 0 } }] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async () => ({ data: { values: [columnNames, rowValues] } }),
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
    },
  };

  await appendToParentNotes("sem_001", "テスト診断コメント", { config, sheets });

  const newNotes = updateCalls[0].requestBody.data[0].values[0][0];
  assert.ok(newNotes.startsWith("既存メモ\n["));
  assert.ok(newNotes.includes("テスト診断コメント"));
});

test("runPdcaCheck aggregates approved ad metrics, funnel metrics, and writes a diagnosis note", async () => {
  const config = {
    spreadsheetId: "sheet-123",
    sheets: { parent: "parent", x_ads_ops: "X_ads_ops" },
  };
  const parentColumns = getColumnNames("parent");
  const parentRowValues = parentColumns.map((c) => {
    if (c === "seminar_id") return "sem_001";
    if (c === "lp_visits") return "500";
    if (c === "registrations") return "100";
    return "";
  });
  const xAdsColumns = getColumnNames("x_ads_ops");
  const adRow = (adId, status, impressions, clicks, spend) =>
    xAdsColumns.map((c) => {
      if (c === "ad_id") return adId;
      if (c === "seminar_id") return "sem_001";
      if (c === "status") return status;
      if (c === "impressions") return String(impressions);
      if (c === "clicks") return String(clicks);
      if (c === "spend") return String(spend);
      return "";
    });
  const xAdsRows = [
    xAdsColumns,
    adRow("ad-1", "approved", 6000, 90, 1500),
    adRow("ad-2", "approved", 4000, 60, 1500),
    adRow("ad-3", "proposed", 999999, 999999, 999999), // 未承認のため集計対象外であることを確認する
  ];

  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 0 } }] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async (request) => {
          if (request.range.startsWith("parent")) {
            return { data: { values: [parentColumns, parentRowValues] } };
          }
          return { data: { values: xAdsRows } };
        },
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
    },
  };

  const result = await runPdcaCheck("sem_001", { config, sheets });

  assert.deepEqual(result.adMetrics, { impressions: 10000, clicks: 150, spend: 3000, ctr: 0.015, cpc: 20 });
  assert.deepEqual(result.funnel, { lp_visits: 500, registrations: 100, lp_cvr: 0.2 });
  assert.equal(result.cpa, 30);
  // CTR 1.5% > 目安1%、LP CVR 20% >= 目安20% のため、ボトルネックなし
  assert.equal(result.diagnosis.bottleneck, "none");
  // status="proposed"のad-3（異常値999999）が集計対象外であることを確認する
  assert.equal(result.adMetrics.impressions, 10000);
  // CPA=30円は目標500円以内
  assert.deepEqual(result.cpaEvaluation, {
    withinTarget: true,
    target: 500,
    message: "CPAが30円で目標500円以内です。",
  });

  const writtenNote = updateCalls[0].requestBody.data.find((d) => d.range.includes("!T")).values[0][0];
  assert.match(writtenNote, /CPAが30円で目標500円以内です。/);
  assert.doesNotMatch(writtenNote, /CPA観点からも改善が必要/);
});

test("runPdcaCheck appends a CPA-over-target warning line when CPA exceeds CPA_TARGET", async () => {
  const config = {
    spreadsheetId: "sheet-123",
    sheets: { parent: "parent", x_ads_ops: "X_ads_ops" },
  };
  const parentColumns = getColumnNames("parent");
  const parentRowValues = parentColumns.map((c) => {
    if (c === "seminar_id") return "sem_001";
    if (c === "lp_visits") return "500";
    if (c === "registrations") return "10"; // 少ない申込数でCPAを吊り上げる
    return "";
  });
  const xAdsColumns = getColumnNames("x_ads_ops");
  const adRow = (adId, status, impressions, clicks, spend) =>
    xAdsColumns.map((c) => {
      if (c === "ad_id") return adId;
      if (c === "seminar_id") return "sem_001";
      if (c === "status") return status;
      if (c === "impressions") return String(impressions);
      if (c === "clicks") return String(clicks);
      if (c === "spend") return String(spend);
      return "";
    });
  const xAdsRows = [xAdsColumns, adRow("ad-1", "approved", 10000, 150, 7000)]; // spend/registrations = 700円

  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 0 } }] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async (request) => {
          if (request.range.startsWith("parent")) {
            return { data: { values: [parentColumns, parentRowValues] } };
          }
          return { data: { values: xAdsRows } };
        },
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
    },
  };

  const result = await runPdcaCheck("sem_001", { config, sheets });

  assert.equal(result.cpa, 700);
  assert.equal(result.cpaEvaluation.withinTarget, false);

  const writtenNote = updateCalls[0].requestBody.data.find((d) => d.range.includes("!T")).values[0][0];
  assert.match(writtenNote, /CPAが700円で目標500円を超過しています（要注意）。/);
  assert.match(writtenNote, /CPA観点からも改善が必要（広告費が高すぎる）/);
});
