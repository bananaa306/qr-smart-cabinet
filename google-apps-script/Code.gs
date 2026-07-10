/**
 * QR Smart Cabinet — Google Sheets live inventory sync.
 *
 * Paste this into your spreadsheet's Apps Script (Extensions → Apps Script),
 * set a Script Property named SECRET, then deploy as a Web App
 * (Execute as: Me · Who has access: Anyone). Put the /exec URL in
 * SHEETS_WEBHOOK_URL and the same secret in SHEETS_SECRET on the app side.
 *
 * It keeps ONE ROW PER DRAWER up to date. Your sheet needs a header row with
 * these column names (order doesn't matter, extra columns are fine):
 *
 *     Drawer | Part | Quantity | Is Locked
 *
 * The "Drawer" column holds the drawer number (1–9); rows are matched on it.
 * (The "#" index column that Google Sheets "Tables" add is ignored.)
 */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || body.secret !== secret) {
      return json_({ error: 'forbidden' });
    }
    if (body.type === 'snapshot') {
      var n = syncSnapshot_(body.drawers || []);
      return json_({ ok: true, updated: n });
    }
    return json_({ error: 'unknown_type' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// Health check — returns how many drawer rows are present.
function doGet() {
  var t = locateTable_();
  return json_({ ok: true, sheet: t ? t.sheet.getName() : null, rows: t ? t.rows.length : 0 });
}

function syncSnapshot_(drawers) {
  var t = locateTable_();
  if (!t) throw new Error('No sheet with a "Part" and "Quantity" header row found.');

  var updated = 0;
  for (var i = 0; i < drawers.length; i++) {
    var d = drawers[i];
    var rowIdx = findRowByNumber_(t, d.number); // 0-based into t.rows, or -1
    var sheetRow;
    if (rowIdx === -1) {
      // No row for this drawer yet — append one and fill its number.
      sheetRow = t.headerRow + t.rows.length + 1;
      t.rows.push(new Array(t.width).fill(''));
      rowIdx = t.rows.length - 1;
      if (t.col.drawer) t.sheet.getRange(sheetRow, t.col.drawer).setValue(d.number);
    } else {
      sheetRow = t.headerRow + 1 + rowIdx;
    }
    if (t.col.part) t.sheet.getRange(sheetRow, t.col.part).setValue(d.part);
    if (t.col.quantity) t.sheet.getRange(sheetRow, t.col.quantity).setValue(d.quantity);
    if (t.col.locked) t.sheet.getRange(sheetRow, t.col.locked).setValue(!!d.locked);
    updated++;
  }
  return updated;
}

// Find the sheet + header columns holding the drawer table.
function locateTable_() {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) continue;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var col = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase();
      if (h === 'drawer') col.drawer = c + 1;
      else if (h === '#' && !col.drawer) col.drawer = c + 1; // fallback key
      else if (h === 'part' || h === 'item') col.part = c + 1;
      else if (h === 'quantity' || h === 'qty') col.quantity = c + 1;
      else if (h === 'is locked' || h === 'locked') col.locked = c + 1;
    }
    if (col.part && col.quantity) {
      var lastRow = sheet.getLastRow();
      var width = sheet.getLastColumn();
      var rows = lastRow > 1
        ? sheet.getRange(2, 1, lastRow - 1, width).getValues()
        : [];
      return { sheet: sheet, headerRow: 1, col: col, rows: rows, width: width };
    }
  }
  return null;
}

function findRowByNumber_(t, number) {
  if (!t.col.drawer) return -1;
  for (var i = 0; i < t.rows.length; i++) {
    if (Number(t.rows[i][t.col.drawer - 1]) === Number(number)) return i;
  }
  return -1;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
