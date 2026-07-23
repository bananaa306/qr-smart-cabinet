import { NextResponse } from "next/server";
import { after } from "next/server";
import { clientIp, rateLimit } from "@/lib/security";
import { pullStockFromSheets, sheetsCacheFresh, sheetsEnabled } from "@/lib/sheets";

/**
 * GET /api/sheets/preload — start warming inventory while the user is on sign-in.
 * Rate-limited; safe to call from the public check-in screen.
 * Always returns immediately — pull runs in after().
 */
export async function GET(req: Request) {
  if (!sheetsEnabled()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const gate = rateLimit(`sheets_preload:${clientIp(req)}`, 24, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  if (sheetsCacheFresh()) {
    return NextResponse.json({ ok: true, fresh: true });
  }

  after(() => {
    void pullStockFromSheets({ force: true, timeoutMs: 20000 });
  });

  return NextResponse.json({ ok: true, fresh: false, warming: true });
}
