import { NextResponse } from "next/server";
import { after } from "next/server";
import { clientIp, rateLimit } from "@/lib/security";
import { pullStockFromSheets, sheetsCacheFresh, sheetsEnabled } from "@/lib/sheets";

/**
 * GET /api/sheets/preload — start warming inventory while the user is on sign-in.
 * Rate-limited; safe to call from the public check-in screen.
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

  // Try a quick pull while sign-in is on screen; finish in the background if cold.
  const quick = await pullStockFromSheets({ timeoutMs: 2500 });
  if (!quick.ok) {
    after(() => {
      void pullStockFromSheets({ force: true, timeoutMs: 20000 });
    });
  }

  return NextResponse.json({ ok: true, fresh: quick.ok });
}
