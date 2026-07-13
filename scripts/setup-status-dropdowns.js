#!/usr/bin/env node
/**
 * setup-status-dropdowns.js
 *
 * X_ads_ops / LPs シートの "status" 列に、Google Sheets のデータ検証（プルダウン）を設定する。
 * scripts/sheet-rows.js / scripts/acquisition-agent.js のロジックは変更せず、
 * Sheets側の入力UI（データ検証設定）を追加するだけの独立したスクリプト。
 *
 * 既存のセル値は変更しない（データ検証は既存値を書き換えない。新しいルールに反しない値かの
 * チェックのみ行われ、既に入っている値がルールと一致していれば警告等も出ない）。
 *
 * 許容する選択肢は docs/schema.md の X_ads_ops / LPs シート定義と一致させること。
 *
 * Usage:
 *   node scripts/setup-status-dropdowns.js
 */

const { loadSheetsConfig, getSheetsClient } = require("./sync-sheets");
const { getColumnNames } = require("./schema-utils");

/**
 * 各シートの status 列に設定する選択肢。docs/schema.md の記載と一致させること。
 */
const STATUS_OPTIONS = {
  x_ads_ops: ["proposed", "approved", "rejected", "paused_auto", "winner"],
  lps: ["proposed", "approved", "rejected"],
};

/**
 * 指定タイトルのシートタブの数値sheetId（gid）を取得する。
 * @param {string} sheetTitle
 * @param {{ spreadsheetId: string }} config
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @returns {Promise<number>}
 */
async function getSheetIdByTitle(sheetTitle, config, sheets) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: "sheets.properties",
  });
  const sheet = (meta.data.sheets || []).find((s) => s.properties.title === sheetTitle);
  if (!sheet) {
    throw new Error(`Sheet not found in spreadsheet: "${sheetTitle}"`);
  }
  return sheet.properties.sheetId;
}

/**
 * 指定シートの "status" 列に、options を選択肢とするプルダウン（データ検証）を設定する。
 * ヘッダー行（1行目）は対象外。2行目以降、シート末尾まで（将来追加される行も含む）に適用する。
 * @param {string} sheetKey - "x_ads_ops" | "lps"
 * @param {string[]} options - 選択肢
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [params]
 * @returns {Promise<*>}
 */
async function setStatusDropdown(sheetKey, options, params = {}) {
  const config = params.config || loadSheetsConfig();
  const sheets = params.sheets || (await getSheetsClient());
  const sheetTitle = config.sheets[sheetKey];

  if (!sheetTitle) {
    throw new Error(`Unknown sheetKey: "${sheetKey}". Check the "sheets" mapping in config/sheets.json.`);
  }

  const columnNames = getColumnNames(sheetKey);
  const statusColIndex = columnNames.indexOf("status");
  if (statusColIndex === -1) {
    throw new Error(`"status" column not found for sheetKey "${sheetKey}"`);
  }

  const sheetId = await getSheetIdByTitle(sheetTitle, config, sheets);

  return sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1, // ヘッダー行(0)を除く
              startColumnIndex: statusColIndex,
              endColumnIndex: statusColIndex + 1,
              // endRowIndexを省略し、シート末尾（将来追加される行を含む）まで対象にする
            },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: options.map((value) => ({ userEnteredValue: value })),
              },
              strict: true,
              showCustomUi: true,
            },
          },
        },
      ],
    },
  });
}

/**
 * X_ads_ops / LPs 両方の status 列にプルダウンを設定する。
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [params]
 * @returns {Promise<Array<{ sheetKey: string, options: string[] }>>}
 */
async function setupAllStatusDropdowns(params = {}) {
  const results = [];
  for (const [sheetKey, options] of Object.entries(STATUS_OPTIONS)) {
    await setStatusDropdown(sheetKey, options, params);
    results.push({ sheetKey, options });
  }
  return results;
}

module.exports = { STATUS_OPTIONS, setStatusDropdown, setupAllStatusDropdowns, getSheetIdByTitle };

if (require.main === module) {
  setupAllStatusDropdowns()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
