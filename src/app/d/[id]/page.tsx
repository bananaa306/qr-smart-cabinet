"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  buildSmartScreenStyle,
  RooseveltIslandScene,
  SMART_ACCENT,
  smartEspressoTheme,
} from "@/components/smart-shell";
import { api } from "@/lib/client";
import type { DrawerView } from "@/lib/dto";

type Phase = "loading" | "gone";

export default function DrawerDeepLinkPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const t = smartEspressoTheme;
  const accent = SMART_ACCENT;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { ok, status, data } = await api<{ drawer: DrawerView }>(
        `/api/drawers/${encodeURIComponent(id)}`,
      );
      if (cancelled) return;

      if (status === 401) {
        const next = `/d/${encodeURIComponent(id)}`;
        router.replace(`/signin?next=${encodeURIComponent(next)}`);
        return;
      }

      if (!ok || !data.drawer) {
        setPhase("gone");
        return;
      }

      router.replace(`/drawers?open=${encodeURIComponent(data.drawer.id)}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <div className="h-dvh overflow-hidden" style={{ background: t.bg }}>
      <main className="smart-screen" style={buildSmartScreenStyle(t, accent)}>
        <RooseveltIslandScene />

        <div className="smart-screen-body">
          <header className="smart-header">
            <div>
              <div className="smart-eyebrow">NYC FIRST</div>
              <h1>Smart Cabinet</h1>
            </div>
          </header>

          {phase === "loading" ? (
            <div className="smart-loading" role="status">
              <span className="spin h-7 w-7 rounded-full border-2" />
              <span>Opening drawer…</span>
            </div>
          ) : (
            <div className="smart-activity-empty">
              <p>
                This code doesn’t match a drawer you’re permitted to open. If you
                believe that’s wrong, contact your administrator.
              </p>
              <button
                type="button"
                className="smart-signin-submit"
                style={{ background: accent, marginTop: 16, width: "100%", maxWidth: 280 }}
                onClick={() => router.replace("/drawers")}
              >
                <span>Back to drawers</span>
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
