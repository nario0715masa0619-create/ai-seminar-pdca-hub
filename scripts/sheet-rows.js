#!/usr/bin/env node
/**
 * sheet-rows.js
 *
 * scripts/sync-sheets.js の append専用インターフェイスでは対応できない、
 * 「既存の1行を探して特定の列だけ更新する」「シートタブが無ければ作る」といった
 * 操作をまとめたヘルパー。scripts/acquisition-agent.js から利用する想定。
 *
 * Usage:
 *   const { getRowBySeminarId, updateRowFields, createSheetIfNotExists } = require("./sheet-rows");
 */

const { loadSheetsConfig, getSheetsClient } = require("./sync-sheets");
const { getColumnNames } = require("./schema-utils");

/**
 * 0-based の列インデックスを Sheets の列記号（A, B, ..., Z, AA, AB, ...）に変換する。
 * @param {number} index - 0-based
 * @returns {string}
 */
function columnIndexToA1(index) {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * 指定シートの中から、columnName の値が value と一致する最初のデータ行を探す。
 * @param {string} sheetKey - "parent" | "x_ads_ops" | "lps" など
 * @param {string} columnName - 検索対象の列名（docs/schema.md準拠）
 * @param {string} value - 一致させたい値
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ rowNumber: number, row: Record<string, string>, columnNames: string[] } | null>}
 *   rowNumber はSheets上の1-based行番号（ヘッダー行が1）。見つからなければnull。
 */
async function findRowByValue(sheetKey, columnName, value, options = {}) {
  const config = options.config || loadSheetsConfig();
  const sheets = options.sheets || (await getSheetsClient());
  const sheetTitle = config.sheets[sheetKey];

  if (!sheetTitle) {
    throw new Error(`Unknown sheetKey: "${sheetKey}". Check the "sheets" mapping in config/sheets.json.`);
  }

  const columnNames = getColumnNames(sheetKey);
  const targetIndex = columnNames.indexOf(columnName);
  if (targetIndex === -1) {
    throw new Error(`"${columnName}" column not found for sheetKey "${sheetKey}"`);
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${sheetTitle}!A:Z`,
  });
  const rows = res.data.values || [];

  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i][targetIndex] === value) {
      const row = {};
      columnNames.forEach((column, colIndex) => {
        row[column] = rows[i][colIndex] !== undefined ? rows[i][colIndex] : "";
      });
      return { rowNumber: i + 1, row, columnNames };
    }
  }
  return null;
}

/**
 * Parent Sheetから、指定 seminar_id の行を取得する。
 * @param {string} seminarId
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ rowNumber: number, row: Record<string, string>, columnNames: string[] } | null>}
 */
async function getRowBySeminarId(seminarId, options = {}) {
  return findRowByValue("parent", "seminar_id", seminarId, options);
}

/**
 * 指定シートの、seminar_idが一致する行のうち、fieldsで渡された列だけを更新する
 * （他の列には触れない）。列ごとに個別のrangeでUPDATEするため、行全体を読み直して
 * 書き戻すよりも既存データを壊しにくい。
 * @param {string} sheetKey
 * @param {string} seminarId
 * @param {Record<string, string|number>} fields - { 列名: 新しい値 } のマップ
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ updatedRange: string }[]>}
 */
async function updateRowFields(sheetKey, seminarId, fields, options = {}) {
  const config = options.config || loadSheetsConfig();
  const sheets = options.sheets || (await getSheetsClient());
  const sheetTitle = config.sheets[sheetKey];

  if (!sheetTitle) {
    throw new Error(`Unknown sheetKey: "${sheetKey}". Check the "sheets" mapping in config/sheets.json.`);
  }

  const found = await findRowByValue(sheetKey, "seminar_id", seminarId, { config, sheets });
  if (!found) {
    throw new Error(`Row with seminar_id "${seminarId}" not found in sheet "${sheetTitle}"`);
  }

  const data = Object.entries(fields).map(([columnName, value]) => {
    const colIndex = found.columnNames.indexOf(columnName);
    if (colIndex === -1) {
      throw new Error(`"${columnName}" column not found for sheetKey "${sheetKey}"`);
    }
    const a1Col = columnIndexToA1(colIndex);
    return {
      range: `${sheetTitle}!${a1Col}${found.rowNumber}`,
      values: [[value]],
    };
  });

  if (data.length === 0) {
    return [];
  }

  const res = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
  return (res.data.responses || []).map((r) => ({ updatedRange: r.updatedRange }));
}

/**
 * 指定シートの1行目（ヘッダー行）を、docs/schema.md（getColumnNames）の内容で上書きする。
 * 既存シートの列を後から拡張した場合（例: Parent Sheetに予算カラムを追加）に使う。
 * 既存データ行には触れない。
 * @param {string} sheetKey
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<*>}
 */
async function extendSheetHeader(sheetKey, options = {}) {
  const config = options.config || loadSheetsConfig();
  const sheets = options.sheets || (await getSheetsClient());
  const sheetTitle = config.sheets[sheetKey];

  if (!sheetTitle) {
    throw new Error(`Unknown sheetKey: "${sheetKey}". Check the "sheets" mapping in config/sheets.json.`);
  }

  const columnNames = getColumnNames(sheetKey);
  const lastCol = columnIndexToA1(columnNames.length - 1);

  return sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${sheetTitle}!A1:${lastCol}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [columnNames] },
  });
}

/**
 * スプレッドシート内に指定タイトルのタブが無ければ作成する（あれば何もしない）。
 * @param {string} sheetTitle
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options]
 * @returns {Promise<{ created: boolean }>}
 */
async function createSheetIfNotExists(sheetTitle, options = {}) {
  const config = options.config || loadSheetsConfig();
  const sheets = options.sheets || (await getSheetsClient());

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: "sheets.properties",
  });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === sheetTitle);
  if (exists) {
    return { created: false };
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetTitle } } }],
    },
  });
  return { created: true };
}

module.exports = {
  columnIndexToA1,
  findRowByValue,
  getRowBySeminarId,
  updateRowFields,
  extendSheetHeader,
  createSheetIfNotExists,
};
