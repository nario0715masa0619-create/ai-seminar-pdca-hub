#!/usr/bin/env node
/**
 * sync-sheets.js
 *
 * Claude エージェント（Acquisition / Seminar Content / Diagnostics / Follow-up）の
 * 生成結果を、Google Sheets API v4 経由で各シートに append するための本番想定インターフェイス。
 *
 * スプレッドシートID・シート名はハードコードせず、config/sheets.json（gitignore対象）から読み込む。
 * 認証情報もハードコードせず、環境変数 GOOGLE_APPLICATION_CREDENTIALS 経由で渡す前提とする。
 *
 * 事前準備:
 *   1. npm install googleapis
 *   2. Google Cloud でサービスアカウントを作成し、Sheets API を有効化
 *   3. サービスアカウントの鍵ファイル(JSON)を取得し、対象スプレッドシートを
 *      サービスアカウントのメールアドレスに共有（編集権限）
 *   4. 環境変数 GOOGLE_APPLICATION_CREDENTIALS に鍵ファイルのパスを設定
 *   5. config/sheets.example.json を config/sheets.json にコピーし、
 *      spreadsheetId と各シート名を実際の値に書き換える
 *
 * Usage (将来): node scripts/sync-sheets.js
 */

const fs = require("fs");
const path = require("path");
const { getColumnNames } = require("./schema-utils");

const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "config", "sheets.json");
const EXAMPLE_CONFIG_PATH = path.join(__dirname, "..", "config", "sheets.example.json");

/**
 * config/sheets.json（実運用設定）を読み込む。
 * 読み込み先は環境変数 SHEETS_CONFIG_PATH で上書き可能（テストや複数環境の切り替え用）。
 * ファイルが存在しない場合は、config/sheets.example.json をコピーして作成するよう促す
 * 明示的なエラーを投げる。
 * @returns {{ spreadsheetId: string, sheets: Record<string, string> }}
 */
function loadSheetsConfig() {
  const configPath = process.env.SHEETS_CONFIG_PATH || DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Sheets config not found at "${configPath}". ` +
        `Copy config/sheets.example.json to config/sheets.json and fill in your spreadsheetId / sheet names.`
    );
  }

  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

/**
 * サービスアカウント認証で Sheets API クライアントを取得する。
 * googleapis は実際に呼び出すこの関数の中でのみ require する
 * （payloadToRow / loadSheetsConfig など googleapis 非依存の関数を、未インストールの環境でもテストできるようにするため）。
 *
 * TODO: 認証情報の受け渡し方法を確定させる。現時点では以下のいずれかを想定する。
 *   - 環境変数 GOOGLE_APPLICATION_CREDENTIALS に鍵ファイルパスを設定する（googleapis のデフォルト挙動、GoogleAuth が自動的に参照する）
 *   - options.keyFilePath で鍵ファイルパスを明示的に渡す（環境変数を使えないCI等での利用を想定）
 * @param {{ keyFilePath?: string }} [options]
 */
async function getSheetsClient(options = {}) {
  const { google } = require("googleapis");
  const auth = new google.auth.GoogleAuth({
    // TODO: keyFilePath が未指定の場合、GoogleAuth は GOOGLE_APPLICATION_CREDENTIALS 環境変数に自動フォールバックする。
    keyFile: options.keyFilePath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

/**
 * config/sheets.json から解決した対象シートの末尾に、1行分の値を追加する。
 * Google Sheets API v4 spreadsheets.values.append のパラメータ仕様に準拠する:
 * https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append
 *
 * @param {object} params
 * @param {string} params.sheetKey - "parent" | "x_ads" | "lp" | "talk" | "slides" | "follow_up"
 * @param {Array<string|number|boolean>} params.values - 追加する1行分の値（列順は docs/schema.md に準拠）
 * @param {{ spreadsheetId: string, sheets: Record<string, string> }} [params.config] - 省略時は loadSheetsConfig() を呼ぶ
 * @param {import('googleapis').sheets_v4.Sheets} [params.sheets] - 省略時は getSheetsClient() を呼ぶ
 */
async function appendRow({ sheetKey, values, config, sheets }) {
  const resolvedConfig = config || loadSheetsConfig();
  const sheetTitle = resolvedConfig.sheets[sheetKey];

  if (!sheetTitle) {
    throw new Error(`Unknown sheetKey: "${sheetKey}". Check the "sheets" mapping in config/sheets.json.`);
  }

  const resolvedSheets = sheets || (await getSheetsClient());

  // TODO: valueInputOption は生成テキストに数式(=SUM(...)等)を含めない前提で "USER_ENTERED" としている。
  //       単純な文字列・数値としてそのまま入れたい場合は "RAW" に変更する。
  return resolvedSheets.spreadsheets.values.append({
    spreadsheetId: resolvedConfig.spreadsheetId,
    range: `${sheetTitle}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [values],
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
 * config/sheets.json に定義された各シートに1行ずつ append する。
 * @param {object} payload - { parent, x_ads, lp, talk, slides, follow_up }
 */
async function syncPayloadToSheets(payload) {
  const config = loadSheetsConfig();
  const sheets = await getSheetsClient();

  for (const sheetKey of Object.keys(config.sheets)) {
    const values = payloadToRow(sheetKey, payload[sheetKey]);
    await appendRow({ sheetKey, values, config, sheets });
  }
}

/**
 * 指定シートの1行目に、docs/schema.md の該当テンプレのカラム名（英語）をそのままヘッダー行として書き込む。
 * 初回セットアップ時に1回だけ実行する想定（複数回実行するとヘッダー行が重複して追加される点に注意）。
 * @param {string} sheetKey - "parent" | "x_ads" | "lp" | "talk" | "slides" | "follow_up"
 * @param {{ config?: object, sheets?: import('googleapis').sheets_v4.Sheets }} [options] - initAllSheetHeaders から呼ぶ際に config/sheets を使い回すためのもの
 * @returns {Promise<*>} spreadsheets.values.append のレスポンス
 */
async function initSheetHeaders(sheetKey, options = {}) {
  const headerRow = getColumnNames(sheetKey);
  return appendRow({ sheetKey, values: headerRow, config: options.config, sheets: options.sheets });
}

/**
 * config/sheets.json に定義された全シート（parent, x_ads, lp, talk, slides, follow_up）の
 * ヘッダー行を一括で初期化する。
 * @returns {Promise<Array<{ sheetKey: string, result: * }>>}
 */
async function initAllSheetHeaders() {
  const config = loadSheetsConfig();
  const sheets = await getSheetsClient();

  const results = [];
  for (const sheetKey of Object.keys(config.sheets)) {
    const result = await initSheetHeaders(sheetKey, { config, sheets });
    results.push({ sheetKey, result });
  }
  return results;
}

/**
 * E2E接続確認用に、parent シートへ「明らかにテストとわかる」ダミー行を1行 append する。
 * KPI集計等に影響しないよう、seminar_id は "test-e2e-" プレフィックス付きにする。
 * @returns {Promise<*>} spreadsheets.values.append のレスポンス
 */
async function appendTestRowToParent() {
  const values = payloadToRow("parent", {
    seminar_id: "test-e2e-001",
    seminar_name: "[E2E TEST] sync-sheets.js connectivity check",
    notes: "scripts/sync-sheets.js appendTestRowToParent() によるE2Eテスト行。削除して問題ない。",
  });
  return appendRow({ sheetKey: "parent", values });
}

module.exports = {
  loadSheetsConfig,
  getSheetsClient,
  appendRow,
  payloadToRow,
  syncPayloadToSheets,
  initSheetHeaders,
  initAllSheetHeaders,
  appendTestRowToParent,
  DEFAULT_CONFIG_PATH,
  EXAMPLE_CONFIG_PATH,
};

if (require.main === module) {
  const command = process.argv[2];
  const COMMANDS = {
    "init-headers": () => {
      const sheetKey = process.argv[3];
      if (!sheetKey) {
        return Promise.reject(new Error('Usage: node scripts/sync-sheets.js init-headers <sheetKey>'));
      }
      return initSheetHeaders(sheetKey);
    },
    "init-all-headers": initAllSheetHeaders,
    "append-test-row": appendTestRowToParent,
  };

  const run =
    command in COMMANDS
      ? COMMANDS[command]()
      : command
        ? Promise.reject(
            new Error(`Unknown command: "${command}". Expected one of: ${Object.keys(COMMANDS).join(", ")}, or no argument.`)
          )
        : syncPayloadToSheets({});

  run
    .then((result) => {
      console.log(JSON.stringify(result && result.data ? result.data : result, null, 2));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
