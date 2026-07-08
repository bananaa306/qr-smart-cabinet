import crypto from "node:crypto";
import type {
  AuditEvent,
  Drawer,
  Item,
  StockLevel,
  Transaction,
  UnlockSession,
  User,
} from "./types";

// ---------------------------------------------------------------------------
// In-memory data store. Stands in for PostgreSQL (source of truth) + Redis
// (sessions/rate limits) from the reference architecture (PRD §7). Attached to
// globalThis so it survives Next.js dev hot-reloads and is shared across route
// module instances. Swap this module for a real DB layer in production.
// ---------------------------------------------------------------------------

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface OtpChallenge {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

export interface Bucket {
  count: number;
  resetAt: number;
}

interface DB {
  users: Map<string, User>;
  items: Map<string, Item>;
  drawers: Map<string, Drawer>;
  drawersByShortCode: Map<string, string>;
  stock: Map<string, StockLevel>; // key: drawerId
  // deny-by-default permission table (PRD §5.2): userId -> set of drawerIds
  permissions: Map<string, Set<string>>;
  transactions: Transaction[]; // append-only ledger
  unlockSessions: Map<string, UnlockSession>;
  openDrawer: Map<string, string>; // drawerId -> unlockSessionId (one at a time)
  drawerCooldown: Map<string, number>; // drawerId -> earliest next-open ts
  sessions: Map<string, Session>;
  otps: Map<string, OtpChallenge>; // key: email
  rateBuckets: Map<string, Bucket>;
  idempotency: Map<string, unknown>; // key: userId:idempotencyKey
  audit: AuditEvent[];
  seeded: boolean;
}

function freshDB(): DB {
  return {
    users: new Map(),
    items: new Map(),
    drawers: new Map(),
    drawersByShortCode: new Map(),
    stock: new Map(),
    permissions: new Map(),
    transactions: [],
    unlockSessions: new Map(),
    openDrawer: new Map(),
    drawerCooldown: new Map(),
    sessions: new Map(),
    otps: new Map(),
    rateBuckets: new Map(),
    idempotency: new Map(),
    audit: [],
    seeded: false,
  };
}

const g = globalThis as unknown as { __cabinetDB?: DB };
export const db: DB = g.__cabinetDB ?? (g.__cabinetDB = freshDB());

export const id = () => crypto.randomUUID();
// opaque 128-bit drawer id, url-safe (PRD §B.1)
export const opaqueId = () => crypto.randomBytes(16).toString("hex");

export function audit(e: Omit<AuditEvent, "id" | "at">) {
  db.audit.push({ id: id(), at: Date.now(), ...e });
  if (db.audit.length > 500) db.audit.splice(0, db.audit.length - 500);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
export function seed() {
  if (db.seeded) return;
  db.seeded = true;

  const users: User[] = [
    { id: "u_alex", email: "alex@example.com", name: "Alex Rivera" },
    { id: "u_sam", email: "sam@example.com", name: "Sam Okafor" },
  ];
  users.forEach((u) => db.users.set(u.id, u));

  const items: Item[] = [
    {
      id: "it_gloves",
      name: "Nitrile Gloves (M)",
      unit: "pair",
      minStock: 20,
      photo:
        "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&q=60",
    },
    {
      id: "it_drill",
      name: "Cordless Drill Bit Set",
      unit: "set",
      minStock: 3,
      photo:
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&q=60",
    },
    {
      id: "it_cable",
      name: "Cat6 Patch Cable 1m",
      unit: "cable",
      minStock: 15,
      photo:
        "https://images.unsplash.com/photo-1601737487795-dab272f52420?w=400&q=60",
    },
    {
      id: "it_battery",
      name: "AA Batteries",
      unit: "cell",
      minStock: 40,
      photo:
        "https://images.unsplash.com/photo-1619641805634-b0ba0dd5f4d5?w=400&q=60",
    },
  ];
  items.forEach((i) => db.items.set(i.id, i));

  // Fixed opaque ids + friendly short codes so the demo is reproducible.
  const drawers: Array<Drawer & { qty: number }> = [
    {
      id: "9f3ka1b2c3d4e5f60718293a4b5c6d7e",
      shortCode: "A1-7Q4",
      cabinet: "Cabinet A",
      label: "Drawer 1",
      location: "Workshop · North wall",
      status: "active",
      itemId: "it_gloves",
      qty: 64,
    },
    {
      id: "7b2c9d0e1f2a3b4c5d6e7f8091a2b3c4",
      shortCode: "A2-3K9",
      cabinet: "Cabinet A",
      label: "Drawer 2",
      location: "Workshop · North wall",
      status: "active",
      itemId: "it_drill",
      qty: 6,
    },
    {
      id: "3c4d5e6f70819a2b3c4d5e6f70819a2b",
      shortCode: "B1-8M2",
      cabinet: "Cabinet B",
      label: "Drawer 1",
      location: "Server room · Rack 4",
      status: "active",
      itemId: "it_cable",
      qty: 22,
    },
    {
      id: "1a2b3c4d5e6f708192a3b4c5d6e7f809",
      shortCode: "B2-0X5",
      cabinet: "Cabinet B",
      label: "Drawer 2",
      location: "Server room · Rack 4",
      status: "disabled",
      itemId: "it_battery",
      qty: 0,
    },
  ];

  drawers.forEach(({ qty, ...d }) => {
    db.drawers.set(d.id, d);
    db.drawersByShortCode.set(d.shortCode.toUpperCase(), d.id);
    db.stock.set(d.id, {
      drawerId: d.id,
      itemId: d.itemId,
      quantity: qty,
      version: 1,
    });
  });

  // Permissions (deny-by-default). Alex: all four. Sam: only Cabinet A.
  db.permissions.set(
    "u_alex",
    new Set(drawers.map((d) => d.id)),
  );
  db.permissions.set(
    "u_sam",
    new Set([drawers[0].id, drawers[1].id]),
  );
}
