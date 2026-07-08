# Repo constitution — QR Smart Cabinet

Hard rules for anyone (human or AI) editing this repo. These come straight from
the PRD (§5, §6.5) and are non-negotiable.

## Security invariants — never violate
- **Never trust client-reported quantities or balances.** The server is the sole
  source of truth for stock. Re-validate every quantity server-side.
- **Ledger is append-only.** Never update or delete a `Transaction`. Corrections
  are new compensating entries.
- **Deny-by-default authz.** Every drawer resource is gated by an object-level
  permission check (`canAccessDrawer`). Missing-vs-forbidden both return 404 — no
  information leak.
- **Never add admin routes/components/API clients to this app.** Admin lives in a
  separate, network-isolated console (PRD §5.3). This bundle ships zero admin code.
- **Never bypass the rate limiter "temporarily."** All limits enforced server-side
  (see `src/lib/security.ts`).
- **Idempotency keys are required** on unlock/transaction mutations so retries can't
  double-decrement or double-fire the lock.
- **No secrets in code or the client bundle.** Use a secrets manager in production.
- **No tokens in localStorage.** Session lives in an HttpOnly/Secure/SameSite=Strict
  cookie only.
- **Unlock is server-authoritative.** The lock command never passes through the
  client; commands are single-use, signed, ≤60s TTL, replay-rejected.

## Architecture notes
- `src/lib/store.ts` is an in-memory stand-in for PostgreSQL (ledger/stock) + Redis
  (sessions/rate limits). Replace with a real DB layer for production; keep the same
  invariants (atomic stock mutation + ledger write, optimistic versioning).
- `src/lib/lock.ts` simulates the ESP32/RPi controller handshake in-process.
- Auth here uses the OTP fallback path; production primary is passkeys/WebAuthn.

## Ordered checks in the unlock path (do not reorder)
valid session → drawer permission → drawer enabled → one-open-session/cooldown →
optimistic version → quantity within stock → issue single-use lock command →
atomic stock mutation + append ledger → schedule auto-relock.
