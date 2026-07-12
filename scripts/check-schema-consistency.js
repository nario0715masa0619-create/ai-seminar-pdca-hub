#!/usr/bin/env node
/**
 * check-schema-consistency.js
 *
 * docs/schema.md（scripts/schema-utils.js経由）に定義された列名・列順と、
 * sheets/header-<templateKey>.csv の実際のヘッダー行が一致しているかを検証する。
 *
 * schema.md を更新したのに sheets/header-*.csv の更新を忘れる、逆に
 * header-*.csv だけ直接編集して schema.md との対応が崩れる、といったズレを検知するためのもの。
 * Google Sheets の実シートのヘッダー行を作る/確認する際は、この sheets/header-*.csv をコピー&ペーストする想定。
 *
 * Usage:
 *   node scripts/check-schema-consistency.js
 *   （全テンプレをチェックし、不整合があれば非0で終了する）
 */

const fs = require("fs");
const path = require("path");
const { getColumnNames, HEADING_TO_TEMPLATE_KEY } = require("./schema-utils");

const SHEETS_DIR = path.join(__dirname, "..", "sheets");
const TEMPLATE_KEYS = [...new Set(Object.values(HEADING_TO_TEMPLATE_KEY))];

/**
 * sheets/header-<templateKey>.csv の1行目をカンマ区切りで読み、列名の配列を返す。
 * ファイルが存在しない場合は null を返す。
 * @param {string} templateKey
 * @returns {string[] | null}
 */
function readCsvHeader(templateKey) {
  const csvPath = path.join(SHEETS_DIR, `header-${templateKey}.csv`);
  if (!fs.existsSync(csvPath)) {
    return null;
  }
  const firstLine = fs.readFileSync(csvPath, "utf8").split(/\r?\n/)[0];
  return firstLine.split(",").map((column) => column.trim());
}

/**
 * 2つの列名配列（docs/schema.md側とCSV側）を比較し、順序も含めて一致しているか検証する。
 * @param {string[]} schemaColumns
 * @param {string[]} csvColumns
 * @returns {string[]} errors - 一致していれば空配列
 */
function compareColumns(schemaColumns, csvColumns) {
  const errors = [];

  if (csvColumns.length !== schemaColumns.length) {
    errors.push(`column count mismatch: schema has ${schemaColumns.length}, csv has ${csvColumns.length}`);
  }

  const maxLength = Math.max(schemaColumns.length, csvColumns.length);
  for (let i = 0; i < maxLength; i += 1) {
    if (schemaColumns[i] !== csvColumns[i]) {
      errors.push(`column[${i}] mismatch: schema="${schemaColumns[i] ?? "(missing)"}", csv="${csvColumns[i] ?? "(missing)"}"`);
    }
  }

  return errors;
}

/**
 * 1テンプレ分について、docs/schema.md の列順と sheets/header-*.csv の列順を比較する。
 * @param {string} templateKey
 * @returns {{ templateKey: string, ok: boolean, errors: string[] }}
 */
function checkTemplateConsistency(templateKey) {
  const schemaColumns = getColumnNames(templateKey);
  const csvColumns = readCsvHeader(templateKey);

  if (csvColumns === null) {
    return { templateKey, ok: false, errors: [`sheets/header-${templateKey}.csv is missing`] };
  }

  const errors = compareColumns(schemaColumns, csvColumns);
  return { templateKey, ok: errors.length === 0, errors };
}

/**
 * 全テンプレをチェックし、結果の配列を返す。
 * @returns {Array<{ templateKey: string, ok: boolean, errors: string[] }>}
 */
function checkAllTemplates() {
  return TEMPLATE_KEYS.map(checkTemplateConsistency);
}

module.exports = { checkTemplateConsistency, checkAllTemplates, readCsvHeader, compareColumns, TEMPLATE_KEYS };

if (require.main === module) {
  const results = checkAllTemplates();
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify(results, null, 2));

  if (failed.length > 0) {
    console.error(`${failed.length} template(s) out of sync between docs/schema.md and sheets/header-*.csv`);
    process.exit(1);
  }
}
