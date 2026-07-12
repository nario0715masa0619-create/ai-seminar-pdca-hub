const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  validateWorkflowFile,
  validateAllWorkflows,
  listWorkflowFiles,
} = require("../scripts/validate-n8n-workflows");

test("all committed n8n/workflows/*.json files are valid", () => {
  const results = validateAllWorkflows();

  assert.ok(results.length > 0, "expected at least one workflow file to be found");
  for (const result of results) {
    assert.deepEqual(
      { file: result.file, ok: result.ok, errors: result.errors },
      { file: result.file, ok: true, errors: [] }
    );
  }
});

test("listWorkflowFiles only returns .json files from n8n/workflows/", () => {
  const files = listWorkflowFiles();
  assert.ok(files.every((file) => file.endsWith(".json")));
});

test("validateWorkflowFile reports invalid JSON syntax", () => {
  const tmpFile = path.join(os.tmpdir(), `n8n-workflow-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, "{not valid json");
  try {
    const result = validateWorkflowFile(tmpFile);
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].startsWith("invalid JSON:"));
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("validateWorkflowFile reports missing required top-level fields", () => {
  const tmpFile = path.join(os.tmpdir(), `n8n-workflow-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ nodes: [] }));
  try {
    const result = validateWorkflowFile(tmpFile);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('missing or empty top-level "name" (string)'));
    assert.ok(result.errors.includes('missing top-level "connections" (object)'));
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("validateWorkflowFile accepts a minimal valid workflow", () => {
  const tmpFile = path.join(os.tmpdir(), `n8n-workflow-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ name: "Test Workflow", nodes: [], connections: {} }));
  try {
    const result = validateWorkflowFile(tmpFile);
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});
