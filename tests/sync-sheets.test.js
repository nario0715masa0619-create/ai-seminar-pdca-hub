const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { payloadToRow, loadSheetsConfig, appendRow, EXAMPLE_CONFIG_PATH } = require("../scripts/sync-sheets");
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
      "parent",
      "slides",
      "talk",
      "x_ads",
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
