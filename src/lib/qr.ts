// Client-side validation of a decoded QR value (PRD §B.2 step 2).
// A scanned code grants nothing — it only identifies a drawer. We accept ONLY:
//   • an allowlisted-domain URL of the form https://<host>/d/<id>
//   • a same-origin relative path /d/<id>
//   • a bare printed short code (manual fallback)
// Any foreign URL is rejected and never navigated to.

const ALLOWED_HOSTS = new Set(["app.example.com"]);

export function allowedHosts(): Set<string> {
  const hosts = new Set(ALLOWED_HOSTS);
  if (typeof location !== "undefined") hosts.add(location.host);
  return hosts;
}

const ID_RE = /^[a-f0-9]{32}$/i;
const SHORTCODE_RE = /^[A-Z0-9]{2}-[A-Z0-9]{3}$/i;

export function parseScanned(raw: string): { id: string } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: "Empty code." };

  // Bare short code
  if (SHORTCODE_RE.test(value)) return { id: value.toUpperCase() };
  // Bare opaque id
  if (ID_RE.test(value)) return { id: value.toLowerCase() };

  let url: URL;
  try {
    url = new URL(value, typeof location !== "undefined" ? location.origin : "https://app.example.com");
  } catch {
    return { error: "Not a recognized cabinet code." };
  }

  if (!allowedHosts().has(url.host)) {
    return { error: `Rejected: "${url.host}" is not an approved cabinet domain.` };
  }
  const m = url.pathname.match(/^\/d\/([^/]+)\/?$/);
  if (!m) return { error: "Not a cabinet drawer link." };

  const candidate = decodeURIComponent(m[1]);
  if (ID_RE.test(candidate)) return { id: candidate.toLowerCase() };
  if (SHORTCODE_RE.test(candidate)) return { id: candidate.toUpperCase() };
  return { error: "Malformed drawer identifier." };
}
