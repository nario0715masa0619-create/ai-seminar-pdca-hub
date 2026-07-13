const test = require("node:test");
const assert = require("node:assert/strict");
const {
  columnIndexToA1,
  findRowByValue,
  getRowBySeminarId,
  updateRowFields,
  extendSheetHeader,
  createSheetIfNotExists,
} = require("../scripts/sheet-rows");

test("columnIndexToA1 converts 0-based index to Sheets column letters", () => {
  assert.equal(columnIndexToA1(0), "A");
  assert.equal(columnIndexToA1(19), "T");
  assert.equal(columnIndexToA1(25), "Z");
  assert.equal(columnIndexToA1(26), "AA");
  assert.equal(columnIndexToA1(27), "AB");
  assert.equal(columnIndexToA1(51), "AZ");
});

function makeFakeSheets(rows) {
  return {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: rows } }),
      },
    },
  };
}

test("findRowByValue returns the matching row as a column-name-keyed object", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  const rows = [columnNames, ["sem_001", "テストセミナー"]];
  const sheets = makeFakeSheets(rows);

  const result = await findRowByValue("parent", "seminar_id", "sem_001", { config, sheets });

  assert.equal(result.rowNumber, 2);
  assert.equal(result.row.seminar_id, "sem_001");
  assert.equal(result.row.seminar_name, "テストセミナー");
  assert.equal(result.row.notes, "");
});

test("findRowByValue returns null when nothing matches", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  const sheets = makeFakeSheets([columnNames]);

  const result = await findRowByValue("parent", "seminar_id", "does-not-exist", { config, sheets });
  assert.equal(result, null);
});

test("getRowBySeminarId delegates to findRowByValue on the parent sheet", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  const rows = [columnNames, ["sem_001", "テストセミナー"]];
  const sheets = makeFakeSheets(rows);

  const result = await getRowBySeminarId("sem_001", { config, sheets });
  assert.equal(result.row.seminar_id, "sem_001");
});

test("updateRowFields issues one batchUpdate call with per-field ranges", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  const rows = [columnNames, ["sem_001", "テストセミナー"]];
  const batchUpdateCalls = [];
  const sheets = {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: rows } }),
        batchUpdate: async (request) => {
          batchUpdateCalls.push(request);
          return {
            data: {
              responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })),
            },
          };
        },
      },
    },
  };

  const result = await updateRowFields(
    "parent",
    "sem_001",
    { ad_budget_total: 5000, ad_budget_status: "proposed" },
    { config, sheets }
  );

  assert.equal(batchUpdateCalls.length, 1);
  const { data } = batchUpdateCalls[0].requestBody;
  assert.equal(data.length, 2);
  assert.ok(data.some((d) => d.range.startsWith("parent!") && d.values[0][0] === 5000));
  assert.ok(data.some((d) => d.values[0][0] === "proposed"));
  assert.equal(result.length, 2);
});

test("updateRowFields normalizes date-like values to a consistent yyyy-mm-dd display format", async () => {
  // 回帰テスト: USER_ENTERED で "2026-08-06" のような文字列を書き込むと、
  // Google Sheets側が自動的にDATE型セルへ変換し、セルごとに表示形式がバラつくことがあった
  // （例: 隣接する列で "yyyy-mm-dd" と "m/d" が混在し、"2026-08-06" が "8/6" と表示された）。
  // 日付らしき値を書き込んだ場合は、続けてnumberFormatを明示的に揃えるリクエストを送ることを確認する。
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  const rows = [columnNames, columnNames.map((c) => (c === "seminar_id" ? "sem_001" : ""))];
  const valuesBatchUpdateCalls = [];
  const formatBatchUpdateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 42 } }] } }),
      batchUpdate: async (request) => {
        formatBatchUpdateCalls.push(request);
        return { data: {} };
      },
      values: {
        get: async () => ({ data: { values: rows } }),
        batchUpdate: async (request) => {
          valuesBatchUpdateCalls.push(request);
          return {
            data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) },
          };
        },
      },
    },
  };

  await updateRowFields(
    "parent",
    "sem_001",
    { ad_flight_start_date: "2026-07-31", ad_flight_end_date: "2026-08-06", ad_budget_status: "proposed" },
    { config, sheets }
  );

  assert.equal(formatBatchUpdateCalls.length, 1);
  const requests = formatBatchUpdateCalls[0].requestBody.requests;
  // 日付らしき2フィールド分のフォーマット指定リクエストのみ（ad_budget_statusは対象外）
  assert.equal(requests.length, 2);
  for (const req of requests) {
    assert.equal(req.repeatCell.range.sheetId, 42);
    assert.equal(req.repeatCell.cell.userEnteredFormat.numberFormat.pattern, "yyyy-mm-dd");
  }
});

test("updateRowFields skips the format-fixing request when no date-like values are written", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  const rows = [columnNames, columnNames.map((c) => (c === "seminar_id" ? "sem_001" : ""))];
  let formatBatchUpdateCalled = false;
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 42 } }] } }),
      batchUpdate: async () => {
        formatBatchUpdateCalled = true;
        return { data: {} };
      },
      values: {
        get: async () => ({ data: { values: rows } }),
        batchUpdate: async (request) => ({
          data: { responses: request.requestBody.data.map((d) => ({ updatedRange: d.range })) },
        }),
      },
    },
  };

  await updateRowFields("parent", "sem_001", { ad_budget_status: "proposed" }, { config, sheets });
  assert.equal(formatBatchUpdateCalled, false);
});

test("updateRowFields throws when the seminar_id row is not found", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  const sheets = makeFakeSheets([columnNames]);

  await assert.rejects(
    () => updateRowFields("parent", "does-not-exist", { notes: "x" }, { config, sheets }),
    /not found/
  );
});

test("extendSheetHeader writes the full column list to row 1", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const updateCalls = [];
  const sheets = {
    spreadsheets: {
      values: {
        update: async (request) => {
          updateCalls.push(request);
          return { data: {} };
        },
      },
    },
  };

  await extendSheetHeader("parent", { config, sheets });

  assert.equal(updateCalls.length, 1);
  const columnNames = require("../scripts/schema-utils").getColumnNames("parent");
  assert.deepEqual(updateCalls[0].requestBody.values, [columnNames]);
  assert.ok(updateCalls[0].range.startsWith("parent!A1:"));
});

test("createSheetIfNotExists does nothing when the tab already exists", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: {} };
  let batchUpdateCalled = false;
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "X_ads" } }] } }),
      batchUpdate: async () => {
        batchUpdateCalled = true;
        return { data: {} };
      },
    },
  };

  const result = await createSheetIfNotExists("X_ads", { config, sheets });
  assert.deepEqual(result, { created: false });
  assert.equal(batchUpdateCalled, false);
});

test("createSheetIfNotExists creates the tab when missing", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: {} };
  const batchUpdateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent" } }] } }),
      batchUpdate: async (request) => {
        batchUpdateCalls.push(request);
        return { data: {} };
      },
    },
  };

  const result = await createSheetIfNotExists("X_ads", { config, sheets });
  assert.deepEqual(result, { created: true });
  assert.equal(batchUpdateCalls.length, 1);
  assert.equal(batchUpdateCalls[0].requestBody.requests[0].addSheet.properties.title, "X_ads");
});
