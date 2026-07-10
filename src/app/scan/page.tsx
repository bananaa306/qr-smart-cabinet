"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar, Button, Callout } from "@/components/ui";
import { api } from "@/lib/client";
import { parseScanned } from "@/lib/qr";

// Screen 2 — Scan (PRD §A.2 / §B.2). On-device decode via the native
// BarcodeDetector (no frames leave the device); manual short-code entry is
// always available as a fallback for damaged labels or camera-denied users.

type CamState = "idle" | "starting" | "running" | "denied" | "unsupported";

const DEMO_CODES = ["A1-7Q4", "A3-8M2", "A5-2R1", "A7-9W3"];

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [cam, setCam] = useState<CamState>("idle");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  // Guard the route: bounce to sign-in if the session is gone.
  useEffect(() => {
    api("/api/auth/me").then(({ ok }) => {
      if (!ok) router.replace("/signin");
    });
  }, [router]);

  const go = useCallback(
    (raw: string) => {
      if (handled.current) return;
      const parsed = parseScanned(raw);
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      handled.current = true;
      stop();
      router.push(`/d/${encodeURIComponent(parsed.id)}`);
    },
    [router],
  );

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const Detector = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCam("unsupported");
      return;
    }
    setCam("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCam("running");

      // @ts-expect-error runtime-only global
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) return go(codes[0].rawValue);
        } catch {
          /* transient decode error; keep scanning */
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCam("denied");
    }
  }, [go]);

  useEffect(() => () => stop(), [stop]);

  return (
    <>
      <AppBar title="Scan a drawer" back="/drawers" />

      <main className="flex flex-1 flex-col gap-5 px-5 py-5">
        {/* Viewfinder */}
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-surface-2">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${cam === "running" ? "" : "hidden"}`}
          />
          {/* Reticle */}
          {cam === "running" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-2/3 w-2/3 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {cam !== "running" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              {cam === "idle" && (
                <div className="flex flex-col items-center gap-4">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" className="text-ink-mute" aria-hidden>
                    <path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="w-full max-w-[220px]">
                    <Button onClick={start}>Start camera</Button>
                  </div>
                </div>
              )}
              {cam === "starting" && <p className="text-sm text-ink-mute">Starting camera…</p>}
              {cam === "denied" && (
                <Callout tone="warn" title="Camera unavailable">
                  Permission was denied. Use the manual code entry below.
                </Callout>
              )}
              {cam === "unsupported" && (
                <Callout tone="info" title="Camera scan not supported here">
                  This browser can’t decode QR on-device. Enter the short code
                  printed under the QR instead.
                </Callout>
              )}
            </div>
          )}
        </div>

        {error && <Callout tone="danger">{error}</Callout>}

        {/* Manual fallback (PRD §B.2 step 4) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(manual);
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-sm font-medium text-ink-soft">
            Manual entry — short code under the QR
            <input
              value={manual}
              onChange={(e) => {
                setManual(e.target.value);
                setError(null);
              }}
              placeholder="e.g. A1-7Q4"
              autoCapitalize="characters"
              className="mt-1.5 min-h-[48px] w-full rounded-2xl border border-border bg-surface px-4 text-base uppercase tracking-wider outline-none focus:border-brand"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!manual.trim()}>
            Open drawer
          </Button>
        </form>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-mute">
            Demo drawers (tap to simulate a scan)
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_CODES.map((c) => (
              <button
                key={c}
                onClick={() => go(c)}
                className="min-h-[40px] rounded-xl border border-border bg-surface px-3 font-mono text-sm text-ink-soft hover:border-brand hover:text-brand"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
