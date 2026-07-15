import { NextResponse } from "next/server";
import { after } from "next/server";
import { db, seed } from "@/lib/store";
import { canAccessDrawer } from "@/lib/security";
import { currentUser } from "@/lib/session";
import { drawerView } from "@/lib/dto";
import { pullStockFromSheets, sheetsBackend, sheetsEnabled } from "@/lib/sheets";

// GET /api/drawers — the main menu. Lists only the drawers this user is
// permitted to open (deny-by-default, §5.2) with their live stock. No other
// users' data, no permission tables, no admin fields (§C.3).
export async function GET() {
  seed();

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Sheets API is usually sub-second; Apps Script cold starts are not.
  // Brief wait, then background finish if needed.
  const budget = sheetsBackend() === "api" ? 2500 : 1000;
  const quick = await pullStockFromSheets({ timeoutMs: budget });
  if (!quick.ok && sheetsEnabled()) {
    after(() => {
      void pullStockFromSheets({ force: true, timeoutMs: 20000 });
    });
  }

  const drawers = [...db.drawers.values()]
    .filter((d) => canAccessDrawer(user.id, d.id))
    .map((d) => drawerView(d, db.stock.get(d.id)!))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  return NextResponse.json({
    drawers,
    sheets: sheetsEnabled(),
    sheetsFresh: quick.ok,
    sheetsBackend: sheetsBackend(),
  });
}
