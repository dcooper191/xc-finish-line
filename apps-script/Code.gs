/**
 * XC Finish Line: Google Sheet side (script version 3).
 *
 * The Sheet is the home of everything: each meet's setup, which meet is today's meet (volunteers' phones follow
 * it), each phone's tap list as it uploads during the race, and the finished results as ordinary sheet tabs.
 *
 * Install: in the Google Sheet choose Extensions > Apps Script, replace everything with this file, save.
 * Then Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone" > Deploy,
 * and copy the web app URL (it ends in /exec) into Setup in the app.
 * Updating a script that is already deployed: Deploy > Manage deployments > Edit > Version: New version > Deploy.
 * The link stays the same.
 */
var SCRIPT_VERSION = 3;
var UPLOADS = 'XC uploads';
var SETUP = 'setup';   /* the "device" that holds a meet's setup (schools, rosters, races) */
var HEADER = ['Meet', 'Device id', 'Device', 'Received (ms)', 'Received', 'Contents', 'Code'];

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function uploadsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(UPLOADS);
  if (!sh) {
    sh = ss.insertSheet(UPLOADS);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rowObj_(r) {
  return {meet: String(r[0]), device: String(r[1]), name: String(r[2]), at: Number(r[3]) || 0,
    summary: String(r[5]), code: String(r[6])};
}

/** The organizer's device asks: what has been uploaded for this meet? Or: which meets are on this Sheet? */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (p.ping) return reply_({ok: true, v: SCRIPT_VERSION, sheet: ss.getName(), url: ss.getUrl()});
    var rows = uploadsSheet_().getDataRange().getValues();
    if (p.list) return reply_({ok: true, v: SCRIPT_VERSION, today: today_(), meets: listMeets_(rows)});
    if (!p.meet) return reply_({ok: false, error: 'No meet given'});
    var list = [];
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(p.meet)) continue;
      list.push(rowObj_(rows[i]));
    }
    return reply_({ok: true, v: SCRIPT_VERSION, uploads: list});
  } catch (err) {
    return reply_({ok: false, error: String(err)});
  }
}

function today_() { return PropertiesService.getScriptProperties().getProperty('today') || ''; }

/** Every meet on the Sheet: its setup (if the organizer's device saved one) and which phones have uploaded. */
function listMeets_(rows) {
  var by = {}, order = [];
  for (var i = 1; i < rows.length; i++) {
    var o = rowObj_(rows[i]);
    if (!o.meet) continue;
    if (!by[o.meet]) { by[o.meet] = {meet: o.meet, name: '', setup: '', setupAt: 0, devices: []}; order.push(o.meet); }
    var m = by[o.meet];
    if (o.device === SETUP) { m.name = o.name; m.setup = o.code; m.setupAt = o.at; m.summary = o.summary; }
    else m.devices.push({device: o.device, name: o.name, at: o.at, summary: o.summary});
  }
  return order.map(function (k) { return by[k]; });
}

/** A phone uploads its tap list ("up"), the organizer saves a meet's setup (also "up", device "setup"),
 *  or the organizer sends finished results ("results"). */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents);
    if (d.t === 'ping') return reply_({ok: true, v: SCRIPT_VERSION});
    if (d.t === 'up') return reply_(saveUpload_(d));
    if (d.t === 'results') return reply_(saveResults_(d));
    if (d.t === 'today') { PropertiesService.getScriptProperties().setProperty('today', String(d.meet || '')); return reply_({ok: true, v: SCRIPT_VERSION, today: today_()}); }
    if (d.t === 'delete') return reply_(deleteMeet_(d));
    return reply_({ok: false, error: 'Unknown request'});
  } catch (err) {
    return reply_({ok: false, error: String(err)});
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** One row per meet and device; a later upload from the same phone replaces its row. */
function saveUpload_(d) {
  if (!d.meet || !d.device || !d.code) return {ok: false, error: 'Incomplete upload'};
  var sh = uploadsSheet_();
  var now = new Date();
  var row = [String(d.meet), String(d.device), String(d.name || ''), now.getTime(), now, String(d.summary || ''), String(d.code)];
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === row[0] && String(rows[i][1]) === row[1]) {
      sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return {ok: true, v: SCRIPT_VERSION, replaced: true, at: now.getTime()};
    }
  }
  sh.appendRow(row);
  return {ok: true, v: SCRIPT_VERSION, replaced: false, at: now.getTime()};
}

/** Removes a meet: its setup, every phone's uploads, and the result tabs the app named. Today's meet is protected. */
function deleteMeet_(d) {
  if (!d.meet) return {ok: false, error: 'No meet given'};
  if (String(d.meet) === today_()) return {ok: false, error: 'That is today\'s meet. Mark another meet as today\'s first.'};
  var sh = uploadsSheet_();
  var rows = sh.getDataRange().getValues();
  var removed = 0;
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(d.meet)) { sh.deleteRow(i + 1); removed++; }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = d.tabs || [], gone = [];
  for (var t = 0; t < tabs.length; t++) {
    var title = String(tabs[t]).replace(/[\[\]\*\?:\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    var old = title && ss.getSheetByName(title);
    if (old && ss.getSheets().length > 1) { ss.deleteSheet(old); gone.push(title); }
  }
  return {ok: true, v: SCRIPT_VERSION, rows: removed, tabs: gone};
}

/** Each race becomes its own tab: Place, School, Name, Time. Sending again replaces the tab's contents. */
function saveResults_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = d.tabs || [];
  var written = [];
  for (var t = 0; t < tabs.length; t++) {
    var title = String(tabs[t].title || 'Results').replace(/[\[\]\*\?:\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Results';
    var rows = tabs[t].rows || [];
    var sh = ss.getSheetByName(title);
    if (!sh) sh = ss.insertSheet(title);
    sh.clear();
    if (rows.length) {
      var width = rows[0].length;
      // keep times such as 18:42.3 exactly as written; the Place column stays numeric
      if (width > 1) sh.getRange(1, 2, rows.length, width - 1).setNumberFormat('@');
      sh.getRange(1, 1, rows.length, width).setValues(rows);
      sh.getRange(1, 1, 1, width).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    written.push({title: title, gid: sh.getSheetId(), rows: Math.max(0, rows.length - 1)});
  }
  return {ok: true, v: SCRIPT_VERSION, url: ss.getUrl(), tabs: written};
}
