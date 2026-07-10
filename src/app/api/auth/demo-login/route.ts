import { NextResponse } from "next/server";
import { audit, db, seed } from "@/lib/store";
import { createSession, currentUser, setSessionCookie } from "@/lib/session";

// Demo convenience: establish a session for the default demo user without the
// OTP screen, so the app opens straight onto the scan menu. This exists ONLY
// because auth is stubbed for the demo — production uses the real passkey/OTP
// sign-in and this route would not ship.
const DEFAULT_USER = "u_alex"; // seeded user with access to all drawers

// GET variant: establishes the demo session and redirects straight to the main
// menu as a normal top-level navigation. This is the robust path — no
// client-side fetch to hang, and Set-Cookie on a redirect is always honoured.
export async function GET(req: Request) {
  seed();
  const menu = new URL("/drawers", req.url);

  const existing = await currentUser();
  if (existing) return NextResponse.redirect(menu, 303);

  const user = db.users.get(DEFAULT_USER);
  if (!user) return NextResponse.json({ error: "no_demo_user" }, { status: 500 });

  const { token, maxAge } = createSession(user.id);
  audit({ type: "auth.demo_login", userId: user.id });

  const res = NextResponse.redirect(menu, 303);
  res.cookies.set(setSessionCookie(token, maxAge));
  return res;
}

export async function POST() {
  seed();

  // Already signed in? Reuse the existing session.
  const existing = await currentUser();
  if (existing) return NextResponse.json({ ok: true });

  const user = db.users.get(DEFAULT_USER);
  if (!user) return NextResponse.json({ error: "no_demo_user" }, { status: 500 });

  const { token, maxAge } = createSession(user.id);
  audit({ type: "auth.demo_login", userId: user.id });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
  res.cookies.set(setSessionCookie(token, maxAge));
  return res;
}
