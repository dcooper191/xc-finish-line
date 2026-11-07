/* XC Finish Line: screens and device storage. Pure logic lives in logic.js (window.XC). */
(function(){
'use strict';
const X = window.XC, fmtTime = X.fmtTime;
const LS = 'xcfl.v2';
const APP_VERSION = '2026-11-07.1';   /* keep in step with VERSION in sw.js */
const PRESETS = [['Green','#1F7A4D'],['Navy','#1B2A5C'],['Royal blue','#2456C5'],['Sky blue','#5AA9E6'],['Maroon','#7A1F2B'],['Red','#C8102E'],
  ['Orange','#E8701A'],['Gold','#E5B10E'],['Purple','#5B2D8E'],['Black','#1C1C1C'],['Gray','#7D858C'],['White','#F4F4EF'],['Teal','#0F8B8D'],['Brown','#6B4423']];
const KIND_LABEL = {timer:'Timer', school:'Schools', roster:'Roster'};

function $(id){ return document.getElementById(id); }
function inkFor(hex){ const n=parseInt(String(hex).slice(1),16), r=n>>16, g=n>>8&255, b=n&255; return (0.2126*r+0.7152*g+0.0722*b)/255>0.5?'#16130E':'#FFFFFF'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function rid(n){ let s=''; while(s.length<n) s+=Math.random().toString(36).slice(2); return s.slice(0,n); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function today(){ const d=new Date(); return d.getFullYear()+'-'+X.pad2(d.getMonth()+1)+'-'+X.pad2(d.getDate()); }
function plural(n,w){ return n+' '+w+(n===1?'':'s'); }
function clockStr(ts){ const d=new Date(ts), h=d.getHours(); return ((h%12)||12)+':'+X.pad2(d.getMinutes())+(h<12?' AM':' PM'); }
function niceDate(iso){
  const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(iso||''); if(!m) return iso||'';
  try{ return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric', year:'numeric'}); }catch(e){ return iso; }
}

/* ---------- state: everything lives on this device ---------- */
let storageOK = true, offlineReady = false;
function freshState(){ return {v:2, roles:1, deviceId:'d'+rid(6), deviceName:'', sound:true, meetId:null, meets:{},
  ui:{tab:'home', lock:null, rosterSchool:null, resRace:null, openRow:null}}; }
function load(){
  let s=null;
  try{ localStorage.setItem(LS+'.t','1'); localStorage.removeItem(LS+'.t'); s=JSON.parse(localStorage.getItem(LS)||'null'); }
  catch(e){ storageOK=false; }
  if(!s||s.v!==2) s=freshState();
  s.ui=s.ui||{}; s.meets=s.meets||{};
  /* meets saved before organizer and volunteer views were separate keep the full view, so nobody is locked out */
  if(!s.roles){ Object.keys(s.meets).forEach(k => { s.meets[k].own=true; }); s.roles=1; }
  return s;
}
let lastJSON=null;
function save(){ try{ lastJSON=JSON.stringify(S); localStorage.setItem(LS, lastJSON); }catch(e){ storageOK=false; } }
const S = load();
/* Another tab or window of this app saved something: take its data, keep this window's own screen. */
function adoptStored(str){
  if(!str||str===lastJSON) return false;
  let n=null; try{ n=JSON.parse(str); }catch(e){ return false; }
  if(!n||n.v!==2) return false;
  S.meets=n.meets||{}; S.meetId=n.meetId; S.deviceId=n.deviceId; S.deviceName=n.deviceName; S.sound=n.sound; S.up=n.up||{}; S.sheet=n.sheet||S.sheet; S.setupUp=n.setupUp||{}; S.org=n.org||S.org; S.chosen=n.chosen||null; lastJSON=str;
  return true;
}

function curMeet(){ const m=S.meets[S.meetId]; return (m&&!m.config.deleted)?m:null; }
/* Two views. The plain address is always the full app: manage meets, Results, Review, Setup and the three jobs.
   A volunteer link (#s= season link or #m= meet link) ALWAYS gives the stripped-down volunteer view, the three
   jobs only, on any device: what the link shows is what volunteers get. Nothing has to be set up on a device. */
function volunteerURL(){ return /#[ms]=/.test(location.hash||''); }
function boardURL(){ return /#r=/.test(location.hash||''); }   /* the results board: a read-only finish list for anyone at the course */
function todayId(){ return (listInfo&&!listInfo.err&&listInfo.today)||''; }
function isOwner(meet){ return !!meet&&!volunteerURL()&&!boardURL(); }
function liveMeets(){ return Object.values(S.meets).filter(m => !m.config.deleted)
  .sort((a,b) => (b.config.date||'').localeCompare(a.config.date||'')||(b.config.ver||0)-(a.config.ver||0)); }
function schoolOf(meet,id){ return meet.config.schools.find(s => s.id===id)||null; }
function raceOf(meet,id){ return meet.config.races.find(r => r.id===id)||null; }
function raceIdx(meet,id){ return Math.max(0, meet.config.races.findIndex(r => r.id===id)); }
function touchConfig(meet){ meet.config.ver=Math.max(Date.now(), (meet.config.ver||0)+1); save(); refreshLink(); scheduleSetupPush(); }   /* always moves forward */

/* ---------- tap lists ("streams"): one per race, per job, per device ---------- */
function myStream(meet,raceId,kind,create){
  const id=raceId+'.'+kind+'.'+S.deviceId; let st=meet.streams[id];
  if(!st&&create){
    st=meet.streams[id]={id, raceId, kind, deviceId:S.deviceId, deviceName:S.deviceName||'', updatedAt:Date.now()};
    if(kind==='timer'){ st.startedAt=null; st.endedAt=null; st.taps=[]; }
    else if(kind==='school'){ st.taps=[]; }
    else { st.picks=[]; st.added=[]; }
  }
  return st||null;
}
function entryCount(st){ return !st?0:(st.kind==='roster'?st.picks.length:st.taps.length); }
function hasData(st){ return entryCount(st)>0||(st.kind==='timer'&&!!st.startedAt); }
function raceStreams(meet,raceId,kind){ return Object.values(meet.streams).filter(s => s.raceId===raceId&&s.kind===kind); }
function myStreams(meet){ return Object.values(meet.streams).filter(s => s.deviceId===S.deviceId&&raceOf(meet,s.raceId)); }
function pickStream(meet,raceId,kind,prefer){
  const list=raceStreams(meet,raceId,kind).filter(s => entryCount(s)>0);
  if(!list.length) return null;
  if(prefer){ const p=list.find(s => s.id===prefer); if(p) return p; }
  return list.sort((a,b) => entryCount(b)-entryCount(a)||(a.id<b.id?-1:1))[0];
}
function touchStream(meet,st){ st.updatedAt=Date.now(); st.deviceName=S.deviceName||''; save(); }
function resultOf(meet,raceId,create){
  let r=meet.results[raceId];
  if(!r&&create){ r=meet.results[raceId]={raceId, names:{}, status:{}, startAdj:0, finishers:null, cols:null, srcTimer:null, srcSchool:null, srcRoster:null, updatedAt:0}; }
  return r||null;
}
function touchResult(meet,r){ r.updatedAt=Date.now(); save(); }

/* ---------- merged view of one race ---------- */
function sigOf(T,C){ return (T?T.id+':'+T.taps.length+':'+(T.startedAt||0):'-')+'|'+(C?C.id+':'+C.taps.length:'-'); }
function rawCols(T,C){
  const start=T?T.startedAt:null;
  return { times:T?T.taps.map(t => t-start):[], schools:C?C.taps.map(x => ({s:x.s||null, t:start!=null?x.t-start:null})):[] };
}
function runnerMap(meet,raceId){
  const m={};
  meet.config.runners.forEach(u => { if(u.r===raceId) m[u.id]=u; });
  raceStreams(meet,raceId,'roster').forEach(st => (st.added||[]).forEach(a => { if(!m[a.id]) m[a.id]={id:a.id, n:a.n, s:a.s, r:raceId, added:true}; }));
  return m;
}
function view(meet,raceId){
  const r=resultOf(meet,raceId)||{names:{},status:{},startAdj:0,finishers:null,cols:null};
  const T=pickStream(meet,raceId,'timer',r.srcTimer), C=pickStream(meet,raceId,'school',r.srcSchool), R=pickStream(meet,raceId,'roster',r.srcRoster);
  const sig=sigOf(T,C), cols=r.cols||rawCols(T,C), rm=runnerMap(meet,raceId), entries={}, rows=[], seen={};
  if(R) R.picks.forEach(p => { entries[p.p]={u:p.u}; });
  Object.keys(r.names||{}).forEach(k => { const o=r.names[k]; if(o&&o.clear) delete entries[k]; else if(o) entries[k]=o; });
  let n=Math.max(cols.times.length, cols.schools.length);
  Object.keys(entries).forEach(k => { n=Math.max(n,+k); });
  for(let i=0;i<n;i++){
    const e=entries[i+1]||null, tap=cols.schools[i]||null, tapS=tap&&tap.s&&schoolOf(meet,tap.s)?tap.s:null;
    const runner=e&&e.u?(rm[e.u]||{id:e.u, n:'Unknown runner', s:null, unknown:true}):null;
    let school=runner?(runner.s||tapS):tapS; if(school&&!schoolOf(meet,school)) school=null;
    rows.push({i, time:cols.times[i]==null?null:cols.times[i], tap, tapS, entry:e, runner, name:(e&&e.n)||(runner?runner.n:''), school,
      conflict:!!(runner&&runner.s&&tapS&&runner.s!==tapS), dup:false});
    if(runner) (seen[runner.id]=seen[runner.id]||[]).push(i);
  }
  Object.keys(seen).forEach(k => { if(seen[k].length>1) seen[k].forEach(i => { rows[i].dup=true; }); });
  const unplaced=meet.config.runners.filter(u => u.r===raceId&&!seen[u.id])
    .sort((a,b) => raceIdxSchool(meet,a.s)-raceIdxSchool(meet,b.s)||X.nameKey(a.n).localeCompare(X.nameKey(b.n)));
  return {r, T, C, R, times:cols.times, schools:cols.schools, rows, n, edited:!!r.cols, stale:!!r.cols&&r.cols.sig!==sig, sig, adj:r.startAdj||0, unplaced, rm,
    named:rows.some(x => x.entry)};   /* with no names recorded, runners without a place are not counted as DNS */
}
function raceIdxSchool(meet,sid){ const i=meet.config.schools.findIndex(s => s.id===sid); return i<0?999:i; }
function ensureCols(meet,raceId){
  const r=resultOf(meet,raceId,true);
  if(!r.cols){ const v=view(meet,raceId), raw=rawCols(v.T,v.C); r.cols={times:raw.times, schools:raw.schools, sig:v.sig}; }
  return r;
}
const EXPORT_HEAD=['Place','Team','Last Name','First Name','Time'];
function exportRows(meet,raceId){
  const v=view(meet,raceId), out=[];
  v.rows.forEach(row => { const sch=row.school?schoolOf(meet,row.school):null, nm=X.splitName(row.name||'');
    out.push([row.i+1, sch?sch.name:'', nm.last, nm.first, row.time!=null?fmtTime(row.time+v.adj):'']); });
  if(v.named) v.unplaced.forEach(u => { const sch=schoolOf(meet,u.s), nm=X.splitName(u.n); out.push([(v.r.status||{})[u.id]||'DNS', sch?sch.name:'', nm.last, nm.first, '']); });
  return out;
}
function toDelimited(meet,raceIds,sep){
  const many=raceIds.length>1, rows=[(many?['Race']:[]).concat(EXPORT_HEAD)];
  raceIds.forEach(id => { const race=raceOf(meet,id); exportRows(meet,id).forEach(r => rows.push(many?[race.name].concat(r):r)); });
  return rows.map(r => r.map(c => sep===','?X.csvCell(c):String(c).replace(/[\t\n]/g,' ')).join(sep)).join('\n');
}

/* ---------- moving data between devices ---------- */
/* Season links carry the Sheet: #s= for volunteers, #a= for the organizer's own devices. The Sheet then says which
   meet is today's. The older per-meet links (#m= volunteer, #o= organizer) still work as a no-signal backup. */
const LINK_RE=/#([moasr])=([A-Za-z0-9_.~-]+)/;
function meetLinkFor(code, owner){ return location.href.split('#')[0]+(owner?'#o=':'#m=')+code; }
function sheetKey(url){
  const m=/^https:\/\/script\.google\.com\/(?:a\/macros\/([^\/\s]+)\/|)macros\/s\/([A-Za-z0-9_-]+)\/exec$/.exec(url||''); if(!m) return '';
  return m[1]?'d~'+m[1]+'~'+m[2]:m[2];
}
function urlFromKey(key){
  const m=/^(?:d~([^~]+)~)?([A-Za-z0-9_-]+)$/.exec(key||''); if(!m) return '';
  return 'https://script.google.com/'+(m[1]?'a/macros/'+m[1]+'/':'')+'macros/s/'+m[2]+'/exec';
}
function seasonLink(owner){ const k=sheetKey(sheetUrl()); return k?location.href.split('#')[0]+(owner?'#a=':'#s=')+k:''; }
function resultsLink(){ const k=sheetKey(sheetUrl()); return k?location.href.split('#')[0]+'#r='+k:''; }
/* Any link from this app: a season link connects the device to the Sheet and follows today's meet; a meet link loads that meet. */
function importLink(kind, code, boot){
  if(kind==='m'||kind==='o') return importCode(code, boot, kind==='o');
  const url=urlFromKey(code); if(!syncUrl({config:{sync:url}})) return Promise.resolve({ok:false, msg:'That season link is not complete. Ask for it again.'});
  S.sheet=url; if(kind==='a') S.org=true; save();
  return followToday(true, true).then(r => { if(r.ok&&kind==='a'&&!/organizer/.test(r.msg)) r.msg+='. This device is an organizer\'s.'; return r; });
}
function importConfig(cfg, boot, owner){
  if(!cfg) return {ok:false, msg:'That is not a meet link from this app.'};
  const local=S.meets[cfg.id], cur=curMeet(), isNew=!local||!!local.config.deleted; let msg, quiet=false;
  if(!local){ S.meets[cfg.id]={config:cfg, streams:{}, results:{}, own:!!owner}; msg='Loaded '+cfg.name; }
  else if(local.config.deleted){ local.config=cfg; msg='Loaded '+cfg.name; }
  else if(cfg.ver>(local.config.ver||0)){ local.config=cfg; msg='Updated '+cfg.name; }
  else{ msg=cfg.name+' is already on this device'; quiet=true; }
  if(owner&&local&&!local.own){ local.own=true; msg+='. Setup and Results are now available on this device'; quiet=false; }
  if(syncUrl({config:cfg})) S.sheet=syncUrl({config:cfg});   /* any link that carries the Sheet connects this device to it */
  if(!cur||cur.config.id!==cfg.id){
    if(cur&&S.ui.lock){ msg+='. This device is in the middle of a job for '+cur.config.name+'. Exit that first, then choose the meet in Setup.'; quiet=false; }
    else if(cur&&boot&&!isNew){ quiet=true; }   /* an old link left in the address bar never pulls the device off its current meet */
    else{ S.meetId=cfg.id; Object.assign(S.ui,{lock:null, tab:'home', resRace:null, openRow:null, rosterSchool:null}); }
  }
  save(); return {ok:true, msg, quiet};
}
function importStreams(p){
  if(!p) return {ok:false, msg:'That code is not from this app.'};
  const meet=S.meets[p.meetId];
  if(!meet||meet.config.deleted) return {ok:false, msg:'Those taps belong to a meet that is not on this device. Open that meet here first.'};
  if(p.deviceId===S.deviceId) return {ok:true, msg:'That is this device\'s own code. Nothing to add.'};
  const parts=[]; let skipped=0;
  p.streams.forEach(st => {
    const race=raceOf(meet,st.raceId); if(!race){ if(hasData(st)) skipped++; return; }
    const loc=meet.streams[st.id];
    if(!loc||(st.updatedAt||0)>=(loc.updatedAt||0)) meet.streams[st.id]=st;
    if(hasData(st)) parts.push(race.name+' '+KIND_LABEL[st.kind].toLowerCase()+' '+entryCount(st));
  });
  save();
  let msg='Got '+(p.deviceName||'a device')+': '+(parts.join(', ')||'no taps')+'.';
  if(skipped) msg+=' '+plural(skipped,'list')+' skipped: '+(skipped>1?'their races are':'its race is')+' not in this device\'s setup.';
  if(p.ver&&p.ver!==meet.config.ver) msg+=' Their phone has '+(p.ver<meet.config.ver?'an older':'a newer')+' copy of the meet setup.';
  if(p.meetId!==S.meetId) msg+=' Saved under '+meet.config.name+', which is not the meet on screen.';
  return {ok:true, msg};
}
function importCode(code, boot, owner){
  return X.decodeText(code).then(txt => {
    let obj=null; try{ obj=JSON.parse(txt); }catch(e){}
    if(obj&&obj.st) return importStreams(X.unpackStreams(obj));
    if(obj&&obj.i) return importConfig(X.unpackConfig(obj), boot, owner);
    return {ok:false, msg:'That code is not from this app.'};
  }, e => ({ok:false, msg:(e&&e.message)==='old-browser'?'This browser is too old to read the code. Update the phone or use another device.':'That code could not be read. Copy or scan it again.'}));
}
/* Accepts a meet link, one or more frames, or a bare code. */
function importIncoming(text){
  text=String(text||'').trim();
  const link=LINK_RE.exec(text);
  if(link) return importLink(link[1], link[2], false);
  /* several volunteers' codes can be pasted together: collect each one separately */
  const asms={}, order=[];
  text.split(/\s+/).forEach(tok => { const f=X.parseFrame(tok); if(!f) return; const key=f.msg+'/'+f.n;
    if(!asms[key]){ asms[key]={asm:new X.Assembler(), res:null}; order.push(key); } asms[key].res=asms[key].asm.add(tok); });
  if(order.length){
    const results=[]; let chain=Promise.resolve();
    order.forEach(key => { const res=asms[key].res;
      chain=chain.then(() => res.done?importCode(res.code):{ok:false, msg:'Only '+res.have+' of '+res.total+' parts of a code were pasted.'}).then(r => { results.push(r); }); });
    return chain.then(() => ({ok:results.every(r => r.ok), msg:results.map(r => r.msg).join(' ')}));
  }
  if(/^[zp][A-Za-z0-9_-]{8,}$/.test(text)) return importCode(text);
  if(syncUrl({config:{sync:text}})){ S.sheet=text; save(); return followToday(true, true); }
  return Promise.resolve({ok:false, msg:'That text is not a link or a code from this app.'});
}
function sendPayload(meet){
  const mine=myStreams(meet).filter(hasData);
  return X.encodeText(JSON.stringify(X.packStreams({meetId:meet.config.id, ver:meet.config.ver, deviceId:S.deviceId, deviceName:S.deviceName}, mine)));
}
function sendSummary(meet){
  return myStreams(meet).filter(hasData).sort((a,b) => raceIdx(meet,a.raceId)-raceIdx(meet,b.raceId))
    .map(st => raceOf(meet,st.raceId).name+' '+KIND_LABEL[st.kind].toLowerCase()+': '+entryCount(st)).join(' · ');
}

/* ---------- automatic upload to the organizer's Google Sheet ----------
   Taps are always saved on the phone first. A phone uploads its lists only when it is quiet: when the volunteer
   leaves the race screen, or two minutes after the last tap. Tapping never waits for the network. */
function syncUrl(meet){
  const u=String((meet&&meet.config.sync)||'').trim();
  return /^https:\/\/script\.google\.com\/(a\/macros\/[^\/\s]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/.test(u)?u:'';
}
/* The Sheet this device knows: the current meet's, or the last one any link or Setup gave it. */
function sheetUrl(){ return syncUrl(curMeet())||syncUrl({config:{sync:S.sheet||''}}); }
function fetchJSON(url, opts){
  const ac=new AbortController(), t=setTimeout(() => ac.abort(), 25000);
  return fetch(url, Object.assign({signal:ac.signal, cache:'no-store', redirect:'follow'}, opts||{}))
    .then(r => { if(!r.ok) throw new Error('The Sheet answered with an error ('+r.status+')'); return r.json(); })
    .then(v => { clearTimeout(t); return v; }, e => { clearTimeout(t); throw e; });
}
/* text/plain keeps this a simple request, which is what a Google Apps Script web app accepts from another site */
function postSheet(url, body){ return fetchJSON(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body)}); }
function mySig(meet){ return myStreams(meet).filter(hasData).map(s => s.id+':'+s.updatedAt).sort().join('|'); }
function upInfo(meet){ return (S.up&&S.up[meet.config.id])||{}; }
function uploadPending(meet){ const sig=mySig(meet); return !!sig&&sig!==upInfo(meet).sig; }
function lastActivity(meet){ return myStreams(meet).reduce((m,s) => Math.max(m,s.updatedAt||0), 0); }
let upBusy=false, upErr=null, upTried=0, upFlash=0;
/* During a race every tap is uploaded within a second or two (see scheduleUpload), with a 10-second sweep behind it; the upload runs in the
   background and never holds up a tap. Outside a race it uploads as soon as anything changes. */
function maybeUpload(force){
  const meet=[curMeet()].concat(liveMeets()).find(m => m&&syncUrl(m)&&uploadPending(m)), url=syncUrl(meet);
  if(!meet||!url||upBusy) return;
  if(!force&&Date.now()-upTried<8000) return;
  if(navigator.onLine===false){ softHeader(); softSync(); return; }
  upBusy=true; upTried=Date.now(); softHeader(); softSync();
  const sig=mySig(meet), id=meet.config.id;
  sendPayload(meet).then(code => postSheet(url, {t:'up', meet:id, device:S.deviceId, name:S.deviceName||'', summary:sendSummary(meet), code}))
    .then(res => { if(!res||!res.ok) throw new Error((res&&res.error)||'The Sheet refused the upload'); (S.up=S.up||{})[id]={sig, at:Date.now()}; upErr=null; upFlash=Date.now(); save(); },
          e => { upErr=String((e&&e.message)||e); })
    .then(() => { upBusy=false; softHeader(); softSync(); if(ov&&ov.type==='send'){ const el=$('upnote'); if(el) el.outerHTML=upNoteHTML(curMeet()); }
      if(!upErr&&uploadPending(curMeet())) scheduleUpload(); });   /* taps that landed during the upload go next */
}
/* Every tap is pushed about a second later, so the organizer's Results screen fills in as runners cross. */
let upT=null;
function scheduleUpload(){ clearTimeout(upT); upT=setTimeout(() => { upT=null; maybeUpload(true); }, 1200); }
function upStatus(meet){
  if(!meet||!syncUrl(meet)||!myStreams(meet).some(hasData)) return null;
  if(upBusy) return ['', 'Uploading'];
  if(uploadPending(meet)) return ['warn', navigator.onLine===false?'Waiting for signal':upErr?'Upload failed, retrying':'Not uploaded yet'];
  return ['ok', 'Uploaded '+clockStr(upInfo(meet).at||Date.now())];
}
function ago(ts){ const s=Math.max(0, Math.round((Date.now()-ts)/1000)); return s<5?'just now':s<60?s+' s ago':s<3600?Math.round(s/60)+' min ago':'at '+clockStr(ts); }
/* The line under the race-day buttons: what is saved on this phone and whether the Sheet has it. */
function syncLineHTML(meet){
  const lock=S.ui.lock; if(!lock||!meet) return '';
  const mine=myStreams(meet).filter(s => s.kind===lock.kind), n=mine.reduce((a,s) => a+entryCount(s), 0);
  const what=lock.kind==='roster'?'name':'tap', saved='<b>'+plural(n,what)+'</b> on this phone';
  if(!syncUrl(meet)) return '<span class="dot ok"></span>'+saved+'<span class="sep">&middot;</span>no Sheet';
  if(!n&&!uploadPending(meet)) return '<span class="dot"></span>'+saved;
  if(upBusy) return '<span class="dot"></span>'+saved+'<span class="sep">&middot;</span>uploading';
  if(uploadPending(meet)) return '<span class="dot warn"></span>'+saved+'<span class="sep">&middot;</span>'+(navigator.onLine===false?'no signal, upload later':upErr?'upload failed, retrying':'upload soon');
  const at=upInfo(meet).at||Date.now();
  return '<span class="dot ok"></span>'+saved+'<span class="sep">&middot;</span>'+(Date.now()-upFlash<4000?'<b class="okword">uploaded just now</b>':'uploaded '+ago(at));
}
function softSync(){ const el=$('syncline'); if(el) el.innerHTML=syncLineHTML(curMeet()); }
setInterval(softSync, 5000);

/* ---- the meet's setup lives on the Sheet too, so any device with the Sheet can open it, and phones pick up changes ---- */
let setupT=null, setupBusy=false;
function setupPending(meet){ return !!(meet&&isOwner(meet)&&syncUrl(meet)&&((S.setupUp||{})[meet.config.id]||0)!==meet.config.ver); }
function scheduleSetupPush(){ clearTimeout(setupT); setupT=setTimeout(pushSetup, 1500); }
function setupSummary(c){ return (c.date?niceDate(c.date)+' · ':'')+plural(c.schools.length,'school')+' · '+c.races.map(r => r.name+' '+c.runners.filter(u => u.r===r.id).length).join(', '); }
function pushSetup(){
  const meet=curMeet(); if(!meet||setupBusy||!setupPending(meet)||navigator.onLine===false) return;
  const ver=meet.config.ver, id=meet.config.id, url=syncUrl(meet);
  setupBusy=true;
  meetCode(meet).then(code => postSheet(url, {t:'up', meet:id, device:'setup', name:meet.config.name, summary:setupSummary(meet.config), code}))
    .then(res => { if(res&&res.ok){ (S.setupUp=S.setupUp||{})[id]=ver; save(); if(listInfo) listInfo.at=0; } }, () => {})
    .then(() => { setupBusy=false; const el=$('setupnote'); if(el) el.textContent=setupNote(curMeet()); });
}
function setupNote(meet){
  if(!meet||!syncUrl(meet)) return '';
  if(setupBusy) return 'Saving the setup to the Sheet.';
  return setupPending(meet)?(navigator.onLine===false?'The setup will be saved to the Sheet when this device has signal.':'Setup not yet saved to the Sheet.'):'Setup saved to the Sheet. Phones that have the meet pick up changes by themselves.';
}
/* Today's meet, as marked on the Sheet. A volunteer phone switches to it whenever it checks (opening the app, signal
   coming back, leaving a race screen, every few minutes). An organizer device opens it too, unless the organizer
   chose another meet since today's was set. Nothing on the phone is thrown away: every meet it has stays stored. */
function followToday(force, announce){
  const meet=curMeet();
  if(!sheetUrl()) return Promise.resolve({ok:false, msg:'No Sheet on this device yet'});
  if(navigator.onLine===false) return Promise.resolve({ok:!!meet, quiet:!announce, msg:meet?'No signal: using '+meet.config.name+' from last time':'No signal, and no meet on this device yet. Try again with signal.'});
  return listSheet(force).then(li => {
    if(!li) return {ok:!!meet, quiet:true, msg:''};
    if(li.err) return {ok:!!meet, quiet:!announce, msg:li.err==='oldscript'?'The Sheet runs an older script. Update it from Setup.':'Could not reach the Sheet: '+li.err};
    const today=li.today, m=today&&li.meets.find(x => x.meet===today);
    if(!m||!m.setup) return {ok:!!meet, quiet:!announce, msg:'No meet is marked as today\'s on the Sheet yet.'+(meet?' Staying on '+meet.config.name+'.':'')};
    const own=!volunteerURL()&&!boardURL(), cur=curMeet();
    if(cur&&cur.config.id!==today&&S.ui.lock) return {ok:true, quiet:!announce, msg:'Today\'s meet is '+m.name+'. Exit the current job and it will switch.'};
    if(cur&&cur.config.id!==today&&own&&S.chosen&&S.chosen.meet===cur.config.id&&S.chosen.today===today) return {ok:true, quiet:true, msg:''};   /* organizer picked this one on purpose */
    const before=cur?cur.config.id+':'+cur.config.ver:'';
    return importCode(m.setup, false, own).then(r => {
      if(!r.ok) return r;
      if(S.meetId!==today){ S.meetId=today; Object.assign(S.ui,{lock:null, tab:(S.ui.tab==='setup'||S.ui.tab==='results'||S.ui.tab==='live')&&own?S.ui.tab:'home', resRace:null, openRow:null, rosterSchool:null}); }
      if(own) S.chosen=null;
      save();
      const now=curMeet(), changed=now&&(now.config.id+':'+now.config.ver)!==before;
      return {ok:true, quiet:!changed&&!announce, msg:changed?'Today\'s meet: '+now.config.name:'Today\'s meet, '+now.config.name+', is on this device'};
    });
  });
}
let followAt=0;
function followTick(force){
  if(!sheetUrl()||S.ui.lock||ov||typing()) return;
  if(!force&&Date.now()-followAt<300000) return;
  followAt=Date.now();
  followToday(force, false).then(r => { if(!r.quiet&&r.msg) toast(r.msg); if(r.ok&&!S.ui.lock&&!ov&&!typing()) render(); });
}
function setToday(id){
  const url=sheetUrl(); if(!url) return;
  toast('Marking today\'s meet');
  postSheet(url, {t:'today', meet:id}).then(res => { if(!res||!res.ok) throw new Error((res&&res.error)||'refused');
    if(listInfo) listInfo.today=id; S.chosen=null; save(); toast('Today\'s meet is now '+((S.meets[id]||{config:{name:id}}).config.name)+'. Volunteers\' phones switch to it when they next open the app.'); render();
    listSheet(true).then(() => { if(!typing()&&!S.ui.lock&&!ov) render(); }); })
    .catch(e => toast('Could not mark it ('+String((e&&e.message)||e)+'). Check the connection.'));
}
function deleteMeet(id){
  const m=S.meets[id], url=sheetUrl();
  if(todayId()===id){ toast('That is today\'s meet. Mark another meet as today\'s first.'); return; }
  const finish=() => { if(m) m.config.deleted=true; if(S.meetId===id){ S.ui.lock=null; S.meetId=(liveMeets()[0]||{config:{}}).config.id||null; } save(); render(); };
  if(!url||!(listInfo&&listInfo.meets.some(x => x.meet===id))){ finish(); toast('Removed from this device'); return; }
  const tabs=m?m.config.races.map(r => m.config.name+' '+r.name):[];
  toast('Deleting from the Sheet');
  postSheet(url, {t:'delete', meet:id, tabs}).then(res => { if(!res||!res.ok) throw new Error((res&&res.error)||'refused');
    if(listInfo) listInfo.meets=listInfo.meets.filter(x => x.meet!==id); finish(); toast('Deleted from the Sheet and this device'); })
    .catch(e => toast('Not deleted: '+String((e&&e.message)||e)));
}
/* Every meet on the Sheet, for the organizer's home screen and for the mismatch check in Results. */
let listBusy=false, listInfo=null;
function listSheet(force){
  const url=sheetUrl(); if(!url||listBusy||navigator.onLine===false) return Promise.resolve(null);
  if(!force&&listInfo&&listInfo.url===url&&Date.now()-listInfo.at<20000) return Promise.resolve(listInfo);
  listBusy=true;
  return fetchJSON(url+'?list=1').then(res => {
    if(!res||!res.ok) throw new Error((res&&res.error)==='No meet given'?'oldscript':((res&&res.error)||'The Sheet refused the request'));
    listInfo={url, at:Date.now(), meets:res.meets||[], today:res.today||'', err:null};
  }).catch(e => { listInfo={url, at:Date.now(), meets:[], err:String((e&&e.message)||e)}; }).then(() => { listBusy=false; return listInfo; });
}
function sheetMeetsHTML(meet){
  const url=sheetUrl(); if(!url) return '';
  let h='<section class="sec"><h3>Meets on the Sheet</h3>';
  if(!listInfo||listInfo.url!==url) h+='<p class="note" id="listnote">'+(listBusy?'Checking the Sheet.':'Not checked yet.')+'</p>';
  else if(listInfo.err==='oldscript') h+='<div class="banner warn"><strong>The Sheet is running an older script.</strong>In Setup press Copy the script, paste it over the old one in Apps Script, then Deploy, Manage deployments, Edit, New version.</div>';
  else if(listInfo.err) h+='<p class="note">Could not reach the Sheet ('+esc(listInfo.err)+').</p>';
  else{
    const ms=listInfo.meets.slice().sort((a,b) => Math.max(b.setupAt||0, ...b.devices.map(d => d.at||0))-Math.max(a.setupAt||0, ...a.devices.map(d => d.at||0)));
    if(!ms.length) h+='<p class="note">Nothing on the Sheet yet.</p>';
    else h+='<p class="note">Volunteers\' phones open whichever meet is marked today\'s.'+(listInfo.today?'':' None is marked yet.')+'</p><div class="list">'+ms.map(m => { const cur=meet&&meet.config.id===m.meet, isToday=listInfo.today===m.meet, last=Math.max(0, ...m.devices.map(d => d.at||0));
      return '<div class="item'+(isToday?' today':'')+'"><div class="grow"><strong>'+esc(m.name||'(no setup saved)')+'</strong>'+(isToday?' <span class="badge">Today\'s meet</span>':'')+' <span class="status">'+esc(m.meet)+'</span><div class="status">'+esc(m.summary||'')+(m.devices.length?(m.summary?' · ':'')+plural(m.devices.length,'phone')+' uploaded, last '+ago(last):'')+'</div></div>'+
        '<div class="picks">'+(cur?'<span class="status">open now</span>':m.setup?'<button data-act="open-sheet-meet" data-m="'+esc(m.meet)+'">Open</button>':'')+
        (isToday||!m.setup?'':'<button data-act="set-today" data-m="'+esc(m.meet)+'" data-confirm="Tap again: today\'s meet">Make today\'s meet</button>')+
        (isToday?'':'<button class="danger" data-act="del-sheet-meet" data-m="'+esc(m.meet)+'" data-confirm="Tap again to delete">Delete</button>')+'</div></div>'; }).join('')+'</div>';
  }
  return h+'<div class="rowf"><button class="btn" data-act="list-sheet">Check the Sheet</button><button class="btn" data-act="new-meet">New meet</button><button class="btn" data-act="sample-meet">Load a sample meet</button></div></section>';
}
function openSheetMeet(id){
  const m=listInfo&&listInfo.meets.find(x => x.meet===id); if(!m||!m.setup){ toast('That meet has no setup on the Sheet'); return; }
  importCode(m.setup, false, true).then(r => { toast(r.msg); if(r.ok){ S.org=true; S.meetId=id; S.chosen={meet:id, today:todayId()}; Object.assign(S.ui,{lock:null, tab:'home', resRace:null, openRow:null, rosterSchool:null}); save(); render(); pullSheet(false); } });
}
/* Phones uploading to a meet that is not the one open here: the usual sign that a link went to the wrong copy. */
function otherMeetsHTML(meet){
  if(!listInfo||listInfo.err||!meet) return '';
  const recent=Date.now()-12*3600000;
  const others=listInfo.meets.filter(m => m.meet!==meet.config.id&&m.devices.some(d => (d.at||0)>recent));
  if(!others.length) return '';
  return others.map(m => { const last=Math.max(...m.devices.map(d => d.at||0));
    return '<div class="banner warn"><strong>'+plural(m.devices.length,'phone')+' uploaded to a different meet, '+esc(m.name||m.meet)+' ('+esc(m.meet)+'), last '+ago(last)+'.</strong>Volunteers may be on another link. Those uploads are safe on the Sheet.'+
      (m.setup?'<div class="acts"><button class="btn sm" data-act="open-sheet-meet" data-m="'+esc(m.meet)+'">Switch to that meet</button></div>':'')+'</div>'; }).join('');
}
function upNoteHTML(meet){
  const s=upStatus(meet);
  if(!s) return '<div id="upnote"></div>';
  if(s[0]==='ok') return '<div class="banner ok" id="upnote"><strong>Everything on this phone has been uploaded to the organizer.</strong>The code below is only a backup.</div>';
  return '<div class="banner warn" id="upnote"><strong>'+(upBusy?'Uploading now.':'Not uploaded yet.')+'</strong>'+(upBusy?'':'It uploads by itself once the phone has signal. With no signal, show this code to the organizer instead.')+'</div>';
}
/* organizer side: collect what the phones uploaded, and send finished results to the Sheet */
let pullBusy=false, pullInfo=null, sheetMsg=null, sheetBusy=false;
function streamsSig(meet){ return Object.values(meet.streams).map(s => s.id+':'+(s.updatedAt||0)).sort().join('|'); }
function pullSheet(manual){
  const meet=curMeet(), url=syncUrl(meet);
  if(!meet||!url||pullBusy) return;
  if(navigator.onLine===false){ if(manual) toast('No connection right now'); return; }
  pullBusy=true; const before=streamsSig(meet), id=meet.config.id, hadErr=!!(pullInfo&&pullInfo.err);
  if(manual) render();
  fetchJSON(url+'?meet='+encodeURIComponent(id)).then(res => {
    if(!res||!res.ok) throw new Error((res&&res.error)||'The Sheet refused the request');
    let chain=Promise.resolve(), n=0;
    const phones=(res.uploads||[]).filter(u => u.device!=='setup').map(u => ({device:u.device, name:u.name, at:u.at, summary:u.summary, mine:u.device===S.deviceId}));
    (res.uploads||[]).forEach(u => { if(u.device===S.deviceId||!u.code) return; chain=chain.then(() => importCode(u.code)).then(r => { if(r.ok) n++; }); });
    return chain.then(() => { pullInfo={at:Date.now(), n, err:null, phones}; });
  }).catch(e => { pullInfo={at:Date.now(), n:0, err:String((e&&e.message)||e), phones:(pullInfo&&pullInfo.phones)||[]}; }).then(() => {
    pullBusy=false;
    const m=S.meets[id], changed=!m||streamsSig(m)!==before||hadErr!==!!pullInfo.err;
    if((S.ui.tab==='results'||S.ui.tab==='live'||S.ui.tab==='roster')&&!S.ui.lock&&!ov&&(manual||changed)){ if(typing()) deferRender(); else render(); }
    else{ document.querySelectorAll('.pullnote').forEach(el => { el.textContent=pullNote(); }); }
  }).then(() => listSheet(!!manual)).then(() => { const el=$('others'); if(el) el.innerHTML=otherMeetsHTML(curMeet()); });
}
function phonesHTML(meet){
  const ph=(pullInfo&&pullInfo.phones)||[]; if(!ph.length) return '';
  return '<div class="list">'+ph.map(p => '<div class="item"><div class="grow"><strong>'+esc(p.mine?'This device':(p.name||p.device))+'</strong><div class="status">'+esc(p.summary||'')+'</div></div><span class="status">uploaded '+esc(ago(p.at||0))+'</span></div>').join('')+'</div>';
}
function pullNote(){
  if(pullBusy) return 'Checking the Sheet.';
  if(!pullInfo) return 'Not checked yet.';
  if(pullInfo.err) return 'Could not reach the Sheet at '+clockStr(pullInfo.at)+'. It will try again; the QR codes still work.';
  return 'Checked the Sheet '+ago(pullInfo.at)+': '+plural(((pullInfo.phones||[]).length),'phone')+' uploaded.';
}
function sendResults(meet){
  const url=syncUrl(meet); if(!url||sheetBusy) return;
  const tabs=meet.config.races.map(r => ({title:meet.config.name+' '+r.name, rows:[EXPORT_HEAD].concat(exportRows(meet,r.id))})).filter(t => t.rows.length>1);
  if(!tabs.length){ toast('There are no results to send yet'); return; }
  sheetBusy=true; sheetMsg=null; render();
  postSheet(url, {t:'results', tabs}).then(res => {
    if(!res||!res.ok) throw new Error((res&&res.error)||'The Sheet refused the results');
    sheetMsg={kind:'ok', text:'Sent '+plural((res.tabs||tabs).length,'race')+' to the Sheet, one tab each. Sending again replaces them.', link:/^https:\/\/docs\.google\.com\//.test(res.url||'')?res.url:null};
  }).catch(e => { sheetMsg={kind:'warn', text:'The results did not go through ('+String((e&&e.message)||e)+'). Check the connection and try again, or use Copy.'}; })
    .then(() => { sheetBusy=false; if(typing()) deferRender(); else render(); });
}
setInterval(() => { maybeUpload(false); pushSetup(); followTick(false); }, 10000);
setInterval(() => { if((S.ui.tab==='results'||S.ui.tab==='live'||S.ui.tab==='roster')&&!S.ui.lock&&!ov&&document.visibilityState==='visible') pullSheet(false); }, 5000);
window.addEventListener('online', () => { softHeader(); softSync(); maybeUpload(false); pushSetup(); followTick(true); });
window.addEventListener('offline', () => softHeader());

/* ---------- small UI helpers ---------- */
let toastT=null;
function toast(msg){
  /* on a race-day screen the message goes in the status line, so nothing ever floats over the buttons or the race switch */
  const line=S.ui.lock&&!ov?$('last'):null, t=$('toast');
  clearTimeout(toastT);
  if(line){ t.hidden=true; line.textContent=msg; line.classList.add('say'); toastT=setTimeout(() => { line.classList.remove('say'); softLock(); }, 2800); return; }
  t.textContent=msg; t.hidden=false; toastT=setTimeout(() => { t.hidden=true; }, 2800);
}
let actx=null;
function beep(f){
  if(!S.sound) return;
  try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume();
    const o=actx.createOscillator(), g=actx.createGain(), t=actx.currentTime; o.frequency.value=f||880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.08); o.start(t); o.stop(t+0.09);
  }catch(e){}
}
function buzz(){ if(navigator.vibrate) try{ navigator.vibrate(12); }catch(e){} }
function primeAudio(){ if(!S.sound) return; try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume(); }catch(e){} }
let wl=null, wakeFail=false;
async function wake(on){
  try{
    if(on){
      if(!navigator.wakeLock) wakeFail=true;
      else if(!wl){ wl=await navigator.wakeLock.request('screen'); wakeFail=false; wl.addEventListener('release', () => { wl=null; }); }
    }else if(wl){ const w=wl; wl=null; await w.release(); }
  }catch(e){ if(on) wakeFail=true; }
  const el=$('wakenote'); if(el) el.hidden=!(wakeFail&&S.ui.lock);
}
const WAKENOTE='<div class="status warnline" id="wakenote" hidden>This screen may dim and lock by itself. Set Auto-Lock to Never for the race.</div>';
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState!=='visible') return;
  let str=null; try{ str=localStorage.getItem(LS); }catch(e){}
  if(adoptStored(str)&&!typing()) render();
  if(S.ui.lock) wake(true);
});
window.addEventListener('storage', e => { if(e.key===LS&&adoptStored(e.newValue)){ if(typing()) deferRender(); else render(); } });
function flash(el){ if(!el) return; el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 110); }
function copyText(text, okMsg, fallbackId){
  const fb=() => { const ta=fallbackId&&$(fallbackId); if(ta){ ta.hidden=false; ta.value=text; ta.focus(); ta.select(); toast('Copy the selected text'); } else toast('Copying is blocked in this browser'); };
  try{ navigator.clipboard.writeText(text).then(() => toast(okMsg), fb); }catch(e){ fb(); }
}
function download(name, text, type){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:type||'text/csv'})); a.download=name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function shareFail(e){ if(!e||e.name!=='AbortError') toast('Sharing was blocked. Try again, or use Copy.'); }
function fileSlug(s){ return String(s).replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,''); }

/* ---------- rendering ---------- */
let pendingRender=false, pdown=false, flushT=null, lockRenderAt=0;
function typing(){ const a=document.activeElement; return a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.closest('#app'); }
function flushRender(){
  clearTimeout(flushT); flushT=null;
  if(!pendingRender) return;
  if(typing()||pdown){ flushT=setTimeout(flushRender,120); return; }
  pendingRender=false; render();
}
function deferRender(){ pendingRender=true; if(!flushT) flushT=setTimeout(flushRender,120); }

function statusPill(){
  if(!storageOK) return ['bad','Not saving'];
  return upStatus(curMeet())||(offlineReady?['ok','Works offline']:['','Saved on device']);
}
function softHeader(){ const el=$('pill'); if(el){ const s=statusPill(); el.innerHTML='<span class="dot '+s[0]+'"></span>'+esc(s[1]); } }
function render(noGuard){
  const app=$('app'); let meet=curMeet(); pendingRender=false;
  if(!meet){ const first=liveMeets()[0]; if(first){ S.meetId=first.config.id; meet=first; } }
  if(S.ui.lock&&!meet) S.ui.lock=null;
  if(S.ui.lock){
    app.className='app locked';
    app.innerHTML=S.ui.lock.kind==='timer'?lockTimerHTML(meet):S.ui.lock.kind==='school'?lockSchoolHTML(meet):lockRosterHTML(meet);
    if(noGuard!==true) lockRenderAt=performance.now();
    softLock(); wake(true); return;
  }
  wake(false);
  if(boardURL()){
    S.ui.tab='live'; app.className='app board';
    app.innerHTML='<header class="top"><div class="brand"><strong>'+esc(meet?meet.config.name:'XC Finish Line')+'</strong><span>'+esc(meet?(meet.config.date?niceDate(meet.config.date)+' · ':'')+'Results':'Results')+'</span></div></header>'+
      '<main id="main" class="main"><div class="wrap">'+(meet?liveHTML(meet):'<div class="empty"><p>'+(sheetUrl()?'No meet is marked as today\'s yet. This page updates by itself once one is.':'This results link is not complete.')+'</p></div>')+'</div></main>';
    return;
  }
  const keep=$('main'), top=keep?keep.scrollTop:0, s=statusPill();
  const tabs=!meet?[]:[['timer','Timer'],['schools','Schools']].concat(isOwner(meet)?[['roster','Roster'],['live','Results'],['results','Review'],['setup','Setup']]:[]);
  app.className='app';
  app.innerHTML='<header class="top"><button class="brand" data-act="tab" data-tab="home"><strong>XC Finish Line</strong><span>'+esc(meet?meet.config.name:'No meet on this device')+(meet?' <i class="code">'+esc(meet.config.id)+'</i>':'')+'</span></button>'+
    '<button class="pill" id="pill" data-act="upload-now"><span class="dot '+s[0]+'"></span>'+esc(s[1])+'</button>'+
    (meet?'<button class="btn sm pri" data-act="send">Send</button>':'')+'</header>'+
    '<nav class="tabs" role="tablist" style="--n:'+Math.max(1,tabs.length)+'"'+(tabs.length?'':' hidden')+'>'+tabs.map(t => '<button role="tab" aria-selected="'+(S.ui.tab===t[0])+'" data-act="tab" data-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</nav>'+
    '<main id="main" class="main"><div class="wrap">'+mainHTML(meet)+'</div></main>';
  $('main').scrollTop=top;
}
function mainHTML(meet){
  const warn=storageOK?'':'<div class="banner bad"><strong>This browser is not saving data on the device.</strong>Taps will be lost if the page reloads. Turn off private browsing before the race.</div>';
  if(!meet) return warn+noMeetHTML();
  let tab=S.ui.tab;
  if(!isOwner(meet)&&(tab==='setup'||tab==='results'||tab==='live'||tab==='roster')) tab='home';   /* volunteers have the two line jobs only */
  if(tab==='setup'){ refreshLink(); return warn+setupHTML(meet); }
  if(tab==='live') return warn+liveHTML(meet);
  if(tab==='timer') return warn+timerHTML(meet);
  if(tab==='schools') return warn+schoolsHTML(meet);
  if(tab==='roster') return warn+rosterHTML(meet);
  if(tab==='results') return warn+resultsHTML(meet);
  return warn+homeHTML(meet);
}
function noMeetHTML(){
  const su=sheetUrl(), vol=volunteerURL();
  if(vol) return '<section class="sec"><h2>No meet yet</h2><p class="note">'+(su?'No meet is marked as today\'s on the Sheet yet. Ask the organizer, then open the app again with signal.':'Open the season link you were sent, or paste it here.')+'</p>'+
    (su?'':'<label class="field"><span>Link</span><textarea id="linkpaste" class="linkbox" placeholder="Paste the link"></textarea></label><div class="rowf"><button class="btn pri" data-act="import-link">Open</button></div>')+'</section>'+versionHTML();
  return '<section class="sec"><h2>'+(su?'No meet marked as today\'s':'Connect your Sheet')+'</h2><p class="note">'+(su?'The Sheet is connected. Mark a meet below as today\'s, or make a new one.':'Paste your Sheet\'s web app link once (it ends in /exec; find it in Apps Script under Deploy, Manage deployments). Every meet on the Sheet is then available here. Or create a meet without a Sheet.')+'</p>'+
    (su?'':'<label class="field"><span>Web app link</span><input type="text" id="sheeturl" data-bind="sheet-url" value="'+esc(S.sheet||'')+'" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off" autocapitalize="off" spellcheck="false"></label>'+
    '<div class="rowf"><button class="btn" data-act="new-meet">Create a meet</button><button class="btn" data-act="sample-meet">Load a sample meet</button></div>')+'</section>'+
    (su?sheetMeetsHTML(null):'')+versionHTML();
}
function versionHTML(){
  return '<section class="sec"><p class="note">Version '+APP_VERSION+'.'+(updateWaiting?' A newer version is ready.':'')+'</p>'+
    (updateWaiting?'<div class="rowf"><button class="btn" data-act="reload-app">Switch to the newer version</button></div>':'')+'</section>';
}
function soundField(){
  return '<label class="field" style="flex:0 1 150px"><span>Tap sound</span><select id="sound" data-bind="sound"><option value="1"'+(S.sound?' selected':'')+'>On</option><option value="0"'+(S.sound?'':' selected')+'>Off</option></select></label>';
}
function meetPickerHTML(meet){
  const meets=liveMeets(); if(meets.length<2) return '';
  return '<label class="field"><span>Meet on this device</span><select id="pickmeet" data-bind="pick-meet">'+meets.map(m =>
    '<option value="'+esc(m.config.id)+'"'+(m.config.id===meet.config.id?' selected':'')+'>'+esc(m.config.name)+(m.config.date?' ('+esc(niceDate(m.config.date))+')':'')+'</option>').join('')+'</select></label>';
}
function deviceNameField(){
  return '<label class="field"><span>Your name or device (shown to the organizer)</span><input type="text" id="devname" data-bind="device-name" value="'+esc(S.deviceName)+'" placeholder="Sam\'s phone" autocomplete="off"></label>';
}
function homeHTML(meet){
  const isToday=todayId()===meet.config.id, owner=isOwner(meet);
  return '<section class="sec"><h2>'+esc(meet.config.name)+(isToday?' <span class="badge">Today\'s meet</span>':'')+'</h2><p class="note">'+(meet.config.date?esc(niceDate(meet.config.date)):'')+
    (owner&&sheetUrl()&&!isToday&&todayId()?' · Not today\'s meet; volunteers\' phones are on the other one.':'')+'</p>'+(owner?'':meetPickerHTML(meet))+
    (owner&&sheetUrl()&&!isToday?'<div class="rowf"><button class="btn pri" data-act="set-today" data-m="'+esc(meet.config.id)+'" data-confirm="Tap again: today\'s meet">Make this today\'s meet</button></div>':'')+
    (owner?'':'<div class="rowf">'+deviceNameField()+soundField()+'</div>')+'</section>'+
    (owner?sheetMeetsHTML(meet)+'<section class="sec"><div class="rowf">'+deviceNameField()+soundField()+'</div></section>':'')+
    '<section class="roles">'+
    '<button class="role c0" data-act="go" data-kind="timer"><b>Timer</b><span>At the line. Press START for each race, then tap once for every runner who crosses. Switch races at the top.</span></button>'+
    '<button class="role c1" data-act="go" data-kind="school"><b>Schools</b><span>At the line. Tap the school of every runner who crosses, in order.</span></button>'+
    '</section>'+versionHTML();
}
/* Team scores, either as one meet (everyone's raw place) or as duals (every pair head to head). */
function chipHTML(meet,sid){ const s=schoolOf(meet,sid); return s?'<span class="chip"><u style="background:'+esc(s.color)+'"></u><span>'+esc(s.name)+'</span></span>':esc(sid); }
function scoresHTML(meet, v, heading){
  const schools=v.rows.map(r => r.school), blanks=v.rows.filter(r => !r.school).length;
  const note=blanks?' '+plural(blanks,'finisher')+' with no school yet, so these can still change.':'';
  if(meet.config.scoring==='dual'){
    const d=X.dualScores(schools); if(!d.pairs.length) return '';
    return '<section class="sec"><h3>'+heading+'</h3>'+(note?'<p class="note">'+note.trim()+'</p>':'')+
      '<div class="tscroll"><table class="grid"><thead><tr><th>Record</th><th>School</th><th>Finishers</th></tr></thead><tbody>'+
      d.records.map(r => '<tr><td class="num">'+r.w+'-'+r.l+(r.t?'-'+r.t:'')+'</td><td>'+chipHTML(meet,r.s)+'</td><td>'+r.finishers+(r.finishers<5?' (fewer than five)':'')+'</td></tr>').join('')+'</tbody></table></div>'+
      '<div class="tscroll"><table class="grid"><thead><tr><th>Score</th><th></th><th>Score</th><th></th></tr></thead><tbody>'+
      d.pairs.map(p => { const wa=p.winner===p.a, wb=p.winner===p.b;
        return '<tr><td class="num'+(wa?' win':'')+'">'+(p.sa==null?'inc.':p.sa)+'</td><td'+(wa?' class="win"':'')+'>'+chipHTML(meet,p.a)+'</td><td class="num'+(wb?' win':'')+'">'+(p.sb==null?'inc.':p.sb)+'</td><td'+(wb?' class="win"':'')+'>'+chipHTML(meet,p.b)+'</td></tr>'; }).join('')+
      '</tbody></table></div></section>';
  }
  const sc=X.teamScores(schools); if(!sc.length) return '';
  return '<section class="sec"><h3>'+heading+'</h3>'+(note?'<p class="note">'+note.trim()+'</p>':'')+
    '<div class="tscroll"><table class="grid"><thead><tr><th>Score</th><th>School</th><th>Scoring places</th><th>Finishers</th></tr></thead><tbody>'+
    sc.map(x => '<tr><td class="num">'+(x.score==null?'inc.':x.score)+'</td><td>'+chipHTML(meet,x.s)+'</td><td>'+(x.score==null?'fewer than five':x.places.slice(0,5).join(', ')+(x.places.length>5?' ('+x.places.slice(5).join(', ')+')':''))+'</td><td>'+x.finishers+'</td></tr>').join('')+
    '</tbody></table></div></section>';
}
/* ----- the results sheet: one self-contained page to save, share or print, laid out like a score sheet ----- */
function sheetDoc(meet){
  const c=meet.config, title=c.name;
  const css='body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:24px;font-size:14px}h1{font-size:22px;margin:0 0 2px}h2{font-size:17px;margin:28px 0 8px;page-break-after:avoid}.sub{color:#555;margin:0 0 18px}'+
    'table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{border:1px solid #888;padding:4px 8px;text-align:left}th{background:#E9EDE8;font-size:12px;text-transform:uppercase;letter-spacing:.04em}'+
    '.race{display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap}.res td:first-child,.res th:first-child{text-align:center}.res td:last-child{text-align:right;font-weight:600}'+
    '.boxes{display:grid;grid-template-columns:repeat(2,max-content);gap:14px 22px}.box{border-collapse:collapse}.box th{font-size:12px;text-transform:none;letter-spacing:0}.box td{text-align:center;min-width:3.2em}.box td.disp{background:#E6E6E6}.box tr.sum td{font-weight:700;background:#F3F3F3}.win{font-weight:700}'+
    '.scores{min-width:260px}.dns td{color:#555}@media print{body{margin:12mm}h2{margin-top:18px}}@page{margin:12mm}';
  let body='<h1>Cross Country Score Sheet</h1><p class="sub">'+esc(title)+(c.date?' · '+esc(niceDate(c.date)):'')+'</p>';
  c.races.forEach(race => {
    const v=view(meet,race.id); if(!v.n) return;
    const rows=exportRows(meet,race.id);
    body+='<h2>'+esc(race.name)+'</h2><div class="race"><table class="res"><thead><tr>'+EXPORT_HEAD.map(hh => '<th>'+esc(hh)+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(r => '<tr'+(/^DN/.test(String(r[0]))?' class="dns"':'')+'>'+r.map(x => '<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table><div class="scores">';
    const schools=v.rows.map(r => r.school);
    if(c.scoring==='dual'){
      const d=X.dualScores(schools);
      body+='<table><thead><tr><th>Record</th><th>Team</th></tr></thead><tbody>'+d.records.map(r => '<tr><td>'+r.w+'-'+r.l+(r.t?'-'+r.t:'')+'</td><td>'+esc((schoolOf(meet,r.s)||{}).name||r.s)+(r.finishers<5?' (incomplete)':'')+'</td></tr>').join('')+'</tbody></table><br><div class="boxes">'+
        d.pairs.map(p => { const na=(schoolOf(meet,p.a)||{}).name||p.a, nb=(schoolOf(meet,p.b)||{}).name||p.b, n=Math.max(7, p.pa.length, p.pb.length, 7);
          let t='<table class="box"><tr><th class="'+(p.winner===p.a?'win':'')+'">'+esc(na)+'</th><th class="'+(p.winner===p.b?'win':'')+'">'+esc(nb)+'</th></tr>';
          for(let i=0;i<7;i++) t+='<tr><td'+(i>=5?' class="disp"':'')+'>'+(p.pa[i]||'')+'</td><td'+(i>=5?' class="disp"':'')+'>'+(p.pb[i]||'')+'</td></tr>';
          return t+'<tr class="sum"><td>'+(p.sa==null?'-':p.sa)+'</td><td>'+(p.sb==null?'-':p.sb)+'</td></tr></table>'; }).join('')+'</div>';
    }else{
      const sc=X.teamScores(schools);
      if(sc.length) body+='<table><thead><tr><th>Score</th><th>Team</th><th>Scoring places</th></tr></thead><tbody>'+sc.map(x => '<tr><td>'+(x.score==null?'inc.':x.score)+'</td><td>'+esc((schoolOf(meet,x.s)||{}).name||x.s)+'</td><td>'+(x.score==null?'fewer than five':x.places.slice(0,5).join(', ')+(x.places.length>5?' ('+x.places.slice(5).join(', ')+')':''))+'</td></tr>').join('')+'</tbody></table>';
    }
    body+='</div></div>';
  });
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' results</title><style>'+css+'</style></head><body>'+body+'</body></html>';
}
/* A printable poster for the results link: QR code, what it is, and the address in plain text. */
function qrPosterDoc(link, meet){
  const q=window.qrcode(0,'M'); q.addData(link,'Byte'); q.make();
  const n=q.getModuleCount(), cell=10, quiet=4, size=(n+2*quiet)*cell, cv=document.createElement('canvas'); cv.width=cv.height=size;
  const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,size,size); ctx.fillStyle='#000';
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(q.isDark(r,c)) ctx.fillRect((c+quiet)*cell,(r+quiet)*cell,cell,cell);
  const img=cv.toDataURL('image/png'), name=meet?meet.config.name:'', date=meet&&meet.config.date?niceDate(meet.config.date):'';
  const css='@page{size:letter;margin:0}html,body{margin:0;height:100%}body{font-family:Helvetica,Arial,sans-serif;color:#15201B;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}'+
    '.card{width:7.5in;text-align:center;padding:0.6in 0.5in;box-sizing:border-box}.kick{font-size:14px;letter-spacing:.28em;text-transform:uppercase;color:#1D5C41;font-weight:700;margin:0 0 10px}'+
    'h1{font-size:46px;letter-spacing:.02em;text-transform:uppercase;margin:0 0 6px;line-height:1}.sub{font-size:20px;color:#55655C;margin:0 0 30px}'+
    '.qr{display:block;width:4.6in;height:4.6in;margin:0 auto 26px;border:6px solid #15201B;border-radius:18px;padding:10px;box-sizing:border-box}'+
    '.how{font-size:19px;margin:0 0 16px;font-weight:600}.url{font-size:12px;color:#55655C;word-break:break-all;margin:0}.foot{margin-top:30px;font-size:12px;color:#9BACA2;letter-spacing:.2em;text-transform:uppercase}';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Results link</title><style>'+css+'</style></head><body><div class="card">'+
    '<p class="kick">Cross Country</p><h1>Live Results</h1><p class="sub">'+esc(name)+(date?' · '+esc(date):'')+'</p>'+
    '<img class="qr" src="'+img+'" alt="QR code">'+
    '<p class="how">Finish list and team scores as runners come in</p></div></body></html>';
}
function saveFile(fname, text, type){
  let file=null; try{ file=new File([text],fname,{type}); }catch(e){}
  const touch=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
  if(touch&&file&&navigator.canShare&&navigator.canShare({files:[file]})) navigator.share({files:[file], title:fname}).catch(e => { if(!e||e.name!=='AbortError') download(fname,text,type); });
  else download(fname,text,type);
}
/* ----- Live: the finish list as it stands, for showing coaches at the race ----- */
function liveHTML(meet){
  const races=meet.config.races, su=syncUrl(meet);
  if(!races.length) return '<div class="empty"><p>Add a race in Setup first.</p></div>';
  /* until someone picks a race, show the one with the most finishers (the race that is on) */
  let rid=S.ui.liveRace; if(!S.ui.livePicked||!races.some(r => r.id===rid)){ rid=races.map(r => [view(meet,r.id).n, r.id]).sort((a,b) => b[0]-a[0])[0][1]; S.ui.liveRace=rid; }
  const race=raceOf(meet,rid), v=view(meet,rid), named=v.rows.some(r => r.name);
  let h='<section class="sec"><div class="rowf" style="justify-content:space-between;align-items:center"><h2>'+esc(race.name)+'</h2>'+
    (su?'<button class="btn sm" data-act="pull-sheet"'+(pullBusy?' disabled':'')+'>Check now</button>':'')+'</div>'+
    (races.length>1?'<div class="seg">'+races.map(r => '<button aria-pressed="'+(r.id===rid)+'" data-act="live-race" data-race="'+esc(r.id)+'">'+esc(r.name)+'</button>').join('')+'</div>':'')+
    (su?'<p class="note pullnote">'+esc(pullNote())+'</p>':'')+'</section>';
  if(!v.n) return h+'<div class="empty"><p>No finishers yet for '+esc(race.name)+'.</p></div>';
  h+='<div class="rtable live'+(named?' named':'')+'"><div class="rhead"><span>Pl</span><span>Time</span><span>School</span>'+(named?'<span>Name</span>':'')+'</div>';
  v.rows.forEach(row => { const sch=row.school?schoolOf(meet,row.school):null;
    h+='<div class="rrow"><span class="pl">'+(row.i+1)+'</span><span class="tm'+(row.time==null?' none':'')+'">'+(row.time!=null?fmtTime(row.time+v.adj):'no time')+'</span>'+
      (sch?'<span class="chip"><u style="background:'+esc(sch.color)+'"></u><span>'+esc(sch.name)+'</span></span>':'<span class="none">'+(row.tap?'not sure':'no school')+'</span>')+
      (named?'<span class="nm2'+(row.name?'':' none')+'">'+esc(row.name||'')+'</span>':'')+'</div>'; });
  h+='</div>';
  h+=scoresHTML(meet, v, 'Team scores'+(v.rows.some(r => r.time==null)||!v.r.finishers?' so far':''));
  return h;
}

/* ----- Setup ----- */
const openRos={};   /* roster panels the organizer has opened stay open when the page redraws */
document.addEventListener('toggle', e => { const el=e.target; if(el&&el.classList&&el.classList.contains('roster')) openRos[el.id.slice(4)]=el.open; }, true);
function setupHTML(meet){
  const meets=liveMeets(); let h='<section class="sec"><h2>Meet</h2>';
  if(!meet){
    return h+'<div class="empty"><p>No meet yet. A meet holds the races, schools and rosters, and travels to volunteers as a link.</p><button class="btn pri" data-act="new-meet">Create a meet</button></div></section>'+
      '<section class="sec"><h3>Or load one</h3><label class="field"><span>Meet link</span><textarea id="linkpaste" class="linkbox" placeholder="Paste a meet link"></textarea></label><div class="rowf"><button class="btn" data-act="import-link">Load meet</button></div></section>';
  }
  const c=meet.config;
  h+=meetPickerHTML(meet);
  h+='<p class="note">Meet code <strong>'+esc(c.id)+'</strong></p>'+
     '<div class="rowf"><label class="field" style="flex:2 1 200px"><span>Meet name</span><input type="text" id="meetname" data-bind="meet-name" value="'+esc(c.name)+'"></label>'+
     '<label class="field" style="flex:1 1 150px"><span>Date</span><input type="date" id="meetdate" data-bind="meet-date" value="'+esc(c.date||'')+'"></label>'+
     '<label class="field" style="flex:1 1 200px"><span>Scoring</span><select id="scoring" data-bind="scoring"><option value="invite"'+(c.scoring==='dual'?'':' selected')+'>Invitational (raw places)</option><option value="dual"'+(c.scoring==='dual'?' selected':'')+'>Dual meet (head to head)</option></select></label></div>'+
     '<div class="rowf"><button class="btn" data-act="new-meet">New meet (copies schools and rosters)</button></div></section>';

  h+='<section class="sec"><h2>Races</h2><div class="list">';
  c.races.forEach((r,i) => { h+='<div class="item"><input class="grow" type="text" id="race-name-'+i+'" data-bind="race-name" data-i="'+i+'" value="'+esc(r.name)+'" aria-label="Race name">'+
    '<button class="btn sm danger" data-act="del-race" data-i="'+i+'" data-confirm="Tap again to remove">Remove</button></div>'; });
  h+='</div><div class="rowf"><button class="btn" data-act="add-race">Add race</button></div></section>';

  h+='<section class="sec"><h2>Schools and rosters</h2>'+
     '<div class="rowf"><label class="field" style="flex:0 1 22rem"><span>The names I paste are written</span><select id="cellorder" data-bind="cell-order"><option value="lf"'+(S.cellOrder!=='fl'?' selected':'')+'>Last name first (Smith Anna)</option><option value="fl"'+(S.cellOrder==='fl'?' selected':'')+'>First name first (Anna Smith)</option></select></label>'+
     '<button class="btn" data-act="swap-names" data-confirm="Tap again to swap every roster">Swap first and last on every roster</button></div><div class="list">';
  c.schools.forEach((s,i) => {
    h+='<div class="item"><span class="swatch" style="background:'+esc(s.color)+'"></span>'+
      '<input class="sname" type="text" id="sc-name-'+i+'" data-bind="school-name" data-i="'+i+'" value="'+esc(s.name)+'" aria-label="School name" placeholder="School name">'+
      '<select class="colsel" id="sc-color-'+i+'" data-bind="school-color" data-i="'+i+'" aria-label="Color">'+PRESETS.map(p => '<option value="'+p[1]+'"'+(p[1]===s.color?' selected':'')+'>'+p[0]+'</option>').join('')+'</select>'+
      '<button class="btn sm danger" data-act="del-school" data-i="'+i+'" data-confirm="Tap again to remove">Remove</button>';
    const counts=c.races.map(r => c.runners.filter(u => u.s===s.id&&u.r===r.id).length);
    h+='<div class="runs"><span>Runs in</span>'+c.races.map(r => '<label><input type="checkbox" data-bind="school-race" data-i="'+i+'" data-race="'+esc(r.id)+'"'+(schoolInRace(s,r.id)?' checked':'')+'> '+esc(r.name)+'</label>').join('')+'</div>'+
      '<details class="roster" id="ros-'+esc(s.id)+'"'+(openRos[s.id]?' open':'')+'><summary>Rosters ('+c.races.map((r,k) => esc(r.name)+' '+counts[k]).join(', ')+')</summary><div class="rowf">'+
      c.races.map(r => '<label class="field" style="flex:1 1 200px"><span>'+esc(r.name)+'</span><textarea id="ros-'+esc(s.id)+'-'+esc(r.id)+'" data-bind="roster" data-i="'+i+'" data-race="'+esc(r.id)+'" placeholder="One runner per line">'+
        esc(c.runners.filter(u => u.s===s.id&&u.r===r.id).map(u => u.n).join('\n'))+'</textarea></label>').join('')+'</div>'+
      '<div class="rowf"><button class="btn sm" data-act="swap-names" data-i="'+i+'">Swap first and last for this school</button></div></details></div>';
  });
  h+='</div><div class="rowf"><button class="btn" data-act="add-school">Add school</button></div></section>';

  const su=syncUrl(meet), raw=String(c.sync||'').trim();
  h+='<section class="sec"><h2>Google Sheet</h2>'+
     '<details class="roster"><summary>Setting up the Sheet (once a season)</summary><ol class="steps"><li>Make a Google Sheet. In it, open Extensions, then Apps Script.</li><li>Press Copy the script here, and paste it over everything in the editor. Save.</li>'+
     '<li>Deploy, New deployment, type Web app. Execute as: Me. Who has access: Anyone. Deploy, and approve the permission request. When the script changes later: Deploy, Manage deployments, Edit, New version.</li>'+
     '<li>Copy the web app link (it ends in /exec) and paste it below.</li></ol>'+
     '<div class="rowf"><button class="btn" data-act="copy-script">Copy the script</button></div><textarea id="scriptout" class="linkbox" readonly hidden></textarea></details>'+
     '<label class="field"><span>Web app link</span><input type="text" id="syncurl" data-bind="sync-url" value="'+esc(raw)+'" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off" autocapitalize="off" spellcheck="false"></label>'+
     (raw&&!su?'<div class="banner warn"><strong>That is not a web app link.</strong>It should start with https://script.google.com/ and end in /exec.</div>':'')+
     '<div class="rowf"><button class="btn'+(su?' pri':'')+'" data-act="sync-test">Test the connection</button></div>'+(su?'<p class="status" id="setupnote">'+esc(setupNote(meet))+'</p>':'')+'</section>';
  const isToday=todayId()===c.id;
  h+='<section class="sec"><h2>Today\'s meet</h2>'+(su?'<p class="note">'+(isToday?'This is today\'s meet.':todayId()?'Another meet is marked as today\'s.':'No meet is marked as today\'s yet.')+'</p>'+
     (isToday?'':'<div class="rowf"><button class="btn pri" data-act="set-today" data-m="'+esc(c.id)+'" data-confirm="Tap again: today\'s meet">Make this today\'s meet</button></div>')
     :'<p class="note">Needs the Sheet.</p>')+'</section>';
  h+='<section class="sec"><h2>Links</h2>'+(su?''+
     '<div class="rowf"><button class="btn pri" data-act="copy-season">Copy season link for volunteers</button>'+(navigator.share?'<button class="btn" data-act="share-season">Share</button>':'')+'<button class="btn" data-act="show-season-qr">Show as QR code</button></div>'+
     '<div class="rowf"><button class="btn" data-act="copy-season-org">Copy link for your own other devices</button></div>'+
     '<p class="note"><strong>Results link</strong></p>'+
     '<div class="rowf"><button class="btn" data-act="copy-results-link">Copy results link</button><button class="btn" data-act="show-results-qr">Show as QR code</button></div>':'')+
     '<details class="roster"><summary>'+(su?'Backup: links for this meet only (no signal needed)':'Links for this meet')+'</summary>'+
     '<div class="rowf"><button class="btn" data-act="copy-link">Copy volunteer meet link</button>'+(navigator.share?'<button class="btn" data-act="share-link">Share</button>':'')+
     '<button class="btn" data-act="show-link-qr">Show as QR code</button><button class="btn" data-act="copy-org-link">Copy organizer meet link</button></div></details><textarea id="linkout" class="linkbox" readonly hidden></textarea></section>';

  h+='<section class="sec"><h2>This device</h2><div class="rowf">'+deviceNameField()+soundField()+'</div></section>';

  h+='<section class="sec"><h2>Race day</h2><ol class="steps">'+
     '<li>Before leaving a connection, every volunteer opens the season link (once a season) and then opens the app on race day with signal, and waits for "Works offline" at the top. It shows today\'s meet.</li>'+
     '<li>Timer and Schools stand at the line. Place cards go out at the chute as usual; coaches write places on their rosters and you enter them in the Roster tab afterward.</li>'+
     '<li>Every tap is saved on the phone the moment it happens. With the Sheet connected, phones upload in the background and Results on your device shows the finish list as it grows.</li>'+
     '<li>Afterward, check Review and send the finished races to the Sheet. Without the Sheet, each volunteer presses Send and you scan the codes before anyone leaves.</li></ol></section>';

  h+='<section class="sec"><h3>Remove</h3>'+(isToday?'<p class="note">Today\'s meet cannot be deleted; mark another first.</p>':'')+'<div class="rowf"><button class="btn danger" data-act="del-meet" data-confirm="Tap again to delete this meet"'+(isToday?' disabled':'')+'>Delete this meet</button></div></section>'+versionHTML();
  return h;
}

/* ----- job tabs (not locked) ----- */
function timerStatus(st){
  if(!st||!st.startedAt) return ['', 'Not started'];
  if(!st.endedAt) return ['run', 'Running, '+st.taps.length+' recorded'];
  return ['', 'Ended, '+st.taps.length+' recorded'];
}
function timerHTML(meet){
  let h='<section class="sec"><h2>Timer</h2>'+
    '<div class="rowf"><button class="btn pri" data-act="go" data-kind="timer">Open the timer</button></div><div class="list">';
  meet.config.races.forEach(r => {
    const st=myStream(meet,r.id,'timer'), s=timerStatus(st);
    h+='<div class="item"><div class="grow"><strong>'+esc(r.name)+'</strong><div class="status '+s[0]+'">'+esc(s[1])+'</div></div>';
    if(st&&st.startedAt&&st.endedAt) h+='<button class="btn sm" data-act="timer-resume" data-race="'+esc(r.id)+'">Resume</button>';
    if(st&&st.startedAt) h+='<button class="btn sm danger" data-act="reset-stream" data-kind="timer" data-race="'+esc(r.id)+'" data-confirm="Tap again to erase these times">Reset</button>';
    h+='</div>';
  });
  return h+'</div></section>';
}
function schoolsHTML(meet){
  if(!meet.config.schools.length) return '<div class="empty"><p>'+(isOwner(meet)?'Add the schools in Setup first. Each one becomes a button here.':'This meet has no schools yet. Ask the organizer for an updated link.')+'</p></div>';
  let h='<section class="sec"><h2>School taps</h2>'+
    '<div class="rowf"><button class="btn pri" data-act="go" data-kind="school">Open the school buttons</button></div><div class="list">';
  meet.config.races.forEach(r => {
    const st=myStream(meet,r.id,'school'), n=entryCount(st);
    h+='<div class="item"><div class="grow"><strong>'+esc(r.name)+'</strong><div class="status">'+(n?n+' tapped':'No taps yet')+'</div></div>'+
      (n?'<button class="btn sm danger" data-act="reset-stream" data-kind="school" data-race="'+esc(r.id)+'" data-confirm="Tap again to erase these taps">Reset</button>':'')+'</div>';
  });
  return h+'</div></section>';
}
function rosterHTML(meet){
  const races=meet.config.races;
  if(!meet.config.schools.length||!races.length) return '<div class="empty"><p>Add the schools, races and rosters in Setup first.</p></div>';
  let rid=S.ui.resRace; if(!races.some(r => r.id===rid)){ rid=races[0].id; S.ui.resRace=rid; }
  const race=raceOf(meet,rid), v=view(meet,rid), placeOf={};
  v.rows.forEach(row => { if(row.runner&&!row.runner.unknown) placeOf[row.runner.id]=row; });
  const runners=meet.config.runners.filter(u => u.r===rid), placed=runners.filter(u => placeOf[u.id]).length;
  let h='<section class="sec"><h2>Roster</h2>'+
    (races.length>1?'<div class="seg">'+races.map(r => '<button aria-pressed="'+(r.id===rid)+'" data-act="res-race" data-race="'+esc(r.id)+'">'+esc(r.name)+'</button>').join('')+'</div>':'')+
    '<p class="status">'+esc(race.name)+': '+placed+' of '+runners.length+' placed, '+v.n+' finishers timed.</p></section>';
  if(!runners.length) return h+'<div class="empty"><p>No roster for '+esc(race.name)+' yet. Paste the rosters in Setup, or add names in Review.</p></div>';
  meet.config.schools.filter(s2 => runners.some(u => u.s===s2.id)).forEach(sch => {
    const list=runners.filter(u => u.s===sch.id).sort((x,y) => X.nameKey(x.n).localeCompare(X.nameKey(y.n)));
    h+='<section class="sec"><h3>'+chipHTML(meet,sch.id)+'</h3><div class="ptable">';
    list.forEach(u => { const row=placeOf[u.id], st=(v.r.status||{})[u.id]||'';
      let fb='';
      if(row){ fb=(row.time!=null?'<b>'+fmtTime(row.time+v.adj)+'</b>':'<span class="none">no time</span>')+(row.tapS?(row.tapS===u.s?' <span class="okword">&#10003;</span>':' <span class="warnline">&ne; tapped '+esc((schoolOf(meet,row.tapS)||{}).name||'?')+'</span>'):'');
        if(row.dup) fb+=' <span class="warnline">used twice</span>'; }
      h+='<div class="prow"><span class="pname">'+esc(u.n)+'</span><input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" class="pbox" data-bind="place" data-u="'+esc(u.id)+'" value="'+(row?row.i+1:'')+'" placeholder="#" aria-label="Place">'+
        '<span class="pfb">'+fb+'</span><span class="pst"'+(row?' hidden':'')+'><button class="pdnf'+(st==='DNS'?' on':'')+'" data-act="set-status" data-u="'+esc(u.id)+'" data-st="'+(st==='DNS'?'':'DNS')+'">DNS</button>'+
        '<button class="pdnf'+(st==='DNF'?' on':'')+'" data-act="set-status" data-u="'+esc(u.id)+'" data-st="'+(st==='DNF'?'':'DNF')+'">DNF</button></span></div>'; });
    h+='</div></section>';
  });
  return h;
}
function setPlace(meet, uid, place){
  const r=resultOf(meet,S.ui.resRace,true), names=r.names;
  Object.keys(names).forEach(k => { if(names[k]&&names[k].u===uid) delete names[k]; });
  /* a chute pick for this runner (old data) is cleared the same way */
  const v=view(meet,S.ui.resRace); v.rows.forEach(row => { if(row.entry&&row.entry.u===uid&&!names[row.i+1]) names[row.i+1]={clear:1}; });
  if(place>0){ const was=names[place]&&names[place].u&&names[place].u!==uid?(runnerMap(meet,S.ui.resRace)[names[place].u]||{}).n:null;
    names[place]={u:uid}; if(was) toast('Place '+place+' was '+was+'; replaced'); }
  touchResult(meet,r);
}

/* ----- race-day consoles: one race on screen at a time, chosen with the switch at the top ----- */
function activeRace(meet,kind){
  const a=S.ui.active||(S.ui.active={});
  return raceOf(meet,a[kind])||meet.config.races[0]||null;
}
function switchHTML(meet,kind){
  const cur=activeRace(meet,kind);
  return '<div class="rswitch" role="tablist" style="--n:'+Math.max(1,meet.config.races.length)+'">'+meet.config.races.map((r,idx) =>
    '<button role="tab" class="rs c'+(idx%3)+'" aria-selected="'+(!!cur&&r.id===cur.id)+'" data-tap="switch" data-race="'+esc(r.id)+'"><b>'+esc(r.name)+'</b><span data-rsinfo="'+esc(r.id)+'"></span></button>').join('')+'</div>';
}
/* Columns for n big buttons that share the whole screen; an odd last button stretches to finish its row. */
function gridCols(n){ return window.innerWidth>=700?(n<=2?Math.max(1,n):n<=4?2:n<=9?3:4):(n<=3?1:n<=10?2:3); }
function spanCSS(n,cols){ const rem=n%cols; return rem?'grid-column:span '+(cols-rem+1)+';':''; }
function footHTML(buttons){
  return '<div class="lockfoot"><div class="last" id="last"></div><div class="syncline" id="syncline">'+syncLineHTML(curMeet())+'</div><div class="footrow">'+buttons+
    '<button class="btn hold" data-hold="exit-lock"><span>Hold: exit</span></button></div>'+WAKENOTE+'</div>';
}
function noRaceHTML(){ return '<main class="lock"><div class="done-card"><h2>No races</h2><p class="note">Add a race in Setup first.</p></div>'+footHTML('')+'</main>'; }

/* ----- Timer console ----- */
function lockTimerHTML(meet){
  const race=activeRace(meet,'timer'); if(!race) return noRaceHTML();
  const id=esc(race.id), st=myStream(meet,race.id,'timer');
  const anyLive=meet.config.races.some(r => { const s=myStream(meet,r.id,'timer'); return !!(s&&s.startedAt&&!s.endedAt); });
  let body, hold='';
  if(!st||!st.startedAt){
    body='<button class="pad start" data-tap="start" data-race="'+id+'"><b>START</b><span>'+esc(race.name)+'</span></button>';
  }else if(!st.endedAt){
    body='<button class="pad c'+(raceIdx(meet,race.id)%3)+'" data-tap="time" data-race="'+id+'"><span class="pad-label">'+esc(race.name)+'</span>'+
      '<span class="pad-clock" data-clock="'+id+'">0:00.0</span><span class="pad-num" data-next="'+id+'">1</span><span class="pad-sub">tap each finisher</span></button>';
    hold='<button class="btn hold" data-hold="end-race" data-race="'+id+'"><span data-endlabel="'+id+'">'+endLabel(race,st)+'</span></button>';
  }else{
    body='<div class="done-card"><h2>'+esc(race.name)+' ended</h2><p class="note">'+plural(st.taps.length,'time')+' recorded. '+
      (anyLive?'Another race is still running. Switch to it at the top.':(syncUrl(meet)?'When every race is done, hold Exit. The times upload by themselves when the phone has signal; Send shows the backup code.':'When every race is done, send your times to the organizer.'))+'</p>'+
      (anyLive?'':'<button class="btn pri" data-act="send">Send</button>')+'</div>';
    hold='<button class="btn hold" data-hold="resume-race" data-race="'+id+'"><span>Hold: resume '+esc(race.name)+'</span></button>';
  }
  return '<main class="lock">'+switchHTML(meet,'timer')+'<div class="stage">'+body+'</div>'+
    footHTML('<button class="btn" data-act="undo-time">Undo last</button>'+hold)+'</main>';
}
function endLabel(race,st){ return esc(st.taps.length?'Hold: end '+race.name:'Hold: cancel '+race.name+' start'); }
function undoTimer(meet){
  let best=null;
  meet.config.races.forEach(r => { const st=myStream(meet,r.id,'timer');
    if(st&&st.startedAt&&st.taps.length&&(!best||st.taps[st.taps.length-1]>best.taps[best.taps.length-1])) best=st; });
  if(!best){ toast('No taps to undo'); return; }
  best.taps.pop(); touchStream(meet,best); softLock(); scheduleUpload(); toast('Removed: '+raceOf(meet,best.raceId).name+' · Place '+(best.taps.length+1));
}

/* ----- Schools console ----- */
function schoolInRace(s,raceId){ return !Array.isArray(s.races)||s.races.indexOf(raceId)>=0; }
function raceSchools(meet,raceId){
  const withRunners=meet.config.schools.filter(s => meet.config.runners.some(u => u.s===s.id&&u.r===raceId));
  return withRunners.length?withRunners:meet.config.schools.filter(s => schoolInRace(s,raceId));
}
function lockSchoolHTML(meet){
  const race=activeRace(meet,'school'); if(!race) return noRaceHTML();
  const id=esc(race.id), list=raceSchools(meet,race.id), n=list.length+1, cols=gridCols(n);
  return '<main class="lock">'+switchHTML(meet,'school')+'<div class="frame c'+(raceIdx(meet,race.id)%3)+'"><div class="tiles" style="--cols:'+cols+'">'+
    list.map(s => '<button class="tile" data-tap="school" data-race="'+id+'" data-s="'+esc(s.id)+'" style="background:'+esc(s.color)+';color:'+inkFor(s.color)+'"><b>'+esc(s.name)+
      '</b><i data-count="'+esc(race.id+'|'+s.id)+'">0</i></button>').join('')+
    '<button class="tile unknown" data-tap="school" data-race="'+id+'" data-s="" style="'+spanCSS(n,cols)+'"><b>Not sure</b><i data-count="'+id+'|">0</i></button></div></div>'+
    footHTML('<button class="btn" data-act="undo-school">Undo last</button>')+'</main>';
}

/* ----- Roster console ----- */
const placeOverride={};
function rosterFilled(st){ const f={}; if(st) st.picks.forEach(p => { f[p.p]=p.u; }); return f; }
function rosterNext(meet,raceId){ return placeOverride[raceId]||X.nextPlace(rosterFilled(myStream(meet,raceId,'roster'))); }
function lockRosterHTML(meet){
  const race=activeRace(meet,'roster'); if(!race) return noRaceHTML();
  const id=esc(race.id), ci=raceIdx(meet,race.id)%3, school=S.ui.rosterSchool?schoolOf(meet,S.ui.rosterSchool):null;
  if(!school){
    const list=raceSchools(meet,race.id), n=list.length, cols=gridCols(n);
    return '<main class="lock">'+switchHTML(meet,'roster')+'<div class="frame c'+ci+'"><div class="tiles roster-tiles" style="--cols:'+cols+'">'+
      list.map((s,k) => '<button class="tile" data-act="roster-school" data-s="'+esc(s.id)+'" style="background:'+esc(s.color)+';color:'+inkFor(s.color)+';'+(k===n-1?spanCSS(n,cols):'')+'"><b>'+esc(s.name)+'</b></button>').join('')+
      '</div></div>'+footHTML('<button class="btn" data-act="undo-pick">Undo last name</button>')+'</main>';
  }
  const st=myStream(meet,race.id,'roster'), filled=rosterFilled(st), placeOf={}; Object.keys(filled).forEach(p => { placeOf[filled[p]]=+p; });
  const list=meet.config.runners.filter(u => u.s===school.id&&u.r===race.id)
    .concat(((st&&st.added)||[]).filter(a => a.s===school.id).map(a => ({id:a.id, n:a.n})))
    .sort((a,b) => X.nameKey(a.n).localeCompare(X.nameKey(b.n)));
  /* Every name keeps its position for the whole race and is always shown in full. A small team fills the screen;
     a large one gets a second column and scrolls, because there is no rush at this station. */
  const n=list.length+1, wide=window.innerWidth>=700, avail=Math.max(200, window.innerHeight-110);
  let cols=1;
  if(n*66>avail) cols=2;
  if(wide&&Math.ceil(n/2)*66>avail) cols=3;
  const over=placeOverride[race.id], flow=Math.ceil(n/cols)*66>avail;   /* too many to fill one screen: rows take their natural height and the list scrolls */
  return '<main class="lock"><div class="lockbar"><button class="btn sm" data-act="roster-back">&lsaquo; Back</button>'+
    '<span class="race">'+esc(school.name)+' &middot; '+esc(race.name)+'</span>'+
    '<button class="btn sm'+(over?' card':'')+'" data-act="place-pad" data-race="'+id+'">'+(over?'Card '+over:'Place '+rosterNext(meet,race.id))+' &middot; edit</button></div>'+
    '<div class="names scrolly"><div class="namegrid'+(flow?' flow':'')+'" style="--cols:'+cols+'">'+
    list.map(u => placeOf[u.id]
      ?'<button class="nm picked" data-act="unpick" data-race="'+id+'" data-u="'+esc(u.id)+'" data-confirm="Tap again to remove from place '+placeOf[u.id]+'"><i>'+placeOf[u.id]+'</i> '+esc(u.n)+'</button>'
      :'<button class="nm" data-act="pick" data-race="'+id+'" data-u="'+esc(u.id)+'">'+esc(u.n)+'</button>').join('')+
    '<button class="nm add" data-act="add-runner" data-race="'+id+'" style="'+spanCSS(n,cols)+'">Not on the list</button></div></div></main>';
}
function rosterPick(meet,raceId,uid,name){
  const st=myStream(meet,raceId,'roster',true), filled=rosterFilled(st);
  const at=Object.keys(filled).find(p => filled[p]===uid);
  if(at){ toast('Already recorded at place '+at); return; }
  const place=placeOverride[raceId]||X.nextPlace(filled), was=filled[place]?((runnerMap(meet,raceId)[filled[place]]||{}).n||'a runner'):null;
  st.picks=st.picks.filter(p => p.p!==place);
  st.picks.push({p:place, u:uid, t:Date.now()}); delete placeOverride[raceId];
  touchStream(meet,st); S.ui.rosterSchool=null; save(); render(); beep(660); buzz(); scheduleUpload();
  toast('Recorded: '+raceOf(meet,raceId).name+' · Place '+place+' · '+name+(was?' (replaced '+was+')':''));
}

/* The status line shows one thing: the most recent entry, as Race · Place n · detail. */
function lastHTML(items, empty){
  if(!items.length) return '<span class="lbl">'+esc(empty)+'</span>';
  const x=items.reduce((a,b) => b.t>=a.t?b:a);
  return '<span class="lbl">Last</span>'+esc(x.race)+'<span class="sep">&middot;</span>Place '+x.place+'<span class="sep">&middot;</span>'+esc(x.what);
}
function softLock(){
  const lock=S.ui.lock, meet=curMeet(); if(!lock||!meet) return;
  softSync();
  const last=$('last'), items=[];
  const info=(raceId,html) => { const el=document.querySelector('[data-rsinfo="'+raceId+'"]'); if(el) el.innerHTML=html; };
  if(lock.kind==='timer'){
    meet.config.races.forEach(r => { const st=myStream(meet,r.id,'timer');
      if(!st||!st.startedAt){ info(r.id,'not started'); return; }
      info(r.id, st.endedAt?'ended &middot; '+st.taps.length:'<span data-clock="'+esc(r.id)+'"></span> &middot; '+st.taps.length);
      const el=document.querySelector('[data-next="'+r.id+'"]'); if(el) el.textContent=st.taps.length+1;
      const lab=document.querySelector('[data-endlabel="'+r.id+'"]'); if(lab) lab.innerHTML=endLabel(r,st);
      if(st.taps.length){ const i=st.taps.length-1, t=st.taps[i]; items.push({t, race:r.name, place:i+1, what:fmtTime(t-st.startedAt)}); } });
    if(last&&!last.classList.contains('say')) last.innerHTML=lastHTML(items,'No times yet. False start? Hold the cancel button.');
    tickClock();
  }else if(lock.kind==='school'){
    meet.config.races.forEach(r => { const st=myStream(meet,r.id,'school'), counts={};
      info(r.id,(st?st.taps.length:0)+' tapped'); if(!st) return;
      st.taps.forEach(x => { const k=r.id+'|'+(x.s||''); counts[k]=(counts[k]||0)+1; });
      if(st.taps.length){ const i=st.taps.length-1, x=st.taps[i], sc=x.s?schoolOf(meet,x.s):null; items.push({t:x.t, race:r.name, place:i+1, what:sc?sc.name:'Not sure'}); }
      document.querySelectorAll('[data-count^="'+r.id+'|"]').forEach(el2 => { el2.textContent=counts[el2.getAttribute('data-count')]||0; }); });
    if(last&&!last.classList.contains('say')) last.innerHTML=lastHTML(items,'No taps yet');
  }else{
    meet.config.races.forEach(r => { const st=myStream(meet,r.id,'roster'); info(r.id,'next place '+rosterNext(meet,r.id)); if(!st) return;
      const rm=runnerMap(meet,r.id); st.picks.forEach(p => items.push({t:p.t||0, race:r.name, place:p.p, what:(rm[p.u]||{}).n||'?'})); });
    if(last&&!last.classList.contains('say')) last.innerHTML=lastHTML(items,'No names yet');
  }
}
function tickClock(){
  const lock=S.ui.lock, meet=curMeet(); if(!lock||lock.kind!=='timer'||!meet) return;
  document.querySelectorAll('[data-clock]').forEach(el => { const st=myStream(meet,el.getAttribute('data-clock'),'timer');
    if(st&&st.startedAt) el.textContent=fmtTime((st.endedAt||Date.now())-st.startedAt); });
}
setInterval(tickClock, 100);

/* ----- Results ----- */
let outText=null;
function checklistHTML(meet){
  let h='<div class="tscroll"><table class="grid"><thead><tr><th>Race</th><th>Timer</th><th>Schools</th><th>Roster</th></tr></thead><tbody>';
  meet.config.races.forEach(r => {
    h+='<tr><td><strong>'+esc(r.name)+'</strong></td>'+['timer','school','roster'].map(k => { const st=pickStream(meet,r.id,k,(resultOf(meet,r.id)||{})['src'+k.charAt(0).toUpperCase()+k.slice(1)]);
      const others=raceStreams(meet,r.id,k).filter(x => entryCount(x)>0).length-1;
      if(k==='roster'&&!st){ const typed=Object.values((resultOf(meet,r.id)||{}).names||{}).filter(x => x&&(x.u||x.n)).length; return '<td>'+(typed?typed+'<div class="status">entered in Roster</div>':'<span class="status">none yet</span>')+'</td>'; }
      return st?'<td>'+entryCount(st)+'<div class="status">'+esc(st.deviceId===S.deviceId?'this device':(st.deviceName||'a device'))+(others>0?' <span class="warnline">+'+others+' more, see Corrections</span>':'')+'</div></td>':'<td class="miss">missing</td>'; }).join('')+'</tr>';
  });
  return h+'</tbody></table></div>';
}
function resultsHTML(meet){
  const races=meet.config.races;
  if(!races.length) return '<div class="empty"><p>Add a race in Setup first.</p></div>';
  let rid=S.ui.resRace; if(!races.some(r => r.id===rid)){ rid=races[0].id; S.ui.resRace=rid; }
  const su=syncUrl(meet);
  let h='<section class="sec"><h2>Collected</h2><p class="note">Meet code '+esc(meet.config.id)+'</p>'+checklistHTML(meet)+
    (su?'<p class="status pullnote">'+esc(pullNote())+'</p>'+phonesHTML(meet)+'<div id="others">'+otherMeetsHTML(meet)+'</div>':'')+
    '<div class="rowf">'+(su?'<button class="btn pri" data-act="pull-sheet"'+(pullBusy?' disabled':'')+'>Check the Sheet now</button>':'')+
    '<button class="btn'+(su?'':' pri')+'" data-act="scan">Scan a code</button><button class="btn" data-act="paste-open">Paste a code</button></div></section>';
  const race=raceOf(meet,rid), v=view(meet,rid), nT=v.times.length, nS=v.schools.length, nR=v.rows.filter(r => r.name).length, fin=v.r.finishers;
  h+='<section class="sec">';
  if(races.length>1) h+='<div class="seg">'+races.map(r => '<button aria-pressed="'+(r.id===rid)+'" data-act="res-race" data-race="'+esc(r.id)+'">'+esc(r.name)+'</button>').join('')+'</div>';
  h+='<h2>'+esc(race.name)+'</h2>';
  if(!v.n){ return h+'<div class="empty"><p>Nothing collected for this race yet. Times, school taps and names appear here as you scan each device.</p></div></section>'; }
  h+='<div class="counts"><div><b>'+nT+'</b><span>times</span></div><div><b>'+nS+'</b><span>school taps</span></div><div><b>'+nR+'</b><span>names</span></div>'+
     '<label class="field" style="flex:0 1 150px"><span>Place cards handed out</span><input type="number" inputmode="numeric" min="0" id="finishers" data-bind="res-finishers" value="'+(fin==null?'':fin)+'" placeholder="count"></label></div>';

  /* cross-checks, one problem at a time */
  let issue=X.findIssue(v.times, v.schools.map(x => x?x.t:null)), noFit=false;
  if(issue&&issue.kind==='noFit'){ noFit=true; issue=null; }
  const seq=!issue&&v.R?X.findSeqIssue(v.rows.map(r => r.tapS), v.rows.map(r => r.runner?r.runner.s:null)):null;
  let flagAt=-1;
  if(v.stale) h+='<div class="banner warn"><strong>New taps arrived after you started correcting this race.</strong>Rebuilding pulls them in and discards your inserts and deletes. Names stay.<div class="acts"><button class="btn sm" data-act="rebuild" data-confirm="Tap again to rebuild">Rebuild from taps</button></div></div>';
  if(noFit) h+='<div class="banner warn"><strong>The times and the school taps could not be lined up by clock.</strong>The two devices\' clocks are far apart, or one list belongs to a different race. The automatic check between them is off for this race, so compare the counts and the video.</div>';
  if(issue){
    const p=issue.index+1; flagAt=issue.index;
    if(issue.kind==='timeAlone') h+='<div class="banner warn"><strong>Times and school taps stop matching at place '+p+'.</strong>The time at place '+p+' has no school tap near it. Either the school tapper missed a runner, or the timer was tapped twice. Check the video or the card count, then pick one.'+
      '<div class="acts"><button class="btn sm" data-act="ins-school" data-i="'+issue.index+'">Missed school: add a blank at '+p+'</button><button class="btn sm" data-act="del-time" data-i="'+issue.index+'">Extra tap: delete time '+p+'</button></div></div>';
    else h+='<div class="banner warn"><strong>Times and school taps stop matching at place '+p+'.</strong>The school tap at place '+p+' has no time near it. Either the timer missed a runner, or a school was tapped twice. Check the video or the card count, then pick one.'+
      '<div class="acts"><button class="btn sm" data-act="ins-time" data-i="'+issue.index+'">Missed time: add a blank at '+p+'</button><button class="btn sm" data-act="del-school-tap" data-i="'+issue.index+'">Extra tap: delete school '+p+'</button></div></div>';
  }else if(seq){
    const p=seq.index+1; flagAt=seq.index;
    if(seq.kind==='lineMissing') h+='<div class="banner warn"><strong>The line and the roster stop matching near place '+p+'.</strong>From here the schools tapped at the line run one place behind the schools on the roster, so both line volunteers probably missed a runner. Check the video.'+
      '<div class="acts"><button class="btn sm" data-act="ins-both" data-i="'+seq.index+'">Add a blank time and school at '+p+'</button></div></div>';
    else h+='<div class="banner warn"><strong>The line and the roster stop matching near place '+p+'.</strong>From here the schools tapped at the line run one place ahead of the roster. Either both line volunteers tapped an extra time, or the roster skipped a place. Check the cards and the video.'+
      '<div class="acts"><button class="btn sm" data-act="del-both" data-i="'+seq.index+'">Extra at the line: delete time and school '+p+'</button></div></div>';
  }else if(nT!==nS&&nT&&nS){
    h+='<div class="banner warn"><strong>'+nT+' times and '+nS+' school taps.</strong>The lists match up to the shorter one, so the extra '+(Math.abs(nT-nS)>1?'entries are':'entry is')+' at the end. Open the last rows to fill in or delete.</div>';
  }else if(nT>=3&&nS>=3&&!noFit){
    h+='<div class="banner ok"><strong>Times and school taps line up, '+nT+' each'+(v.R?', and the roster follows the same school order':'')+'.</strong></div>';
  }
  const conf=v.rows.filter(r => r.conflict).map(r => r.i+1), dups=v.rows.filter(r => r.dup).map(r => r.i+1);
  if(conf.length&&!issue&&!seq) h+='<div class="banner warn"><strong>The line tap and the roster disagree on the school at place'+(conf.length>1?'s':'')+' '+conf.join(', ')+'.</strong>The roster\'s school is shown. Usually a wrong button at the line, or two runners who swapped order in the chute.</div>';
  if(dups.length) h+='<div class="banner bad"><strong>The same runner is entered at places '+dups.join(', ')+'.</strong>Open one of those rows and clear or change the name.</div>';
  const cnt=[['times',nT],['school taps',nS]].concat(v.R?[['names',v.rows.filter(r => r.entry).length]]:[]);
  if(fin!=null&&cnt.some(c => c[1]!==fin)) h+='<div class="banner warn"><strong>Place cards say '+fin+' finishers.</strong>'+cnt.map(c => c[0]+': '+c[1]+(c[1]!==fin?' ('+(c[1]>fin?(c[1]-fin)+' extra':(fin-c[1])+' missing')+')':'')).join('. ')+'.</div>';

  h+='<div class="rtable"><div class="rhead"><span>Pl</span><span>Time</span><span>School</span><span>Name</span></div>';
  v.rows.forEach(row => {
    const sch=row.school?schoolOf(meet,row.school):null, open=S.ui.openRow===row.i;
    h+='<button class="rrow'+(row.i===flagAt?' flag':'')+(row.conflict||row.dup?' conf':'')+'" aria-expanded="'+open+'" data-act="open-row" data-i="'+row.i+'">'+
       '<span class="pl">'+(row.i+1)+'</span><span class="tm'+(row.time==null?' none':'')+'">'+(row.time!=null?fmtTime(row.time+v.adj):'no time')+'</span>'+
       (sch?'<span class="chip"><u style="background:'+esc(sch.color)+'"></u><span>'+esc(sch.name)+'</span></span>':'<span class="none">'+(row.tap?'not sure':'no school')+'</span>')+
       '<span class="nm2'+(row.name?'':' none')+'">'+(row.name?esc(row.name):'add name')+'</span></button>';
    if(open) h+=rowEditHTML(meet,v,row);
  });
  h+='</div></section>';

  if(v.unplaced.length&&v.named){
    h+='<section class="sec"><h2>Did not finish or start</h2><div class="list">'+
      v.unplaced.map(u => { const s=schoolOf(meet,u.s), st=(v.r.status||{})[u.id]||'DNS';
        return '<div class="item"><div class="grow"><strong>'+esc(u.n)+'</strong><div class="status">'+esc(s?s.name:'')+'</div></div><div class="picks">'+
          ['DNS','DNF'].map(k => '<button aria-pressed="'+(st===k)+'" data-act="set-status" data-u="'+esc(u.id)+'" data-st="'+k+'">'+k+'</button>').join('')+'</div></div>'; }).join('')+'</div></section>';
  }

  h+=scoresHTML(meet, v, 'Team scores');

  h+='<section class="sec"><h2>Export</h2><div class="rowf">'+
     '<button class="btn pri" data-act="open-sheet">Results sheet</button>'+
     (su?'<button class="btn" data-act="send-results"'+(sheetBusy?' disabled':'')+'>'+(sheetBusy?'Sending':'Send results to the Sheet')+'</button>':'')+
     '<button class="btn" data-act="copy-tsv">Copy '+esc(race.name)+'</button>'+(races.length>1?'<button class="btn" data-act="copy-all">Copy all races</button>':'')+
     '<button class="btn" data-act="dl-csv">Download CSV</button></div>'+
     (sheetMsg?'<div class="banner '+sheetMsg.kind+'"><strong>'+esc(sheetMsg.text)+'</strong>'+(sheetMsg.link?'<a href="'+esc(sheetMsg.link)+'" target="_blank" rel="noopener">Open the Sheet</a>':'')+'</div>':'')+
     '<textarea id="outtext" class="out" readonly hidden></textarea></section>';

  const lists={timer:raceStreams(meet,rid,'timer'), school:raceStreams(meet,rid,'school'), roster:raceStreams(meet,rid,'roster')};
  h+='<section class="sec"><h3>Corrections</h3><div class="rowf">'+
     '<label class="field" style="flex:1 1 200px"><span>Seconds to add to every time (if the clock started late)</span><input type="number" step="0.1" id="startadj" data-bind="res-adj" value="'+((v.adj||0)/1000)+'"></label>';
  [['timer','Times from',v.T],['school','School taps from',v.C],['roster','Names from',v.R]].forEach(x => {
    const l=lists[x[0]].filter(s => entryCount(s)>0);
    if(l.length>1) h+='<label class="field" style="flex:1 1 180px"><span>'+x[1]+'</span><select id="src-'+x[0]+'" data-bind="res-src" data-kind="'+x[0]+'">'+
      l.map(s => '<option value="'+esc(s.id)+'"'+(x[2]&&x[2].id===s.id?' selected':'')+'>'+esc(s.deviceName||s.deviceId)+' ('+entryCount(s)+')</option>').join('')+'</select></label>';
  });
  h+='</div>'+(v.edited&&!v.stale?'<div class="rowf"><button class="btn danger" data-act="rebuild" data-confirm="Tap again to undo corrections">Undo all inserts and deletes</button></div>':'')+'</section>';
  return h;
}
function rowEditHTML(meet,v,row){
  const i=row.i, cur=row.school||'';
  const cands=v.unplaced.filter(u => !cur||u.s===cur).slice(0,40);
  let h='<div class="redit">';
  if(row.conflict){ const ts=schoolOf(meet,row.tapS); h+='<p class="note">The line tap for this place was '+esc(ts?ts.name:'another school')+'. The roster\'s school is used.</p>'; }
  h+='<div class="rowf"><label class="field" style="flex:1 1 200px"><span>Name for place '+(i+1)+'</span><input type="text" id="row-name-'+i+'" data-bind="row-name" data-i="'+i+'" value="'+esc(row.name)+'" placeholder="Type a name, or pick below" autocomplete="off"></label>'+
     (row.entry?'<button class="btn sm" data-act="clear-name" data-i="'+i+'">Clear name</button>':'')+'</div>';
  if(cands.length) h+='<div class="field"><span>Runners with no place yet'+(cur?' from this school':'')+'</span><div class="picks">'+cands.map(u => '<button data-act="assign" data-i="'+i+'" data-u="'+esc(u.id)+'">'+esc(u.n)+'</button>').join('')+'</div></div>';
  if(!row.runner||!row.runner.s) h+='<div class="field"><span>School</span><div class="picks">'+meet.config.schools.map(s => '<button aria-pressed="'+(s.id===row.tapS)+'" data-act="set-school" data-i="'+i+'" data-s="'+esc(s.id)+'">'+esc(s.name)+'</button>').join('')+'</div></div>';
  h+='<div class="rowf"><label class="field" style="flex:0 1 150px"><span>Time</span><input type="text" inputmode="decimal" id="row-time-'+i+'" data-bind="row-time" data-i="'+i+'" value="'+(row.time!=null?fmtTime(row.time+v.adj):'')+'" placeholder="18:42.3"></label>';
  if(row.time==null&&row.tap&&row.tap.t!=null) h+='<button class="btn sm" data-act="use-school-time" data-i="'+i+'">Use school tap time</button>';
  h+='</div><div class="field"><span>Shift a column (moves every later entry by one place)</span><div class="picks">'+
     '<button data-act="ins-time" data-i="'+i+'">Add blank time here</button><button data-act="del-time" data-i="'+i+'">Delete this time</button>'+
     '<button data-act="ins-school" data-i="'+i+'">Add blank school here</button><button data-act="del-school-tap" data-i="'+i+'">Delete this school tap</button></div></div></div>';
  return h;
}

/* ---------- overlays: send, scan, paste, number pad, add runner ---------- */
let ov=null, ovTimer=null;
const scan={stream:null, timer:null, asm:new X.Assembler(), lastMsg:null, busy:false, canvas:null};
function drawQR(canvas,text){
  const q=window.qrcode(0,'L'); q.addData(text,'Byte'); q.make();
  const n=q.getModuleCount(), quiet=4, scale=Math.max(3, Math.floor(1000/(n+2*quiet))), size=(n+2*quiet)*scale, ctx=canvas.getContext('2d');
  canvas.width=canvas.height=size; ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,size,size); ctx.fillStyle='#000000';
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(q.isDark(r,c)) ctx.fillRect((c+quiet)*scale,(r+quiet)*scale,scale,scale);
}
function closeOverlay(){
  clearInterval(ovTimer); ovTimer=null; stopScan(); ov=null;
  const el=$('overlay'); el.hidden=true; el.innerHTML=''; render();
}
function sheet(title,body){ return '<div class="sheet"><div class="sheet-h"><h2>'+esc(title)+'</h2><button class="btn" data-act="overlay-close">Close</button></div>'+body+'</div>'; }
function renderOverlay(){
  const el=$('overlay'), meet=curMeet(); if(!ov){ el.hidden=true; return; }
  clearInterval(ovTimer); ovTimer=null;
  let h='';
  if(ov.type==='send'){
    h=sheet('Send to the organizer', '<p class="note">'+esc(ov.summary)+'</p>'+upNoteHTML(meet)+
      (ov.frames?'<div class="qrbox"><canvas id="qr"></canvas></div><div class="qrmeta" id="qrmeta"></div>'+
        '<p class="note">Hold this screen up to the organizer\'s camera. '+(ov.frames.length>1?'The code changes on its own; keep holding until their screen says it has every part.':'')+'</p>'+
        '<div class="rowf"><button class="btn" data-act="copy-send">Copy as text instead</button>'+(navigator.share?'<button class="btn" data-act="share-send">Share as text</button>':'')+'</div><textarea id="sendout" class="linkbox" readonly hidden></textarea>'
        :'<p class="note">Preparing the code.</p>'));
  }else if(ov.type==='linkqr'){
    h=sheet(ov.title||(ov.season?'Season link':'Meet link'), '<div class="qrbox printable"><canvas id="qr"></canvas><div class="qrcap">'+esc(ov.title||'')+'</div></div><p class="note">'+esc(ov.note||('Volunteers point their phone camera at this and open the link.'+(ov.season?' They only need to do it once a season.':' If it will not scan from a small screen, text the link instead.')))+'</p>'+
      '<div class="rowf"><button class="btn" data-act="print-qr">Print</button></div>');
  }else if(ov.type==='sheet'){
    h=sheet(ov.title||'Results sheet', '<div class="rowf"><button class="btn pri" data-act="print-sheet">Print / PDF</button><button class="btn" data-act="dl-sheet">Save or share</button></div><iframe id="sheetframe" class="sheetframe" title="'+esc(ov.title||'Results sheet')+'"></iframe>');
  }else if(ov.type==='scan'){
    h=sheet('Scan a code', (scan.cam==='blocked'?CAM_BLOCKED:'<div class="scanbox"><video id="scanv" playsinline muted></video></div>')+
      '<div class="banner '+(ov.kind||'ok')+'" id="scanmsg"><strong>'+esc(ov.msg||'Point the camera at a volunteer\'s Send screen.')+'</strong></div>'+
      (meet?checklistHTML(meet):'')+
      '<div class="rowf"><label class="btn">Use a photo instead<input type="file" accept="image/*" capture="environment" id="scanfile" hidden></label><button class="btn" data-act="paste-open">Paste a code</button></div>');
  }else if(ov.type==='paste'){
    h=sheet('Paste a code', '<p class="note">Paste a meet link, or the text a volunteer copied from their Send screen.</p><textarea id="pastebox" class="linkbox" style="min-height:140px" placeholder="Paste here"></textarea>'+
      (ov.msg?'<div class="banner '+(ov.kind||'ok')+'"><strong>'+esc(ov.msg)+'</strong></div>':'')+'<div class="rowf"><button class="btn pri" data-act="paste-import">Import</button></div>');
  }else if(ov.type==='numpad'){
    const race=raceOf(meet,ov.race);
    h=sheet(race.name+' card number', '<div class="bigval">'+(ov.val||'&nbsp;')+'</div>'+(ov.msg?'<div class="banner warn"><strong>'+esc(ov.msg)+'</strong></div>':'')+'<div class="keys">'+[1,2,3,4,5,6,7,8,9].map(k => '<button data-act="key" data-k="'+k+'">'+k+'</button>').join('')+
      '<button data-act="key" data-k="back">&larr;</button><button data-act="key" data-k="0">0</button><button data-act="key" data-k="ok">OK</button></div>'+
      '<div class="rowf"><button class="btn" data-act="pad-clear">Use the next place in order</button></div>');
  }else if(ov.type==='addrunner'){
    const race=raceOf(meet,ov.race), sch=schoolOf(meet,S.ui.rosterSchool);
    h=sheet('Add a runner', '<p class="note">'+esc((sch?sch.name:'')+', '+race.name+', place '+rosterNext(meet,ov.race))+'</p>'+
      '<label class="field"><span>Name</span><input type="text" id="addname" autocomplete="off" autocapitalize="words"></label><div class="rowf"><button class="btn pri" data-act="add-runner-ok">Add and record</button></div>');
  }
  el.innerHTML=h; el.hidden=false;
  if(ov.type==='send'&&ov.frames){
    const show=() => { drawQR($('qr'), ov.frames[ov.idx]); $('qrmeta').textContent=ov.frames.length>1?'Part '+(ov.idx+1)+' of '+ov.frames.length:''; };
    show(); if(ov.frames.length>1) ovTimer=setInterval(() => { ov.idx=(ov.idx+1)%ov.frames.length; show(); }, 1100);
  }
  if(ov.type==='linkqr') drawQR($('qr'), ov.link);
  if(ov.type==='sheet'){ const f=$('sheetframe'); if(f) f.srcdoc=ov.doc; }
  if(ov.type==='addrunner'){ const a=$('addname'); if(a) a.focus(); }
  if(ov.type==='scan') attachScan();
}
function openSend(){
  const meet=curMeet(); if(!meet) return;
  if(!myStreams(meet).some(hasData)){ toast('Nothing recorded on this device yet'); return; }
  ov={type:'send', frames:null, idx:0, summary:sendSummary(meet)}; renderOverlay(); maybeUpload(true);
  sendPayload(meet).then(code => { if(!ov||ov.type!=='send') return; ov.code=code; ov.frames=X.makeFrames(code,500); renderOverlay(); });
}
const CAM_BLOCKED='<div class="banner warn"><strong>The camera is not available here.</strong>Allow camera access for this site, or use a photo or paste the code.</div>';
function camBlocked(){ scan.cam='blocked'; const box=document.querySelector('#overlay .scanbox'); if(box) box.outerHTML=CAM_BLOCKED; }   /* swap in place; the rest of the sheet stays put */
function stopScan(){
  clearTimeout(scan.timer); scan.timer=null;
  if(scan.stream){ scan.stream.getTracks().forEach(t => t.stop()); scan.stream=null; }
}
function attachScan(){
  const v=$('scanv'); if(!v) return;
  if(scan.stream){ v.srcObject=scan.stream; v.play().catch(() => {}); return; }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ camBlocked(); return; }
  navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}, audio:false}).then(stream => {
    if(!ov||ov.type!=='scan'){ stream.getTracks().forEach(t => t.stop()); return; }
    scan.stream=stream; const vid=$('scanv'); if(vid){ vid.srcObject=stream; vid.play().catch(() => {}); }
    scan.asm=new X.Assembler(); scanLoop();
  }, () => { if(ov&&ov.type==='scan') camBlocked(); });
}
function scanNote(kind,msg){ if(ov&&ov.type==='scan'){ ov.kind=kind; ov.msg=msg; } const el=$('scanmsg'); if(el){ el.className='banner '+kind; el.innerHTML='<strong>'+esc(msg)+'</strong>'; } }
function decodeImage(source,w,h,both){
  const max=1000, k=Math.min(1,max/Math.max(w,h)), cw=Math.max(1,Math.round(w*k)), ch=Math.max(1,Math.round(h*k));
  scan.canvas=scan.canvas||document.createElement('canvas'); scan.canvas.width=cw; scan.canvas.height=ch;
  const ctx=scan.canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(source,0,0,cw,ch);
  const img=ctx.getImageData(0,0,cw,ch), res=window.jsQR(img.data,cw,ch,{inversionAttempts:both?'attemptBoth':'dontInvert'});
  return res&&res.data?res.data:null;
}
function scanLoop(){
  if(!scan.stream||!ov||ov.type!=='scan') return;
  const v=$('scanv');
  if(v&&v.readyState>=2&&v.videoWidth&&!scan.busy){ let text=null; try{ text=decodeImage(v,v.videoWidth,v.videoHeight,false); }catch(e){} if(text) onScanText(text); }
  scan.timer=setTimeout(scanLoop,140);
}
function onScanText(text){
  const link=LINK_RE.exec(text);
  if(link){ finishScan(importCode(link[2], false, link[1]==='o'), 'link:'+link[2].slice(0,12)); return; }
  const res=scan.asm.add(text);
  if(!res){ scanNote('warn','That is a QR code, but not one from this app.'); return; }
  if(scan.asm.msg===scan.lastMsg) return;
  if(!res.done){ if(!res.dup) beep(520); scanNote('ok','Reading: part '+res.have+' of '+res.total+'. Keep holding.'); return; }
  finishScan(importCode(res.code), scan.asm.msg);
}
function finishScan(promise,msgId){
  if(scan.lastMsg===msgId) return;
  scan.busy=true; scan.lastMsg=msgId;
  promise.then(r => { scan.busy=false; scan.asm=new X.Assembler(); if(r.ok){ beep(990); buzz(); } else scan.lastMsg=null;
    if(ov&&ov.type==='scan'){ ov.kind=r.ok?'ok':'warn'; ov.msg=r.msg+(r.ok?' Ready for the next code.':''); renderOverlay(); } else toast(r.msg); });
}
function scanFromFile(file){
  const img=new Image(), url=URL.createObjectURL(file);
  img.onload=() => { let text=null; try{ text=decodeImage(img,img.naturalWidth,img.naturalHeight,true); }catch(e){} URL.revokeObjectURL(url);
    if(text) onScanText(text); else scanNote('warn','No code found in that photo. Fill the frame with the code and try again.'); };
  img.onerror=() => { URL.revokeObjectURL(url); scanNote('warn','That photo could not be opened.'); };
  img.src=url;
}

/* A sample meet with invented runners and a finished boys race, to click through. It stays on this device. */
function sampleMeet(){
  const id='m'+rid(6), sIds=['s1','s2','s3','s4'].map(() => 's'+rid(3)), hosts=['Berkshire','Millbrook','Gunn','Salisbury'];
  const rosters=[['Jack Stone','Sam Wang','William Liu','Harry Ol'],['Will Vollmer','Vincent He','Charlie Maier','Ollie Fauver','Zane Williams','Patrick Xu'],
    ['Nickolas Mannello','Anders Hildebrand','Tommy Hagymasi','Louis Valentino','August Dong','Lucas Chen','Tyler Choi'],['Eli Myers','Jack Solon','Wyatt Orthwein','Sam Schneider','Jo Kaijima','Marcus Mann']];
  const girls=[['Ann Abel','Bea Baker','Cat Cole'],['Gia North','Hana North','Ivy North'],[],['Dee Fox','Eve Gray','Fay Hill','Ida Jones','Kay Lee']];
  const cfg={id, name:'Sample meet (delete me)', date:today(), ver:Date.now(), deleted:false, counter:0, sync:'', scoring:'dual',
    schools:hosts.map((n,i) => ({id:sIds[i], name:n, color:PRESETS[i][1], races:i===2?['b']:undefined})), races:[{id:'g',name:'Girls'},{id:'b',name:'Boys'}], runners:[]};
  let k=0; rosters.forEach((list,i) => list.forEach(n => cfg.runners.push({id:String(k++), n, s:sIds[i], r:'b'}))); girls.forEach((list,i) => list.forEach(n => cfg.runners.push({id:String(k++), n, s:sIds[i], r:'g'})));
  cfg.counter=k;
  const order=[[1,1095.6],[2,1113.1],[2,1153.9],[2,1160.9],[2,1177.8],[2,1187.7],[0,1192.7],[1,1197.3],[1,1198.2],[1,1200.8],[1,1208.9],[3,1211.0],[3,1219.9],[2,1233.3],[2,1251.2],[3,1252.6],[3,1261.3],[3,1271.8],[0,1311.6],[1,1314.5],[3,1319.8],[3,1337.6],[0,1459.3],[0,1550.0]];
  const t0=Date.now()-3600000, streams={};
  streams['b.timer.dsample1']={id:'b.timer.dsample1', raceId:'b', kind:'timer', deviceId:'dsample1', deviceName:'Sample timer', updatedAt:Date.now(), startedAt:t0, endedAt:t0+1600000, taps:order.map(o => t0+Math.round(o[1]*1000))};
  streams['b.school.dsample2']={id:'b.school.dsample2', raceId:'b', kind:'school', deviceId:'dsample2', deviceName:'Sample schools', updatedAt:Date.now(), taps:order.map(o => ({t:t0+Math.round(o[1]*1000)+400, s:sIds[o[0]]}))};
  /* the girls race: times only, with one school tap missed at place 4 so the check has something to show */
  const go=[[0,1102.3],[1,1140.0],[3,1151.2],[0,1163.9],[1,1170.4],[3,1184.0],[0,1199.5],[3,1210.7],[1,1231.0],[3,1266.2],[3,1290.9]];
  streams['g.timer.dsample1']={id:'g.timer.dsample1', raceId:'g', kind:'timer', deviceId:'dsample1', deviceName:'Sample timer', updatedAt:Date.now(), startedAt:t0+300000, endedAt:t0+1700000, taps:go.map(o => t0+300000+Math.round(o[1]*1000))};
  streams['g.school.dsample2']={id:'g.school.dsample2', raceId:'g', kind:'school', deviceId:'dsample2', deviceName:'Sample schools', updatedAt:Date.now(), taps:go.filter((o,i) => i!==3).map(o => ({t:t0+300000+Math.round(o[1]*1000)+400, s:sIds[o[0]]}))};
  const names={}; [[0,'Will Vollmer'],[1,'Nickolas Mannello'],[2,'Anders Hildebrand'],[3,'Tommy Hagymasi'],[4,'Louis Valentino'],[5,'August Dong'],[6,'Jack Stone'],[7,'Vincent He'],[8,'Charlie Maier'],[9,'Ollie Fauver'],[10,'Zane Williams'],[11,'Eli Myers'],[12,'Jack Solon'],[13,'Lucas Chen'],[14,'Tyler Choi'],[15,'Wyatt Orthwein'],[16,'Sam Schneider'],[17,'Jo Kaijima'],[18,'Sam Wang'],[19,'Patrick Xu'],[20,'Marcus Mann'],[22,'William Liu']]
    .forEach(x => { const u=cfg.runners.find(r => r.n===x[1]&&r.r==='b'); if(u) names[x[0]+1]={u:u.id}; });
  S.meets[id]={config:cfg, streams, results:{b:{raceId:'b', names, status:{}, startAdj:0, finishers:24, cols:null, srcTimer:null, srcSchool:null, srcRoster:null, updatedAt:Date.now()}}, own:true};
  S.meetId=id; S.chosen={meet:id, today:todayId()};
  Object.assign(S.ui,{tab:'live', resRace:'b', liveRace:'b', livePicked:true, openRow:null, lock:null, rosterSchool:null}); save(); render();
  toast('Sample meet loaded. It is only on this device; delete it from Setup when you are done.');
}
/* ---------- actions ---------- */
function newMeet(){
  const prev=curMeet(), id='m'+rid(6);
  const cfg={id, name:'New meet', date:today(), ver:Date.now(), deleted:false, counter:prev?prev.config.counter||0:0, sync:prev?prev.config.sync||'':'', scoring:prev&&prev.config.scoring==='dual'?'dual':'invite',
    schools:prev?clone(prev.config.schools):[{id:'s'+rid(3), name:'Berkshire', color:'#1F7A4D'}],
    races:prev?clone(prev.config.races):[{id:'g', name:'Girls'},{id:'b', name:'Boys'}],
    runners:prev?clone(prev.config.runners):[]};
  if(!cfg.sync&&S.sheet) cfg.sync=S.sheet;
  S.org=true; S.chosen={meet:id, today:todayId()};
  S.meets[id]={config:cfg, streams:{}, results:{}, own:true}; S.meetId=id;
  Object.assign(S.ui,{tab:'setup', resRace:null, openRow:null, lock:null, rosterSchool:null}); save(); render(); scheduleSetupPush();
}
function colEdit(fn){ const meet=curMeet(), r=ensureCols(meet,S.ui.resRace); fn(r.cols,r); touchResult(meet,r); render(); }
function padTo(arr,n,mk){ while(arr.length<n) arr.push(mk()); }
const blankS=() => ({s:null,t:null}), blankT=() => null;
function meetCode(meet){ return X.encodeText(JSON.stringify(X.packConfig(meet.config))); }
/* The link is prepared ahead of the tap, because phones only allow copying and sharing directly inside a tap. */
let linkCache={id:null, ver:0, code:null};
function refreshLink(){
  const meet=curMeet(); if(!meet) return;
  const id=meet.config.id, ver=meet.config.ver;
  if(linkCache.id===id&&linkCache.ver===ver) return;
  meetCode(meet).then(code => { if(meet.config.ver===ver) linkCache={id, ver, code}; }, () => {});
}
function withLink(meet,fn,owner){
  if(linkCache.id===meet.config.id&&linkCache.ver===meet.config.ver&&linkCache.code) fn(meetLinkFor(linkCache.code, owner));
  else meetCode(meet).then(code => fn(meetLinkFor(code, owner)), () => toast('Could not build the link in this browser'));
}

function act(name,el){
  const meet=curMeet(), d=el?el.dataset:{}, i=d.i!=null?+d.i:-1, raceId=d.race;
  let st, r;
  switch(name){
    case 'tab': S.ui.tab=(!isOwner(meet)&&(d.tab==='setup'||d.tab==='results'))?'home':d.tab; S.ui.openRow=null; save(); render(); $('main').scrollTop=0;
      if(S.ui.tab==='results'||S.ui.tab==='live'||S.ui.tab==='roster') pullSheet(false);
      if((S.ui.tab==='home'||S.ui.tab==='setup')&&isOwner(meet)) listSheet(false).then(() => { if((S.ui.tab==='home'||S.ui.tab==='setup')&&!typing()) render(); }); break;
    case 'go': if(!meet||d.kind==='roster') break;
      if(d.kind!=='timer'&&!meet.config.schools.length){ toast(isOwner(meet)?'Add the schools in Setup first':'This meet has no schools yet. Ask the organizer for an updated link.'); break; }
      S.ui.lock={kind:d.kind}; S.ui.rosterSchool=null; save(); render(); break;
    case 'send': openSend(); break;
    case 'scan': ov={type:'scan'}; scan.lastMsg=null; scan.cam=null; renderOverlay(); break;
    case 'paste-open': stopScan(); ov={type:'paste'}; renderOverlay(); break;
    case 'paste-import': { const ta=$('pastebox'); importIncoming(ta?ta.value:'').then(res => { if(ov&&ov.type==='paste'){ ov.kind=res.ok?'ok':'warn'; ov.msg=res.msg; renderOverlay(); } }); break; }
    case 'import-link': { const ta=$('linkpaste'); importIncoming(ta?ta.value:'').then(res => { toast(res.msg); if(res.ok) render(); }); break; }
    case 'overlay-close': closeOverlay(); break;
    case 'copy-send': copyText(X.makeFrames(ov.code,1e9)[0], 'Copied. Send it to the organizer.', 'sendout'); break;
    case 'share-send': navigator.share({text:X.makeFrames(ov.code,1e9)[0]}).catch(shareFail); break;
    case 'new-meet': newMeet(); break;
    case 'sample-meet': sampleMeet(); break;
    case 'del-meet': deleteMeet(meet.config.id); break;
    case 'del-sheet-meet': deleteMeet(d.m); break;
    case 'set-today': setToday(d.m); break;
    case 'copy-season': copyText(seasonLink(false), 'Season link copied. Send it to every volunteer once.', 'linkout'); break;
    case 'copy-season-org': copyText(seasonLink(true), 'Organizer season link copied. Keep it to yourself.', 'linkout'); break;
    case 'share-season': navigator.share({title:'XC Finish Line', text:'XC Finish Line season link', url:seasonLink(false)}).catch(shareFail); break;
    case 'show-season-qr': ov={type:'linkqr', link:seasonLink(false), season:true}; renderOverlay(); break;
    case 'add-school': meet.config.schools.push({id:'s'+rid(3), name:'', color:PRESETS[meet.config.schools.length%PRESETS.length][1]}); touchConfig(meet); render();
      { const ns=$('sc-name-'+(meet.config.schools.length-1)); if(ns) ns.focus(); } break;
    case 'del-school': { const gone=meet.config.schools.splice(i,1)[0]; meet.config.runners=meet.config.runners.filter(u => u.s!==gone.id); touchConfig(meet); render(); break; }
    case 'swap-names': { const only=i>=0?meet.config.schools[i]:null; let k=0;
      meet.config.runners.forEach(u => { if(only&&u.s!==only.id) return; const v=X.swapNameOrder(u.n); if(v!==u.n){ u.n=v; k++; } });
      touchConfig(meet); render(); toast('Swapped '+plural(k,'name')+'. Send the meet link again.'); break; }
    case 'add-race': meet.config.races.push({id:'r'+rid(3), name:'Race '+(meet.config.races.length+1)}); touchConfig(meet); render(); break;
    case 'del-race': { const gone=meet.config.races.splice(i,1)[0]; meet.config.runners=meet.config.runners.filter(u => u.r!==gone.id); touchConfig(meet); render(); break; }
    case 'copy-link': withLink(meet, link => copyText(link, 'Volunteer link copied', 'linkout')); break;
    case 'copy-org-link': withLink(meet, link => copyText(link, 'Organizer link copied. Keep it to yourself.', 'linkout'), true); break;
    case 'share-link': withLink(meet, link => navigator.share({title:meet.config.name, text:meet.config.name+' finish line', url:link}).catch(shareFail)); break;
    case 'show-link-qr': withLink(meet, link => { if(link.length>2600){ toast('This meet is too big for one QR code. Text the link instead.'); return; } ov={type:'linkqr', link}; renderOverlay(); }); break;

    case 'timer-resume': st=myStream(meet,raceId,'timer'); if(st){ st.endedAt=null; touchStream(meet,st); (S.ui.active=S.ui.active||{}).timer=raceId; S.ui.lock={kind:'timer'}; save(); render(); } break;
    case 'resume-race': st=myStream(meet,raceId,'timer'); if(st){ st.endedAt=null; touchStream(meet,st); render(); } break;
    case 'reset-stream': st=myStream(meet,raceId,d.kind); if(st){ delete meet.streams[st.id]; save(); render(); toast('Erased'); } break;
    case 'undo-time': undoTimer(meet); break;
    case 'end-race': st=myStream(meet,raceId,'timer'); if(st){
        if(st.taps.length) st.endedAt=Date.now(); else{ st.startedAt=null; st.endedAt=null; toast(raceOf(meet,raceId).name+' start cancelled'); }
        touchStream(meet,st); render();
        if(!meet.config.races.some(rc => { const s2=myStream(meet,rc.id,'timer'); return !!(s2&&s2.startedAt&&!s2.endedAt); })) maybeUpload(true); } break;
    case 'exit-lock': { const k=S.ui.lock?S.ui.lock.kind:'timer'; S.ui.lock=null; S.ui.rosterSchool=null; S.ui.tab=k==='school'?'schools':k; save(); render(); maybeUpload(true); followTick(true); break; }
    case 'reload-app': location.reload(); break;
    case 'upload-now': if(!meet||!syncUrl(meet)) break;
      if(upBusy) toast('Uploading now'); else if(!uploadPending(meet)) toast(myStreams(meet).some(hasData)?'Everything on this phone is uploaded':'Nothing recorded on this phone yet');
      else if(navigator.onLine===false) toast('No signal. It will upload by itself later, or use Send for the code.');
      else{ maybeUpload(true); toast('Uploading'); } break;
    case 'pull-sheet': pullSheet(true); break;
    case 'live-race': S.ui.liveRace=raceId; S.ui.livePicked=true; save(); render(); break;
    case 'list-sheet': toast('Checking the Sheet'); listSheet(true).then(() => { if(!typing()) render(); }); break;
    case 'open-sheet-meet': openSheetMeet(d.m); break;
    case 'send-results': sendResults(meet); break;
    case 'sync-test': { const u=syncUrl(meet); if(!u){ toast('Paste the web app link first. It ends in /exec.'); break; }
      /* checks both directions: reading (what Results does) and writing (what the phones do) */
      toast('Checking the Sheet');
      fetchJSON(u+'?ping=1').then(res => { if(!res||!res.ok) throw new Error('read');
        if(!res.v||res.v<2){ toast('Connected to "'+res.sheet+'", but it runs an older script. Copy the script again, paste it over the old one, then Deploy, Manage deployments, Edit, New version.'); return; }
        S.sheet=u; S.org=true; save(); pushSetup(); listInfo=null;
        return postSheet(u,{t:'ping'}).then(r2 => toast(r2&&r2.ok?'Connected to "'+res.sheet+'". Uploads will work.':'Connected to "'+res.sheet+'", but it is running an older script. Paste the script again and redeploy.'),
          () => toast('Reading works, but uploading was blocked. Redeploy with access set to Anyone.')); },
        () => toast('Could not reach the Sheet. Check the link, and that access is set to Anyone.')); break; }
    case 'copy-script': if(scriptText) copyText(scriptText, 'Script copied. Paste it into Apps Script.', 'scriptout'); else toast('Still loading the script. Try again in a moment.'); break;
    case 'undo-school': { let best=null;
      meet.config.races.forEach(rc => { const s2=myStream(meet,rc.id,'school'); if(s2&&s2.taps.length&&(!best||s2.taps[s2.taps.length-1].t>best.taps[best.taps.length-1].t)) best=s2; });
      if(!best){ toast('Nothing to undo'); break; }
      best.taps.pop(); touchStream(meet,best); softLock(); toast('Removed: '+raceOf(meet,best.raceId).name+' · Place '+(best.taps.length+1)); break; }

    case 'roster-school': S.ui.rosterSchool=d.s; save(); render(); break;
    case 'roster-back': S.ui.rosterSchool=null; save(); render(); break;
    case 'pick': { const u=runnerMap(meet,raceId)[d.u]; if(u) rosterPick(meet,raceId,u.id,u.n); break; }
    case 'unpick': st=myStream(meet,raceId,'roster'); if(st){ st.picks=st.picks.filter(p => p.u!==d.u); touchStream(meet,st); render(); toast('Removed'); } break;
    case 'undo-pick': { let best=null, bp=null;
      meet.config.races.forEach(rc => { const s2=myStream(meet,rc.id,'roster'); if(!s2) return; s2.picks.forEach(p => { if(!bp||(p.t||0)>=(bp.t||0)){ bp=p; best=s2; } }); });
      if(!bp){ toast('Nothing to undo'); break; }
      best.picks=best.picks.filter(p => p!==bp); touchStream(meet,best); render();
      toast('Removed: '+raceOf(meet,best.raceId).name+' · Place '+bp.p+' · '+((runnerMap(meet,best.raceId)[bp.u]||{}).n||'')); break; }
    case 'place-pad': ov={type:'numpad', race:raceId, val:''}; renderOverlay(); break;
    case 'key': if(d.k==='ok'){ const nv=+ov.val;
        if(nv>0){ const f=rosterFilled(myStream(meet,ov.race,'roster'));
          if(f[nv]&&ov.warn!==nv){ ov.warn=nv; ov.msg='Place '+nv+' already has '+((runnerMap(meet,ov.race)[f[nv]]||{}).n||'a runner')+'. Press OK again to replace.'; renderOverlay(); break; }
          placeOverride[ov.race]=nv; }
        closeOverlay(); }
      else{ ov.val=d.k==='back'?ov.val.slice(0,-1):(ov.val+d.k).slice(0,3); ov.warn=null; ov.msg=null; renderOverlay(); } break;
    case 'pad-clear': delete placeOverride[ov.race]; closeOverlay(); break;
    case 'add-runner': ov={type:'addrunner', race:raceId}; renderOverlay(); break;
    case 'add-runner-ok': { const nm=($('addname').value||'').replace(/\s+/g,' ').trim(); if(!nm){ toast('Type the runner\'s name'); break; }
      st=myStream(meet,ov.race,'roster',true); const a={id:'x'+S.deviceId.slice(1,4)+rid(3), n:nm, s:S.ui.rosterSchool}; st.added.push(a);
      const race2=ov.race; ov=null; $('overlay').hidden=true; $('overlay').innerHTML=''; rosterPick(meet,race2,a.id,a.n); break; }

    case 'res-race': S.ui.resRace=raceId; S.ui.openRow=null; save(); render(); break;
    case 'open-row': S.ui.openRow=(S.ui.openRow===i?null:i); render(); break;
    case 'set-school': colEdit(c => { padTo(c.schools,i+1,blankS); c.schools[i].s=(c.schools[i].s===d.s?null:d.s); }); break;
    case 'assign': r=resultOf(meet,S.ui.resRace,true); r.names[i+1]={u:d.u}; touchResult(meet,r); render(); break;
    case 'clear-name': r=resultOf(meet,S.ui.resRace,true); r.names[i+1]={clear:1}; touchResult(meet,r); render(); break;
    case 'set-status': r=resultOf(meet,S.ui.resRace,true); r.status=r.status||{}; if(d.st==='DNF'||d.st==='DNS') r.status[d.u]=d.st; else delete r.status[d.u]; touchResult(meet,r); render(); break;
    case 'use-school-time': { const v=view(meet,S.ui.resRace), A=v.times.filter(t => t!=null), B=v.schools.map(x => x?x.t:null).filter(t => t!=null);
      const off=(A.length>=3&&B.length>=3)?X.estimateOffset(A,B):0;
      colEdit(c => { padTo(c.times,i+1,blankT); c.times[i]=Math.round(c.schools[i].t-off); }); toast('Time filled from the school tap'); break; }
    case 'ins-time': colEdit(c => { padTo(c.times,i,blankT); c.times.splice(i,0,null); }); break;
    case 'del-time': colEdit(c => { if(i<c.times.length) c.times.splice(i,1); }); break;
    case 'ins-school': colEdit(c => { padTo(c.schools,i,blankS); c.schools.splice(i,0,blankS()); }); break;
    case 'del-school-tap': colEdit(c => { if(i<c.schools.length) c.schools.splice(i,1); }); break;
    case 'ins-both': colEdit(c => { padTo(c.times,i,blankT); c.times.splice(i,0,null); padTo(c.schools,i,blankS); c.schools.splice(i,0,blankS()); }); break;
    case 'del-both': colEdit(c => { if(i<c.times.length) c.times.splice(i,1); if(i<c.schools.length) c.schools.splice(i,1); }); break;
    case 'rebuild': r=resultOf(meet,S.ui.resRace,true); r.cols=null; touchResult(meet,r); render(); toast('Rebuilt from the original taps'); break;
    case 'copy-tsv': copyText(toDelimited(meet,[S.ui.resRace],'\t'), 'Copied. Paste into cell A1 of a Google Sheet.', 'outtext'); break;
    case 'copy-all': copyText(toDelimited(meet,meet.config.races.map(x => x.id),'\t'), 'Copied all races. Paste into cell A1.', 'outtext'); break;
    case 'dl-csv': saveFile(fileSlug(meet.config.name+' '+raceOf(meet,S.ui.resRace).name)+'.csv', toDelimited(meet,[S.ui.resRace],','), 'text/csv'); break;
    case 'open-sheet': ov={type:'sheet', doc:sheetDoc(meet)}; renderOverlay(); break;
    case 'dl-sheet': saveFile(ov.fname||(fileSlug(meet.config.name+' results')+'.html'), ov.doc, 'text/html'); break;
    case 'print-sheet': { const f=$('sheetframe'); if(f&&f.contentWindow){ f.contentWindow.focus(); f.contentWindow.print(); } break; }
    case 'copy-results-link': copyText(resultsLink(), 'Results link copied. Anyone with it sees the finish list, nothing else.', 'linkout'); break;
    case 'show-results-qr': ov={type:'sheet', title:'Results link poster', doc:qrPosterDoc(resultsLink(), meet), fname:'results-link.html'}; renderOverlay(); break;
    case 'print-qr': window.print(); break;
  }
}
function bind(el){
  const meet=curMeet(), d=el.dataset, k=d.bind, i=d.i!=null?+d.i:-1, val=el.value; let r;
  if(!meet&&k!=='device-name'&&k!=='sound'&&k!=='cell-order'&&k!=='sheet-url') return;
  if((k==='school-name'||k==='school-color'||k==='roster'||k==='school-race')&&!meet.config.schools[i]) return;
  if(k==='race-name'&&!meet.config.races[i]) return;
  if(k==='roster'&&!raceOf(meet,d.race)) return;
  switch(k){
    case 'pick-meet': if(!S.meets[val]) break; S.meetId=val; Object.assign(S.ui,{resRace:null, openRow:null, lock:null, rosterSchool:null}); save(); pendingRender=true; break;
    case 'meet-name': meet.config.name=val.trim()||'Untitled meet'; touchConfig(meet); pendingRender=true; break;
    case 'meet-date': meet.config.date=val; touchConfig(meet); break;
    case 'scoring': meet.config.scoring=val==='dual'?'dual':'invite'; touchConfig(meet); pendingRender=true; break;
    case 'device-name': S.deviceName=val.trim().slice(0,30); save(); break;
    case 'sound': S.sound=val==='1'; save(); break;
    case 'sync-url': meet.config.sync=val.trim(); if(syncUrl(meet)) S.sheet=syncUrl(meet); touchConfig(meet); pendingRender=true; break;
    case 'sheet-url': S.sheet=val.trim(); if(sheetUrl()) S.org=true; save(); listInfo=null; if(sheetUrl()) followToday(true, true).then(r => { toast(r.msg); if(!typing()) render(); }); pendingRender=true; break;
    case 'cell-order': S.cellOrder=val==='fl'?'fl':'lf'; save(); break;
    case 'school-name': meet.config.schools[i].name=val.trim(); touchConfig(meet); break;
    case 'school-color': meet.config.schools[i].color=val; touchConfig(meet); pendingRender=true; break;
    case 'school-race': { const sc=meet.config.schools[i], all=meet.config.races.map(r => r.id);
      let list=Array.isArray(sc.races)?sc.races.filter(x => all.indexOf(x)>=0):all.slice();
      if(el.checked){ if(list.indexOf(d.race)<0) list.push(d.race); } else list=list.filter(x => x!==d.race);
      if(list.length===all.length) delete sc.races; else sc.races=list;
      touchConfig(meet); break; }
    case 'race-name': meet.config.races[i].name=val.trim()||('Race '+(i+1)); touchConfig(meet); break;
    case 'roster': { const sidr=meet.config.schools[i].id, have={};
      meet.config.runners.forEach(u => { if(u.s===sidr&&u.r===d.race) have[u.n]=1; });
      /* names already on this roster are left exactly as they are; only new lines are read in the pasted order */
      const lines=val.split(/\r?\n/).map(l => { const c=l.replace(/\s+/g,' ').trim(); return have[c]?c:X.parseNameLine(l, S.cellOrder!=='fl'); });
      const out=X.syncRoster(meet.config.runners, meet.config.schools[i].id, d.race, lines, meet.config.counter||0);
      meet.config.runners=out.runners; meet.config.counter=out.counter; touchConfig(meet);
      const sum=el.closest('details').querySelector('summary'), c=meet.config, sid=c.schools[i].id;
      el.value=c.runners.filter(u => u.s===sid&&u.r===d.race).map(u => u.n).join('\n');   /* show the names as they were understood */
      if(sum) sum.textContent='Rosters ('+c.races.map(rc => rc.name+' '+c.runners.filter(u => u.s===sid&&u.r===rc.id).length).join(', ')+')'; break; }
    case 'place': { const n=Math.max(0, Math.round(+val)||0); setPlace(meet, d.u, n);
      /* redraw now so the time and school check appear, keeping the cursor where it is (usually the next box) */
      const a=document.activeElement, keep=placeNext||(a&&a.dataset&&a.dataset.bind==='place'?a.dataset.u:null); placeNext=null; render();
      if(keep){ const nx=document.querySelector('[data-bind="place"][data-u="'+keep+'"]'); if(nx){ nx.focus(); try{ nx.select(); }catch(e){} } }
      return; }
    case 'res-finishers': r=resultOf(meet,S.ui.resRace,true); r.finishers=val===''?null:Math.max(0,Math.round(+val)||0); touchResult(meet,r); pendingRender=true; break;
    case 'res-adj': r=resultOf(meet,S.ui.resRace,true); r.startAdj=Math.round((parseFloat(val)||0)*1000); touchResult(meet,r); pendingRender=true; break;
    case 'res-src': r=resultOf(meet,S.ui.resRace,true); r['src'+d.kind.charAt(0).toUpperCase()+d.kind.slice(1)]=val; if(d.kind!=='roster') r.cols=null; touchResult(meet,r); pendingRender=true; break;
    case 'row-name': { const t=val.replace(/\s+/g,' ').trim(), row=view(meet,S.ui.resRace).rows[i], ru=row&&row.runner&&!row.runner.unknown?row.runner:null;
      r=resultOf(meet,S.ui.resRace,true);
      r.names[i+1]=!t?{clear:1}:ru?(t===ru.n?{u:ru.id}:{u:ru.id, n:t}):{n:t};   /* a typed correction keeps the runner and school linked */
      touchResult(meet,r); pendingRender=true; break; }
    case 'row-time': { const ms=X.parseTime(val), adj=(resultOf(meet,S.ui.resRace)||{}).startAdj||0;
      if(val.trim()&&ms==null){ toast('Enter the time as minutes:seconds, like 18:42.3'); break; }
      r=ensureCols(meet,S.ui.resRace); padTo(r.cols.times,i+1,blankT); r.cols.times[i]=ms==null?null:ms-adj; touchResult(meet,r); pendingRender=true; break; }
  }
  if(pendingRender){ if(el.tagName==='SELECT'){ el.blur(); render(); } else deferRender(); }
}

/* ---------- taps: handled on pointer down so nothing waits for a click ---------- */
function tap(el){
  const meet=curMeet(), kind=el.dataset.tap, raceId=el.dataset.race, now=Date.now(); let st;
  if(!meet||!S.ui.lock||!raceOf(meet,raceId)) return;
  if(kind==='switch'){
    const k=S.ui.lock.kind, cur=activeRace(meet,k);
    if(cur&&cur.id===raceId) return;   /* a second touch on the same side changes nothing, so no debounce is needed */
    (S.ui.active=S.ui.active||{})[k]=raceId; save(); render(true); return;
  }
  if(performance.now()-lockRenderAt<350) return;   /* the screen just changed under the finger: a bounce, not a tap */
  if(kind==='start'){
    st=myStream(meet,raceId,'timer',true); if(st.startedAt) return;
    st.startedAt=now; st.endedAt=null; st.taps=[]; touchStream(meet,st); beep(520); buzz(); render();
  }else if(kind==='time'){
    st=myStream(meet,raceId,'timer'); if(!st||!st.startedAt||st.endedAt) return;
    if(now-st.startedAt<1500) return;                /* nobody finishes within 1.5 s of the gun */
    st.taps.push(now); touchStream(meet,st); beep(880); buzz(); flash(el); softLock(); scheduleUpload();
  }else if(kind==='school'){
    st=myStream(meet,raceId,'school',true);
    st.taps.push({t:now, s:el.dataset.s||null}); touchStream(meet,st); beep(660); buzz(); flash(el); softLock(); scheduleUpload();
  }
}
let holdT=null, holdEl=null;
function cancelHold(){ if(holdEl){ holdEl.classList.remove('holding'); holdEl=null; } clearTimeout(holdT); holdT=null; }
document.addEventListener('pointerdown', e => {
  pdown=true;
  const t=e.target.closest&&e.target.closest('[data-tap]');
  if(t){ e.preventDefault(); tap(t); return; }
  const h=e.target.closest&&e.target.closest('[data-hold]');
  if(h){ e.preventDefault(); cancelHold(); holdEl=h; h.classList.add('holding'); holdT=setTimeout(() => { const n=h.dataset.hold; cancelHold(); act(n,h); }, 1100); }
});
document.addEventListener('pointerup', () => { primeAudio(); cancelHold(); setTimeout(() => { pdown=false; }, 60); });
document.addEventListener('pointercancel', () => { cancelHold(); pdown=false; });
document.addEventListener('contextmenu', e => { if(S.ui.lock) e.preventDefault(); });
document.addEventListener('keydown', e => {
  /* Roster tab: Enter moves to the next runner's place box, like a spreadsheet */
  if((e.key==='Enter'||e.key==='Tab')&&e.target&&e.target.dataset&&e.target.dataset.bind==='place'){
    e.preventDefault(); const boxes=Array.from(document.querySelectorAll('[data-bind="place"]')), i=boxes.indexOf(e.target), nx=boxes[i+(e.shiftKey?-1:1)];
    placeNext=nx?nx.dataset.u:null;
    if(nx) nx.focus(); else e.target.blur();   /* leaving the box fires the change that saves the place */
    return;
  }
  /* a Bluetooth clicker taps the pad for the race on screen */
  if(!S.ui.lock||S.ui.lock.kind!=='timer'||e.repeat||ov) return;
  if([' ','Enter','PageDown','PageUp','ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].indexOf(e.key)<0) return;
  const pad=document.querySelector('[data-tap="time"]');
  if(pad){ e.preventDefault(); tap(pad); }
});
/* The app sits still like a native screen: nothing drags, bounces or zooms. Only lists that need to scroll do. */
document.addEventListener('touchmove', e => {
  const t=e.target; if(!t||!t.closest) return;
  if(t.closest(S.ui.lock&&!ov?'.scrolly':'.main, .overlay, .scrolly')) return;
  e.preventDefault();
}, {passive:false});
['gesturestart','gesturechange'].forEach(n => document.addEventListener(n, e => e.preventDefault()));
let resizeT=null;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT=setTimeout(() => { if(S.ui.lock&&!ov) render(true); }, 150); });
let armed=null, armT=null, armedAt=0, placeNext=null;
document.addEventListener('click', e => {
  primeAudio();
  const el=e.target.closest&&e.target.closest('[data-act]'); if(!el||el.disabled) return;
  if(S.ui.lock&&!ov&&performance.now()-lockRenderAt<300) return;   /* the screen just changed under the finger */
  if(el.dataset.confirm){
    if(armed!==el){
      if(armed&&armed.isConnected){ armed.classList.remove('armed'); armed.textContent=armed.dataset.label; }
      armed=el; armedAt=performance.now(); el.dataset.label=el.textContent; el.textContent=el.dataset.confirm; el.classList.add('armed');
      clearTimeout(armT); armT=setTimeout(() => { if(armed===el){ el.classList.remove('armed'); el.textContent=el.dataset.label; armed=null; } }, 3500);
      return;
    }
    if(performance.now()-armedAt<450) return;   /* a double-tap is not a confirmation */
    armed=null; clearTimeout(armT);
  }
  act(el.dataset.act, el);
});
document.addEventListener('focusin', e => { const t=e.target; if(t&&t.dataset&&t.dataset.bind==='place'){ try{ t.select(); }catch(x){} } });
document.addEventListener('change', e => {
  const el=e.target; if(!el) return;
  if(el.id==='scanfile'&&el.files&&el.files[0]){ scanFromFile(el.files[0]); el.value=''; return; }
  if(el.dataset&&el.dataset.bind) bind(el);
});

/* ---------- boot ---------- */
function boot(){
  render();
  const m=LINK_RE.exec(location.hash||'');
  if(m) importLink(m[1], m[2], true).then(res => { if(res.ok) render(); if(!res.quiet&&res.msg) toast(res.msg); });
  if('serviceWorker' in navigator){
    /* When a newer version has been published, switch to it straight away instead of on the next visit,
       unless someone is recording or typing; then it waits for the next time the app is opened. */
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(!hadController||reloading) return;
      if(S.ui.lock||ov||typing()){ updateWaiting=true; return; }
      reloading=true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(reg => { try{ reg.update(); }catch(e){} }, () => {});
    navigator.serviceWorker.ready.then(() => { offlineReady=true; softHeader(); }).catch(() => {});
  }
  if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(() => {});
  fetch('apps-script/Code.gs').then(r => r.ok?r.text():'').then(t => { scriptText=t; }, () => {});
  setTimeout(() => { maybeUpload(false); pushSetup(); if(!m) followTick(true); }, 2500);
}
let scriptText='', reloading=false, updateWaiting=false;
window.addEventListener('hashchange', () => { const m=LINK_RE.exec(location.hash||''); if(m) importLink(m[1], m[2], false).then(res => { if(res.msg) toast(res.msg); if(res.ok) render(); }); });
boot();
})();
