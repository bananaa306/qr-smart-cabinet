// Core entities — mirrors PRD §C.1 data model.

export type UserId = string;
export type DrawerId = string;

export interface User {
  id: UserId;
  email: string;
  name: string;
  // Demo auth only. Production uses passkeys/WebAuthn (PRD §5.2). No passwords
  // stored — OTP is generated per sign-in attempt.
}

export interface Item {
  id: string;
  name: string;
  unit: string;
  photo: string;
  minStock: number;
}

export interface Drawer {
  id: DrawerId; // opaque 128-bit id (PRD §B.1)
  shortCode: string; // printed under the QR for manual fallback
  cabinet: string;
  label: string;
  location: string;
  status: "active" | "disabled";
  itemId: string;
}

export interface StockLevel {
  drawerId: DrawerId;
  itemId: string;
  quantity: number;
  version: number; // optimistic concurrency (PRD §C.2)
}

export type Intent = "take" | "return";

// Append-only ledger entry (PRD §C.1) — never mutated or deleted.
export interface Transaction {
  id: string;
  userId: UserId;
  drawerId: DrawerId;
  itemId: string;
  delta: number; // ±n
  balanceAfter: number;
  intent: Intent;
  unlockSessionId: string;
  createdAt: number;
  flagged?: boolean;
  flagReason?: string;
}

export type UnlockOutcome =
  | "granted"
  | "opened"
  | "closed"
  | "expired"
  | "denied";

export interface UnlockSession {
  id: string;
  userId: UserId;
  drawerId: DrawerId;
  requestedAt: number;
  grantedAt?: number;
  openedAt?: number;
  closedAt?: number;
  expiresAt: number;
  outcome: UnlockOutcome;
  quantity: number;
  intent: Intent;
}

export interface AuditEvent {
  id: string;
  at: number;
  type: string;
  userId?: UserId;
  drawerId?: DrawerId;
  ip?: string;
  detail?: string;
}
