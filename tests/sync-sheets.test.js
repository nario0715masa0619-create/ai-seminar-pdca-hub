const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  payloadToRow,
  loadSheetsConfig,
  appendRow,
  findTestRowIndices,
  deleteTestRows,
  EXAMPLE_CONFIG_PATH,
} = require("../scripts/sync-sheets");
const { getColumnNames } = require("../scripts/schema-utils");

test("payloadToRow maps fields in docs/schema.md column order", () => {
  const row = payloadToRow("parent", {
    seminar_id: "sem_test",
    seminar_name: "テストセミナー",
  });
  const columns = getColumnNames("parent");

  assert.equal(row.length, columns.length);
  assert.equal(row[columns.indexOf("seminar_id")], "sem_test");
  assert.equal(row[columns.indexOf("seminar_name")], "テストセミナー");
});

test("payloadToRow fills missing fields with empty string", () => {
  const row = payloadToRow("parent", { seminar_id: "sem_test" });
  const columns = getColumnNames("parent");

  for (let i = 0; i < columns.length; i += 1) {
    if (columns[i] !== "seminar_id") {
      assert.equal(row[i], "");
    }
  }
});

test("payloadToRow handles a completely missing template object", () => {
  const row = payloadToRow("follow_up", undefined);
  const columns = getColumnNames("follow_up");

  assert.equal(row.length, columns.length);
  assert.ok(row.every((value) => value === ""));
});

test("payloadToRow preserves non-string values (numbers, booleans)", () => {
  const row = payloadToRow("parent", { lp_visits: 1200, registrations: 0 });
  const columns = getColumnNames("parent");

  assert.equal(row[columns.indexOf("lp_visits")], 1200);
  // 0 は falsy だが未定義値ではないため、空文字に変換されず 0 のまま残ることを確認する
  assert.equal(row[columns.indexOf("registrations")], 0);
});

test("loadSheetsConfig throws a helpful error when the config file is missing", () => {
  // ローカル環境では実運用の config/sheets.json が存在しうるため、デフォルトパスに依存せず
  // 確実に存在しないパスを SHEETS_CONFIG_PATH で指定して検証する。
  process.env.SHEETS_CONFIG_PATH = path.join(__dirname, "does-not-exist.sheets.json");
  try {
    assert.throws(() => loadSheetsConfig(), /Sheets config not found/);
  } finally {
    delete process.env.SHEETS_CONFIG_PATH;
  }
});

test("loadSheetsConfig loads config/sheets.example.json via SHEETS_CONFIG_PATH override", () => {
  process.env.SHEETS_CONFIG_PATH = EXAMPLE_CONFIG_PATH;
  try {
    const config = loadSheetsConfig();
    assert.equal(config.spreadsheetId, "YOUR_SPREADSHEET_ID");
    assert.deepEqual(Object.keys(config.sheets).sort(), [
      "follow_up",
      "lp",
      "lps",
      "parent",
      "slides",
      "talk",
      "x_ads",
      "x_ads_ops",
    ]);
  } finally {
    delete process.env.SHEETS_CONFIG_PATH;
  }
});

test("appendRow calls spreadsheets.values.append with config-resolved spreadsheetId and range", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const calls = [];
  const fakeSheets = {
    spreadsheets: {
      values: {
        append: async (request) => {
          calls.push(request);
          return { data: {} };
        },
      },
    },
  };

  await appendRow({ sheetKey: "parent", values: ["a", "b"], config, sheets: fakeSheets });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].spreadsheetId, "sheet-123");
  assert.equal(calls[0].range, "parent!A:Z");
  assert.equal(calls[0].valueInputOption, "USER_ENTERED");
  assert.deepEqual(calls[0].requestBody.values, [["a", "b"]]);
});

test("appendRow throws for an unknown sheetKey", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  await assert.rejects(
    () => appendRow({ sheetKey: "unknown", values: [], config, sheets: {} }),
    /Unknown sheetKey/
  );
});

test("findTestRowIndices finds only data rows whose seminar_id starts with the prefix", () => {
  const columns = ["seminar_id", "seminar_name"];
  const rows = [
    ["seminar_id", "seminar_name"],
    ["sem_2026_001", "実データ"],
    ["test-e2e-001", "テスト行1"],
    ["test-e2e-002", "テスト行2"],
  ];

  const indices = findTestRowIndices(rows, columns, "test-e2e-");
  assert.deepEqual(indices, [2, 3]);
});

test("findTestRowIndices returns an empty array when no rows match", () => {
  const columns = ["seminar_id", "seminar_name"];
  const rows = [
    ["seminar_id", "seminar_name"],
    ["sem_2026_001", "実データ"],
  ];

  assert.deepEqual(findTestRowIndices(rows, columns, "test-e2e-"), []);
});

test("findTestRowIndices throws when seminar_id column is not present", () => {
  assert.throws(() => findTestRowIndices([], ["ad_id"], "test-e2e-"), /"seminar_id" column not found/);
});

test("deleteTestRows deletes matching rows in descending order via batchUpdate", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  const batchUpdateCalls = [];
  const fakeSheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 42 } }] } }),
      values: {
        get: async () => ({
          data: {
            values: [
              ["seminar_id", "seminar_name"],
              ["sem_2026_001", "実データ"],
              ["test-e2e-001", "テスト行1"],
              ["test-e2e-002", "テスト行2"],
            ],
          },
        }),
      },
      batchUpdate: async (request) => {
        batchUpdateCalls.push(request);
        return { data: {} };
      },
    },
  };

  const result = await deleteTestRows("parent", { config, sheets: fakeSheets });

  assert.deepEqual(result, { deleted: 2 });
  assert.equal(batchUpdateCalls.length, 1);
  const requests = batchUpdateCalls[0].requestBody.requests;
  // 行2, 行3のうち、大きいインデックス(3)から先に削除するリクエストになっていること
  assert.deepEqual(
    requests.map((r) => r.deleteDimension.range.startIndex),
    [3, 2]
  );
  assert.ok(requests.every((r) => r.deleteDimension.range.sheetId === 42));
});

test("deleteTestRows returns deleted: 0 without calling batchUpdate when nothing matches", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { parent: "parent" } };
  let batchUpdateCalled = false;
  const fakeSheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "parent", sheetId: 42 } }] } }),
      values: {
        get: async () => ({ data: { values: [["seminar_id"], ["sem_2026_001"]] } }),
      },
      batchUpdate: async () => {
        batchUpdateCalled = true;
        return { data: {} };
      },
    },
  };

  const result = await deleteTestRows("parent", { config, sheets: fakeSheets });

  assert.deepEqual(result, { deleted: 0 });
  assert.equal(batchUpdateCalled, false);
});
