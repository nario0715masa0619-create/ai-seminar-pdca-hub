/**
 * sync-sheets.e2e.test.js
 *
 * 実際のGoogle Sheets APIに接続し、parentシートへテスト行を1行 append するE2Eテスト。
 * node:test の他のテスト（tests/*.test.js）はモック/純粋関数のみを検証するのに対し、
 * このファイルだけは実ネットワーク・実認証・実シート書き込みを伴う点に注意。
 *
 * 実行には以下が必要:
 *   - GOOGLE_APPLICATION_CREDENTIALS 環境変数（サービスアカウント鍵ファイルのパス）
 *   - config/sheets.json（実際の spreadsheetId とシート名）
 *
 * 通常の `npm test`（tests/*.test.js）には含めず、`npm run test:e2e` で個別に実行する。
 * 実行するとスプレッドシートの parent シートに "test-e2e-001" などの
 * 明らかにテストとわかる行が実際に追加される（削除は任意、残っても問題ない前提）。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { appendTestRowToParent } = require("../../scripts/sync-sheets");

test("appendTestRowToParent appends a row to the real parent sheet without error", async () => {
  const result = await appendTestRowToParent();

  assert.ok(result, "expected a response object from spreadsheets.values.append");
  assert.ok(result.data, "expected response.data from the Sheets API");
  assert.ok(
    result.data.updates && result.data.updates.updatedRows === 1,
    "expected exactly 1 row to be appended"
  );
});
