const test = require("node:test");
const assert = require("node:assert/strict");
const { checkAllTemplates, compareColumns, TEMPLATE_KEYS } = require("../scripts/check-schema-consistency");

test("all templates are in sync between docs/schema.md and sheets/header-*.csv", () => {
  const results = checkAllTemplates();

  assert.equal(results.length, TEMPLATE_KEYS.length);
  for (const result of results) {
    assert.deepEqual(
      { templateKey: result.templateKey, ok: result.ok, errors: result.errors },
      { templateKey: result.templateKey, ok: true, errors: [] }
    );
  }
});

test("checkAllTemplates covers every template key derived from docs/schema.md", () => {
  const results = checkAllTemplates();
  const checkedKeys = results.map((result) => result.templateKey).sort();
  assert.deepEqual(checkedKeys, [...TEMPLATE_KEYS].sort());
});

test("compareColumns returns no errors when column names and order match", () => {
  const errors = compareColumns(["seminar_id", "seminar_name"], ["seminar_id", "seminar_name"]);
  assert.deepEqual(errors, []);
});

test("compareColumns detects a column count mismatch", () => {
  const errors = compareColumns(["seminar_id", "seminar_name"], ["seminar_id"]);
  assert.ok(errors.some((e) => e.includes("column count mismatch")));
});

test("compareColumns detects an out-of-order or renamed column", () => {
  const errors = compareColumns(["seminar_id", "seminar_name"], ["seminar_id", "seminar_title"]);
  assert.ok(errors.some((e) => e.includes('column[1] mismatch: schema="seminar_name", csv="seminar_title"')));
});
