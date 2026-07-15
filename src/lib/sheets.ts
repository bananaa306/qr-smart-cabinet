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

const PULL_CACHE_MS = 1500;
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

async function postToSheets(payload: Record<string, unknown>): Promise<Response | null> {
  if (!sheetsEnabled()) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

async function postOk(payload: Record<string, unknown>): Promise<boolean> {
  const res = await postToSheets(payload);
  return Boolean(res?.ok);
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
}): Promise<boolean> {
  if (!sheetsEnabled()) return false;
  seed();

  const now = Date.now();
  if (!opts?.force && lastPullOk && now - lastPullAt < PULL_CACHE_MS) {
    return true;
  }

  const res = await postToSheets({ secret: SECRET, type: "inventory" });
  if (!res?.ok) {
    audit({ type: "sheets.pull_error", detail: res ? `http ${res.status}` : "fetch_failed" });
    lastPullOk = false;
    return false;
  }

  let body: { drawers?: SheetDrawerRow[] };
  try {
    body = (await res.json()) as { drawers?: SheetDrawerRow[] };
  } catch {
    audit({ type: "sheets.pull_error", detail: "invalid_json" });
    lastPullOk = false;
    return false;
  }

  const rows = Array.isArray(body.drawers) ? body.drawers : [];
  applySheetRowsToStore(rows);
  lastPullAt = Date.now();
  lastPullOk = true;
  audit({ type: "sheets.pull_ok", detail: `${rows.length} drawers` });
  return true;
}

function applySheetRowsToStore(rows: SheetDrawerRow[]) {
  const byNumber = new Map<number, Drawer>();
  for (const d of db.drawers.values()) {
    const n = parseInt(d.label.replace(/[^0-9]/g, ""), 10);
    if (n) byNumber.set(n, d);
  }

  for (const row of rows) {
    const number = Number(row.number);
    if (!number) continue;
    const drawer = byNumber.get(number);
    if (!drawer) continue;

    const stock = db.stock.get(drawer.id);
    if (!stock) continue;

    const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
    if (stock.quantity !== qty) {
      stock.quantity = qty;
      stock.version += 1;
    }

    const part = typeof row.part === "string" ? row.part.trim() : "";
    if (part) {
      const item = db.items.get(drawer.itemId);
      if (item && item.name !== part) {
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
export async function syncSheet(): Promise<{ ok: boolean; error?: string }> {
  if (!sheetsEnabled()) return { ok: false, error: "not_configured" };
  const ok = await pullStockFromSheets({ force: true });
  return ok ? { ok: true } : { ok: false, error: "pull_failed" };
}

export function sheetsEnabled(): boolean {
  return Boolean(WEBHOOK_URL && SECRET);
}
