# Google Sheets as inventory source

When `SHEETS_WEBHOOK_URL` and `SHEETS_SECRET` are set, the **inventory sheet
owns Part, Quantity, and Is Locked**. The app reads those columns before showing
drawers and before take/return. It never rewrites Part or Locked from seeded
app data.

Take/return **only** patch the Quantity cell for that drawer. Session tracker
rows are append-only (separate sheet).

## One-time setup (~5 minutes)

1. **Open your spreadsheet** →
   `https://docs.google.com/spreadsheets/d/1rhm8XpNQIIIrtaBwIB6tTSrOwbP3zScRpPm-DGeni_U/edit`
2. **Extensions → Apps Script.** Paste
   [`google-apps-script/Code.gs`](../google-apps-script/Code.gs). Save.
3. **Script property** `SECRET` = a long random string.
4. **Deploy → New deployment** (Web app, Execute as Me, Anyone) → copy `/exec` URL.
5. **Env** (local + Vercel):

   ```bash
   SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/AKfyc.../exec
   SHEETS_SECRET=the-same-secret
   SESSION_SECRET=another-long-random-string
   ```

6. Redeploy Apps Script with **New version** after any `Code.gs` change.

## Sheet layout

**Inventory**

| Drawer | Part | Quantity | Is Locked |
|--------|------|----------|-----------|
| 1 | Cat6 Patch Cable 1m | 64 | TRUE |

Drawer numbers must match app labels (`Drawer 1` → `1`).

**Session tracker**

| Name | Time | Session ID | Action | Part | Shelf | Quantity | Locked? |

## Behavior

- **Read:** `inventory` → fills the UI from the sheet.
- **Take/return:** `set_quantity` → updates that row’s Quantity only.
- **Refresh button:** pulls from the sheet again (does not push inventory).
- **Lock/unlock:** session log only; Is Locked stays sheet-owned until you change it in Sheets.
- Full `snapshot` overwrites are disabled.

## Architecture note

Sheets is fine as shared workshop inventory. It is not a transactional DB. For
strong concurrency, use PostgreSQL later and keep Sheets as ops UI.
