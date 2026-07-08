import crypto from "node:crypto";
import { audit } from "./store";

// ---------------------------------------------------------------------------
// Simulated lock controller (ESP32/RPi-class device, PRD §B.3–B.4).
//
// In production the backend issues a single-use, short-TTL unlock command over
// a mutually-authenticated channel (MQTT/TLS or device-cert HTTPS); the token
// never passes through the browser. Here we simulate that handshake in-process:
// a signed command with a monotonic nonce that the "device" verifies and will
// reject on replay.
// ---------------------------------------------------------------------------

const DEVICE_SECRET = "demo-device-shared-secret"; // secrets-manager in prod
const seenNonces = new Set<string>();
let counter = 0;

export interface UnlockCommand {
  drawerId: string;
  nonce: string;
  counter: number;
  expiresAt: number;
  sig: string;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", DEVICE_SECRET).update(payload).digest("hex");
}

export function issueUnlockCommand(drawerId: string): UnlockCommand {
  const nonce = crypto.randomBytes(12).toString("hex");
  const c = ++counter;
  const expiresAt = Date.now() + 60_000; // ≤ 60s TTL (PRD §B.3)
  const sig = sign(`${drawerId}.${nonce}.${c}.${expiresAt}`);
  return { drawerId, nonce, counter: c, expiresAt, sig };
}

// The "device" side. Returns whether the latch physically opened.
export function deviceOpen(cmd: UnlockCommand): {
  opened: boolean;
  reason?: string;
} {
  const expected = sign(
    `${cmd.drawerId}.${cmd.nonce}.${cmd.counter}.${cmd.expiresAt}`,
  );
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cmd.sig))) {
    return { opened: false, reason: "bad-signature" };
  }
  if (cmd.expiresAt < Date.now()) return { opened: false, reason: "expired" };
  if (seenNonces.has(cmd.nonce)) {
    // Replay of a captured command — rejected (PRD §B.4).
    audit({
      type: "lock.replay_rejected",
      drawerId: cmd.drawerId,
      detail: cmd.nonce,
    });
    return { opened: false, reason: "replay" };
  }
  seenNonces.add(cmd.nonce);
  return { opened: true };
}
