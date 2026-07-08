import { NextResponse } from "next/server";
import { audit, db, seed } from "@/lib/store";
import { LIMITS, clientIp, rateLimit } from "@/lib/security";
import { createSession, setSessionCookie } from "@/lib/session";

// Step 2 of OTP fallback: verify the code and establish a session.

export async function POST(req: Request) {
  seed();
  const ip = clientIp(req);

  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").trim();

  const gate = rateLimit(
    `verify:${email}:${ip}`,
    LIMITS.auth.limit,
    LIMITS.auth.windowMs,
  );
  if (!gate.ok) {
    audit({ type: "auth.verify_throttled", ip, detail: email });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const challenge = db.otps.get(email);
  const generic = NextResponse.json({ error: "invalid_code" }, { status: 401 });

  if (!challenge || challenge.expiresAt < Date.now()) return generic;
  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    db.otps.delete(email);
    audit({ type: "auth.otp_exhausted", ip, detail: email });
    return generic;
  }
  if (!/^\d{6}$/.test(code) || code !== challenge.code) {
    audit({ type: "auth.verify_failed", ip, detail: email });
    return generic;
  }

  const user = [...db.users.values()].find((u) => u.email === email);
  if (!user) return generic;

  db.otps.delete(email);
  const { token, maxAge } = createSession(user.id);
  audit({ type: "auth.login", userId: user.id, ip });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
  res.cookies.set(setSessionCookie(token, maxAge));
  return res;
}
