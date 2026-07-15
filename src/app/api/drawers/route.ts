import { NextResponse } from "next/server";
import { after } from "next/server";
import { db, seed } from "@/lib/store";
import { canAccessDrawer } from "@/lib/security";
import { currentUser } from "@/lib/session";
import { drawerView } from "@/lib/dto";
import { pullStockFromSheets, sheetsEnabled } from "@/lib/sheets";

// GET /api/drawers — the main menu. Lists only the drawers this user is
// permitted to open (deny-by-default, §5.2) with their live stock. No other
// users' data, no permission tables, no admin fields (§C.3).
export async function GET() {
  seed();

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Never stall the menu on a cold Apps Script. Give a warm script ~1s;
  // if it misses, serve current store data and finish the pull after the
  // response (Fluid / Node) so the next paint / soft-refresh is correct.
  const quick = await pullStockFromSheets({ timeoutMs: 1000 });
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
  });
}
