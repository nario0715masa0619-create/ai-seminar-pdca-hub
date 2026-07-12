const test = require("node:test");
const assert = require("node:assert/strict");
const { payloadToRow } = require("../scripts/sync-sheets");
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
