import { NextResponse } from "next/server";
import { audit, db, seed } from "@/lib/store";
import { LIMITS, canAccessDrawer, clientIp, rateLimit } from "@/lib/security";
import { currentUser } from "@/lib/session";
import { drawerView } from "@/lib/dto";

// GET /api/drawers/{id} — resolve drawer metadata + live stock (PRD §B.2 step 3).
// Accepts an opaque id or the printed short code (manual fallback, §B.2 step 4).
// Deny-by-default, object-level permission check kills IDOR (§5.2).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  seed();
  const { id: raw } = await params;
  const ip = clientIp(req);

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Fast resolve only — do not await Sheets here. Scan → check-in used to pay
  // for a full inventory pull before the menu, then pull again on /drawers.
  // Live Part/Qty comes from the list endpoint + Refresh / mutations.

  // Throttle lookups to make enumeration impractical (§5.1).
  const gate = rateLimit(`lookup:${user.id}`, LIMITS.lookup.limit, LIMITS.lookup.windowMs);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const key = decodeURIComponent(raw).trim();
  const drawerId =
    db.drawers.get(key)?.id ??
    db.drawersByShortCode.get(key.toUpperCase());
  const drawer = drawerId ? db.drawers.get(drawerId) : undefined;

  // Same 404 whether the drawer is missing or simply not permitted — no
  // information leak about which opaque ids exist.
  if (!drawer || !canAccessDrawer(user.id, drawer.id)) {
    audit({ type: "drawer.lookup_denied", userId: user.id, ip, detail: key });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const stock = db.stock.get(drawer.id)!;
  audit({ type: "drawer.lookup", userId: user.id, drawerId: drawer.id });
  return NextResponse.json({ drawer: drawerView(drawer, stock) });
}
