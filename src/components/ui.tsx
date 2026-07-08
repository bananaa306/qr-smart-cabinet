"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Small shared UI kit. Touch targets ≥ 44px, tinted neutrals, no bounce easing
// (PRD §A.1 / §A.3).

export function AppBar({
  title,
  back,
  right,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-2 backdrop-blur">
      {back ? (
        <Link
          href={back}
          aria-label="Back"
          className="grid h-11 w-11 place-items-center rounded-xl text-ink-soft hover:bg-surface-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : (
        <span className="w-11" />
      )}
      <h1 className="flex-1 truncate text-center text-base font-semibold text-ink">
        {title}
      </h1>
      <div className="flex w-11 items-center justify-end">{right}</div>
    </header>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  full = true,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
}) {
  const base =
    "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<string, string> = {
    primary: "bg-brand text-white hover:brightness-95 active:brightness-90",
    secondary: "bg-surface-2 text-ink hover:bg-border/60",
    ghost: "text-ink-soft hover:bg-surface-2",
    danger: "bg-danger text-white hover:brightness-95",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-ink-mute">
      <span className="spin h-7 w-7 rounded-full border-2 border-border border-t-brand" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warn" | "danger";
  title?: string;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    info: "bg-brand-soft text-brand-ink",
    success: "bg-success-soft text-success",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm ${tones[tone]}`} role="status">
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
    </div>
  );
}

export function BottomNav({ active }: { active: "scan" | "activity" }) {
  const router = useRouter();
  const item = (
    key: "scan" | "activity",
    href: string,
    label: string,
    icon: React.ReactNode,
  ) => (
    <button
      onClick={() => router.push(href)}
      className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-xs font-medium ${
        active === key ? "text-brand" : "text-ink-mute"
      }`}
      aria-current={active === key ? "page" : undefined}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <nav className="sticky bottom-0 z-10 flex border-t border-border bg-surface/95 backdrop-blur">
      {item(
        "scan",
        "/scan",
        "Scan",
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>,
      )}
      {item(
        "activity",
        "/activity",
        "My activity",
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 12h4l2 5 4-12 2 7h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>,
      )}
    </nav>
  );
}
