#!/usr/bin/env node
/**
 * sync-sheets.js
 *
 * Claude エージェント（Acquisition / Seminar Content / Diagnostics / Follow-up）の
 * 生成結果を、Google Sheets API v4 経由で各シートに append / update するためのひな型。
 *
 * 認証・append・行データの列順変換（scripts/schema-utils.js 経由）は実装済み。
 * 実際のスプレッドシートID・シート名・レンジ（SPREADSHEET_ID / SHEET_RANGES）は
 * まだ TODO として未確定にしている。
 *
 * 事前準備:
 *   1. npm install googleapis
 *   2. Google Cloud でサービスアカウントを作成し、Sheets API を有効化
 *   3. サービスアカウントの鍵ファイル(JSON)を取得し、対象スプレッドシートを
 *      サービスアカウントのメールアドレスに共有（編集権限）
 *   4. 環境変数 GOOGLE_APPLICATION_CREDENTIALS に鍵ファイルのパスを設定
 *
 * Usage (将来): node scripts/sync-sheets.js
 */

const { getColumnNames } = require("./schema-utils");

// TODO: 対象スプレッドシートIDを設定する（Parent Sheet と5点セットを1ブックにまとめる想定）
const SPREADSHEET_ID = "TODO_SPREADSHEET_ID";

// TODO: シート名・レンジをシートごとに確定させる（各シートのヘッダー行はdocs/schema.mdに準拠）
const SHEET_RANGES = {
  parent: "TODO_ParentSheet!A:Z",
  x_ads: "TODO_XAdsTemplate!A:Z",
  lp: "TODO_LPTemplate!A:Z",
  talk: "TODO_TalkScriptTemplate!A:Z",
  slides: "TODO_SlideTemplate!A:Z",
  follow_up: "TODO_FollowUpTemplate!A:Z",
};

/**
 * サービスアカウント認証で Sheets API クライアントを取得する。
 * GOOGLE_APPLICATION_CREDENTIALS 環境変数に鍵ファイルのパスが設定されている前提。
 * googleapis は実際に呼び出すこの関数の中でのみ require する
 * （payloadToRow など googleapis 非依存の関数を、未インストールの環境でもテストできるようにするため）。
 */
async function getSheetsClient() {
  const { google } = require("googleapis");
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

/**
 * 指定シートの末尾に1行分の値を追加する。
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {string} range - SHEET_RANGES のいずれか
 * @param {Array<string|number>} rowValues - 追加する1行分の値（列順は各シートのヘッダーに合わせる）
 */
async function appendRow(sheets, range, rowValues) {
  // TODO: valueInputOption は生成テキストに数式を含めない前提で "RAW" としている。
  //       将来的にテンプレ側で数式を使う場合は "USER_ENTERED" を検討する。
  return sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [rowValues],
    },
  });
}

/**
 * payload内の1テンプレ分のオブジェクトを、docs/schema.md のカラム順序に沿った
 * 配列（Sheets append用の1行分の値）に変換する。
 * 未定義のプロパティは空文字列にする（Sheets側の列がずれないようにするため）。
 * @param {string} templateKey - parent | x_ads | lp | talk | slides | follow_up
 * @param {object} templateData - payload[templateKey]
 * @returns {Array<string|number|boolean>}
 */
function payloadToRow(templateKey, templateData) {
  const columnNames = getColumnNames(templateKey);
  return columnNames.map((column) => {
    const value = templateData ? templateData[column] : undefined;
    return value === undefined || value === null ? "" : value;
  });
}

/**
 * 統合ペイロード（scripts/build-payload.js の出力形式）を受け取り、
 * 各シートに1行ずつ append する。
 * @param {object} payload - { parent, x_ads, lp, talk, slides, follow_up }
 */
async function syncPayloadToSheets(payload) {
  if (SPREADSHEET_ID === "TODO_SPREADSHEET_ID") {
    throw new Error("sync-sheets.js is a scaffold. Set SPREADSHEET_ID and SHEET_RANGES before use.");
  }

  const sheets = await getSheetsClient();

  for (const templateKey of Object.keys(SHEET_RANGES)) {
    const rowValues = payloadToRow(templateKey, payload[templateKey]);
    await appendRow(sheets, SHEET_RANGES[templateKey], rowValues);
  }
}

module.exports = { getSheetsClient, appendRow, payloadToRow, syncPayloadToSheets };

if (require.main === module) {
  syncPayloadToSheets({}).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
