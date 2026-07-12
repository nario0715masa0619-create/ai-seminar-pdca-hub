#!/usr/bin/env node
/**
 * validate-agent-output.js
 *
 * n8n の "Validate Output" ノードが行うべきチェックを実装として固定化したもの。
 * 各エージェントのチェック内容は docs/n8n-workflows.md の各Flowの
 * "Validate Output" セクションと対応する（内容を変える場合は両方を更新すること）。
 *
 * Usage:
 *   node scripts/validate-agent-output.js <agentKey> <path-to-output.json>
 *   agentKey: acquisition | seminar-content | diagnostics | follow-up
 *
 * Programmatic:
 *   const { validateAgentOutput } = require("./scripts/validate-agent-output");
 *   const result = validateAgentOutput("acquisition", output);
 *   // result = { valid: boolean, errors: string[] }
 */

// prompts/diagnostics.md の improvement_priorities[].template で許容される値
const DIAGNOSTICS_TEMPLATE_VALUES = ["x_ads", "lp", "talk_script", "slides", "follow_up"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// docs/n8n-workflows.md > Acquisition Flow > Validate Output:
// 「x_ads が配列であること、lp がオブジェクトであること、両方に test_variable / hypothesis が含まれることを確認する」
function validateAcquisitionOutput(output) {
  const errors = [];

  if (!Array.isArray(output.x_ads)) {
    errors.push("x_ads must be an array");
  } else {
    output.x_ads.forEach((entry, index) => {
      if (!isNonEmptyString(entry && entry.test_variable)) errors.push(`x_ads[${index}].test_variable is required`);
      if (!isNonEmptyString(entry && entry.hypothesis)) errors.push(`x_ads[${index}].hypothesis is required`);
    });
  }

  if (!isPlainObject(output.lp)) {
    errors.push("lp must be an object");
  } else {
    if (!isNonEmptyString(output.lp.test_variable)) errors.push("lp.test_variable is required");
    if (!isNonEmptyString(output.lp.hypothesis)) errors.push("lp.hypothesis is required");
  }

  return errors;
}

// docs/n8n-workflows.md > Seminar Content Flow > Validate Output:
// 「talk.outline / slides.outline が空文字でないことを確認する」
function validateSeminarContentOutput(output) {
  const errors = [];

  if (!isPlainObject(output.talk) || !isNonEmptyString(output.talk.outline)) {
    errors.push("talk.outline must be a non-empty string");
  }
  if (!isPlainObject(output.slides) || !isNonEmptyString(output.slides.outline)) {
    errors.push("slides.outline must be a non-empty string");
  }

  return errors;
}

// docs/n8n-workflows.md > Diagnostics Flow > Validate Output:
// 「improvement_priorities の各要素の template が x_ads | lp | talk_script | slides | follow_up の
//   いずれかであることを確認する」
function validateDiagnosticsOutput(output) {
  const errors = [];

  if (!Array.isArray(output.improvement_priorities)) {
    errors.push("improvement_priorities must be an array");
  } else {
    output.improvement_priorities.forEach((entry, index) => {
      const template = entry && entry.template;
      if (!DIAGNOSTICS_TEMPLATE_VALUES.includes(template)) {
        errors.push(
          `improvement_priorities[${index}].template must be one of ${DIAGNOSTICS_TEMPLATE_VALUES.join(" | ")}, got "${template}"`
        );
      }
    });
  }

  return errors;
}

// docs/n8n-workflows.md > Follow-up Flow > Validate Output:
// 「follow_up_scenarios の各要素に segment / trigger / test_variable が含まれることを確認する」
function validateFollowUpOutput(output) {
  const errors = [];

  if (!Array.isArray(output.follow_up_scenarios)) {
    errors.push("follow_up_scenarios must be an array");
  } else {
    output.follow_up_scenarios.forEach((entry, index) => {
      if (!isNonEmptyString(entry && entry.segment)) errors.push(`follow_up_scenarios[${index}].segment is required`);
      if (!isNonEmptyString(entry && entry.trigger)) errors.push(`follow_up_scenarios[${index}].trigger is required`);
      if (!isNonEmptyString(entry && entry.test_variable))
        errors.push(`follow_up_scenarios[${index}].test_variable is required`);
    });
  }

  return errors;
}

const VALIDATORS = {
  acquisition: validateAcquisitionOutput,
  "seminar-content": validateSeminarContentOutput,
  diagnostics: validateDiagnosticsOutput,
  "follow-up": validateFollowUpOutput,
};

/**
 * @param {string} agentKey - acquisition | seminar-content | diagnostics | follow-up
 * @param {object} output - Claude Agentのレスポンスをパースしたオブジェクト
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAgentOutput(agentKey, output) {
  const validator = VALIDATORS[agentKey];
  if (!validator) {
    throw new Error(`Unknown agentKey: "${agentKey}". Expected one of ${Object.keys(VALIDATORS).join(" | ")}.`);
  }
  if (!isPlainObject(output)) {
    return { valid: false, errors: ["output must be a JSON object"] };
  }

  const errors = validator(output);
  return { valid: errors.length === 0, errors };
}

module.exports = { validateAgentOutput, DIAGNOSTICS_TEMPLATE_VALUES };

if (require.main === module) {
  const [, , agentKey, filePath] = process.argv;
  if (!agentKey || !filePath) {
    console.error("Usage: node scripts/validate-agent-output.js <agentKey> <path-to-output.json>");
    process.exit(1);
  }

  const fs = require("fs");
  const output = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const result = validateAgentOutput(agentKey, output);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}
