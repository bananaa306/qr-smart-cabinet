"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BottomTabs,
  buildSmartScreenStyle,
  RooseveltIslandScene,
  SMART_ACCENT,
  smartEspressoTheme,
} from "@/components/smart-shell";
import { LegalFooter } from "@/components/legal-footer";
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
  const [sessionName, setSessionName] = useState<string | null>(null);
  const t = smartEspressoTheme;
  const accent = SMART_ACCENT;

  useEffect(() => {
    api<{ transactions: Row[] }>("/api/activity").then(({ ok, status, data }) => {
      if (status === 401) return router.replace("/signin");
      if (ok) setRows(data.transactions);
      else setRows([]);
    });
    api<{ user: { name: string } | null }>("/api/auth/me").then(({ ok, data }) => {
      if (ok && data.user?.name) setSessionName(data.user.name);
    });
  }, [router]);

  return (
    <div className="h-dvh overflow-hidden" style={{ background: t.bg }}>
      <main className="smart-screen" style={buildSmartScreenStyle(t, accent)}>
        <RooseveltIslandScene />

        <div className="smart-screen-body">
          <header className="smart-header">
            <div>
              <div className="smart-eyebrow">NYC FIRST</div>
              <h1>My activity</h1>
            </div>
            {sessionName && (
              <div className="smart-session-chip" title={`Signed in as ${sessionName}`}>
                <span>Signed in</span>
                <b>{sessionName}</b>
              </div>
            )}
          </header>

          <div className="smart-activity-content">
            {rows === null ? (
              <div className="smart-loading" role="status">
                <span className="spin h-7 w-7 rounded-full border-2" />
                <span>Loading your history…</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="smart-activity-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 12h4l2 5 4-12 2 7h4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p>No transactions yet. Scan a drawer to get started.</p>
              </div>
            ) : (
              <ul className="smart-activity-list">
                {rows.map((row) => {
                  const take = row.intent === "take";
                  return (
                    <li key={row.id} className="smart-activity-row">
                      <span
                        className={`smart-activity-badge ${take ? "take" : "return"}`}
                        aria-hidden
                      >
                        {take ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 19V5m0 14l-6-6m6 6l6-6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 5v14m0-14l6 6m-6-6l-6 6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <div className="smart-activity-row-main">
                        <p>{row.item}</p>
                        <p>
                          {row.drawer} · {new Date(row.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="smart-activity-row-stat">
                        <b className={take ? "take" : "return"}>
                          {row.delta > 0 ? "+" : ""}
                          {row.delta}
                        </b>
                        <span>bal {row.balanceAfter}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <LegalFooter />
          </div>
        </div>

        <BottomTabs accent={accent} active="activity" />
      </main>
    </div>
  );
}
