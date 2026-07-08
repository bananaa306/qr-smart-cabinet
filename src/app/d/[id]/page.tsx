"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppBar, Button, Callout, Spinner } from "@/components/ui";
import { api, uuid } from "@/lib/client";
import type { DrawerView } from "@/lib/dto";

type Intent = "take" | "return";
type Phase = "loading" | "view" | "unlocking" | "open" | "done" | "gone";

interface UnlockResult {
  transaction: { id: string; delta: number; intent: Intent; balanceAfter: number; createdAt: number };
  drawer: DrawerView;
  relockAt: number;
  relockSeconds: number;
}

export default function DrawerPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [drawer, setDrawer] = useState<DrawerView | null>(null);
  const [intent, setIntent] = useState<Intent>("take");
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<UnlockResult | null>(null);
  const [remaining, setRemaining] = useState(0);
  const idemKey = useRef<string>(uuid());

  const load = useCallback(async () => {
    const { ok, status, data } = await api<{ drawer: DrawerView }>(
      `/api/drawers/${encodeURIComponent(id)}`,
    );
    if (status === 401) return router.replace("/signin");
    if (!ok) {
      setPhase("gone");
      return;
    }
    setDrawer(data.drawer);
    setQty(data.drawer.item ? Math.min(1, Math.max(data.drawer.quantity, 0)) || 1 : 1);
    setPhase("view");
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Countdown while the drawer is physically open.
  useEffect(() => {
    if (phase !== "open" || !result) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((result.relockAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setPhase("done");
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [phase, result]);

  const maxQty = drawer
    ? intent === "take"
      ? Math.max(1, drawer.quantity)
      : 99
    : 1;
  const clampedQty = Math.min(Math.max(qty, 1), maxQty);

  async function unlock() {
    if (!drawer) return;
    setPhase("unlocking");
    setError(null);
    const { ok, status, data } = await api<UnlockResult & { error?: string; drawer?: DrawerView }>(
      `/api/drawers/${encodeURIComponent(id)}/unlock`,
      {
        method: "POST",
        body: JSON.stringify({
          quantity: clampedQty,
          intent,
          idempotencyKey: idemKey.current,
          stockVersion: drawer.stockVersion,
        }),
      },
    );

    if (ok) {
      setResult(data);
      setDrawer(data.drawer);
      setPhase("open");
      return;
    }

    // Fresh idempotency key for the next distinct attempt.
    idemKey.current = uuid();
    setPhase("view");
    if (status === 401) return router.replace("/signin");
    if (data.drawer) setDrawer(data.drawer);
    const messages: Record<string, string> = {
      stock_changed: "Stock changed while you were deciding. Re-check the count and confirm.",
      insufficient_stock: "Not enough in the drawer for that quantity.",
      drawer_busy: "Someone else has this drawer open right now. Try again shortly.",
      cooldown: "This drawer just closed — give it a moment before reopening.",
      rate_limited: "You’ve hit the unlock limit for now. Try again later.",
      drawer_disabled: "This drawer is disabled.",
      lock_error: "The lock didn’t respond. Nothing was taken — please retry.",
    };
    setError(messages[data.error ?? ""] ?? "Couldn’t unlock. Please try again.");
  }

  async function lockNow() {
    await api(`/api/drawers/${encodeURIComponent(id)}/lock`, { method: "POST" });
    setPhase("done");
  }

  // ---- render ----
  if (phase === "loading") {
    return (
      <>
        <AppBar title="Drawer" back="/scan" />
        <Spinner label="Checking your access…" />
      </>
    );
  }

  if (phase === "gone") {
    return (
      <>
        <AppBar title="Drawer" back="/scan" />
        <main className="flex flex-1 flex-col justify-center gap-4 px-6">
          <Callout tone="danger" title="Drawer not available">
            This code doesn’t match a drawer you’re permitted to open. If you
            believe that’s wrong, contact your administrator.
          </Callout>
          <Button onClick={() => router.replace("/scan")}>Back to scan</Button>
        </main>
      </>
    );
  }

  if (!drawer) return null;

  if (phase === "open" && result) {
    const pct = Math.max(0, Math.min(1, remaining / result.relockSeconds));
    return (
      <>
        <AppBar title="Drawer open" />
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
          <div className="relative grid h-44 w-44 place-items-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke="var(--success)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - pct)}
                style={{ transition: "stroke-dashoffset 250ms linear" }}
              />
            </svg>
            <div>
              <div className="text-5xl font-bold text-success tabular-nums">{remaining}</div>
              <div className="text-xs font-medium uppercase tracking-wide text-ink-mute">seconds</div>
            </div>
          </div>

          <div>
            <p className="text-lg font-semibold text-success">Unlocked — go ahead</p>
            <p className="mt-1 text-sm text-ink-soft">
              {intent === "take" ? "Taking" : "Returning"}{" "}
              <span className="font-semibold text-ink">{result.transaction.delta > 0 ? "+" : ""}{result.transaction.delta}</span>{" "}
              {drawer.item.unit}
              {Math.abs(result.transaction.delta) !== 1 ? "s" : ""} · {drawer.item.name}
            </p>
            <p className="mt-1 text-sm text-ink-mute">Auto-relocks when the timer ends.</p>
          </div>

          <div className="w-full">
            <Button variant="primary" onClick={lockNow}>Done — lock now</Button>
          </div>
        </main>
      </>
    );
  }

  if (phase === "done" && result) {
    const took = result.transaction.intent === "take";
    return (
      <>
        <AppBar title="Confirmation" />
        <main className="flex flex-1 flex-col gap-6 px-6 py-8">
          <div className="flex flex-col items-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-3 text-xl font-bold">Locked & recorded</h2>
            <p className="mt-1 text-sm text-ink-mute">
              {new Date(result.transaction.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-5">
            <Row label={took ? "Items taken" : "Items returned"} value={`${Math.abs(result.transaction.delta)} × ${drawer.item.name}`} />
            <Divider />
            <Row label="Drawer" value={`${drawer.cabinet} · ${drawer.label}`} />
            <Divider />
            <Row label="New drawer count" value={`${result.transaction.balanceAfter} ${drawer.item.unit}${result.transaction.balanceAfter === 1 ? "" : "s"}`} />
            <Divider />
            <Row label="Reference" value={result.transaction.id.slice(0, 8)} mono />
          </div>

          <div className="mt-auto flex flex-col gap-3">
            <Button onClick={() => router.replace("/scan")}>Scan another drawer</Button>
            <Button variant="secondary" onClick={() => router.replace("/activity")}>
              View my activity
            </Button>
          </div>
        </main>
      </>
    );
  }

  // ---- default: drawer view (screen 3) ----
  const disabled = drawer.status === "disabled";
  const empty = drawer.quantity === 0;
  const lowStock = drawer.quantity > 0 && drawer.quantity <= 5;

  return (
    <>
      <AppBar title={`${drawer.cabinet} · ${drawer.label}`} back="/scan" />
      <main className="flex flex-1 flex-col gap-5 px-5 py-5">
        <div className="flex items-center gap-2 text-sm text-ink-mute">
          <LockBadge locked={drawer.locked} />
          <span>{drawer.location}</span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={drawer.item.photo}
            alt={drawer.item.name}
            className="h-44 w-full bg-surface-2 object-cover"
          />
          <div className="p-5">
            <h2 className="text-lg font-semibold">{drawer.item.name}</h2>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">{drawer.quantity}</span>
              <span className="text-sm text-ink-mute">
                {drawer.item.unit}
                {drawer.quantity === 1 ? "" : "s"} in stock
              </span>
            </div>
            {lowStock && <p className="mt-1 text-sm font-medium text-warn">Low stock</p>}
          </div>
        </div>

        {disabled ? (
          <Callout tone="warn" title="Drawer disabled">
            This drawer is currently out of service and can’t be opened.
          </Callout>
        ) : empty && intent === "take" ? (
          <Callout tone="info" title="Drawer is empty">
            Nothing to take. You can still return items.
          </Callout>
        ) : null}

        {error && <Callout tone="danger">{error}</Callout>}
        {notice && <Callout tone="info">{notice}</Callout>}

        {/* Intent toggle */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1">
          {(["take", "return"] as Intent[]).map((it) => (
            <button
              key={it}
              onClick={() => {
                setIntent(it);
                setQty(1);
                setError(null);
                setNotice(it === "return" ? "Returning adds items back to the drawer." : null);
              }}
              className={`min-h-[44px] rounded-xl text-sm font-semibold capitalize transition-colors ${
                intent === it ? "bg-surface text-ink shadow-sm" : "text-ink-mute"
              }`}
            >
              {it}
            </button>
          ))}
        </div>

        {/* Quantity stepper — clamped client-side, re-validated server-side */}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-3">
          <StepBtn label="Decrease" disabled={clampedQty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</StepBtn>
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums">{clampedQty}</div>
            <div className="text-xs text-ink-mute">
              max {maxQty} {drawer.item.unit}
              {maxQty === 1 ? "" : "s"}
            </div>
          </div>
          <StepBtn label="Increase" disabled={clampedQty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</StepBtn>
        </div>

        <div className="mt-auto">
          <Button
            onClick={unlock}
            disabled={disabled || phase === "unlocking" || (intent === "take" && empty)}
            variant={intent === "take" ? "primary" : "secondary"}
          >
            {phase === "unlocking" ? (
              <>
                <span className="spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
                Unlocking…
              </>
            ) : intent === "take" ? (
              `Unlock & take ${clampedQty}`
            ) : (
              `Unlock & return ${clampedQty}`
            )}
          </Button>
        </div>
      </main>
    </>
  );
}

function StepBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-2xl font-bold text-ink hover:bg-border/60 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function LockBadge({ locked }: { locked: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        locked ? "bg-surface-2 text-ink-soft" : "bg-success-soft text-success"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${locked ? "bg-ink-mute" : "bg-success"}`} />
      {locked ? "Locked" : "Open"}
    </span>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-ink-mute">{label}</span>
      <span className={`text-sm font-semibold text-ink ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-border" />;
}
