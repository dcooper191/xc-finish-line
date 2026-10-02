/**
 * XC Finish Line: Google Sheet side.
 *
 * Collects each volunteer's tap list as their phone uploads it, hands those lists to the organizer's
 * Results screen, and receives the finished results as ordinary sheet tabs.
 *
 * Install: in the Google Sheet choose Extensions > Apps Script, replace everything with this file, save.
 * Then Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone" > Deploy,
 * and copy the web app URL (it ends in /exec) into Setup in the app.
 */
var UPLOADS = 'XC uploads';
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

/** The organizer's device asks: what has been uploaded for this meet? */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (p.ping) return reply_({ok: true, sheet: ss.getName(), url: ss.getUrl()});
    if (!p.meet) return reply_({ok: false, error: 'No meet given'});
    var rows = uploadsSheet_().getDataRange().getValues();
    var list = [];
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(p.meet)) continue;
      list.push({device: String(rows[i][1]), name: String(rows[i][2]), at: Number(rows[i][3]) || 0,
        summary: String(rows[i][5]), code: String(rows[i][6])});
    }
    return reply_({ok: true, uploads: list});
  } catch (err) {
    return reply_({ok: false, error: String(err)});
  }
}

/** A phone uploads its tap list ("up"), or the organizer sends finished results ("results"). */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents);
    if (d.t === 'ping') return reply_({ok: true});
    if (d.t === 'up') return reply_(saveUpload_(d));
    if (d.t === 'results') return reply_(saveResults_(d));
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
      return {ok: true, replaced: true};
    }
  }
  sh.appendRow(row);
  return {ok: true, replaced: false};
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
  return {ok: true, url: ss.getUrl(), tabs: written};
}
