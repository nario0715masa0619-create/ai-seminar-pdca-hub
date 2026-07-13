const test = require("node:test");
const assert = require("node:assert/strict");
const {
  proposeAdFlight,
  getSeminarRow,
  updateParentBudgetProposal,
  writeAdCandidatesToXAds,
  writeLpCandidateToLPs,
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
      values: {
        get: async () => ({ data: { values: [columnNames, rowValues] } }),
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
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
      values: {
        get: async () => ({ data: { values: [columnNames, rowValues] } }),
        batchUpdate: async (request) => {
          updateCalls.push(request);
          return { data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) } };
        },
      },
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
