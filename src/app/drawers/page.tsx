"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { api, uuid } from "@/lib/client";
import type { DrawerView } from "@/lib/dto";

type Intent = "take" | "return";
type Accent = "#CF2233" | "#1F5FA8" | "#1C2B4A";
type ThemeName = "Espresso" | "Sage" | "Clay" | "Slate" | "Navy";
type DetailPhase = "idle" | "enter" | "shown" | "exit";

interface ThemeTokens {
  bg: string;
  ink: string;
  sub: string;
  line: string;
  dot: string;
  panelBg: string;
  panelBorder: string;
}

interface UnlockResult {
  transaction: {
    id: string;
    delta: number;
    intent: Intent;
    balanceAfter: number;
    createdAt: number;
  };
  drawer: DrawerView;
}

const BLUE = "#1F5FA8";
const INK = "#1C2B4A";
const ORIGINAL_ACCENT: Accent = "#CF2233";

const themes: Record<ThemeName, ThemeTokens> = {
  Espresso: {
    bg: "radial-gradient(ellipse 82% 44% at 60% 30%, rgba(255,240,214,0.13), rgba(255,240,214,0) 64%), linear-gradient(180deg, #2C2822 0%, #1D1A16 100%)",
    ink: "#F2ECDD",
    sub: "#B7AF9E",
    line: "rgba(242,236,221,0.30)",
    dot: "rgba(242,236,221,0.09)",
    panelBg: "rgba(242,236,221,0.06)",
    panelBorder: "rgba(242,236,221,0.16)",
  },
  Sage: {
    bg: "radial-gradient(ellipse 78% 42% at 62% 34%, rgba(255,255,249,0.5), rgba(255,255,249,0) 68%), linear-gradient(178deg, #BAC3AD 0%, #A2AD91 100%)",
    ink: "#2C3327",
    sub: "#4F573F",
    line: "rgba(44,51,39,0.30)",
    dot: "rgba(44,51,39,0.10)",
    panelBg: "rgba(255,255,248,0.42)",
    panelBorder: "rgba(44,51,39,0.16)",
  },
  Clay: {
    bg: "radial-gradient(ellipse 78% 42% at 62% 34%, rgba(255,249,240,0.5), rgba(255,249,240,0) 68%), linear-gradient(178deg, #CFB49D 0%, #B99A7F 100%)",
    ink: "#3B2C22",
    sub: "#61493A",
    line: "rgba(59,44,34,0.28)",
    dot: "rgba(59,44,34,0.10)",
    panelBg: "rgba(255,251,244,0.44)",
    panelBorder: "rgba(59,44,34,0.16)",
  },
  Slate: {
    bg: "radial-gradient(ellipse 78% 42% at 62% 34%, rgba(255,252,246,0.55), rgba(255,252,246,0) 68%), linear-gradient(178deg, #E9EDF6 0%, #D7DEEE 46%, #BFC9E0 100%)",
    ink: "#1C2B4A",
    sub: "#4A5670",
    line: "rgba(28,43,74,0.30)",
    dot: "rgba(28,43,74,0.09)",
    panelBg: "rgba(255,253,248,0.55)",
    panelBorder: "rgba(28,43,74,0.14)",
  },
  Navy: {
    bg: "radial-gradient(ellipse 82% 44% at 60% 32%, rgba(180,205,240,0.12), rgba(180,205,240,0) 64%), linear-gradient(180deg, #1B2740 0%, #121B31 100%)",
    ink: "#EAF0FA",
    sub: "#9FAAC4",
    line: "rgba(234,240,250,0.28)",
    dot: "rgba(234,240,250,0.08)",
    panelBg: "rgba(234,240,250,0.06)",
    panelBorder: "rgba(234,240,250,0.16)",
  },
};

const fronts = ["#FFFDF8", "#F7F0DF", "#FBF6EC"];
const borders = ["#E6DCC4", "#DFD3B6", "#E4DAC1"];

export default function DrawersPage() {
  const router = useRouter();
  const [drawers, setDrawers] = useState<DrawerView[] | null>(null);
  const [sheets, setSheets] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const [detailPhase, setDetailPhase] = useState<DetailPhase>("idle");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<{ drawers: DrawerView[]; sheets: boolean }>("/api/drawers").then(
      ({ ok, status, data }) => {
        if (status === 401) return router.replace("/signin");
        if (ok) {
          setDrawers(data.drawers);
          setSheets(data.sheets);
        } else {
          setDrawers([]);
        }
      },
    );
  }, [router]);

  const t = themes.Espresso;
  const accent = ORIGINAL_ACCENT;
  const rulerBg = `repeating-linear-gradient(180deg, ${t.line} 0px, ${t.line} 1.5px, transparent 1.5px, transparent 70px), repeating-linear-gradient(180deg, ${t.dot} 0px, ${t.dot} 1px, transparent 1px, transparent 14px)`;
  const dotBg = `radial-gradient(${t.dot} 1px, transparent 1.2px)`;
  const detail = detailIdx !== null && drawers ? drawers[detailIdx] : null;

  function openDrawer(i: number) {
    setOpenIdx(i);
    setDetailIdx(i);
    setDetailPhase("enter");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDetailPhase("shown"));
    });
  }

  function closeDrawer() {
    setDetailPhase("exit");
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setDetailIdx(null);
      setOpenIdx(null);
      setDetailPhase("idle");
    }, 220);
  }

  function updateDrawer(next: DrawerView) {
    setDrawers((current) =>
      current?.map((drawer) => (drawer.id === next.id ? next : drawer)) ?? current,
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: t.bg }}>
      <main
        className="smart-screen"
        style={
          {
            "--smart-bg": t.bg,
            "--smart-ink": t.ink,
            "--smart-sub": t.sub,
            "--smart-line": t.line,
            "--smart-dot": t.dot,
            "--smart-panel-bg": t.panelBg,
            "--smart-panel-border": t.panelBorder,
            "--smart-accent": accent,
          } as React.CSSProperties
        }
      >
        <RooseveltIslandScene />

        <header className="smart-header">
          <div>
            <div className="smart-eyebrow">NYC FIRST</div>
            <h1>Smart Cabinet</h1>
          </div>
        </header>

        <SyncBar connected={sheets} accent={accent} />

        {drawers === null ? (
          <div className="relative z-[1] px-5 pt-24">
            <Spinner label="Loading cabinet..." />
          </div>
        ) : drawers.length === 0 ? (
          <p className="relative z-[1] mx-5 mt-24 rounded-2xl border border-[var(--smart-panel-border)] bg-[var(--smart-panel-bg)] p-5 text-center text-sm text-[var(--smart-sub)]">
            No drawers available for your account.
          </p>
        ) : (
          <CabinetStage
            drawers={drawers}
            accent={accent}
            openIdx={openIdx}
            stagger={90}
            rulerBg={rulerBg}
            dotBg={dotBg}
            line={t.line}
            onOpen={openDrawer}
          />
        )}

        <div className="smart-spacer" />
        <BottomTabs accent={accent} />

        <DrawerDetail
          drawer={detail}
          index={detailIdx}
          phase={detailPhase}
          accent={accent}
          t={t}
          onClose={closeDrawer}
          onUpdated={updateDrawer}
        />
      </main>
    </div>
  );
}

function SyncBar({ connected, accent }: { connected: boolean; accent: string }) {
  const [state, setState] = useState<"idle" | "syncing" | "ok" | "err">("idle");

  async function syncNow() {
    setState("syncing");
    const { ok } = await api("/api/sheets/sync", { method: "POST" });
    setState(ok ? "ok" : "err");
    setTimeout(() => setState("idle"), 2200);
  }

  return (
    <div className="smart-sync">
      <div
        className="h-2 w-2 rounded-full"
        style={{ background: connected ? "#3E8E5A" : "var(--smart-sub)" }}
      />
      <div className="min-w-0 flex-1 truncate">
        {connected ? "Synced to Google Sheets" : "Local inventory"}
      </div>
      <button onClick={syncNow} disabled={state === "syncing"} style={{ background: accent }}>
        {state === "syncing"
          ? "Syncing"
          : state === "ok"
            ? "Synced"
            : state === "err"
              ? "Failed"
              : "Sync now"}
      </button>
    </div>
  );
}

function CabinetStage({
  drawers,
  accent,
  openIdx,
  stagger,
  rulerBg,
  dotBg,
  line,
  onOpen,
}: {
  drawers: DrawerView[];
  accent: Accent;
  openIdx: number | null;
  stagger: number;
  rulerBg: string;
  dotBg: string;
  line: string;
  onOpen: (index: number) => void;
}) {
  return (
    <div className="smart-stage" style={{ backgroundImage: dotBg }}>
      <div
        className="smart-ruler"
        style={{
          backgroundImage: rulerBg,
          backgroundSize: "13px 100%, 7px 100%",
          backgroundPosition: "right top, right top",
        }}
      />

      <div className="smart-cabinet-column">
        <div className="smart-perspective">
          <div className="smart-cabinet">
            <div className="smart-carcass" />
            <div className="smart-side-panel">
              <span />
              <span />
            </div>
            <div className="smart-top-panel">
              <span />
              <i />
            </div>

            {drawers.map((drawer, index) => (
              <DrawerRow
                key={drawer.id}
                drawer={drawer}
                index={index}
                open={openIdx === index}
                accent={accent}
                delay={index * stagger}
                onOpen={() => onOpen(index)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="smart-rail" style={{ "--rail-line": line } as React.CSSProperties}>
        {drawers.map((drawer, index) => {
          const open = openIdx === index;
          return (
            <button
              key={drawer.id}
              onClick={() => onOpen(index)}
              style={{
                color: open ? "#FFFDF8" : "#A9A28F",
                background: open ? accent : "transparent",
                borderColor: open ? accent : line,
              }}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DrawerRow({
  drawer,
  index,
  open,
  accent,
  delay,
  onOpen,
}: {
  drawer: DrawerView;
  index: number;
  open: boolean;
  accent: Accent;
  delay: number;
  onOpen: () => void;
}) {
  const status = drawer.quantity === 0 ? "empty" : drawer.quantity <= 5 ? "low" : "ok";
  const empty = status === "empty";
  const unit = pluralUnit(drawer.item.unit, drawer.quantity);

  return (
    <div className="smart-drawer-row">
      <div className="smart-cavity" />
      <button
        className="smart-drawer-box"
        onClick={onOpen}
        style={
          {
            transform: open ? "translateZ(72px)" : "translateZ(2.5px)",
            animationDelay: `${delay}ms`,
          } as React.CSSProperties
        }
      >
        <div className="smart-drawer-west" style={{ opacity: open ? 1 : 0 }} />
        <div
          className="smart-tray"
          style={{ opacity: open ? 1 : 0, animationDelay: `${delay}ms` }}
        >
          <span style={{ left: "20%" }} />
          <span style={{ left: "40%" }} />
          <span style={{ left: "60%" }} />
          <span style={{ left: "80%" }} />
        </div>
        <div
          className="smart-front"
          style={{
            background: fronts[index % fronts.length],
            borderColor: borders[index % borders.length],
            boxShadow: open
              ? "14px 18px 24px rgba(24,19,9,0.35)"
              : "0 1px 2px rgba(28,43,74,0.08)",
          }}
        >
          <div className="smart-scoop" />
          <div className="smart-front-top">
            <span>DRAWER {index + 1}</span>
            <i
              style={{
                background: status === "ok" ? BLUE : status === "low" ? accent : "transparent",
                border: empty ? "1.5px solid #C9BFA9" : "none",
              }}
            />
          </div>
          <div className="smart-front-bottom">
            <span style={{ color: empty ? "#A89F8C" : "#4A4436" }}>
              {drawer.item.name}
            </span>
            <b style={{ color: empty ? "#A89F8C" : status === "low" ? accent : INK }}>
              {drawer.quantity}
            </b>
            <em>{unit}</em>
          </div>
        </div>
      </button>
    </div>
  );
}

function DrawerDetail({
  drawer,
  index,
  phase,
  accent,
  t,
  onClose,
  onUpdated,
}: {
  drawer: DrawerView | null;
  index: number | null;
  phase: DetailPhase;
  accent: Accent;
  t: ThemeTokens;
  onClose: () => void;
  onUpdated: (drawer: DrawerView) => void;
}) {
  const [mode, setMode] = useState<Intent>("take");
  const [qty, setQty] = useState(1);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const idemKey = useRef(uuid());

  useEffect(() => {
    setMode("take");
    setQty(1);
    setWorking(false);
    setError(null);
    setPhotoPreview(null);
    idemKey.current = uuid();
  }, [drawer?.id]);

  const max = drawer ? Math.max(drawer.quantity, 1) : 1;
  const clampedQty = Math.max(1, Math.min(qty, mode === "take" ? max : 99));
  const shown = phase === "shown";
  const status = drawer
    ? drawer.quantity === 0
      ? "empty"
      : drawer.quantity <= 5
        ? "low"
        : "ok"
    : "ok";
  const countColor = status === "empty" ? t.sub : status === "low" ? accent : t.ink;

  async function confirm() {
    if (!drawer) return;
    setWorking(true);
    setError(null);
    const { ok, status: httpStatus, data } = await api<
      UnlockResult & { error?: string; drawer?: DrawerView }
    >(`/api/drawers/${encodeURIComponent(drawer.id)}/unlock`, {
      method: "POST",
      body: JSON.stringify({
        quantity: clampedQty,
        intent: mode,
        idempotencyKey: idemKey.current,
        stockVersion: drawer.stockVersion,
      }),
    });

    setWorking(false);
    idemKey.current = uuid();

    if (ok) {
      onUpdated(data.drawer);
      onClose();
      return;
    }

    if (httpStatus === 401) {
      window.location.href = "/signin";
      return;
    }
    if (data.drawer) onUpdated(data.drawer);
    const messages: Record<string, string> = {
      stock_changed: "Stock changed. Review the latest count and try again.",
      insufficient_stock: "There is not enough stock for that quantity.",
      drawer_busy: "This drawer is open right now. Try again shortly.",
      cooldown: "This drawer just closed. Give it a moment.",
      rate_limited: "Unlock limit reached. Try again later.",
      drawer_disabled: "This drawer is disabled.",
      lock_error: "The lock did not respond. Nothing changed.",
    };
    setError(messages[data.error ?? ""] ?? "Could not unlock. Try again.");
  }

  function handleDrop(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setPhotoPreview(URL.createObjectURL(file));
  }

  if (!drawer || index === null) return null;

  return (
    <div
      className="smart-detail"
      style={{
        background: t.bg,
        color: t.ink,
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0) scale(1)" : "translateY(26px) scale(0.94)",
      }}
    >
      <header>
        <button onClick={onClose} aria-label="Back">
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden>
            <path d="M8 1 1.5 7.5 8 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>Smart Cabinet · Drawer {index + 1}</div>
      </header>

      <div className="smart-lock-row">
        <div>
          <span />
          <b>{drawer.locked ? "Locked" : "Unlocked"}</b>
        </div>
        <p>NYC FIRST · Workshop</p>
      </div>

      <div className="smart-photo-pad">
        <label
          className="smart-photo-slot"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop(event.dataTransfer.files);
          }}
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="" />
          ) : drawer.item.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={drawer.item.photo} alt="" />
          ) : null}
          <span>Drop a photo of this item</span>
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => handleDrop(event.target.files)}
          />
        </label>
      </div>

      <section className="smart-detail-copy">
        <h2>{drawer.item.name}</h2>
        <div>
          <b style={{ color: countColor }}>{drawer.quantity}</b>
          <span>{pluralUnit(drawer.item.unit, drawer.quantity)} in stock</span>
        </div>
      </section>

      <div className="smart-mode-row">
        <button
          onClick={() => {
            setMode("take");
            setQty(1);
          }}
          style={{
            background: mode === "take" ? accent : t.panelBg,
            color: mode === "take" ? "#FFFDF8" : t.sub,
            borderColor: mode === "take" ? accent : t.panelBorder,
          }}
        >
          Take
        </button>
        <button
          onClick={() => {
            setMode("return");
            setQty(1);
          }}
          style={{
            background: mode === "return" ? accent : t.panelBg,
            color: mode === "return" ? "#FFFDF8" : t.sub,
            borderColor: mode === "return" ? accent : t.panelBorder,
          }}
        >
          Return
        </button>
      </div>

      <div className="smart-stepper">
        <button
          onClick={() => setQty((value) => Math.max(1, value - 1))}
          disabled={clampedQty <= 1}
        >
          -
        </button>
        <div>
          <b>{clampedQty}</b>
          <span>
            max {mode === "take" ? max : 99} {pluralUnit(drawer.item.unit, max)}
          </span>
        </div>
        <button
          onClick={() => setQty((value) => Math.min(mode === "take" ? max : 99, value + 1))}
          disabled={clampedQty >= (mode === "take" ? max : 99)}
          style={{ background: accent, color: "#FFFDF8" }}
        >
          +
        </button>
      </div>

      {error && <p className="smart-error">{error}</p>}

      <div className="smart-detail-fill" />
      <button
        className="smart-cta"
        onClick={confirm}
        disabled={working || drawer.status === "disabled" || (mode === "take" && drawer.quantity === 0)}
        style={{ background: accent }}
      >
        {working
          ? "Unlocking..."
          : mode === "take"
            ? `Unlock & take ${clampedQty}`
            : `Unlock & return ${clampedQty}`}
      </button>
    </div>
  );
}

function BottomTabs({ accent }: { accent: Accent }) {
  return (
    <nav className="smart-bottom-nav">
      <button type="button">
        <div className="smart-drawer-icon">
          <span style={{ background: accent }} />
          <span style={{ background: accent }} />
        </div>
        <b style={{ color: accent }}>Drawers</b>
      </button>
      <button type="button" className="inactive" onClick={() => (window.location.href = "/activity")}>
        <div className="smart-activity-icon">
          <span />
          <span />
          <span />
        </div>
        <b>My activity</b>
      </button>
    </nav>
  );
}

function RooseveltIslandScene() {
  return (
    <div className="smart-scene">
      <svg width="402" height="460" viewBox="0 0 402 460" fill="none" aria-hidden>
        <g opacity="0.09" fill="currentColor">
          <rect x="6" y="150" width="13" height="22" />
          <rect x="22" y="138" width="9" height="34" />
          <rect x="34" y="156" width="11" height="16" />
          <rect x="120" y="152" width="12" height="20" />
          <rect x="135" y="143" width="10" height="29" />
          <rect x="150" y="150" width="14" height="22" />
          <rect x="168" y="136" width="11" height="36" />
          <rect x="223" y="154" width="10" height="18" />
          <rect x="238" y="146" width="13" height="26" />
          <rect x="256" y="140" width="11" height="32" />
          <rect x="272" y="151" width="14" height="21" />
          <rect x="290" y="134" width="10" height="38" />
          <rect x="356" y="148" width="11" height="24" />
          <rect x="372" y="140" width="16" height="32" />
          <rect x="390" y="152" width="9" height="20" />
        </g>
        <g opacity="0.10" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <path d="M10 188h16M32 188h10M8 200h20M14 212h12M6 224h18M360 186h18M384 186h10M366 198h20M372 210h14M362 222h20" />
        </g>
        <g opacity="0.14" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M0 171h214M0 177h214" />
          <path d="M6 171l32 6M38 171 6 177M38 171l32 6M70 171l-32 6M70 171l32 6M102 171l-32 6M102 171l32 6M134 171l-32 6M134 171l32 6M166 171l-32 6M166 171l32 6M198 171l-32 6" />
          <path d="M100 178v-78M126 178v-78M96 100h34M100 100l13-10 13 10" />
          <path d="M100 150l26-18M126 150l-26-18M100 132l26-18M126 132l-26-18" />
          <path d="M113 92 16 171M113 92l97 79" />
        </g>
        <g opacity="0.22" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M50 172 60 52l10 120M60 172V52M46 56h28" />
          <path d="M336 172 346 20l10 152M346 172V20M332 24h28" />
          <path d="M60 52q140 8 286-32" />
          <path d="M60 52-6 78M346 20l62 20" />
        </g>
        <g opacity="0.13" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <path d="M60 56q140 10 286-32" />
        </g>
        <g className="smart-tram">
          <circle cx="286" cy="34" r="2.4" fill="currentColor" opacity="0.5" />
          <path d="M286 35v7" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
          <rect x="269" y="42" width="34" height="21" rx="6" fill="var(--smart-accent)" />
          <rect x="272" y="42" width="28" height="3.3" rx="1.5" fill="#000" opacity="0.14" />
          <rect x="274" y="48" width="24" height="8.5" rx="2" fill="#FFF" opacity="0.5" />
          <path d="M286 48v8.5" stroke="var(--smart-accent)" strokeWidth="1.4" />
        </g>
      </svg>
    </div>
  );
}

function pluralUnit(unit: string, quantity: number) {
  if (unit.endsWith("s")) return unit;
  if (quantity === 1) return unit;
  if (unit === "lead") return "leads";
  if (unit === "cable") return "cables";
  return `${unit}s`;
}
