/**
 * sync-payload-to-sheets.e2e.test.js
 *
 * scripts/build-payload.js のダミーペイロード形式を使い、syncPayloadToSheets() で
 * 6シート（parent, x_ads, lp, talk, slides, follow_up）すべてに1行ずつ append できることを
 * 実際のGoogle Sheets APIに対して確認するE2Eテスト。
 *
 * tests/e2e/sync-sheets.test.js と同様、実ネットワーク・実認証・実シート書き込みを伴うため、
 * 通常の `npm test` には含めず `npm run test:e2e` で個別に実行する。
 * seminar_id は "test-e2e-002" など明らかにテストとわかる値を使い、KPI集計に影響しないようにする。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPayload } = require("../../scripts/build-payload");
const { syncPayloadToSheets } = require("../../scripts/sync-sheets");

test("syncPayloadToSheets appends a row to all 6 sheets without error", async () => {
  const payload = buildPayload("test-e2e-002");

  // syncPayloadToSheets は戻り値を返さないため、例外が投げられないことを確認する。
  await assert.doesNotReject(() => syncPayloadToSheets(payload));
});
