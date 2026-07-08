import { NextResponse } from "next/server";
import { db, seed } from "@/lib/store";
import { currentUser } from "@/lib/session";

// GET /api/activity — the signed-in user's OWN ledger only (PRD §C.3).
// No global browsing, no other users' data, no export.

export async function GET() {
  seed();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const rows = db.transactions
    .filter((t) => t.userId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
    .map((t) => {
      const drawer = db.drawers.get(t.drawerId);
      const item = db.items.get(t.itemId);
      return {
        id: t.id,
        createdAt: t.createdAt,
        delta: t.delta,
        intent: t.intent,
        balanceAfter: t.balanceAfter,
        drawer: drawer ? `${drawer.cabinet} · ${drawer.label}` : "—",
        item: item?.name ?? "—",
        unit: item?.unit ?? "",
        flagged: t.flagged ?? false,
      };
    });

  return NextResponse.json({ transactions: rows });
}
