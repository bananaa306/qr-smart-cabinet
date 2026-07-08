import { NextResponse } from "next/server";
import { audit, db, seed } from "@/lib/store";
import { LIMITS, canAccessDrawer } from "@/lib/security";
import { currentUser } from "@/lib/session";

// POST /api/drawers/{id}/lock — "Done — lock now" (PRD §A.2 screen 4).
// Only the user who holds the current open session may relock early.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  seed();
  const { id: raw } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const key = decodeURIComponent(raw).trim();
  const drawerId =
    db.drawers.get(key)?.id ?? db.drawersByShortCode.get(key.toUpperCase());
  const drawer = drawerId ? db.drawers.get(drawerId) : undefined;
  if (!drawer || !canAccessDrawer(user.id, drawer.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const openSessionId = db.openDrawer.get(drawer.id);
  const session = openSessionId ? db.unlockSessions.get(openSessionId) : undefined;
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: "not_open" }, { status: 409 });
  }

  db.openDrawer.delete(drawer.id);
  db.drawerCooldown.set(drawer.id, Date.now() + LIMITS.drawerCooldownMs);
  session.closedAt = Date.now();
  session.outcome = "closed";
  audit({ type: "lock.relocked_by_user", userId: user.id, drawerId: drawer.id });

  return NextResponse.json({ ok: true, locked: true });
}
