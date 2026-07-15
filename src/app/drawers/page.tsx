"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BottomTabs,
  buildSmartScreenStyle,
  RooseveltIslandScene,
  SMART_ACCENT,
  smartEspressoTheme,
} from "@/components/smart-shell";
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

interface TxResult {
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
  return (
    <Suspense fallback={<DrawersBoot />}>
      <DrawersPageInner />
    </Suspense>
  );
}

function DrawersBoot() {
  const t = smartEspressoTheme;
  const accent = SMART_ACCENT;
  return (
    <div className="h-dvh overflow-hidden" style={{ background: t.bg }}>
      <main className="smart-screen" style={buildSmartScreenStyle(t, accent)}>
        <RooseveltIslandScene />
        <div className="smart-screen-body">
          <div className="smart-loading" role="status">
            <span className="spin h-7 w-7 rounded-full border-2" />
            <span>Loading cabinet…</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function DrawersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openParam = searchParams.get("open");
  const [drawers, setDrawers] = useState<DrawerView[] | null>(null);
  const [sheets, setSheets] = useState(false);
  const [sheetsBackend, setSheetsBackend] = useState<"api" | "apps_script" | "none">(
    "none",
  );
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const [detailPhase, setDetailPhase] = useState<DetailPhase>("idle");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedFromScan = useRef(false);

  const DETAIL_REVEAL_DELAY_MS = 320;

  async function loadCabinet() {
    const { ok, status, data } = await api<{
      drawers: DrawerView[];
      sheets: boolean;
      sheetsFresh?: boolean;
      sheetsBackend?: "api" | "apps_script" | "none";
    }>("/api/drawers");
    if (status === 401) {
      router.replace("/signin");
      return null;
    }
    if (!ok) {
      setDrawers([]);
      return [];
    }
    setDrawers(data.drawers);
    setSheets(data.sheets);
    if (data.sheetsBackend) setSheetsBackend(data.sheetsBackend);
    return data.drawers;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const first = await loadCabinet();
      if (cancelled || first === null) return;
      // If the first paint raced a cold Apps Script, silently re-pull once
      // after the background finish likely landed.
      await new Promise((r) => setTimeout(r, 2200));
      if (cancelled) return;
      await loadCabinet();
    })();
    api<{ user: { name: string } | null }>("/api/auth/me").then(({ ok, data }) => {
      if (ok && data.user?.name) setSessionName(data.user.name);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount load
  }, [router]);

  // QR / deep-link: /drawers?open=<id|shortCode> opens that drawer.
  useEffect(() => {
    if (!drawers || !openParam || openedFromScan.current) return;
    const key = openParam.trim();
    if (!key) return;

    const localIdx = drawers.findIndex((d) => d.id === key);
    if (localIdx >= 0) {
      openedFromScan.current = true;
      openDrawer(localIdx);
      router.replace("/drawers", { scroll: false });
      return;
    }

    let cancelled = false;
    void (async () => {
      const { ok, data } = await api<{ drawer: DrawerView }>(
        `/api/drawers/${encodeURIComponent(key)}`,
      );
      if (cancelled || !ok || !data.drawer) return;
      const idx = drawers.findIndex((d) => d.id === data.drawer.id);
      if (idx < 0) return;
      openedFromScan.current = true;
      openDrawer(idx);
      router.replace("/drawers", { scroll: false });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from scan
  }, [drawers, openParam]);

  const t = smartEspressoTheme;
  const accent = SMART_ACCENT;
  const rulerBg = `repeating-linear-gradient(180deg, ${t.line} 0px, ${t.line} 1.5px, transparent 1.5px, transparent 70px), repeating-linear-gradient(180deg, ${t.dot} 0px, ${t.dot} 1px, transparent 1px, transparent 14px)`;
  const dotBg = `radial-gradient(${t.dot} 1px, transparent 1.2px)`;
  const detail = detailIdx !== null && drawers ? drawers[detailIdx] : null;

  async function refreshDrawer(id: string) {
    const { ok, data } = await api<{ drawer: DrawerView }>(
      `/api/drawers/${encodeURIComponent(id)}`,
    );
    if (ok && data.drawer) {
      updateDrawer(data.drawer);
      return data.drawer;
    }
    return null;
  }

  function openDrawer(i: number) {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDetailIdx(null);
    setDetailPhase("idle");
    setOpenIdx(i);

    const current = drawers?.[i];
    if (current) {
      // Pull live Part / Quantity / Locked from the sheet into menu + detail.
      void refreshDrawer(current.id);
    }

    openTimer.current = setTimeout(() => {
      setDetailIdx(i);
      setDetailPhase("enter");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setDetailPhase("shown"));
      });
    }, DETAIL_REVEAL_DELAY_MS);
  }

  function closeDrawer() {
    if (openTimer.current) clearTimeout(openTimer.current);
    setDetailPhase("exit");
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setDetailIdx(null);
      setOpenIdx(null);
      setDetailPhase("idle");
      // Keep the cabinet menu aligned with the sheet after closing a drawer.
      void loadCabinet();
    }, 220);
  }

  function updateDrawer(next: DrawerView) {
    setDrawers((current) =>
      current?.map((drawer) => (drawer.id === next.id ? next : drawer)) ?? current,
    );
  }

  return (
    <div className="h-dvh overflow-hidden" style={{ background: t.bg }}>
      <main
        className="smart-screen"
        style={buildSmartScreenStyle(t, accent)}
      >
        <RooseveltIslandScene />

        <div className="smart-screen-body">
          <header className="smart-header">
            <div>
              <div className="smart-eyebrow">NYC FIRST</div>
              <h1>Smart Cabinet</h1>
            </div>
            {sessionName && (
              <div className="smart-session-chip" title={`Signed in as ${sessionName}`}>
                <span>Signed in</span>
                <b>{sessionName}</b>
              </div>
            )}
          </header>

          <SyncBar
            connected={sheets}
            backend={sheetsBackend}
            accent={accent}
            onRefreshed={(next) => setDrawers(next)}
            reload={loadCabinet}
          />

          {drawers === null ? (
            <div className="smart-loading" role="status">
              <span className="spin h-7 w-7 rounded-full border-2" />
              <span>Loading cabinet…</span>
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
        </div>

        {detailIdx === null && <BottomTabs accent={accent} active="drawers" />}

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

function SyncBar({
  connected,
  backend,
  accent,
  onRefreshed,
  reload,
}: {
  connected: boolean;
  backend: "api" | "apps_script" | "none";
  accent: string;
  onRefreshed: (drawers: DrawerView[]) => void;
  reload: () => Promise<DrawerView[] | null>;
}) {
  const [state, setState] = useState<"idle" | "syncing" | "ok" | "err">("idle");
  const [hint, setHint] = useState<string | null>(null);

  async function syncNow() {
    setState("syncing");
    setHint(null);
    try {
      const sync = await api<{
        ok?: boolean;
        error?: string;
        count?: number;
        parts?: string[];
        backend?: "api" | "apps_script";
      }>("/api/sheets/sync", { method: "POST" });

      const next = await reload();
      if (!next) {
        setState("err");
        setHint("Couldn’t reload drawers");
        setTimeout(() => setState("idle"), 2800);
        return;
      }
      onRefreshed(next);

      if (!sync.data?.ok) {
        setState("err");
        const err = sync.data?.error ?? "pull_failed";
        setHint(
          err === "not_configured"
            ? "Sheets env vars missing on host"
            : err === "forbidden"
              ? "Sheets SECRET mismatch — check Script Properties"
              : err === "unknown_type"
                ? "Old Apps Script — paste Code.gs + New version deploy"
                : err.startsWith("http_") || err === "fetch_failed"
                  ? "Can’t reach Apps Script — check /exec URL"
                  : err === "api_failed"
                    ? "Sheets API failed — check SA email share + keys"
                    : `Sheet pull failed (${err})`,
        );
      } else {
        setState("ok");
        const via = sync.data.backend === "api" ? "API" : "Apps Script";
        const sample = sync.data.parts?.find((p) => /wasd|3dwada/i.test(p));
        setHint(
          sample
            ? `${via} OK · ${sample}`
            : `${via} OK · ${sync.data.count ?? next.length} drawers`,
        );
      }
    } catch {
      setState("err");
      setHint("Network error");
    }
    setTimeout(() => {
      setState("idle");
      setHint(null);
    }, 3200);
  }

  const idleLabel =
    !connected
      ? "Local inventory"
      : backend === "api"
        ? "Following Google Sheet (API)"
        : "Following Google Sheet";

  return (
    <div className="smart-sync">
      <div
        className="h-2 w-2 rounded-full"
        style={{ background: connected ? "#3E8E5A" : "var(--smart-sub)" }}
      />
      <div className="min-w-0 flex-1 truncate">
        {hint ? hint : idleLabel}
      </div>
      <button onClick={syncNow} disabled={state === "syncing"} style={{ background: accent }}>
        {state === "syncing"
          ? "Loading"
          : state === "ok"
            ? "Updated"
            : state === "err"
              ? "Failed"
              : "Refresh"}
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
  const [lockWorking, setLockWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [slideX, setSlideX] = useState(0); // 0 = locked, 1 = open
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startSlide: number;
    currentSlide: number;
    dragging: boolean;
    moved: boolean;
  } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const idemKey = useRef(uuid());
  const lockIdemKey = useRef(uuid());
  const TRAVEL = 24; // thumb travel in px

  useEffect(() => {
    setMode("take");
    setQty(1);
    setWorking(false);
    setLockWorking(false);
    setError(null);
    setPhotoPreview(null);
    setSlideX(drawer?.locked === false ? 1 : 0);
    idemKey.current = uuid();
    lockIdemKey.current = uuid();
  }, [drawer?.id]);

  // Keep detail panel in sync when sheet refresh updates qty / locked / name.
  useEffect(() => {
    if (!drawer) return;
    if (mode === "take") {
      setQty((q) => Math.min(q, Math.max(drawer.quantity, 1)));
    }
  }, [drawer?.quantity, drawer?.item.name, mode, drawer]);

  useEffect(() => {
    if (lockWorking || dragRef.current?.dragging) return;
    setSlideX(drawer?.locked === false ? 1 : 0);
  }, [drawer?.locked, lockWorking]);

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
  const isOpen = slideX >= 0.5;

  async function commitLock(wantOpen: boolean) {
    if (!drawer) return;
    const currentlyOpen = !drawer.locked;
    if (wantOpen === currentlyOpen) {
      setSlideX(wantOpen ? 1 : 0);
      return;
    }

    setLockWorking(true);
    setError(null);
    setSlideX(wantOpen ? 1 : 0);

    const path = wantOpen
      ? `/api/drawers/${encodeURIComponent(drawer.id)}/unlock`
      : `/api/drawers/${encodeURIComponent(drawer.id)}/lock`;
    const { ok, status: httpStatus, data } = await api<{
      error?: string;
      drawer?: DrawerView;
      locked?: boolean;
    }>(path, {
      method: "POST",
      body: wantOpen
        ? JSON.stringify({ idempotencyKey: lockIdemKey.current })
        : JSON.stringify({}),
    });

    setLockWorking(false);
    lockIdemKey.current = uuid();

    if (ok && data.drawer) {
      onUpdated(data.drawer);
      setSlideX(data.drawer.locked ? 0 : 1);
      return;
    }
    if (httpStatus === 401) {
      window.location.href = "/signin";
      return;
    }
    // revert slide
    setSlideX(currentlyOpen ? 1 : 0);
    if (data.drawer) onUpdated(data.drawer);
    const messages: Record<string, string> = {
      drawer_busy: "This drawer is open right now. Try again shortly.",
      cooldown: "This drawer just closed. Give it a moment.",
      rate_limited: "Lock limit reached. Try again later.",
      drawer_disabled: "This drawer is disabled.",
      lock_error: "The lock did not respond. Try again.",
      not_open: "Someone else has this drawer open.",
    };
    setError(
      messages[data.error ?? ""] ??
        (wantOpen ? "Could not unlock. Try again." : "Could not lock. Try again."),
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (lockWorking || drawer?.status === "disabled") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragRef.current = {
      startX: event.clientX,
      startSlide: slideX,
      currentSlide: slideX,
      dragging: true,
      moved: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag?.dragging) return;
    const delta = (event.clientX - drag.startX) / TRAVEL;
    if (Math.abs(event.clientX - drag.startX) > 3) drag.moved = true;
    const next = Math.max(0, Math.min(1, drag.startSlide + delta));
    drag.currentSlide = next;
    setSlideX(next);
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    const start = drag.startSlide;
    const moved = drag.moved;
    const endSlide = drag.currentSlide;
    drag.dragging = false;
    dragRef.current = null;
    setDragging(false);
    if (!moved) {
      void commitLock(start < 0.5);
    } else {
      void commitLock(endSlide >= 0.5);
    }
  }

  async function confirm() {
    if (!drawer) return;
    setWorking(true);
    setError(null);
    const { ok, status: httpStatus, data } = await api<
      TxResult & { error?: string; drawer?: DrawerView }
    >(`/api/drawers/${encodeURIComponent(drawer.id)}/transaction`, {
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
      rate_limited: "Limit reached. Try again later.",
      drawer_disabled: "This drawer is disabled.",
    };
    setError(messages[data.error ?? ""] ?? "Could not record that. Try again.");
  }

  function handleDrop(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setPhotoPreview(URL.createObjectURL(file));
  }

  if (!drawer || index === null) return null;

  return (
    <div
      className="smart-detail-overlay"
      style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? "auto" : "none" }}
    >
      <div className="smart-detail-backdrop" onClick={onClose} aria-hidden />
      <div
        className="smart-detail"
        style={{
          background: t.bg,
          color: t.ink,
          transform: shown ? "scale(1)" : "scale(0.96) translateY(12px)",
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

      <div className="smart-detail-body">
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
          <div className="smart-detail-copy-main">
            <h2>{drawer.item.name}</h2>
            <div>
              <b style={{ color: countColor }}>{drawer.quantity}</b>
              <span>{pluralUnit(drawer.item.unit, drawer.quantity)} in stock</span>
            </div>
          </div>
          <div className="smart-lock-switch">
            <div
              ref={trackRef}
              role="switch"
              tabIndex={lockWorking || drawer.status === "disabled" ? -1 : 0}
              aria-checked={isOpen}
              aria-label={isOpen ? "Lock drawer" : "Unlock drawer"}
              className={isOpen ? "smart-lock-track is-open" : "smart-lock-track is-locked"}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void commitLock(!isOpen);
                }
              }}
              style={{
                opacity: lockWorking || drawer.status === "disabled" ? 0.5 : 1,
                touchAction: "none",
              }}
            >
              <span
                className="smart-lock-thumb"
                aria-hidden
                style={{
                  transform: `translateX(${slideX * TRAVEL}px)`,
                  transition: dragging ? "none" : "transform 180ms ease",
                }}
              />
            </div>
            <span className="smart-lock-caption">
              {lockWorking ? "…" : isOpen ? "Open" : "Locked"}
            </span>
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
      </div>

      <div className="smart-detail-actions">
        <button
          type="button"
          className="smart-cta w-full"
          onClick={confirm}
          disabled={working || drawer.status === "disabled" || (mode === "take" && drawer.quantity === 0)}
          style={{ background: accent }}
        >
          {working
            ? "Saving…"
            : mode === "take"
              ? `Take ${clampedQty}`
              : `Return ${clampedQty}`}
        </button>
      </div>
    </div>
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
