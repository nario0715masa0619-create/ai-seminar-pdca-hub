const test = require("node:test");
const assert = require("node:assert/strict");
const { getColumnNames } = require("../scripts/schema-utils");
const {
  STATUS_OPTIONS,
  setStatusDropdown,
  setupAllStatusDropdowns,
} = require("../scripts/setup-status-dropdowns");

test("STATUS_OPTIONS matches docs/schema.md's documented status values", () => {
  assert.deepEqual(STATUS_OPTIONS.x_ads_ops, ["proposed", "approved", "rejected", "paused_auto", "winner"]);
  assert.deepEqual(STATUS_OPTIONS.lps, ["proposed", "approved", "rejected"]);
});

test("setStatusDropdown issues a setDataValidation request targeting the status column", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: { x_ads_ops: "X_ads_ops" } };
  const batchUpdateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "X_ads_ops", sheetId: 7 } }] } }),
      batchUpdate: async (request) => {
        batchUpdateCalls.push(request);
        return { data: {} };
      },
    },
  };

  await setStatusDropdown("x_ads_ops", STATUS_OPTIONS.x_ads_ops, { config, sheets });

  assert.equal(batchUpdateCalls.length, 1);
  const request = batchUpdateCalls[0].requestBody.requests[0].setDataValidation;
  const columnNames = getColumnNames("x_ads_ops");
  const statusColIndex = columnNames.indexOf("status");

  assert.equal(request.range.sheetId, 7);
  assert.equal(request.range.startRowIndex, 1); // ヘッダー行を除く
  assert.equal(request.range.startColumnIndex, statusColIndex);
  assert.equal(request.range.endColumnIndex, statusColIndex + 1);
  assert.equal(request.range.endRowIndex, undefined); // シート末尾まで（将来の行も対象）
  assert.equal(request.rule.condition.type, "ONE_OF_LIST");
  assert.deepEqual(
    request.rule.condition.values.map((v) => v.userEnteredValue),
    ["proposed", "approved", "rejected", "paused_auto", "winner"]
  );
  assert.equal(request.rule.strict, true);
  assert.equal(request.rule.showCustomUi, true);
});

test("setStatusDropdown throws for an unknown sheetKey", async () => {
  const config = { spreadsheetId: "sheet-123", sheets: {} };
  await assert.rejects(
    () => setStatusDropdown("unknown_sheet", ["a"], { config, sheets: {} }),
    /Unknown sheetKey/
  );
});

test("setupAllStatusDropdowns applies the dropdown to both x_ads_ops and lps", async () => {
  const config = {
    spreadsheetId: "sheet-123",
    sheets: { x_ads_ops: "X_ads_ops", lps: "LPs" },
  };
  const batchUpdateCalls = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: [
            { properties: { title: "X_ads_ops", sheetId: 7 } },
            { properties: { title: "LPs", sheetId: 8 } },
          ],
        },
      }),
      batchUpdate: async (request) => {
        batchUpdateCalls.push(request);
        return { data: {} };
      },
    },
  };

  const result = await setupAllStatusDropdowns({ config, sheets });

  assert.equal(batchUpdateCalls.length, 2);
  assert.deepEqual(
    result.map((r) => r.sheetKey),
    ["x_ads_ops", "lps"]
  );
  const lpsRequest = batchUpdateCalls[1].requestBody.requests[0].setDataValidation;
  assert.equal(lpsRequest.range.sheetId, 8);
  assert.deepEqual(
    lpsRequest.rule.condition.values.map((v) => v.userEnteredValue),
    ["proposed", "approved", "rejected"]
  );
});
