import { NextResponse } from "next/server";
import { audit, db, id as newId, seed } from "@/lib/store";
import {
  LIMITS,
  canAccessDrawer,
  clientIp,
  getIdempotent,
  rateLimit,
  saveIdempotent,
} from "@/lib/security";
import { currentUser } from "@/lib/session";
import { drawerView } from "@/lib/dto";
import { deviceOpen, issueUnlockCommand } from "@/lib/lock";
import type { Intent, Transaction } from "@/lib/types";

const RELOCK_SECONDS = 30; // auto-relock window (PRD §B.3 / open question #3)

interface UnlockBody {
  quantity?: unknown;
  intent?: unknown;
  idempotencyKey?: unknown;
  stockVersion?: unknown;
}

// POST /api/drawers/{id}/unlock — the server-authoritative unlock + ledger
// write. Never trusts client counts; performs the full ordered check from
// PRD §B.3 and writes the ledger in the same step as the grant (§C.2).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  seed();
  const { id: raw } = await params;
  const ip = clientIp(req);

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // ---- input validation (strict; §5.2) ----
  let body: UnlockBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const quantity = body.quantity;
  const intent = body.intent as Intent;
  const idempotencyKey = body.idempotencyKey;

  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10_000
  ) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }
  if (intent !== "take" && intent !== "return") {
    return NextResponse.json({ error: "invalid_intent" }, { status: 400 });
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
    return NextResponse.json({ error: "missing_idempotency_key" }, { status: 400 });
  }

  // ---- idempotency: retries return the stored result (§5.2) ----
  const prior = getIdempotent(user.id, idempotencyKey);
  if (prior) return NextResponse.json(prior);

  // ---- per-user unlock rate limit (§5.1) ----
  const gate = rateLimit(`unlock:${user.id}`, LIMITS.unlock.limit, LIMITS.unlock.windowMs);
  if (!gate.ok) {
    audit({ type: "unlock.rate_limited", userId: user.id, ip });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  // ---- resolve + object-level authz (deny-by-default, §5.2) ----
  const key = decodeURIComponent(raw).trim();
  const drawerId =
    db.drawers.get(key)?.id ?? db.drawersByShortCode.get(key.toUpperCase());
  const drawer = drawerId ? db.drawers.get(drawerId) : undefined;
  if (!drawer || !canAccessDrawer(user.id, drawer.id)) {
    audit({ type: "unlock.denied_authz", userId: user.id, ip, detail: key });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ---- drawer enabled ----
  if (drawer.status !== "active") {
    return NextResponse.json({ error: "drawer_disabled" }, { status: 409 });
  }

  // ---- one open session per drawer + cooldown (§5.1) ----
  if (db.openDrawer.has(drawer.id)) {
    return NextResponse.json({ error: "drawer_busy" }, { status: 409 });
  }
  const cooldownUntil = db.drawerCooldown.get(drawer.id) ?? 0;
  if (cooldownUntil > Date.now()) {
    return NextResponse.json(
      { error: "cooldown" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((cooldownUntil - Date.now()) / 1000)) },
      },
    );
  }

  const stock = db.stock.get(drawer.id)!;

  // ---- optimistic concurrency (§C.2) ----
  if (
    typeof body.stockVersion === "number" &&
    body.stockVersion !== stock.version
  ) {
    return NextResponse.json(
      { error: "stock_changed", drawer: drawerView(drawer, stock) },
      { status: 409 },
    );
  }

  // ---- quantity within stock; stock can never go negative (§C.2) ----
  const delta = intent === "take" ? -quantity : quantity;
  if (intent === "take" && quantity > stock.quantity) {
    return NextResponse.json(
      { error: "insufficient_stock", drawer: drawerView(drawer, stock) },
      { status: 409 },
    );
  }

  // ---- issue single-use unlock command to the controller (§B.3) ----
  const cmd = issueUnlockCommand(drawer.id);
  const result = deviceOpen(cmd);
  if (!result.opened) {
    audit({ type: "unlock.lock_error", userId: user.id, drawerId: drawer.id, detail: result.reason });
    return NextResponse.json({ error: "lock_error" }, { status: 502 });
  }

  // ---- atomic-equivalent: mutate stock + append ledger together (§C.2) ----
  const now = Date.now();
  stock.quantity += delta;
  stock.version += 1;

  const unlockSessionId = newId();
  const relockAt = now + RELOCK_SECONDS * 1000;
  db.unlockSessions.set(unlockSessionId, {
    id: unlockSessionId,
    userId: user.id,
    drawerId: drawer.id,
    requestedAt: now,
    grantedAt: now,
    openedAt: now,
    expiresAt: relockAt,
    outcome: "opened",
    quantity,
    intent,
  });

  const tx: Transaction = {
    id: newId(),
    userId: user.id,
    drawerId: drawer.id,
    itemId: drawer.itemId,
    delta,
    balanceAfter: stock.quantity,
    intent,
    unlockSessionId,
    createdAt: now,
  };
  db.transactions.push(tx); // append-only ledger (§C.1)

  // Mark physically open and schedule auto-relock (§B.3). Server has already
  // finalized the transaction with the declared quantity (§B.4).
  db.openDrawer.set(drawer.id, unlockSessionId);
  const relock = () => {
    if (db.openDrawer.get(drawer.id) === unlockSessionId) {
      db.openDrawer.delete(drawer.id);
      db.drawerCooldown.set(drawer.id, Date.now() + LIMITS.drawerCooldownMs);
      const s = db.unlockSessions.get(unlockSessionId);
      if (s) {
        s.closedAt = Date.now();
        s.outcome = "closed";
      }
      audit({ type: "lock.auto_relocked", drawerId: drawer.id });
    }
  };
  const timer = setTimeout(relock, RELOCK_SECONDS * 1000);
  // don't keep the process alive for the timer
  (timer as { unref?: () => void }).unref?.();

  audit({
    type: "unlock.granted",
    userId: user.id,
    drawerId: drawer.id,
    detail: `${intent} ${quantity}`,
  });

  const payload = {
    transaction: {
      id: tx.id,
      delta: tx.delta,
      intent: tx.intent,
      balanceAfter: tx.balanceAfter,
      createdAt: tx.createdAt,
    },
    drawer: drawerView(drawer, stock),
    unlockSessionId,
    relockAt,
    relockSeconds: RELOCK_SECONDS,
  };
  saveIdempotent(user.id, idempotencyKey, payload);
  return NextResponse.json(payload);
}
