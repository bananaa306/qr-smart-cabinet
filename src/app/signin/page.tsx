"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout } from "@/components/ui";
import { api } from "@/lib/client";

// Screen 1 — Sign-in (PRD §A.2). Passkeys/WebAuthn are the production primary;
// this demo implements the OTP fallback path end-to-end. No self-registration.

export default function SignIn() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, status, data } = await api<{ devCode?: string }>(
      "/api/auth/request-otp",
      { method: "POST", body: JSON.stringify({ email }) },
    );
    setBusy(false);
    if (status === 429) return setError("Too many attempts. Try again later.");
    if (!ok) return setError("Enter a valid email address.");
    setDevCode(data.devCode ?? null);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, status } = await api("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    setBusy(false);
    if (status === 429) return setError("Too many attempts. Try again later.");
    if (!ok) return setError("That code isn't right. Check and re-enter.");
    router.replace("/scan");
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-8 px-6 py-10">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Smart Cabinet</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Scan · unlock · take — every movement tracked.
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={requestOtp} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-ink-soft">
            Work email
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 min-h-[48px] w-full rounded-2xl border border-border bg-surface px-4 text-base outline-none focus:border-brand"
            />
          </label>
          {error && <Callout tone="danger">{error}</Callout>}
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Continue"}
          </Button>

          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-mute">
              Demo accounts — tap to fill
            </p>
            <div className="flex flex-col gap-2">
              {[
                { email: "alex@example.com", note: "all drawers" },
                { email: "sam@example.com", note: "Cabinet A only" },
              ].map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setError(null);
                  }}
                  className="flex min-h-[44px] items-center justify-between rounded-xl border border-border bg-surface px-3 text-left text-sm hover:border-brand"
                >
                  <span className="font-mono text-ink">{a.email}</span>
                  <span className="text-xs text-ink-mute">{a.note}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-ink-mute">
            No sign-up here — accounts are provisioned by an administrator.
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4">
          {devCode && (
            <Callout tone="info" title="Demo one-time code">
              Your code is <span className="font-mono font-bold">{devCode}</span>.
              In production this is sent to your device, not shown here.
            </Callout>
          )}
          <label className="text-sm font-medium text-ink-soft">
            6-digit code sent to {email}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="mt-1.5 min-h-[48px] w-full rounded-2xl border border-border bg-surface px-4 text-center text-2xl tracking-[0.4em] outline-none focus:border-brand"
            />
          </label>
          {error && <Callout tone="danger">{error}</Callout>}
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Sign in"}
          </Button>
          <Button variant="ghost" onClick={() => setStep("email")}>
            Use a different email
          </Button>
        </form>
      )}
    </main>
  );
}
