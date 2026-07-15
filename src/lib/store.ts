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
  /** Per-visit tracker id shown in Sheet2 alongside the user's name. */
  trackerSessionId?: string;
  displayName?: string;
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

  // Photos reuse a handful of known-good Unsplash URLs (allowed by the CSP
  // img-src) so nothing renders broken.
  const PHOTO = {
    cable: "https://images.unsplash.com/photo-1601737487795-dab272f52420?w=400&q=60",
    tool: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&q=60",
    glove: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&q=60",
    battery: "https://images.unsplash.com/photo-1619641805634-b0ba0dd5f4d5?w=400&q=60",
  };

  const items: Item[] = [
    { id: "it_cat6_1m", name: "Cat6 Patch Cable 1m", unit: "cable", minStock: 15, photo: PHOTO.cable },
    { id: "it_cat6_3m", name: "Cat6 Patch Cable 3m", unit: "cable", minStock: 15, photo: PHOTO.cable },
    { id: "it_hdmi", name: "HDMI Cable 2m", unit: "cable", minStock: 10, photo: PHOTO.cable },
    { id: "it_usbc", name: "USB-C Cable 1m", unit: "cable", minStock: 12, photo: PHOTO.cable },
    { id: "it_power", name: "Power Extension Lead", unit: "lead", minStock: 5, photo: PHOTO.battery },
    { id: "it_fiber", name: "Fiber Patch Cable LC", unit: "cable", minStock: 8, photo: PHOTO.cable },
    { id: "it_ties", name: "Cable Ties (100 pk)", unit: "pack", minStock: 6, photo: PHOTO.tool },
    { id: "it_velcro", name: "Velcro Cable Straps", unit: "strap", minStock: 10, photo: PHOTO.glove },
    { id: "it_rj45", name: "RJ45 Connectors", unit: "connector", minStock: 25, photo: PHOTO.tool },
  ];
  items.forEach((i) => db.items.set(i.id, i));

  // Nine drawers in one cabinet — a 3×3 grid on the main menu. Fixed opaque ids
  // + friendly short codes so the demo is reproducible. One drawer is left low,
  // one empty, and one disabled to exercise every card state.
  const drawerSeed: Array<
    Pick<Drawer, "id" | "shortCode" | "label" | "itemId" | "status"> & { qty: number }
  > = [
    { id: "a1c0de00000000000000000000000001", shortCode: "A1-7Q4", label: "Drawer 1", itemId: "it_cat6_1m", status: "active", qty: 64 },
    { id: "a1c0de00000000000000000000000002", shortCode: "A2-3K9", label: "Drawer 2", itemId: "it_cat6_3m", status: "active", qty: 30 },
    { id: "a1c0de00000000000000000000000003", shortCode: "A3-8M2", label: "Drawer 3", itemId: "it_hdmi", status: "active", qty: 12 },
    { id: "a1c0de00000000000000000000000004", shortCode: "A4-0X5", label: "Drawer 4", itemId: "it_usbc", status: "active", qty: 45 },
    { id: "a1c0de00000000000000000000000005", shortCode: "A5-2R1", label: "Drawer 5", itemId: "it_power", status: "active", qty: 8 },
    { id: "a1c0de00000000000000000000000006", shortCode: "A6-5T7", label: "Drawer 6", itemId: "it_fiber", status: "active", qty: 22 },
    { id: "a1c0de00000000000000000000000007", shortCode: "A7-9W3", label: "Drawer 7", itemId: "it_ties", status: "active", qty: 3 },
    { id: "a1c0de00000000000000000000000008", shortCode: "A8-1Y6", label: "Drawer 8", itemId: "it_velcro", status: "active", qty: 40 },
    { id: "a1c0de00000000000000000000000009", shortCode: "A9-4Z8", label: "Drawer 9", itemId: "it_rj45", status: "disabled", qty: 0 },
  ];
  const drawers: Array<Drawer & { qty: number }> = drawerSeed.map((d) => ({
    ...d,
    cabinet: "Cabinet A",
    location: "Workshop · North wall",
  }));

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

  // Permissions (deny-by-default). Alex (demo user): all nine. Sam: first four.
  db.permissions.set("u_alex", new Set(drawers.map((d) => d.id)));
  db.permissions.set("u_sam", new Set(drawers.slice(0, 4).map((d) => d.id)));
}
