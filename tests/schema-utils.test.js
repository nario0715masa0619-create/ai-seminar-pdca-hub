const test = require("node:test");
const assert = require("node:assert/strict");
const { getSchema, getColumnNames } = require("../scripts/schema-utils");

const EXPECTED_TEMPLATE_KEYS = ["parent", "x_ads", "lp", "talk", "slides", "follow_up", "x_ads_ops", "lps", "weekly_pdca_log", "pdca_state"];
// weekly_pdca_log / pdca_state はセミナー単位ではなく週次PDCA全体のグローバルなログ/状態シートのため、
// seminar_idを持たない（docs/schema.md参照）
const SEMINAR_SCOPED_TEMPLATE_KEYS = EXPECTED_TEMPLATE_KEYS.filter(
  (k) => k !== "parent" && k !== "weekly_pdca_log" && k !== "pdca_state"
);

test("getSchema returns all templates defined in docs/schema.md", () => {
  const schema = getSchema();
  assert.deepEqual(Object.keys(schema).sort(), [...EXPECTED_TEMPLATE_KEYS].sort());
});

test("each template has at least one column and every column has a description", () => {
  const schema = getSchema();
  for (const key of EXPECTED_TEMPLATE_KEYS) {
    assert.ok(schema[key].length > 0, `${key} should have columns`);
    for (const entry of schema[key]) {
      assert.ok(entry.column.length > 0, `${key} column name should not be empty`);
      assert.ok(entry.description.length > 0, `${key}.${entry.column} description should not be empty`);
    }
  }
});

test("parent template starts with seminar_id as its key column", () => {
  const columns = getColumnNames("parent");
  assert.equal(columns[0], "seminar_id");
});

test("all seminar-scoped templates reference seminar_id as a foreign key column", () => {
  for (const key of SEMINAR_SCOPED_TEMPLATE_KEYS) {
    const columns = getColumnNames(key);
    assert.ok(columns.includes("seminar_id"), `${key} should include seminar_id`);
  }
});

test("getColumnNames throws for an unknown template key", () => {
  assert.throws(() => getColumnNames("unknown_template"), /Unknown template key/);
});
