import { NextResponse } from "next/server";
import { db, seed } from "@/lib/store";
import { canAccessDrawer } from "@/lib/security";
import { currentUser } from "@/lib/session";
import { drawerView } from "@/lib/dto";
import { sheetsEnabled, syncSheet } from "@/lib/sheets";

// POST /api/sheets/sync — re-read inventory from Google Sheets (never overwrite).
// Soft-fails with HTTP 200 so the UI can still refresh drawer cards locally.
export async function POST() {
  seed();

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (!sheetsEnabled()) {
    return NextResponse.json({ ok: false, error: "not_configured" });
  }

  const result = await syncSheet();
  const drawers = [...db.drawers.values()]
    .filter((d) => canAccessDrawer(user.id, d.id))
    .map((d) => drawerView(d, db.stock.get(d.id)!))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  return NextResponse.json({ ...result, drawers });
}
