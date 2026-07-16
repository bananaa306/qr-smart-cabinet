"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildSmartScreenStyle,
  RooseveltIslandScene,
  SMART_ACCENT,
  smartEspressoTheme,
} from "@/components/smart-shell";
import { api } from "@/lib/client";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/drawers";
  // After check-in, skip /d/[id] round-trip (and its loading screen) —
  // open the drawer directly in the menu.
  const deep = raw.match(/^\/d\/([^/?#]+)/i);
  if (deep) return `/drawers?open=${encodeURIComponent(decodeURIComponent(deep[1]))}`;
  return raw;
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const t = smartEspressoTheme;
  const accent = SMART_ACCENT;
  const ready = name.trim().length > 0;

  // Wake Apps Script while the user is on the check-in screen.
  useEffect(() => {
    void fetch("/api/sheets/preload", { credentials: "same-origin", cache: "no-store" });
  }, []);

  async function prefetchDrawers(maxMs = 2000) {
    await Promise.race([
      api("/api/drawers"),
      new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
    ]);
  }

  // Client-side only — server cookies()+Suspense previously 500'd cold joins.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { ok, data } = await api<{ user: { name: string } | null }>("/api/auth/me");
      if (cancelled || !ok || !data.user) return;
      await prefetchDrawers(1500);
      if (!cancelled) router.replace(safeNextPath(searchParams.get("next")));
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter your name to continue.");
      return;
    }

    setWorking(true);
    setError(null);
    const { ok, status } = await api("/api/auth/tracker", {
      method: "POST",
      body: JSON.stringify({ name: trimmed }),
    });

    if (ok) {
      await prefetchDrawers();
      router.replace(safeNextPath(searchParams.get("next")));
      return;
    }
    setWorking(false);
    if (status === 429) {
      setError("Too many attempts. Wait a moment and try again.");
      return;
    }
    setError("Could not start your session. Try again.");
  }

  return (
    <div className="h-dvh overflow-hidden" style={{ background: t.bg }}>
      <main className="smart-screen" style={buildSmartScreenStyle(t, accent)}>
        <RooseveltIslandScene />

        <div className="smart-screen-body smart-signin-body">
          <header className="smart-header smart-signin-header">
            <div>
              <div className="smart-eyebrow">NYC FIRST</div>
              <h1>Smart Cabinet</h1>
            </div>
          </header>

          <div className="smart-signin">
            <div className="smart-signin-copy">
              <p className="smart-signin-kicker">Session</p>
              <h2 className="smart-signin-title">Who&apos;s checking in?</h2>
              <p className="smart-signin-lead">
                We&apos;ll use your name to track what you take or return.
              </p>
            </div>

            <form className="smart-signin-form" onSubmit={startSession}>
              <div className={`smart-signin-field${ready ? " filled" : ""}`}>
                <label className="smart-signin-label" htmlFor="tracker-name">
                  Name
                </label>
                <input
                  id="tracker-name"
                  className="smart-signin-input"
                  type="text"
                  name="name"
                  autoComplete="name"
                  autoFocus
                  maxLength={80}
                  placeholder=" "
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={working}
                />
                <span className="smart-signin-underline" aria-hidden />
              </div>

              {error && <p className="smart-signin-error">{error}</p>}

              <button
                type="submit"
                className="smart-signin-submit"
                disabled={working || !ready}
                style={{ background: accent }}
              >
                <span>{working ? "Starting…" : "Continue"}</span>
                {!working && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
