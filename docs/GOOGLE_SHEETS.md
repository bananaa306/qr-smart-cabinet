# Connect to Google Sheets (append-only mirror)

The app stays the source of truth; every take/return is **also** pushed to your
Google Sheet — an append-only `Ledger` tab plus a live `Stock` tab. It's
best-effort: if the sheet is down or misconfigured, transactions still succeed.

Nothing is sent to the sheet until both env vars below are set.

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
   ```

6. **Restart** the dev server (`npm run dev`). Do a take/return in the app and
   watch the `Ledger` and `Stock` tabs populate. Tabs and headers are created
   automatically on the first write.

## How it behaves

- `Ledger` tab: one immutable row per transaction — timestamp, user, drawer,
  item, intent, delta, resulting balance, transaction id. Matches the PRD's
  append-only ledger (§C.1).
- `Stock` tab: one row per drawer, `Quantity` overwritten to the latest balance
  on every movement.
- The write is authenticated by the `SECRET` in the request body; a wrong or
  missing secret is rejected by the script.
- Failures are swallowed and recorded in the app's in-memory audit log
  (`sheets.mirror_error`) — they never roll back a transaction.

## Deploying on Vercel

Add the same two variables as Environment Variables in the Vercel project
(`vercel env add SHEETS_WEBHOOK_URL` / `SHEETS_SECRET`), then redeploy.

## Updating the script later

After editing `Code.gs`, in Apps Script use **Deploy → Manage deployments →
edit (pencil) → Version: New version → Deploy** so the `/exec` URL keeps working
without changing.

## A note on architecture

Sheets is a great **mirror / ops surface**, but it isn't a transactional
database — it has no row locking or atomic multi-write. That's why the app keeps
its own authoritative ledger and only mirrors to the sheet. For a production
source of truth, use PostgreSQL (PRD §7) and keep the sheet as a report/export.
