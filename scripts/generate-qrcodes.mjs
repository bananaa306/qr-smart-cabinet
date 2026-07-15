/**
 * Generate printable QR codes for all 9 cabinet drawers.
 *
 * Usage:
 *   npm run qr:generate
 *   APP_URL=https://your-host.example.com npm run qr:generate
 *
 * Output: public/qrcodes/drawer-1.png … drawer-9.png + print sheet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRAWERS = [
  { n: 1, shortCode: "A1-7Q4", label: "Drawer 1", item: "Cat6 Patch Cable 1m" },
  { n: 2, shortCode: "A2-3K9", label: "Drawer 2", item: "Cat6 Patch Cable 3m" },
  { n: 3, shortCode: "A3-8M2", label: "Drawer 3", item: "HDMI Cable" },
  { n: 4, shortCode: "A4-0X5", label: "Drawer 4", item: "USB-C Cable" },
  { n: 5, shortCode: "A5-2R1", label: "Drawer 5", item: "Power Cable" },
  { n: 6, shortCode: "A6-5T7", label: "Drawer 6", item: "Fiber Cable" },
  { n: 7, shortCode: "A7-9W3", label: "Drawer 7", item: "Cable Ties" },
  { n: 8, shortCode: "A8-1Y6", label: "Drawer 8", item: "Velcro Straps" },
  { n: 9, shortCode: "A9-4Z8", label: "Drawer 9", item: "RJ45 Connectors" },
];

const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const outDir = path.join(__dirname, "..", "public", "qrcodes");

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const cards = [];
  for (const d of DRAWERS) {
    const url = `${base}/d/${encodeURIComponent(d.shortCode)}`;
    const file = `drawer-${d.n}.png`;
    const filePath = path.join(outDir, file);

    await QRCode.toFile(filePath, url, {
      type: "png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#1C2B4A", light: "#FFFFFF" },
    });

    console.log(`✓ ${d.label} → ${url}`);
    cards.push({ ...d, url, file });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Smart Cabinet — Drawer QR Codes</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Archivo, ui-sans-serif, system-ui, sans-serif;
      color: #1c2b4a;
      background: #f4f6f7;
    }
    header {
      padding: 24px 28px 8px;
    }
    header .eyebrow {
      color: #cf2233;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    header h1 {
      margin: 4px 0 0;
      font-size: 28px;
      font-weight: 800;
    }
    header p {
      margin: 8px 0 0;
      color: #4a5670;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      padding: 16px 28px 28px;
    }
    .card {
      background: #fff;
      border: 1px solid #d8e0e2;
      border-radius: 16px;
      padding: 16px;
      text-align: center;
      page-break-inside: avoid;
    }
    .card img {
      width: 180px;
      height: 180px;
      image-rendering: pixelated;
    }
    .card h2 {
      margin: 10px 0 2px;
      font-size: 18px;
      font-weight: 800;
    }
    .card .item {
      color: #4a5670;
      font-size: 12px;
      margin: 0 0 6px;
    }
    .card .code {
      display: inline-block;
      margin-top: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #eef2f3;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .card .url {
      margin-top: 8px;
      color: #6b7d7e;
      font-size: 9px;
      word-break: break-all;
    }
    @media print {
      body { background: #fff; }
      header p { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">NYC FIRST</div>
    <h1>Smart Cabinet QR Codes</h1>
    <p>Base URL: <strong>${base}</strong> — print and affix one sticker per drawer. Scan opens that drawer.</p>
  </header>
  <div class="grid">
    ${cards
      .map(
        (c) => `
    <article class="card">
      <img src="${c.file}" alt="QR for ${c.label}" />
      <h2>${c.label}</h2>
      <p class="item">${c.item}</p>
      <div class="code">${c.shortCode}</div>
      <div class="url">${c.url}</div>
    </article>`,
      )
      .join("")}
  </div>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ base, generatedAt: new Date().toISOString(), drawers: cards }, null, 2),
  );

  console.log(`\nWrote ${cards.length} QR codes → public/qrcodes/`);
  console.log(`Print sheet → ${base}/qrcodes/index.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
