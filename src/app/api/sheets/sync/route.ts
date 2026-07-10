import { NextResponse } from "next/server";
import { seed } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { sheetsEnabled, syncSheet } from "@/lib/sheets";

// POST /api/sheets/sync — push the current state of all drawers to the Google
// Sheet on demand (the "Sync now" button). Auth-gated like everything else.
export async function POST() {
  seed();

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (!sheetsEnabled()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 400 });
  }

  const result = await syncSheet();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
