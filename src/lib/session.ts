import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, id } from "./store";
import type { User } from "./types";

// Short-lived opaque session token in an HttpOnly/Secure/SameSite=Strict cookie
// (PRD §5.2). Real deployments would use rotating JWT + refresh tokens; the
// server-side session table here gives the same "no tokens in JS-readable
// storage / server can revoke" property.

export const SESSION_COOKIE = "cab_session";
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min (PRD §5.2)

export function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.sessions.set(token, {
    token,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  return { token, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export function destroySession(token: string | undefined) {
  if (token) db.sessions.delete(token);
}

export function resolveUser(token: string | undefined): User | null {
  if (!token) return null;
  const s = db.sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    db.sessions.delete(token);
    return null;
  }
  // sliding expiry
  s.expiresAt = Date.now() + SESSION_TTL_MS;
  return db.users.get(s.userId) ?? null;
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return resolveUser(jar.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(token: string, maxAge: number) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    // Secure in production only. Over plain http:// to a LAN IP (e.g. testing
    // on a phone via http://192.168.x.x:3000) a browser silently drops a
    // Secure cookie, breaking the session and looping back to sign-in.
    // Production runs on HTTPS, so the Secure-cookie invariant still holds there.
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export const _internal = { id };
