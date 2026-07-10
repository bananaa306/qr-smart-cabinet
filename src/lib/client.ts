// Thin client-side fetch wrapper. All requests are same-origin and rely on the
// HttpOnly session cookie — no tokens ever touch JS-readable storage (PRD §5.2).

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "same-origin",
    // Never let the browser replay a cached auth/session response (would strand
    // the app in a sign-in loop after logging in).
    cache: "no-store",
  });
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = {} as T;
  }
  return { ok: res.ok, status: res.status, data };
}

// UUID for idempotency keys (PRD §5.2).
export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
