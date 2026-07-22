/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    // Security headers per PRD §5.2 (transport & headers).
    // Next.js dev (Fast Refresh / HMR) evaluates code with eval(), so the
    // browser needs 'unsafe-eval' to run any client JS in development. The
    // production bundle never uses eval, so the strict policy holds there.
    const scriptSrc = isProd
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.unsplash.com https://drive.google.com https://*.googleusercontent.com https://lh3.googleusercontent.com",
      isProd ? "connect-src 'self'" : "connect-src 'self' ws: wss: http: https:",
      isProd ? "frame-ancestors 'none'" : "frame-ancestors *",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    const headers = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
    ];
    if (isProd) {
      headers.push({ key: "X-Frame-Options", value: "DENY" });
    }
    // HSTS forces https for the whole host for 2 years and is browser-cached.
    // On http://localhost that permanently breaks local dev, so only send it
    // in production (which is served over HTTPS). PRD §5.2 invariant holds there.
    if (isProd) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
