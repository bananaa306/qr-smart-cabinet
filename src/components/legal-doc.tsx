import type { ReactNode } from "react";
import Link from "next/link";
import {
  RooseveltIslandScene,
  SMART_ACCENT,
  buildSmartScreenStyle,
  smartEspressoTheme,
} from "@/components/smart-shell";

export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const t = smartEspressoTheme;
  const accent = SMART_ACCENT;

  return (
    <div className="h-dvh overflow-hidden" style={{ background: t.bg }}>
      <main className="smart-screen" style={buildSmartScreenStyle(t, accent)}>
        <RooseveltIslandScene />

        <div className="smart-screen-body">
          <header className="smart-header">
            <div>
              <div className="smart-eyebrow">NYC FIRST</div>
              <h1>{title}</h1>
            </div>
            <Link href="/activity" className="smart-legal-back">
              Back
            </Link>
          </header>

          <article className="smart-legal-doc">
            <p className="smart-legal-updated">Last updated {updated}</p>
            {children}
          </article>
        </div>
      </main>
    </div>
  );
}
