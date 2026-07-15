/**
 * QR Smart Cabinet — Google Sheets inventory (sheet is source of truth).
 *
 * Paste this into your spreadsheet's Apps Script (Extensions → Apps Script),
 * set a Script Property named SECRET, then deploy as a Web App
 * (Execute as: Me · Who has access: Anyone). Put the /exec URL in
 * SHEETS_WEBHOOK_URL and the same secret in SHEETS_SECRET on the app side.
 *
 * Inventory sheet (one row per drawer) — owned in Sheets:
 *     Drawer | Part | Quantity | Is Locked
 *
 * The app reads inventory; take/return only patch Quantity (set_quantity).
 * Full snapshot overwrites are disabled.
 *
 * Session tracker sheet (append-only from the app):
 *     Name | Time | Session ID | Action | Part | Shelf | Quantity | Locked?
 */

function doPost(e) {
  try {
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
    if (body.type === 'session_row') {
      var row = body.row || {};
      if (body.action === 'update') {
        return json_({ ok: true, updated: updateSessionRow_(row) });
      }
      return json_({ ok: true, appended: appendSessionRow_(row) });
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

function readInventory_() {
  var t = locateTable_();
  if (!t) throw new Error('No sheet with a "Part" and "Quantity" header row found.');

  var drawers = [];
  for (var i = 0; i < t.rows.length; i++) {
    var row = t.rows[i];
    var number = t.col.drawer ? Number(row[t.col.drawer - 1]) : i + 1;
    if (!number || isNaN(number)) continue;
    var part = t.col.part ? String(row[t.col.part - 1] || '').trim() : '';
    var quantity = t.col.quantity ? Number(row[t.col.quantity - 1]) : 0;
    if (isNaN(quantity) || quantity < 0) quantity = 0;
    var locked = true;
    if (t.col.locked) {
      var raw = row[t.col.locked - 1];
      if (typeof raw === 'boolean') locked = raw;
      else {
        var s = String(raw).trim().toLowerCase();
        locked = !(s === 'false' || s === '0' || s === 'no' || s === 'unlocked' || s === '');
      }
    }
    drawers.push({
      number: number,
      part: part,
      quantity: quantity,
      locked: locked,
    });
  }
  return drawers;
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
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) continue;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var col = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase();
      if (h === 'drawer') col.drawer = c + 1;
      else if (h === '#' && !col.drawer) col.drawer = c + 1;
      else if (h === 'part' || h === 'item') col.part = c + 1;
      else if (h === 'quantity' || h === 'qty') col.quantity = c + 1;
      else if (h === 'is locked' || h === 'locked') col.locked = c + 1;
    }
    if (col.part && col.quantity && !col.sessionId) {
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
  if (t.col.name) t.sheet.getRange(sheetRow, t.col.name).setValue(row.name || '');
  if (t.col.time) t.sheet.getRange(sheetRow, t.col.time).setValue(formatTime_(row.time));
  if (t.col.sessionId) t.sheet.getRange(sheetRow, t.col.sessionId).setValue(row.sessionId || '');
  if (t.col.action) t.sheet.getRange(sheetRow, t.col.action).setValue(actionLabel);
  if (t.col.part) t.sheet.getRange(sheetRow, t.col.part).setValue(row.part || '');
  if (t.col.shelf) t.sheet.getRange(sheetRow, t.col.shelf).setValue(row.shelf || '');
  if (t.col.quantity) t.sheet.getRange(sheetRow, t.col.quantity).setValue(row.quantity || 0);
  if (t.col.locked) t.sheet.getRange(sheetRow, t.col.locked).setValue(!!row.locked);
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
  // Keep original check-in time on updates (e.g. Take → Take + Lock); only fill if blank.
  if (t.col.time) {
    var existingTime = t.rows[rowIdx][t.col.time - 1];
    if (!existingTime) {
      t.sheet.getRange(sheetRow, t.col.time).setValue(formatTime_(row.time));
    }
  }
  if (t.col.locked) t.sheet.getRange(sheetRow, t.col.locked).setValue(!!row.locked);
  if (t.col.quantity && row.quantity != null && row.quantity !== 0) {
    t.sheet.getRange(sheetRow, t.col.quantity).setValue(row.quantity);
  }
  if (t.col.shelf && row.shelf) {
    t.sheet.getRange(sheetRow, t.col.shelf).setValue(row.shelf);
  }
  if (t.col.action) {
    var existing = t.rows[rowIdx][t.col.action - 1];
    actionLabel = mergeAction_(existing, row.actionLabel);
    t.sheet.getRange(sheetRow, t.col.action).setValue(actionLabel);
  }
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

function json_(obj) {a
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
