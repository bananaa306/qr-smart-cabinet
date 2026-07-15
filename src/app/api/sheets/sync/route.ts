import { NextResponse } from "next/server";
import { seed } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { sheetsEnabled, syncSheet } from "@/lib/sheets";

// POST /api/sheets/sync — re-read inventory from Google Sheets (never overwrite).
// Soft-fails with HTTP 200 so the UI can still refresh drawer cards locally.
export async function POST() {
  seed();

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (!sheetsEnabled()) {
    return NextResponse.json({ ok: false, error: "not_configured" });
  }

  const result = await syncSheet();
  return NextResponse.json(result);
}
