#!/usr/bin/env node
/**
 * schema-utils.js
 *
 * docs/schema.md の各テンプレの "### Required Columns" テーブルをパースし、
 * テンプレキーごとのカラム定義（順序付き）を返すヘルパー。
 *
 * scripts/sync-sheets.js の SHEET_RANGES / 行データ組み立てを実装する際に、
 * docs/schema.md の変更と列順序がズレないようにするために使う想定。
 *
 * Usage:
 *   node scripts/schema-utils.js        # 全テンプレのカラム定義をJSONで出力
 *   const { getSchema } = require("./scripts/schema-utils");
 */

const fs = require("fs");
const path = require("path");

const SCHEMA_MD_PATH = path.join(__dirname, "..", "docs", "schema.md");

// docs/schema.md の "## " 見出しと、build-payload.js / sync-sheets.js で使うテンプレキーの対応表
const HEADING_TO_TEMPLATE_KEY = {
  "親シートの項目 (Parent Sheet)": "parent",
  "X Ads Template": "x_ads",
  "LP Template": "lp",
  "Talk Script Template": "talk",
  "Slide Template": "slides",
  "Follow-up Template": "follow_up",
  "X_ads Sheet (Acquisition Automation)": "x_ads_ops",
  "LPs Sheet (Acquisition Automation)": "lps",
  "weekly_pdca_log Sheet (Weekly PDCA Automation)": "weekly_pdca_log",
  "pdca_state Sheet (Weekly PDCA Automation)": "pdca_state",
};

/**
 * docs/schema.md の生テキストから、テンプレキーごとのカラム定義配列を抽出する。
 * @param {string} markdown - docs/schema.md の内容
 * @returns {Record<string, Array<{ column: string, description: string }>>}
 */
function parseSchemaMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const result = {};

  let currentTemplateKey = null;
  let inRequiredColumnsTable = false;
  let tableRowIndex = 0;

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+?)\s*$/);
    if (h2Match) {
      currentTemplateKey = HEADING_TO_TEMPLATE_KEY[h2Match[1]] || null;
      inRequiredColumnsTable = false;
      continue;
    }

    if (line.match(/^###\s+Required Columns\s*$/)) {
      inRequiredColumnsTable = true;
      tableRowIndex = 0;
      if (currentTemplateKey) {
        result[currentTemplateKey] = [];
      }
      continue;
    }

    if (!inRequiredColumnsTable || !currentTemplateKey) {
      continue;
    }

    const isTableRow = line.trim().startsWith("|");
    if (!isTableRow) {
      if (tableRowIndex === 0) {
        // テーブル本体が始まる前の空行はスキップする
        continue;
      }
      // テーブル終端（空行や次のセクションの前置き文）
      inRequiredColumnsTable = false;
      continue;
    }

    tableRowIndex += 1;
    // 1行目はヘッダー行（| column | description |）、2行目は区切り線（|---|---|）なのでスキップ
    if (tableRowIndex <= 2) {
      continue;
    }

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((_, index, arr) => index > 0 && index < arr.length - 1);

    if (cells.length >= 2) {
      result[currentTemplateKey].push({ column: cells[0], description: cells[1] });
    }
  }

  return result;
}

/**
 * docs/schema.md を読み込み、全テンプレのカラム定義を返す。
 * @returns {Record<string, Array<{ column: string, description: string }>>}
 */
function getSchema() {
  const markdown = fs.readFileSync(SCHEMA_MD_PATH, "utf8");
  return parseSchemaMarkdown(markdown);
}

/**
 * 指定テンプレキーのカラム名のみを順序付き配列で返す（sync-sheets.js の行データ組み立てで使う想定）。
 * @param {string} templateKey - parent | x_ads | lp | talk | slides | follow_up
 * @returns {string[]}
 */
function getColumnNames(templateKey) {
  const schema = getSchema();
  if (!schema[templateKey]) {
    throw new Error(`Unknown template key: ${templateKey}`);
  }
  return schema[templateKey].map((entry) => entry.column);
}

module.exports = { getSchema, getColumnNames, parseSchemaMarkdown, HEADING_TO_TEMPLATE_KEY };

if (require.main === module) {
  console.log(JSON.stringify(getSchema(), null, 2));
}
