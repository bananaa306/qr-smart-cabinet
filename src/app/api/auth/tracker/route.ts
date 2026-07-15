import { NextResponse } from "next/server";
import { audit, seed } from "@/lib/store";
import { clientIp, rateLimit, LIMITS } from "@/lib/security";
import { createTrackerSession, setSessionCookie } from "@/lib/session";

interface TrackerBody {
  name?: unknown;
}

// POST /api/auth/tracker — start a name-only visit session (workshop tracker).
export async function POST(req: Request) {
  seed();
  const ip = clientIp(req);

  const gate = rateLimit(`tracker:${ip}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  if (!gate.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: TrackerBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 80) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  try {
    const { token, maxAge, trackerSessionId, displayName, userId } =
      createTrackerSession(name);
    audit({ type: "auth.tracker_session", userId, detail: trackerSessionId });

    const res = NextResponse.json({
      ok: true,
      trackerSessionId,
      user: { id: userId, name: displayName, email: "" },
    });
    res.cookies.set(setSessionCookie(token, maxAge));
    return res;
  } catch {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
}
