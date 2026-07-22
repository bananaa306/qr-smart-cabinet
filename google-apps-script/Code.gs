/**
 * QR Smart Cabinet — Google Sheets inventory (sheet is source of truth).
 *
 * Paste this into your spreadsheet's Apps Script (Extensions → Apps Script),
 * set a Script Property named SECRET, then deploy as a Web App
 * (Execute as: Me · Who has access: Anyone). Put the /exec URL in
 * SHEETS_WEBHOOK_URL and the same secret in SHEETS_SECRET on the app side.
 *
 * Inventory sheet (one row per drawer) — owned in Sheets:
 *     Drawer | Part | Quantity | Is Locked | Image
 *
 * Image column: Insert → Image → Image in cell (example 2), or =IMAGE("url"),
 * or a plain https / Drive link. The app shows that photo on the drawer.
 *
 * Session tracker sheet (append-only from the app):
 *     Name | Time | Session ID | Action | Part | Shelf | Quantity | Locked?
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ error: 'no_body' });
    }
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || body.secret !== secret) {
      return json_({ error: 'forbidden' });
    }
    if (body.type === 'snapshot') {
      // Disabled — inventory Part / Quantity / Locked are owned by the sheet.
      // Use set_quantity for take/return stock updates only.
      return json_({ ok: false, error: 'snapshot_disabled' });
    }
    if (body.type === 'inventory') {
      return json_({ ok: true, drawers: readInventory_() });
    }
    if (body.type === 'set_quantity') {
      return json_({
        ok: true,
        updated: setQuantity_(body.number, body.quantity),
      });
    }
    if (body.type === 'set_locked') {
      return json_({
        ok: true,
        updated: setLocked_(body.number, body.locked),
      });
    }
    if (body.type === 'session_row') {
      var row = body.row || {};
      if (body.action === 'update') {
        return json_({ ok: true, updated: updateSessionRow_(row) });
      }
      return json_({ ok: true, appended: appendSessionRow_(row) });
    }
    // Combined take/return: patch Quantity + write the session row in one call.
    if (body.type === 'tx') {
      var out = { ok: true };
      if (body.number != null && body.quantity != null) {
        out.qtyUpdated = setQuantity_(body.number, body.quantity);
      }
      if (body.row) {
        out.sessionUpdated = body.action === 'update'
          ? updateSessionRow_(body.row)
          : appendSessionRow_(body.row);
      }
      return json_(out);
    }
    // Combined lock/unlock: patch Is Locked + write the session row in one call.
    if (body.type === 'lock_tx') {
      var lockOut = { ok: true };
      if (body.number != null && body.locked != null) {
        lockOut.lockUpdated = setLocked_(body.number, body.locked);
      }
      if (body.row) {
        lockOut.sessionUpdated = body.action === 'update'
          ? updateSessionRow_(body.row)
          : appendSessionRow_(body.row);
      }
      return json_(lockOut);
    }
    return json_({ error: 'unknown_type' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doGet() {
  var t = locateTable_();
  return json_({
    ok: true,
    sheet: t ? t.sheet.getName() : null,
    rows: t ? t.rows.length : 0,
    drawers: t ? readInventory_() : [],
  });
}

/** Accepts 1, "1", "Drawer 1", "1.0", etc. */
function parseDrawerNumber_(value) {
  if (typeof value === 'number' && isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  var m = String(value == null ? '' : value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function parseQuantity_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return value < 0 ? 0 : Math.floor(value);
  }
  var m = String(value == null ? '' : value).replace(/,/g, '').match(/\d+(\.\d+)?/);
  if (!m) return 0;
  var n = Number(m[0]);
  return isNaN(n) || n < 0 ? 0 : Math.floor(n);
}

function readInventory_() {
  var t = locateTable_();
  if (!t) throw new Error('No sheet with a "Part" and "Quantity" header row found.');

  var drawers = [];
  for (var i = 0; i < t.rows.length; i++) {
    var row = t.rows[i];
    var number = t.col.drawer ? parseDrawerNumber_(row[t.col.drawer - 1]) : i + 1;
    if (!number) continue;
    var part = t.col.part ? String(row[t.col.part - 1] || '').trim() : '';
    var quantity = t.col.quantity ? parseQuantity_(row[t.col.quantity - 1]) : 0;
    var locked = true;
    if (t.col.locked) {
      var raw = row[t.col.locked - 1];
      if (typeof raw === 'boolean') locked = raw;
      else {
        var s = String(raw).trim().toLowerCase();
        locked = !(s === 'false' || s === '0' || s === 'no' || s === 'unlocked' || s === '');
      }
    }
    var sheetRow = t.headerRow + 1 + i;
    var photo = t.col.image ? readCellImageUrl_(t.sheet, sheetRow, t.col.image, number) : '';
    drawers.push({
      number: number,
      part: part,
      quantity: quantity,
      locked: locked,
      photo: photo,
    });
  }
  return drawers;
}

/**
 * Resolve an Image cell to a URL the web app can show.
 * Supports: Image in cell (CellImage), =IMAGE("url"), https links, Drive file ids.
 */
function readCellImageUrl_(sheet, sheetRow, imageCol, drawerNumber) {
  var range = sheet.getRange(sheetRow, imageCol);
  var formula = String(range.getFormula() || '');
  if (formula) {
    var m = formula.match(/^=\s*IMAGE\s*\(\s*["']([^"']+)["']/i);
    if (m && m[1]) return normalizeImageUrl_(m[1]);
  }

  var value = range.getValue();
  if (value == null || value === '') return '';

  if (typeof value === 'string') {
    return normalizeImageUrl_(value.trim());
  }

  // Insert → Image → Image in cell → CellImage object
  try {
    if (typeof value.getContentUrl === 'function') {
      return cellImageToDataUrl_(value, drawerNumber);
    }
  } catch (e) {
    // fall through
  }

  return '';
}

function normalizeImageUrl_(raw) {
  if (!raw) return '';
  var s = String(raw).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;

  // Drive share / open links → direct view URL
  var drive = s.match(/\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]{20,})/);
  if (drive) return 'https://drive.google.com/uc?export=view&id=' + drive[1];

  // Bare Drive file id
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) {
    return 'https://drive.google.com/uc?export=view&id=' + s;
  }
  return '';
}

/** Turn a CellImage into a data URL (stable for the browser; no extra Drive share). */
function cellImageToDataUrl_(cellImage, drawerNumber) {
  var contentUrl = cellImage.getContentUrl();
  if (!contentUrl) return '';

  var resp = UrlFetchApp.fetch(contentUrl, {
    muteHttpExceptions: true,
    followRedirects: true,
  });
  if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) {
    // Browser may still load the content URL if the deployment can see it.
    return contentUrl;
  }

  var blob = resp.getBlob();
  var bytes = blob.getBytes();
  // Cap payload so inventory JSON stays reasonable for nine drawers.
  if (bytes.length > 750000) return contentUrl;

  var contentType = blob.getContentType() || 'image/png';
  if (contentType.indexOf('image/') !== 0) contentType = 'image/png';
  return 'data:' + contentType + ';base64,' + Utilities.base64Encode(bytes);
}

/** Write only Quantity for one drawer. Never touches Part or Is Locked. */
function setQuantity_(number, quantity) {
  var t = locateTable_();
  if (!t) throw new Error('No sheet with a "Part" and "Quantity" header row found.');
  if (!t.col.quantity) throw new Error('No Quantity column found.');

  var rowIdx = findRowByNumber_(t, number);
  if (rowIdx === -1) return 0;

  var sheetRow = t.headerRow + 1 + rowIdx;
  var qty = Number(quantity);
  if (isNaN(qty) || qty < 0) qty = 0;
  t.sheet.getRange(sheetRow, t.col.quantity).setValue(qty);
  return 1;
}

/** Write only Is Locked for one drawer. Never touches Part or Quantity. */
function setLocked_(number, locked) {
  var t = locateTable_();
  if (!t) throw new Error('No sheet with a "Part" and "Quantity" header row found.');
  if (!t.col.locked) throw new Error('No Is Locked column found.');

  var rowIdx = findRowByNumber_(t, number);
  if (rowIdx === -1) return 0;

  var sheetRow = t.headerRow + 1 + rowIdx;
  var value = !!locked;
  t.sheet.getRange(sheetRow, t.col.locked).setValue(value);
  colorLockedCell_(t.sheet, sheetRow, t.col.locked, value);
  return 1;
}

function syncSnapshot_(drawers) {
  var t = locateTable_();
  if (!t) throw new Error('No sheet with a "Part" and "Quantity" header row found.');

  var updated = 0;
  for (var i = 0; i < drawers.length; i++) {
    var d = drawers[i];
    var rowIdx = findRowByNumber_(t, d.number);
    var sheetRow;
    if (rowIdx === -1) {
      sheetRow = t.headerRow + t.rows.length + 1;
      t.rows.push(new Array(t.width).fill(''));
      rowIdx = t.rows.length - 1;
      if (t.col.drawer) t.sheet.getRange(sheetRow, t.col.drawer).setValue(d.number);
    } else {
      sheetRow = t.headerRow + 1 + rowIdx;
    }
    if (t.col.part) t.sheet.getRange(sheetRow, t.col.part).setValue(d.part);
    if (t.col.quantity) t.sheet.getRange(sheetRow, t.col.quantity).setValue(d.quantity);
    if (t.col.locked) {
      t.sheet.getRange(sheetRow, t.col.locked).setValue(!!d.locked);
      colorLockedCell_(t.sheet, sheetRow, t.col.locked, !!d.locked);
    }
    updated++;
  }
  return updated;
}

function locateTable_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  // Prefer an inventory-looking tab when multiple Part/Quantity tables exist.
  sheets.sort(function (a, b) {
    return inventorySheetScore_(b.getName()) - inventorySheetScore_(a.getName());
  });

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) continue;
    var width = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
    var col = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] == null ? '' : headers[c]).trim().toLowerCase();
      if (h === 'drawer' || h === 'drawer #' || h === 'drawer number' || h === '# drawer') col.drawer = c + 1;
      else if ((h === '#' || h === 'no' || h === 'no.') && !col.drawer) col.drawer = c + 1;
      else if (h === 'part' || h === 'item' || h === 'parts' || h === 'item name') col.part = c + 1;
      else if (h === 'quantity' || h === 'qty' || h === 'stock' || h === 'count') col.quantity = c + 1;
      else if (h === 'is locked' || h === 'locked' || h === 'locked?') col.locked = c + 1;
      else if (h === 'image' || h === 'photo' || h === 'img' || h === 'picture') col.image = c + 1;
      else if (h === 'session id' || h === 'sessionid') col.sessionId = c + 1;
    }
    // Must be inventory (Part + Quantity), not the session tracker tab.
    if (col.part && col.quantity && !col.sessionId) {
      var lastRow = sheet.getLastRow();
      var numDataRows = Math.max(0, lastRow - 1);
      // Sheet.getRange(row, column, numRows, numColumns) — 3rd/4th are COUNTS.
      var rows = numDataRows > 0
        ? sheet.getRange(2, 1, numDataRows, width).getValues()
        : [];
      return { sheet: sheet, headerRow: 1, col: col, rows: rows, width: width };
    }
  }
  return null;
}

function inventorySheetScore_(name) {
  var n = String(name || '').toLowerCase();
  if (/inventory|stock|cabinet|drawer/.test(n)) return 10;
  if (/session|ledger|log|tracker|activity/.test(n)) return -10;
  return 0;
}

function findRowByNumber_(t, number) {
  if (!t.col.drawer) return -1;
  var target = Number(number);
  for (var i = 0; i < t.rows.length; i++) {
    if (parseDrawerNumber_(t.rows[i][t.col.drawer - 1]) === target) return i;
  }
  return -1;
}

// Session tracker: Name | Time | Session ID | Action | Part | Shelf | Quantity | Locked?
function locateSessionTable_() {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) continue;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var col = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase();
      if (h === 'name') col.name = c + 1;
      else if (h === 'time' || h === 'timestamp' || h === 'when') col.time = c + 1;
      else if (h === 'session id' || h === 'sessionid') col.sessionId = c + 1;
      else if (h === 'action') col.action = c + 1;
      else if (h === 'part' || h === 'item') col.part = c + 1;
      else if (h === 'shelf' || h === 'drawer') col.shelf = c + 1;
      else if (h === 'quantity' || h === 'qty') col.quantity = c + 1;
      else if (h === 'locked?' || h === 'locked' || h === 'is locked') col.locked = c + 1;
    }
    if (col.name && col.sessionId && col.part && col.quantity && col.locked) {
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

function formatTime_(isoOrEmpty) {
  var d = isoOrEmpty ? new Date(isoOrEmpty) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  // Local spreadsheet timezone, readable: 2026-07-13 14:57:02
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function appendSessionRow_(row) {
  var t = locateSessionTable_();
  if (!t) throw new Error('No sheet with Name, Session ID, Part, Quantity, and Locked? headers found.');

  var sheetRow = t.headerRow + t.rows.length + 1;
  var actionLabel = row.actionLabel || '';
  // One setValues write for the whole row beats 8 separate setValue calls.
  var arr = new Array(t.width).fill('');
  if (t.col.name) arr[t.col.name - 1] = row.name || '';
  if (t.col.time) arr[t.col.time - 1] = formatTime_(row.time);
  if (t.col.sessionId) arr[t.col.sessionId - 1] = row.sessionId || '';
  if (t.col.action) arr[t.col.action - 1] = actionLabel;
  if (t.col.part) arr[t.col.part - 1] = row.part || '';
  if (t.col.shelf) arr[t.col.shelf - 1] = row.shelf || '';
  if (t.col.quantity) arr[t.col.quantity - 1] = row.quantity || 0;
  if (t.col.locked) arr[t.col.locked - 1] = !!row.locked;
  t.sheet.getRange(sheetRow, 1, 1, t.width).setValues([arr]);
  colorSessionRow_(t, sheetRow, actionLabel, !!row.locked);
  return 1;
}

function mergeAction_(existing, incoming) {
  var prev = String(existing || '').trim();
  var next = String(incoming || '').trim();
  if (!next) return prev;
  if (!prev) return next;

  // Lock after a take/return → "Take + Lock" / "Return + Lock"
  if (next === 'Lock') {
    if (prev === 'Take' || prev === 'Unlock + Take') return 'Take + Lock';
    if (prev === 'Return' || prev === 'Unlock + Return') return 'Return + Lock';
    if (prev.indexOf('Lock') !== -1) return prev;
    return 'Lock';
  }

  // Unlock then take/return already arrives as "Unlock + Take" etc. Prefer newer label.
  return next;
}

function updateSessionRow_(row) {
  var t = locateSessionTable_();
  if (!t) throw new Error('No sheet with Name, Session ID, Part, Quantity, and Locked? headers found.');

  var rowIdx = findRowBySessionPart_(t, row.sessionId, row.part);
  if (rowIdx === -1) {
    return appendSessionRow_(row);
  }

  var sheetRow = t.headerRow + 1 + rowIdx;
  var actionLabel = row.actionLabel || '';
  // Edit the in-memory row, then write it back in a single setValues call.
  var arr = t.rows[rowIdx].slice();
  // Keep original check-in time on updates (e.g. Take → Take + Lock); only fill if blank.
  if (t.col.time && !arr[t.col.time - 1]) {
    arr[t.col.time - 1] = formatTime_(row.time);
  }
  if (t.col.locked) arr[t.col.locked - 1] = !!row.locked;
  if (t.col.quantity && row.quantity != null && row.quantity !== 0) {
    arr[t.col.quantity - 1] = row.quantity;
  }
  if (t.col.shelf && row.shelf) {
    arr[t.col.shelf - 1] = row.shelf;
  }
  if (t.col.action) {
    actionLabel = mergeAction_(arr[t.col.action - 1], row.actionLabel);
    arr[t.col.action - 1] = actionLabel;
  }
  t.sheet.getRange(sheetRow, 1, 1, t.width).setValues([arr]);
  colorSessionRow_(t, sheetRow, actionLabel, !!row.locked);
  return 1;
}

function findRowBySessionPart_(t, sessionId, part) {
  if (!t.col.sessionId || !sessionId) return -1;
  for (var i = t.rows.length - 1; i >= 0; i--) {
    var sameSession = String(t.rows[i][t.col.sessionId - 1]) === String(sessionId);
    var samePart = !t.col.part || String(t.rows[i][t.col.part - 1]) === String(part || '');
    if (sameSession && samePart) return i;
  }
  return -1;
}

// Soft row tint + strong Action / Locked? chips.
function actionColors_(actionLabel) {
  var a = String(actionLabel || '');
  // Take family — warm red
  if (a === 'Take' || a === 'Unlock + Take' || a === 'Take + Lock') {
    return { row: '#FCE8E6', action: '#EA4335', text: '#FFFFFF' };
  }
  // Return family — green
  if (a === 'Return' || a === 'Unlock + Return' || a === 'Return + Lock') {
    return { row: '#E6F4EA', action: '#34A853', text: '#FFFFFF' };
  }
  // Unlock only — blue
  if (a === 'Unlock') {
    return { row: '#E8F0FE', action: '#1A73E8', text: '#FFFFFF' };
  }
  // Lock only — slate
  if (a === 'Lock') {
    return { row: '#F1F3F4', action: '#5F6368', text: '#FFFFFF' };
  }
  return { row: '#FFFFFF', action: '#E8EAED', text: '#202124' };
}

function colorSessionRow_(t, sheetRow, actionLabel, locked) {
  var colors = actionColors_(actionLabel);
  var width = t.width;
  // Light tint across the whole data row
  t.sheet.getRange(sheetRow, 1, 1, width).setBackground(colors.row);

  if (t.col.action) {
    var actionCell = t.sheet.getRange(sheetRow, t.col.action);
    actionCell.setBackground(colors.action);
    actionCell.setFontColor(colors.text);
    actionCell.setFontWeight('bold');
  }

  if (t.col.locked) {
    var lockCell = t.sheet.getRange(sheetRow, t.col.locked);
    if (locked) {
      lockCell.setBackground('#5F6368');
      lockCell.setFontColor('#FFFFFF');
    } else {
      lockCell.setBackground('#34A853');
      lockCell.setFontColor('#FFFFFF');
    }
    lockCell.setFontWeight('bold');
  }

  if (t.col.quantity) {
    var qtyCell = t.sheet.getRange(sheetRow, t.col.quantity);
    qtyCell.setFontWeight('bold');
  }
}

function colorLockedCell_(sheet, row, col, locked) {
  if (!col) return;
  var cell = sheet.getRange(row, col);
  if (locked) {
    cell.setBackground('#5F6368');
    cell.setFontColor('#FFFFFF');
  } else {
    cell.setBackground('#34A853');
    cell.setFontColor('#FFFFFF');
  }
  cell.setFontWeight('bold');
}

function json_(obj) {
  // TEXT is more reliable than JSON mime for Apps Script /exec redirects.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.TEXT
  );
}
