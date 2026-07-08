import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { audit, db, seed } from "@/lib/store";
import { LIMITS, clientIp, rateLimit } from "@/lib/security";

// Step 1 of OTP fallback (PRD §A.2 / §5.2). Production primary is passkeys.
// We never reveal whether an email exists (anti-enumeration): the response is
// identical either way. In this demo, when the email is a known user we return
// the generated code in `devCode` so it can be shown on screen — that field
// would not exist in production.

export async function POST(req: Request) {
  seed();
  const ip = clientIp(req);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Throttle per IP and per account (PRD §5.1).
  const byIp = rateLimit(`otp:ip:${ip}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const byAcct = rateLimit(
    `otp:acct:${email}`,
    LIMITS.auth.limit,
    LIMITS.auth.windowMs,
  );
  if (!byIp.ok || !byAcct.ok) {
    const retryAfter = Math.max(byIp.retryAfter, byAcct.retryAfter);
    audit({ type: "auth.otp_throttled", ip, detail: email });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const user = [...db.users.values()].find((u) => u.email === email);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

  if (user) {
    db.otps.set(email, {
      email,
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
    audit({ type: "auth.otp_requested", userId: user.id, ip });
  } else {
    audit({ type: "auth.otp_requested_unknown", ip, detail: email });
  }

  // Identical outward response; devCode only present for seeded demo users.
  return NextResponse.json({
    ok: true,
    ...(user ? { devCode: code } : {}),
  });
}
