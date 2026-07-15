import { audit, db, seed } from "./store";
import type { Drawer } from "./types";

// ---------------------------------------------------------------------------
// Google Sheets inventory + session tracker.
//
// Inventory sheet is authoritative for Part / Quantity / Is Locked. The app
// pulls those values before list/detail and before take/return. Take/return
// patches Quantity only (never Part or Locked). Session tracker rows are
// append-only. Full inventory snapshots are disabled.
//
// Configured entirely by env — if either var is missing sheets are a no-op:
//   SHEETS_WEBHOOK_URL   the deployed Apps Script Web App /exec URL
//   SHEETS_SECRET        shared secret checked by the script
// ---------------------------------------------------------------------------

const WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const SECRET = process.env.SHEETS_SECRET;

// Warm reuse within one Fluid instance. Isolates don't share memory across
 // instances, but this still cuts back-to-back pulls after check-in / open.
const PULL_CACHE_MS = 20_000;
let lastPullAt = 0;
let lastPullOk = false;

export type SessionAction =
  | "Lock"
  | "Unlock"
  | "Take"
  | "Return"
  | "Take + Lock"
  | "Return + Lock"
  | "Unlock + Take"
  | "Unlock + Return";

export interface SessionRow {
  name: string;
  sessionId: string;
  action: SessionAction;
  part: string;
  shelf: string;
  quantity: number;
  locked: boolean;
  /** ISO timestamp; defaults to now when logging. */
  time?: string;
}

export interface SheetDrawerRow {
  number: number;
  part: string;
  quantity: number;
  locked: boolean;
}

async function postToSheets(
  payload: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<Response | null> {
  if (!sheetsEnabled()) return null;

  try {
    const ctrl = new AbortController();
    // Apps Script cold starts are often 5–15s from serverless hosts.
    const timeoutMs = opts?.timeoutMs ?? 25000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const body = JSON.stringify(payload);
    const headers = { "Content-Type": "text/plain;charset=utf-8" };

    // Apps Script /exec returns 302 → googleusercontent. Prefer manual follow so
    // we don't lose the ContentService body (common with auto-follow + JSON mime).
    let res = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        res = await fetch(loc, {
          method: "GET",
          signal: ctrl.signal,
          redirect: "follow",
        });
      } else {
        // Location stripped — fall back to automatic redirect follow.
        res = await fetch(WEBHOOK_URL!, {
          method: "POST",
          headers,
          body,
          signal: ctrl.signal,
          redirect: "follow",
        });
      }
    }

    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

/** Parse Apps Script body — they sometimes wrap or return empty on bad redirects. */
function parseSheetsJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty_body");
  try {
    return JSON.parse(trimmed);
  } catch {
    // Recover if Google wraps JSON in HTML or junk.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("invalid_json");
  }
}

async function postOk(payload: Record<string, unknown>): Promise<boolean> {
  const res = await postToSheets(payload);
  if (!res) return false;
  try {
    const text = await res.text();
    const body = parseSheetsJson(text) as { error?: string; ok?: boolean };
    if (body?.error && body.error !== "snapshot_disabled") return false;
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

function invalidatePullCache() {
  lastPullAt = 0;
  lastPullOk = false;
}

function drawerNumber(drawer: Drawer): number {
  return parseInt(drawer.label.replace(/[^0-9]/g, ""), 10) || 0;
}

// ---------------------------------------------------------------------------
// Session tracker: Name | Time | Session ID | Action | Part | Shelf | Quantity | Locked?
// ---------------------------------------------------------------------------
export async function logSessionRow(
  row: SessionRow,
  action: "append" | "update" = "append",
): Promise<void> {
  if (!sheetsEnabled()) return;

  const payload = {
    secret: SECRET,
    type: "session_row",
    action,
    row: {
      name: row.name,
      sessionId: row.sessionId,
      actionLabel: row.action,
      part: row.part,
      shelf: row.shelf,
      quantity: row.quantity,
      locked: row.locked,
      time: row.time ?? new Date().toISOString(),
    },
  };

  const ok = await postOk(payload);
  if (!ok) {
    audit({
      type: "sheets.session_error",
      detail: `${action} ${row.action} ${row.sessionId}`,
    });
    return;
  }
  audit({
    type: "sheets.session_ok",
    detail: `${action} ${row.action} ${row.sessionId}`,
  });
}

/**
 * Pull inventory from the sheet into the in-memory store.
 * Drawer numbers in the sheet match "Drawer N" labels (column Drawer / #).
 */
export async function pullStockFromSheets(opts?: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!sheetsEnabled()) return { ok: false, error: "not_configured" };
  seed();

  const now = Date.now();
  if (!opts?.force && lastPullOk && now - lastPullAt < PULL_CACHE_MS) {
    return { ok: true, count: db.drawers.size };
  }

  const res = await postToSheets(
    { secret: SECRET, type: "inventory" },
    { timeoutMs: opts?.timeoutMs },
  );
  if (!res) {
    audit({ type: "sheets.pull_error", detail: "fetch_failed" });
    lastPullOk = false;
    return { ok: false, error: "fetch_failed" };
  }

  let text = "";
  try {
    text = await res.text();
  } catch {
    audit({ type: "sheets.pull_error", detail: "read_body_failed" });
    lastPullOk = false;
    return { ok: false, error: "read_body_failed" };
  }

  let body: { drawers?: SheetDrawerRow[]; error?: string; ok?: boolean };
  try {
    body = parseSheetsJson(text) as {
      drawers?: SheetDrawerRow[];
      error?: string;
      ok?: boolean;
    };
  } catch {
    audit({
      type: "sheets.pull_error",
      detail: `invalid_json http_${res.status} ${text.slice(0, 120)}`,
    });
    lastPullOk = false;
    return { ok: false, error: "invalid_json" };
  }

  if (body.error) {
    audit({ type: "sheets.pull_error", detail: String(body.error) });
    lastPullOk = false;
    return { ok: false, error: String(body.error) };
  }

  if (!res.ok) {
    audit({ type: "sheets.pull_error", detail: `http ${res.status}` });
    lastPullOk = false;
    return { ok: false, error: `http_${res.status}` };
  }

  const rows = Array.isArray(body.drawers) ? body.drawers : [];
  applySheetRowsToStore(rows);
  lastPullAt = Date.now();
  lastPullOk = true;
  audit({ type: "sheets.pull_ok", detail: `${rows.length} drawers` });
  return { ok: true, count: rows.length };
}

function applySheetRowsToStore(rows: SheetDrawerRow[]) {
  const byNumber = new Map<number, Drawer>();
  for (const d of db.drawers.values()) {
    const n = parseInt(d.label.replace(/[^0-9]/g, ""), 10);
    if (n) byNumber.set(n, d);
  }

  for (const row of rows) {
    const number = Number(row.number);
    if (!Number.isFinite(number) || number < 1) continue;
    const drawer = byNumber.get(Math.floor(number));
    if (!drawer) continue;

    const stock = db.stock.get(drawer.id);
    if (!stock) continue;

    const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
    if (stock.quantity !== qty) {
      stock.quantity = qty;
      stock.version += 1;
    }

    // Part names can arrive as non-strings from Sheets JSON — coerce always.
    const part = String(row.part ?? "").trim();
    if (part) {
      const item = db.items.get(drawer.itemId);
      if (item) {
        db.items.set(drawer.itemId, { ...item, name: part });
      }
    }

    // Locked column is owned by the sheet — mirror it into the open-map.
    if (row.locked) {
      db.openDrawer.delete(drawer.id);
    } else if (!db.openDrawer.has(drawer.id)) {
      db.openDrawer.set(drawer.id, "sheet-open");
    }
  }
}

/** Patch Quantity for one drawer only — does not rewrite Part or Is Locked. */
export async function setSheetQuantity(
  drawer: Drawer,
  quantity: number,
): Promise<boolean> {
  if (!sheetsEnabled()) return false;
  const number = drawerNumber(drawer);
  if (!number) return false;

  const ok = await postOk({
    secret: SECRET,
    type: "set_quantity",
    number,
    quantity: Math.max(0, Math.floor(quantity)),
  });
  if (!ok) {
    audit({ type: "sheets.qty_error", drawerId: drawer.id, detail: String(quantity) });
    return false;
  }
  invalidatePullCache();
  audit({ type: "sheets.qty_ok", drawerId: drawer.id, detail: String(quantity) });
  return true;
}

/** Refresh from sheet (UI Sync button). Never pushes inventory rows. */
export async function syncSheet(): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
  parts?: string[];
}> {
  if (!sheetsEnabled()) return { ok: false, error: "not_configured" };
  const result = await pullStockFromSheets({ force: true });
  if (!result.ok) return { ok: false, error: result.error ?? "pull_failed" };

  const parts = [...db.drawers.values()]
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((d) => {
      const item = db.items.get(d.itemId);
      return `${d.label}: ${item?.name ?? "?"}`;
    });

  return { ok: true, count: result.count ?? parts.length, parts };
}

export function sheetsEnabled(): boolean {
  return Boolean(WEBHOOK_URL && SECRET);
}
