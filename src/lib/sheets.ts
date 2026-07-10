import { audit, db } from "./store";
import type { Drawer, StockLevel, Transaction, User } from "./types";

// ---------------------------------------------------------------------------
// Google Sheets mirror (append-only audit log). The app remains the source of
// truth; every committed transaction is ALSO pushed to a Google Sheet via an
// Apps Script Web App. This is best-effort: a sheet failure never fails or
// rolls back the unlock (the ledger in the app is authoritative). Aligns with
// PRD §C.2 (events surfaced to the ops side via webhook).
//
// Configured entirely by env — if either var is missing the mirror is a no-op:
//   SHEETS_WEBHOOK_URL   the deployed Apps Script Web App /exec URL
//   SHEETS_SECRET        shared secret checked by the script
// ---------------------------------------------------------------------------

const WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const SECRET = process.env.SHEETS_SECRET;

export function sheetsEnabled(): boolean {
  return Boolean(WEBHOOK_URL && SECRET);
}

// ---------------------------------------------------------------------------
// Live snapshot sync. Pushes the CURRENT state of every drawer (part, quantity,
// locked) so a "one row per drawer" sheet stays up to date. Rows are matched on
// the drawer number by the Apps Script. Best-effort: never throws.
// ---------------------------------------------------------------------------
export async function syncSheet(): Promise<{ ok: boolean; error?: string }> {
  if (!sheetsEnabled()) return { ok: false, error: "not_configured" };

  const drawers = [...db.drawers.values()]
    .map((d) => {
      const stock = db.stock.get(d.id);
      const item = db.items.get(d.itemId);
      // "Drawer 7" -> 7 (the row key in the sheet)
      const number = parseInt(d.label.replace(/[^0-9]/g, ""), 10) || 0;
      return {
        number,
        drawer: d.label,
        part: item?.name ?? d.itemId,
        quantity: stock?.quantity ?? 0,
        locked: !db.openDrawer.has(d.id),
        status: d.status,
      };
    })
    .sort((a, b) => a.number - b.number);

  const payload = { secret: SECRET, type: "snapshot", drawers };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      redirect: "follow", // Apps Script /exec 302s to script.googleusercontent
    });
    clearTimeout(timer);
    if (!res.ok) {
      audit({ type: "sheets.sync_error", detail: `http ${res.status}` });
      return { ok: false, error: `http_${res.status}` };
    }
    audit({ type: "sheets.sync_ok", detail: `${drawers.length} drawers` });
    return { ok: true };
  } catch (err) {
    audit({ type: "sheets.sync_error", detail: String(err) });
    return { ok: false, error: String(err) };
  }
}

export async function mirrorTransaction(
  tx: Transaction,
  drawer: Drawer,
  stock: StockLevel,
  user: User,
): Promise<void> {
  if (!sheetsEnabled()) return;

  const item = db.items.get(drawer.itemId);
  const payload = {
    secret: SECRET,
    type: "transaction",
    transaction: {
      id: tx.id,
      timestamp: new Date(tx.createdAt).toISOString(),
      user: user.name,
      email: user.email,
      cabinet: drawer.cabinet,
      drawer: drawer.label,
      drawerId: drawer.id,
      item: item?.name ?? drawer.itemId,
      unit: item?.unit ?? "",
      intent: tx.intent,
      delta: tx.delta,
      balanceAfter: tx.balanceAfter,
    },
    stock: {
      drawerId: drawer.id,
      cabinet: drawer.cabinet,
      drawer: drawer.label,
      item: item?.name ?? drawer.itemId,
      quantity: stock.quantity,
      updatedAt: new Date(tx.createdAt).toISOString(),
    },
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      redirect: "follow", // Apps Script /exec issues a 302 to script.googleusercontent
    });
    clearTimeout(timer);
    if (!res.ok) {
      audit({ type: "sheets.mirror_error", drawerId: drawer.id, detail: `http ${res.status}` });
    } else {
      audit({ type: "sheets.mirror_ok", drawerId: drawer.id, detail: tx.id });
    }
  } catch (err) {
    audit({ type: "sheets.mirror_error", drawerId: drawer.id, detail: String(err) });
  }
}
