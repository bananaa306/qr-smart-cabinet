# Connect to Google Sheets (inventory + session tracker)

When `SHEETS_WEBHOOK_URL` and `SHEETS_SECRET` are set, the **inventory sheet is
the shared stock source** the app reads before listing drawers and before
take/return. After each change the app writes a snapshot back. Session tracker
rows are still append-only for ops.

## One-time setup (~5 minutes)

1. **Open your spreadsheet** →
   `https://docs.google.com/spreadsheets/d/1rhm8XpNQIIIrtaBwIB6tTSrOwbP3zScRpPm-DGeni_U/edit`
2. **Extensions → Apps Script.** Delete any starter code and paste the contents
   of [`google-apps-script/Code.gs`](../google-apps-script/Code.gs). Save.
3. **Add the shared secret.** In Apps Script: **Project Settings (gear) → Script
   Properties → Add script property**
   - Property: `SECRET`
   - Value: a long random string (e.g. run `openssl rand -hex 24`)
4. **Deploy → New deployment.** Type: **Web app**.
   - Description: `cabinet mirror`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, authorize when prompted, and copy the **Web app URL**
     (ends in `/exec`).
5. **Tell the app.** Create `.env.local` in the project root:

   ```bash
   SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/AKfyc.../exec
   SHEETS_SECRET=the-same-long-random-string-from-step-3
   SESSION_SECRET=another-long-random-string
   ```

6. **Restart** the dev server (`npm run dev`). Open drawers — quantities should
   match the inventory sheet. Do a take/return and watch Quantity + session
   tracker update.

## Sheet layout

**Inventory** (headers required):

| Drawer | Part | Quantity | Is Locked |
|--------|------|----------|-----------|
| 1 | Cat6 Patch Cable 1m | 64 | TRUE |

Drawer numbers must match the app labels (`Drawer 1` → `1`, …).

**Session tracker** (headers required):

| Name | Time | Session ID | Action | Part | Shelf | Quantity | Locked? |

## How it behaves

- **Read:** `POST { type: "inventory" }` loads Part / Quantity / Is Locked into
  the app before list, detail, and stock mutations.
- **Write:** `POST { type: "snapshot" }` overwrites those rows after take /
  return / lock / unlock.
- **Sessions:** append/update rows for workshop accountability.
- Failures are recorded in the app audit log; a failed pull falls back to the
  last known in-memory values for that isolate.

## Deploying on Vercel

Add the same variables as Environment Variables in the Vercel project
(`SHEETS_WEBHOOK_URL`, `SHEETS_SECRET`, `SESSION_SECRET`), then redeploy.

## Updating the script later

After editing `Code.gs`, in Apps Script use **Deploy → Manage deployments →
edit (pencil) → Version: New version → Deploy** so the `/exec` URL keeps working
without changing.

## Architecture note

Sheets works as a shared ops inventory for workshop hosting. It is not a true
transactional database (no row locking). For production-grade concurrency, use
PostgreSQL (PRD §7) and keep the sheet as a report/export.
