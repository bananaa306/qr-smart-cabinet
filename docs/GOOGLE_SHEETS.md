# Google Sheets as inventory source

When Sheets is configured, the **inventory sheet owns Part, Quantity, and Is
Locked**. The app reads those columns before showing drawers and before
take/return. It never rewrites Part or Locked from seeded app data.

Take/return **only** patch the Quantity cell for that drawer. Session tracker
rows are append-only (separate sheet).

## Recommended: Google Sheets API (fast)

Typical latency **~200–800ms**. Avoids Apps Script Web App cold starts.

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or
   pick a project.
2. **APIs & Services → Enable APIs** → enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create**:
   - Name e.g. `qr-smart-cabinet`
   - Create key → **JSON** → download the file.
4. Open your spreadsheet and **Share** it with the service account email
   (`…@….iam.gserviceaccount.com`) as **Editor**.
5. Env (local `.env.local` + Vercel):

   ```bash
   GOOGLE_SHEETS_SPREADSHEET_ID=1rhm8XpNQIIIrtaBwIB6tTSrOwbP3zScRpPm-DGeni_U
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

   Or one JSON blob (easier for Vercel):

   ```bash
   GOOGLE_SHEETS_SPREADSHEET_ID=1rhm8XpNQIIIrtaBwIB6tTSrOwbP3zScRpPm-DGeni_U
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}
   ```

   Paste the private key with literal `\n` newlines (or the full downloaded JSON
   on one line). **Never commit** the key / JSON.

6. Restart `npm run dev` / redeploy. Sync bar should say
   **Following Google Sheet (API)**.

Spreadsheet ID is the long id in the sheet URL between `/d/` and `/edit`.

## Fallback: Apps Script webhook (slower)

Still supported if API env is unset.

1. Spreadsheet → Extensions → Apps Script → paste
   [`google-apps-script/Code.gs`](../google-apps-script/Code.gs).
2. Script property `SECRET` = long random string.
3. Deploy → Web app (Execute as Me, Anyone) → copy `/exec` URL.
4. Env:

   ```bash
   SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/AKfyc.../exec
   SHEETS_SECRET=the-same-secret
   SESSION_SECRET=another-long-random-string
   ```

When **both** are set, the app uses the **API first**.

## Sheet layout

**Inventory**

| Drawer | Part | Quantity | Is Locked |
|--------|------|----------|-----------|
| 1 | Cat6 Patch Cable 1m | 64 | TRUE |

Drawer numbers must match app labels (`Drawer 1` → `1`).

**Session tracker**

| Name | Time | Session ID | Action | Part | Shelf | Quantity | Locked? |

## Behavior

- **Read:** inventory → fills the UI from the sheet.
- **Take/return:** patches Quantity only.
- **Refresh:** force-pulls from the sheet (does not push inventory).
- **Lock/unlock:** session log only; Is Locked stays sheet-owned until you change it in Sheets.

## Latency notes

- **Sheets API** is the durable fix for slow loads.
- Apps Script path still uses cache, short menu timeouts, background finish, and
  `/api/sheets/warmup` cron (every 5 min on Pro plans).
- Optional: `CRON_SECRET` to protect the warmup route.

Sheets is fine as shared workshop inventory. For strong concurrency later, use
PostgreSQL and keep Sheets as ops UI.
