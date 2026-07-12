#!/usr/bin/env node
/**
 * validate-n8n-workflows.js
 *
 * n8n/workflows/*.json が有効なJSONであり、n8nワークフローエクスポートとして
 * 最低限の構造（name / nodes配列 / connectionsオブジェクト）を満たしているかを検証する。
 * ワークフロー編集時のJSON構文崩れやキー欠落をCIで検知するためのもの。
 *
 * Usage:
 *   node scripts/validate-n8n-workflows.js
 */

const fs = require("fs");
const path = require("path");

const WORKFLOWS_DIR = path.join(__dirname, "..", "n8n", "workflows");

/**
 * n8n/workflows/ ディレクトリ内の *.json ファイルパスを列挙する。
 * @returns {string[]}
 */
function listWorkflowFiles() {
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(WORKFLOWS_DIR, name));
}

/**
 * 1つのワークフローJSONファイルを検証する。
 * @param {string} filePath
 * @returns {{ file: string, ok: boolean, errors: string[] }}
 */
function validateWorkflowFile(filePath) {
  const file = path.basename(filePath);
  const errors = [];

  let workflow;
  try {
    workflow = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return { file, ok: false, errors: [`invalid JSON: ${err.message}`] };
  }

  if (typeof workflow.name !== "string" || workflow.name.length === 0) {
    errors.push('missing or empty top-level "name" (string)');
  }
  if (!Array.isArray(workflow.nodes)) {
    errors.push('missing top-level "nodes" (array)');
  }
  if (typeof workflow.connections !== "object" || workflow.connections === null || Array.isArray(workflow.connections)) {
    errors.push('missing top-level "connections" (object)');
  }

  return { file, ok: errors.length === 0, errors };
}

/**
 * n8n/workflows/ 配下の全ワークフローJSONを検証する。
 * @returns {Array<{ file: string, ok: boolean, errors: string[] }>}
 */
function validateAllWorkflows() {
  return listWorkflowFiles().map(validateWorkflowFile);
}

module.exports = { listWorkflowFiles, validateWorkflowFile, validateAllWorkflows, WORKFLOWS_DIR };

if (require.main === module) {
  const results = validateAllWorkflows();
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify(results, null, 2));

  if (results.length === 0) {
    console.error(`No workflow JSON files found in ${WORKFLOWS_DIR}`);
    process.exit(1);
  }

  if (failed.length > 0) {
    console.error(`${failed.length} workflow file(s) failed validation`);
    process.exit(1);
  }
}
