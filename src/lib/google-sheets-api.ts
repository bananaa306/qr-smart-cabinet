import { google, type sheets_v4 } from "googleapis";

export interface ApiDrawerRow {
  number: number;
  part: string;
  quantity: number;
  locked: boolean;
}

/**
 * Direct Google Sheets API access via a service account.
 * Typical latency ~200–800ms vs Apps Script Web App cold starts of 5–15s.
 *
 * Env (all required for this path):
 *   GOOGLE_SHEETS_SPREADSHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY   (PEM; use \n for newlines in .env)
 *
 * Or a single JSON blob:
 *   GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"..."}
 *
 * Share the spreadsheet with the service-account email (Editor).
 */

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();

interface ColMap {
  [key: string]: number; // 1-based
}

interface LocatedTable {
  title: string;
  headerRow: number; // 1-based
  width: number;
  col: ColMap;
  rows: unknown[][];
}

let sheetsClient: sheets_v4.Sheets | null = null;
let metaCache: { at: number; inventory?: LocatedTable; session?: LocatedTable } | null =
  null;
const META_TTL_MS = 60_000;

function credentialsFromEnv(): { client_email: string; private_key: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      /* fall through */
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (email && key) return { client_email: email, private_key: key };
  return null;
}

export function sheetsApiConfigured(): boolean {
  return Boolean(SPREADSHEET_ID && credentialsFromEnv());
}

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (sheetsClient) return sheetsClient;
  const creds = credentialsFromEnv();
  if (!creds || !SPREADSHEET_ID) {
    throw new Error("Sheets API not configured");
  }
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function a1(title: string, row: number, col: number): string {
  const safe = `'${title.replace(/'/g, "''")}'`;
  return `${safe}!${colLetter(col)}${row}`;
}

function inventorySheetScore(name: string): number {
  const n = name.toLowerCase();
  if (/inventory|stock|cabinet|drawer/.test(n)) return 10;
  if (/session|ledger|log|tracker|activity/.test(n)) return -10;
  return 0;
}

function parseDrawerNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  const m = String(value ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function parseQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 0 ? 0 : Math.floor(value);
  }
  const m = String(value ?? "")
    .replace(/,/g, "")
    .match(/\d+(\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isNaN(n) || n < 0 ? 0 : Math.floor(n);
}

function parseLocked(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return !(s === "false" || s === "0" || s === "no" || s === "unlocked" || s === "");
}

function mapInventoryHeaders(headers: unknown[]): ColMap | null {
  const col: ColMap = {};
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] ?? "")
      .trim()
      .toLowerCase();
    if (h === "drawer" || h === "drawer #" || h === "drawer number") col.drawer = c + 1;
    else if ((h === "#" || h === "no" || h === "no.") && !col.drawer) col.drawer = c + 1;
    else if (h === "part" || h === "item" || h === "parts" || h === "item name")
      col.part = c + 1;
    else if (h === "quantity" || h === "qty" || h === "stock" || h === "count")
      col.quantity = c + 1;
    else if (h === "is locked" || h === "locked" || h === "locked?") col.locked = c + 1;
    else if (h === "session id" || h === "sessionid") col.sessionId = c + 1;
  }
  if (col.part && col.quantity && !col.sessionId) return col;
  return null;
}

function mapSessionHeaders(headers: unknown[]): ColMap | null {
  const col: ColMap = {};
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] ?? "")
      .trim()
      .toLowerCase();
    if (h === "name") col.name = c + 1;
    else if (h === "time" || h === "timestamp" || h === "when") col.time = c + 1;
    else if (h === "session id" || h === "sessionid") col.sessionId = c + 1;
    else if (h === "action") col.action = c + 1;
    else if (h === "part" || h === "item") col.part = c + 1;
    else if (h === "shelf" || h === "drawer") col.shelf = c + 1;
    else if (h === "quantity" || h === "qty") col.quantity = c + 1;
    else if (h === "locked?" || h === "locked" || h === "is locked") col.locked = c + 1;
  }
  if (col.name && col.sessionId && col.part && col.quantity && col.locked) return col;
  return null;
}

async function loadMeta(force = false): Promise<{
  inventory: LocatedTable | null;
  session: LocatedTable | null;
}> {
  if (!force && metaCache && Date.now() - metaCache.at < META_TTL_MS) {
    return {
      inventory: metaCache.inventory ?? null,
      session: metaCache.session ?? null,
    };
  }

  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID!,
    fields: "sheets.properties(title,sheetId,gridProperties)",
  });

  const titles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t))
    .sort((a, b) => inventorySheetScore(b) - inventorySheetScore(a));

  let inventory: LocatedTable | null = null;
  let session: LocatedTable | null = null;

  for (const title of titles) {
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID!,
      range: `'${title.replace(/'/g, "''")}'!1:1`,
      majorDimension: "ROWS",
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const headers = headerRes.data.values?.[0] ?? [];
    if (headers.length < 1) continue;

    const invCol: ColMap | null = !inventory ? mapInventoryHeaders(headers) : null;
    const sessCol: ColMap | null = !session ? mapSessionHeaders(headers) : null;
    if (!invCol && !sessCol) continue;

    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID!,
      range: `'${title.replace(/'/g, "''")}'`,
      majorDimension: "ROWS",
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const values = dataRes.data.values ?? [];
    const width = Math.max(headers.length, ...values.map((r) => r.length), 1);
    const rows = values.slice(1);

    if (invCol && !inventory) {
      inventory = { title, headerRow: 1, width, col: invCol, rows };
    }
    if (sessCol && !session) {
      session = { title, headerRow: 1, width, col: sessCol, rows };
    }
    if (inventory && session) break;
  }

  metaCache = { at: Date.now(), inventory: inventory ?? undefined, session: session ?? undefined };
  return { inventory, session };
}

export async function apiReadInventory(): Promise<ApiDrawerRow[]> {
  const { inventory } = await loadMeta();
  if (!inventory) throw new Error('No sheet with "Part" and "Quantity" headers found.');

  const drawers: ApiDrawerRow[] = [];
  for (let i = 0; i < inventory.rows.length; i++) {
    const row = inventory.rows[i];
    const number = inventory.col.drawer
      ? parseDrawerNumber(row[inventory.col.drawer - 1])
      : i + 1;
    if (!number) continue;
    const part = inventory.col.part
      ? String(row[inventory.col.part - 1] ?? "").trim()
      : "";
    const quantity = inventory.col.quantity
      ? parseQuantity(row[inventory.col.quantity - 1])
      : 0;
    const locked = inventory.col.locked
      ? parseLocked(row[inventory.col.locked - 1])
      : true;
    drawers.push({ number, part, quantity, locked });
  }
  return drawers;
}

export async function apiSetQuantity(number: number, quantity: number): Promise<number> {
  const sheets = await getSheets();
  const { inventory } = await loadMeta(true);
  if (!inventory) throw new Error('No sheet with "Part" and "Quantity" headers found.');
  if (!inventory.col.quantity) throw new Error("No Quantity column found.");
  if (!inventory.col.drawer) return 0;

  const target = Math.floor(number);
  let rowIdx = -1;
  for (let i = 0; i < inventory.rows.length; i++) {
    if (parseDrawerNumber(inventory.rows[i][inventory.col.drawer - 1]) === target) {
      rowIdx = i;
      break;
    }
  }
  if (rowIdx < 0) return 0;

  const sheetRow = inventory.headerRow + 1 + rowIdx;
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID!,
    range: a1(inventory.title, sheetRow, inventory.col.quantity),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[qty]] },
  });
  metaCache = null;
  return 1;
}

function formatTime(isoOrEmpty?: string): string {
  const d = isoOrEmpty ? new Date(isoOrEmpty) : new Date();
  const stamp = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`;
}

function mergeAction(existing: unknown, incoming: unknown): string {
  const prev = String(existing ?? "").trim();
  const next = String(incoming ?? "").trim();
  if (!next) return prev;
  if (!prev) return next;
  if (next === "Lock") {
    if (prev === "Take" || prev === "Unlock + Take") return "Take + Lock";
    if (prev === "Return" || prev === "Unlock + Return") return "Return + Lock";
    if (prev.includes("Lock")) return prev;
    return "Lock";
  }
  return next;
}

export interface ApiSessionRow {
  name: string;
  sessionId: string;
  actionLabel: string;
  part: string;
  shelf: string;
  quantity: number;
  locked: boolean;
  time?: string;
}

async function appendSessionRow(row: ApiSessionRow): Promise<number> {
  const sheets = await getSheets();
  const { session } = await loadMeta(true);
  if (!session) {
    throw new Error(
      "No sheet with Name, Session ID, Part, Quantity, and Locked? headers found.",
    );
  }

  const sheetRow = session.headerRow + session.rows.length + 1;
  const width = Math.max(session.width, 8);
  const values = new Array(width).fill("");
  if (session.col.name) values[session.col.name - 1] = row.name || "";
  if (session.col.time) values[session.col.time - 1] = formatTime(row.time);
  if (session.col.sessionId) values[session.col.sessionId - 1] = row.sessionId || "";
  if (session.col.action) values[session.col.action - 1] = row.actionLabel || "";
  if (session.col.part) values[session.col.part - 1] = row.part || "";
  if (session.col.shelf) values[session.col.shelf - 1] = row.shelf || "";
  if (session.col.quantity) values[session.col.quantity - 1] = row.quantity || 0;
  if (session.col.locked) values[session.col.locked - 1] = !!row.locked;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID!,
    range: a1(session.title, sheetRow, 1),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
  metaCache = null;
  return 1;
}

export async function apiAppendSessionRow(row: ApiSessionRow): Promise<number> {
  return appendSessionRow(row);
}

export async function apiUpdateSessionRow(row: ApiSessionRow): Promise<number> {
  const sheets = await getSheets();
  const { session } = await loadMeta(true);
  if (!session) {
    throw new Error(
      "No sheet with Name, Session ID, Part, Quantity, and Locked? headers found.",
    );
  }

  let rowIdx = -1;
  for (let i = session.rows.length - 1; i >= 0; i--) {
    const sameSession =
      String(session.rows[i][session.col.sessionId - 1]) === String(row.sessionId);
    const samePart =
      !session.col.part ||
      String(session.rows[i][session.col.part - 1]) === String(row.part || "");
    if (sameSession && samePart) {
      rowIdx = i;
      break;
    }
  }
  if (rowIdx < 0) return appendSessionRow(row);

  const sheetRow = session.headerRow + 1 + rowIdx;
  const data = session.rows[rowIdx];
  const updates: { range: string; values: unknown[][] }[] = [];

  if (session.col.time) {
    const existingTime = data[session.col.time - 1];
    if (!existingTime) {
      updates.push({
        range: a1(session.title, sheetRow, session.col.time),
        values: [[formatTime(row.time)]],
      });
    }
  }
  if (session.col.locked) {
    updates.push({
      range: a1(session.title, sheetRow, session.col.locked),
      values: [[!!row.locked]],
    });
  }
  if (session.col.quantity && row.quantity != null && row.quantity !== 0) {
    updates.push({
      range: a1(session.title, sheetRow, session.col.quantity),
      values: [[row.quantity]],
    });
  }
  if (session.col.shelf && row.shelf) {
    updates.push({
      range: a1(session.title, sheetRow, session.col.shelf),
      values: [[row.shelf]],
    });
  }
  if (session.col.action) {
    const actionLabel = mergeAction(data[session.col.action - 1], row.actionLabel);
    updates.push({
      range: a1(session.title, sheetRow, session.col.action),
      values: [[actionLabel]],
    });
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID!,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updates,
      },
    });
  }
  metaCache = null;
  return 1;
}
