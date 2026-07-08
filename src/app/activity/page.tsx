"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar, BottomNav, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

// Screen 6 — My activity (PRD §A.2 / §C.3). The user's OWN ledger only.

interface Row {
  id: string;
  createdAt: number;
  delta: number;
  intent: "take" | "return";
  balanceAfter: number;
  drawer: string;
  item: string;
  unit: string;
  flagged: boolean;
}

export default function ActivityPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    api<{ transactions: Row[] }>("/api/activity").then(({ ok, status, data }) => {
      if (status === 401) return router.replace("/signin");
      if (ok) setRows(data.transactions);
      else setRows([]);
    });
  }, [router]);

  return (
    <>
      <AppBar title="My activity" back="/scan" />
      <main className="flex flex-1 flex-col px-5 py-5">
        {rows === null ? (
          <Spinner label="Loading your history…" />
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-ink-mute">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12h4l2 5 4-12 2 7h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm">No transactions yet. Scan a drawer to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((t) => {
              const take = t.intent === "take";
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      take ? "bg-brand-soft text-brand-ink" : "bg-success-soft text-success"
                    }`}
                    aria-hidden
                  >
                    {take ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 19V5m0 14l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v14m0-14l6 6m-6-6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{t.item}</p>
                    <p className="truncate text-xs text-ink-mute">
                      {t.drawer} · {new Date(t.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold tabular-nums ${take ? "text-brand-ink" : "text-success"}`}>
                      {t.delta > 0 ? "+" : ""}
                      {t.delta}
                    </p>
                    <p className="text-xs text-ink-mute">bal {t.balanceAfter}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <BottomNav active="activity" />
    </>
  );
}
