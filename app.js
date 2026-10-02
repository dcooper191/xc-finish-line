/* XC Finish Line: screens and device storage. Pure logic lives in logic.js (window.XC). */
(function(){
'use strict';
const X = window.XC, fmtTime = X.fmtTime;
const LS = 'xcfl.v2';
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
function niceDate(iso){
  const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(iso||''); if(!m) return iso||'';
  try{ return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric', year:'numeric'}); }catch(e){ return iso; }
}

/* ---------- state: everything lives on this device ---------- */
let storageOK = true, offlineReady = false;
function freshState(){ return {v:2, deviceId:'d'+rid(6), deviceName:'', sound:true, meetId:null, meets:{},
  ui:{tab:'home', lock:null, rosterSchool:null, resRace:null, openRow:null}}; }
function load(){
  let s=null;
  try{ localStorage.setItem(LS+'.t','1'); localStorage.removeItem(LS+'.t'); s=JSON.parse(localStorage.getItem(LS)||'null'); }
  catch(e){ storageOK=false; }
  if(!s||s.v!==2) s=freshState();
  s.ui=s.ui||{}; s.meets=s.meets||{};
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
  S.meets=n.meets||{}; S.meetId=n.meetId; S.deviceId=n.deviceId; S.deviceName=n.deviceName; S.sound=n.sound; lastJSON=str;
  return true;
}

function curMeet(){ const m=S.meets[S.meetId]; return (m&&!m.config.deleted)?m:null; }
function liveMeets(){ return Object.values(S.meets).filter(m => !m.config.deleted)
  .sort((a,b) => (b.config.date||'').localeCompare(a.config.date||'')||(b.config.ver||0)-(a.config.ver||0)); }
function schoolOf(meet,id){ return meet.config.schools.find(s => s.id===id)||null; }
function raceOf(meet,id){ return meet.config.races.find(r => r.id===id)||null; }
function raceIdx(meet,id){ return Math.max(0, meet.config.races.findIndex(r => r.id===id)); }
function touchConfig(meet){ meet.config.ver=Math.max(Date.now(), (meet.config.ver||0)+1); save(); refreshLink(); }   /* always moves forward */

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
  return {r, T, C, R, times:cols.times, schools:cols.schools, rows, n, edited:!!r.cols, stale:!!r.cols&&r.cols.sig!==sig, sig, adj:r.startAdj||0, unplaced, rm};
}
function raceIdxSchool(meet,sid){ const i=meet.config.schools.findIndex(s => s.id===sid); return i<0?999:i; }
function ensureCols(meet,raceId){
  const r=resultOf(meet,raceId,true);
  if(!r.cols){ const v=view(meet,raceId), raw=rawCols(v.T,v.C); r.cols={times:raw.times, schools:raw.schools, sig:v.sig}; }
  return r;
}
function exportRows(meet,raceId){
  const v=view(meet,raceId), out=[];
  v.rows.forEach(row => { const sch=row.school?schoolOf(meet,row.school):null;
    out.push([row.i+1, sch?sch.name:'', row.name, row.time!=null?fmtTime(row.time+v.adj):'']); });
  v.unplaced.forEach(u => { const sch=schoolOf(meet,u.s); out.push(['', sch?sch.name:'', u.n, (v.r.status||{})[u.id]||'DNS']); });
  return out;
}
function toDelimited(meet,raceIds,sep){
  const many=raceIds.length>1, rows=[(many?['Race']:[]).concat(['Place','School','Name','Time'])];
  raceIds.forEach(id => { const race=raceOf(meet,id); exportRows(meet,id).forEach(r => rows.push(many?[race.name].concat(r):r)); });
  return rows.map(r => r.map(c => sep===','?X.csvCell(c):String(c).replace(/[\t\n]/g,' ')).join(sep)).join('\n');
}

/* ---------- moving data between devices ---------- */
function meetLinkFor(code){ return location.href.split('#')[0]+'#m='+code; }
function importConfig(cfg, boot){
  if(!cfg) return {ok:false, msg:'That is not a meet link from this app.'};
  const local=S.meets[cfg.id], cur=curMeet(), isNew=!local||!!local.config.deleted; let msg, quiet=false;
  if(!local){ S.meets[cfg.id]={config:cfg, streams:{}, results:{}}; msg='Loaded '+cfg.name; }
  else if(local.config.deleted){ local.config=cfg; msg='Loaded '+cfg.name; }
  else if(cfg.ver>(local.config.ver||0)){ local.config=cfg; msg='Updated '+cfg.name; }
  else{ msg=cfg.name+' is already on this device'; quiet=true; }
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
function importCode(code, boot){
  return X.decodeText(code).then(txt => {
    let obj=null; try{ obj=JSON.parse(txt); }catch(e){}
    if(obj&&obj.st) return importStreams(X.unpackStreams(obj));
    if(obj&&obj.i) return importConfig(X.unpackConfig(obj), boot);
    return {ok:false, msg:'That code is not from this app.'};
  }, e => ({ok:false, msg:(e&&e.message)==='old-browser'?'This browser is too old to read the code. Update the phone or use another device.':'That code could not be read. Copy or scan it again.'}));
}
/* Accepts a meet link, one or more frames, or a bare code. */
function importIncoming(text){
  text=String(text||'').trim();
  const link=/#m=([A-Za-z0-9_-]+)/.exec(text);
  if(link) return importCode(link[1]);
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
  return Promise.resolve({ok:false, msg:'That text is not a meet link or a code from this app.'});
}
function sendPayload(meet){
  const mine=myStreams(meet).filter(hasData);
  return X.encodeText(JSON.stringify(X.packStreams({meetId:meet.config.id, ver:meet.config.ver, deviceId:S.deviceId, deviceName:S.deviceName}, mine)));
}
function sendSummary(meet){
  return myStreams(meet).filter(hasData).sort((a,b) => raceIdx(meet,a.raceId)-raceIdx(meet,b.raceId))
    .map(st => raceOf(meet,st.raceId).name+' '+KIND_LABEL[st.kind].toLowerCase()+': '+entryCount(st)).join(' · ');
}

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
function download(name, text){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'})); a.download=name;
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
  return offlineReady?['ok','Works offline']:['','Saved on device'];
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
  const keep=$('main'), top=keep?keep.scrollTop:0, s=statusPill();
  const tabs=[['timer','Timer'],['schools','Schools'],['roster','Roster'],['results','Results'],['setup','Setup']];
  app.className='app';
  app.innerHTML='<header class="top"><button class="brand" data-act="tab" data-tab="home"><strong>XC Finish Line</strong><span>'+esc(meet?meet.config.name:'No meet on this device')+'</span></button>'+
    '<span class="pill" id="pill"><span class="dot '+s[0]+'"></span>'+esc(s[1])+'</span>'+
    (meet?'<button class="btn sm pri" data-act="send">Send</button>':'')+'</header>'+
    '<nav class="tabs" role="tablist">'+tabs.map(t => '<button role="tab" aria-selected="'+(S.ui.tab===t[0])+'" data-act="tab" data-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</nav>'+
    '<main id="main" class="main"><div class="wrap">'+mainHTML(meet)+'</div></main>';
  $('main').scrollTop=top;
}
function mainHTML(meet){
  const warn=storageOK?'':'<div class="banner bad"><strong>This browser is not saving data on the device.</strong>Taps will be lost if the page reloads. Turn off private browsing before the race.</div>';
  const tab=S.ui.tab;
  if(tab==='setup'){ refreshLink(); return warn+setupHTML(meet); }
  if(!meet) return warn+noMeetHTML();
  if(tab==='timer') return warn+timerHTML(meet);
  if(tab==='schools') return warn+schoolsHTML(meet);
  if(tab==='roster') return warn+rosterHTML(meet);
  if(tab==='results') return warn+resultsHTML(meet);
  return warn+homeHTML(meet);
}
function noMeetHTML(){
  return '<section class="sec"><h2>No meet on this device</h2><p class="note">Open the meet link you were sent, or paste it here. If you are organizing the meet, create one in Setup.</p>'+
    '<label class="field"><span>Meet link</span><textarea id="linkpaste" class="linkbox" placeholder="Paste the meet link"></textarea></label>'+
    '<div class="rowf"><button class="btn pri" data-act="import-link">Load meet</button><button class="btn" data-act="tab" data-tab="setup">Go to Setup</button></div></section>';
}
function deviceNameField(){
  return '<label class="field"><span>Your name or device (shown to the organizer)</span><input type="text" id="devname" data-bind="device-name" value="'+esc(S.deviceName)+'" placeholder="Sam\'s phone" autocomplete="off"></label>';
}
function homeHTML(meet){
  return '<section class="sec"><h2>'+esc(meet.config.name)+'</h2><p class="note">'+(meet.config.date?esc(niceDate(meet.config.date))+'. ':'')+
    'This device is set up for the meet and needs no signal from here on. Pick your job.</p>'+deviceNameField()+'</section>'+
    '<section class="roles">'+
    '<button class="role c0" data-act="go" data-kind="timer"><b>Timer</b><span>At the line. Press START for each race, then tap once for every runner who crosses. Switch races at the top.</span></button>'+
    '<button class="role c1" data-act="go" data-kind="school"><b>Schools</b><span>At the line. Tap the school of every runner who crosses, in order.</span></button>'+
    '<button class="role c2" data-act="go" data-kind="roster"><b>Roster</b><span>End of the chute. Take each card, tap the school, then the runner\'s name.</span></button>'+
    '</section><section class="sec"><p class="note">When your race is over, press Send and show the code to the organizer. Organizer: Results and Setup are in the tabs above.</p></section>';
}

/* ----- Setup ----- */
function setupHTML(meet){
  const meets=liveMeets(); let h='<section class="sec"><h2>Meet</h2>';
  if(!meet){
    return h+'<div class="empty"><p>No meet yet. A meet holds the races, schools and rosters, and travels to volunteers as a link.</p><button class="btn pri" data-act="new-meet">Create a meet</button></div></section>'+
      '<section class="sec"><h3>Or load one</h3><label class="field"><span>Meet link</span><textarea id="linkpaste" class="linkbox" placeholder="Paste a meet link"></textarea></label><div class="rowf"><button class="btn" data-act="import-link">Load meet</button></div></section>';
  }
  const c=meet.config;
  if(meets.length>1) h+='<label class="field"><span>Current meet</span><select id="pickmeet" data-bind="pick-meet">'+meets.map(m =>
    '<option value="'+esc(m.config.id)+'"'+(m.config.id===c.id?' selected':'')+'>'+esc(m.config.name)+(m.config.date?' ('+esc(niceDate(m.config.date))+')':'')+'</option>').join('')+'</select></label>';
  h+='<div class="rowf"><label class="field" style="flex:2 1 200px"><span>Meet name</span><input type="text" id="meetname" data-bind="meet-name" value="'+esc(c.name)+'"></label>'+
     '<label class="field" style="flex:1 1 150px"><span>Date</span><input type="date" id="meetdate" data-bind="meet-date" value="'+esc(c.date||'')+'"></label></div>'+
     '<div class="rowf"><button class="btn" data-act="new-meet">New meet (copies schools and rosters)</button></div></section>';

  h+='<section class="sec"><h2>Races</h2><p class="note">Each race has its own start, its own places and its own rosters. Two can run at once.</p><div class="list">';
  c.races.forEach((r,i) => { h+='<div class="item"><input class="grow" type="text" id="race-name-'+i+'" data-bind="race-name" data-i="'+i+'" value="'+esc(r.name)+'" aria-label="Race name">'+
    '<button class="btn sm danger" data-act="del-race" data-i="'+i+'" data-confirm="Tap again to remove">Remove</button></div>'; });
  h+='</div><div class="rowf"><button class="btn" data-act="add-race">Add race</button></div></section>';

  h+='<section class="sec"><h2>Schools and rosters</h2><p class="note">Paste each roster one runner per line, straight from a spreadsheet. Names are shown first name first and sorted by last name. Editing a roster keeps the runners already on it.</p>'+
     '<label class="field" style="max-width:22rem"><span>When a pasted row has two cells, they are</span><select id="cellorder" data-bind="cell-order"><option value="lf"'+(S.cellOrder!=='fl'?' selected':'')+'>Last name, then first name</option><option value="fl"'+(S.cellOrder==='fl'?' selected':'')+'>First name, then last name</option></select></label><div class="list">';
  c.schools.forEach((s,i) => {
    h+='<div class="item"><span class="swatch" style="background:'+esc(s.color)+'"></span>'+
      '<input class="sname" type="text" id="sc-name-'+i+'" data-bind="school-name" data-i="'+i+'" value="'+esc(s.name)+'" aria-label="School name" placeholder="School name">'+
      '<select class="colsel" id="sc-color-'+i+'" data-bind="school-color" data-i="'+i+'" aria-label="Color">'+PRESETS.map(p => '<option value="'+p[1]+'"'+(p[1]===s.color?' selected':'')+'>'+p[0]+'</option>').join('')+'</select>'+
      '<button class="btn sm danger" data-act="del-school" data-i="'+i+'" data-confirm="Tap again to remove">Remove</button>';
    const counts=c.races.map(r => c.runners.filter(u => u.s===s.id&&u.r===r.id).length);
    h+='<details class="roster" id="ros-'+esc(s.id)+'"><summary>Rosters ('+c.races.map((r,k) => esc(r.name)+' '+counts[k]).join(', ')+')</summary><div class="rowf">'+
      c.races.map(r => '<label class="field" style="flex:1 1 200px"><span>'+esc(r.name)+'</span><textarea id="ros-'+esc(s.id)+'-'+esc(r.id)+'" data-bind="roster" data-i="'+i+'" data-race="'+esc(r.id)+'" placeholder="One runner per line">'+
        esc(c.runners.filter(u => u.s===s.id&&u.r===r.id).map(u => u.n).join('\n'))+'</textarea></label>').join('')+'</div></details></div>';
  });
  h+='</div><div class="rowf"><button class="btn" data-act="add-school">Add school</button></div></section>';

  h+='<section class="sec"><h2>Send the meet to volunteers</h2><p class="note">The link contains the races, schools and rosters, so treat it like the roster itself. Each volunteer opens it once with a connection. Send it again after any change.</p>'+
     '<div class="rowf"><button class="btn pri" data-act="copy-link">Copy meet link</button>'+(navigator.share?'<button class="btn" data-act="share-link">Share</button>':'')+
     '<button class="btn" data-act="show-link-qr">Show as QR code</button></div><textarea id="linkout" class="linkbox" readonly hidden></textarea></section>';

  h+='<section class="sec"><h2>This device</h2><div class="rowf">'+deviceNameField()+
     '<label class="field" style="flex:0 1 150px"><span>Tap sound</span><select id="sound" data-bind="sound"><option value="1"'+(S.sound?' selected':'')+'>On</option><option value="0"'+(S.sound?'':' selected')+'>Off</option></select></label></div></section>';

  h+='<section class="sec"><h2>Race day</h2><ol class="steps">'+
     '<li>Before leaving a connection, every volunteer opens the meet link and waits for "Works offline" at the top.</li>'+
     '<li>Timer and Schools stand at the line. Roster stands at the end of the chute and still collects the place cards.</li>'+
     '<li>Nothing is sent during the race. Every tap is saved on the phone the moment it happens.</li>'+
     '<li>Afterward each volunteer presses Send. Open Results on your device, press Scan, and read each code before anyone leaves.</li></ol></section>';

  h+='<section class="sec"><h3>Remove</h3><div class="rowf"><button class="btn danger" data-act="del-meet" data-confirm="Tap again to delete this meet">Delete this meet</button></div></section>';
  return h;
}

/* ----- job tabs (not locked) ----- */
function timerStatus(st){
  if(!st||!st.startedAt) return ['', 'Not started'];
  if(!st.endedAt) return ['run', 'Running, '+st.taps.length+' recorded'];
  return ['', 'Ended, '+st.taps.length+' recorded'];
}
function timerHTML(meet){
  let h='<section class="sec"><h2>Timer</h2><p class="note">One screen times every race. The switch at the top chooses which race the big button belongs to: START first, then one tap per finisher. All clocks keep running whichever race is showing.</p>'+
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
  if(!meet.config.schools.length) return '<div class="empty"><p>Add the schools in Setup first. Each one becomes a button here.</p></div>';
  let h='<section class="sec"><h2>School taps</h2><p class="note">Tap the school of each runner as they cross the line, in order. The switch at the top chooses the race.</p>'+
    '<div class="rowf"><button class="btn pri" data-act="go" data-kind="school">Open the school buttons</button></div><div class="list">';
  meet.config.races.forEach(r => {
    const st=myStream(meet,r.id,'school'), n=entryCount(st);
    h+='<div class="item"><div class="grow"><strong>'+esc(r.name)+'</strong><div class="status">'+(n?n+' tapped':'No taps yet')+'</div></div>'+
      (n?'<button class="btn sm danger" data-act="reset-stream" data-kind="school" data-race="'+esc(r.id)+'" data-confirm="Tap again to erase these taps">Reset</button>':'')+'</div>';
  });
  return h+'</div></section>';
}
function rosterHTML(meet){
  if(!meet.config.schools.length) return '<div class="empty"><p>Add the schools and rosters in Setup first.</p></div>';
  let h='<section class="sec"><h2>Roster</h2><p class="note">At the end of the chute: take the card, tap the school, tap the name. The switch at the top chooses the race. The place follows the cards in order, and you can enter a card number when someone arrives out of order.</p>'+
    '<div class="rowf"><button class="btn pri" data-act="go" data-kind="roster">Open the roster</button></div><div class="list">';
  meet.config.races.forEach(r => {
    const st=myStream(meet,r.id,'roster'), n=entryCount(st);
    h+='<div class="item"><div class="grow"><strong>'+esc(r.name)+'</strong><div class="status">'+(n?n+' recorded':'None recorded yet')+'</div></div>'+
      (n?'<button class="btn sm danger" data-act="reset-stream" data-kind="roster" data-race="'+esc(r.id)+'" data-confirm="Tap again to erase these names">Reset</button>':'')+'</div>';
  });
  return h+'</div></section>';
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
  return '<div class="lockfoot"><div class="last" id="last"></div><div class="footrow">'+buttons+
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
      (anyLive?'Another race is still running. Switch to it at the top.':'When every race is done, send your times to the organizer.')+'</p>'+
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
  best.taps.pop(); touchStream(meet,best); softLock(); toast('Removed '+raceOf(meet,best.raceId).name+' place '+(best.taps.length+1));
}

/* ----- Schools console ----- */
function raceSchools(meet,raceId){
  const withRunners=meet.config.schools.filter(s => meet.config.runners.some(u => u.s===s.id&&u.r===raceId));
  return withRunners.length?withRunners:meet.config.schools;
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
    const list=meet.config.schools, n=list.length, cols=gridCols(n);
    return '<main class="lock">'+switchHTML(meet,'roster')+'<div class="frame c'+ci+'"><div class="tiles roster-tiles" style="--cols:'+cols+'">'+
      list.map((s,k) => '<button class="tile" data-act="roster-school" data-s="'+esc(s.id)+'" style="background:'+esc(s.color)+';color:'+inkFor(s.color)+';'+(k===n-1?spanCSS(n,cols):'')+'"><b>'+esc(s.name)+'</b></button>').join('')+
      '</div></div>'+footHTML('<button class="btn" data-act="undo-pick">Undo last name</button>')+'</main>';
  }
  const st=myStream(meet,race.id,'roster'), filled=rosterFilled(st), placeOf={}; Object.keys(filled).forEach(p => { placeOf[filled[p]]=+p; });
  const list=meet.config.runners.filter(u => u.s===school.id&&u.r===race.id)
    .concat(((st&&st.added)||[]).filter(a => a.s===school.id).map(a => ({id:a.id, n:a.n})))
    .sort((a,b) => X.nameKey(a.n).localeCompare(X.nameKey(b.n)));
  /* every name keeps its position for the whole race; the grid is sized so the team fills the screen */
  const n=list.length+1, wide=window.innerWidth>=700, avail=Math.max(160, window.innerHeight-120), maxCols=wide?4:3;
  let cols=(wide&&n>6)?2:1;
  while(cols<maxCols&&Math.ceil(n/cols)*58>avail) cols++;
  const scroll=Math.ceil(n/cols)*46>avail, over=placeOverride[race.id];
  return '<main class="lock"><div class="lockbar"><button class="btn sm" data-act="roster-back">&lsaquo; Back</button>'+
    '<span class="race">'+esc(school.name)+' &middot; '+esc(race.name)+'</span>'+
    '<button class="btn sm'+(over?' card':'')+'" data-act="place-pad" data-race="'+id+'">'+(over?'Card '+over:'Place '+rosterNext(meet,race.id))+' &middot; edit</button></div>'+
    '<div class="names'+(scroll?' scrolly':'')+'" style="--cols:'+cols+'">'+
    list.map(u => placeOf[u.id]
      ?'<button class="nm picked" data-act="unpick" data-race="'+id+'" data-u="'+esc(u.id)+'" data-confirm="Tap again to remove from place '+placeOf[u.id]+'"><i>'+placeOf[u.id]+'</i> '+esc(u.n)+'</button>'
      :'<button class="nm" data-act="pick" data-race="'+id+'" data-u="'+esc(u.id)+'">'+esc(u.n)+'</button>').join('')+
    '<button class="nm add" data-act="add-runner" data-race="'+id+'" style="'+spanCSS(n,cols)+'">Not on the list</button></div></main>';
}
function rosterPick(meet,raceId,uid,name){
  const st=myStream(meet,raceId,'roster',true), filled=rosterFilled(st);
  const at=Object.keys(filled).find(p => filled[p]===uid);
  if(at){ toast('Already recorded at place '+at); return; }
  const place=placeOverride[raceId]||X.nextPlace(filled), was=filled[place]?((runnerMap(meet,raceId)[filled[place]]||{}).n||'a runner'):null;
  st.picks=st.picks.filter(p => p.p!==place);
  st.picks.push({p:place, u:uid, t:Date.now()}); delete placeOverride[raceId];
  touchStream(meet,st); S.ui.rosterSchool=null; save(); render(); beep(660); buzz();
  toast(raceOf(meet,raceId).name+' '+place+' · '+name+(was?' (replaced '+was+')':''));
}

function softLock(){
  const lock=S.ui.lock, meet=curMeet(); if(!lock||!meet) return;
  const last=$('last'), items=[];
  const info=(raceId,html) => { const el=document.querySelector('[data-rsinfo="'+raceId+'"]'); if(el) el.innerHTML=html; };
  if(lock.kind==='timer'){
    meet.config.races.forEach(r => { const st=myStream(meet,r.id,'timer');
      if(!st||!st.startedAt){ info(r.id,'not started'); return; }
      info(r.id, st.endedAt?'ended &middot; '+st.taps.length:'<span data-clock="'+esc(r.id)+'"></span> &middot; '+st.taps.length);
      const el=document.querySelector('[data-next="'+r.id+'"]'); if(el) el.textContent=st.taps.length+1;
      const lab=document.querySelector('[data-endlabel="'+r.id+'"]'); if(lab) lab.innerHTML=endLabel(r,st);
      st.taps.forEach((t,i) => items.push({t, txt:r.name+' '+(i+1)+'  '+fmtTime(t-st.startedAt)})); });
    if(last&&!last.classList.contains('say')) last.textContent=items.length?items.sort((a,b) => a.t-b.t).slice(-3).map(x => x.txt).join('     '):'No times yet. False start? Hold the cancel button.';
    tickClock();
  }else if(lock.kind==='school'){
    meet.config.races.forEach(r => { const st=myStream(meet,r.id,'school'), counts={};
      info(r.id,(st?st.taps.length:0)+' tapped'); if(!st) return;
      st.taps.forEach((x,i) => { const k=r.id+'|'+(x.s||''); counts[k]=(counts[k]||0)+1;
        const sc=x.s?schoolOf(meet,x.s):null; items.push({t:x.t, txt:r.name+' '+(i+1)+'  '+(sc?sc.name:'Not sure')}); });
      document.querySelectorAll('[data-count^="'+r.id+'|"]').forEach(el2 => { el2.textContent=counts[el2.getAttribute('data-count')]||0; }); });
    if(last&&!last.classList.contains('say')) last.textContent=items.length?items.sort((a,b) => a.t-b.t).slice(-3).map(x => x.txt).join('     '):'No taps yet';
  }else{
    meet.config.races.forEach(r => { const st=myStream(meet,r.id,'roster'); info(r.id,'next place '+rosterNext(meet,r.id)); if(!st) return;
      const rm=runnerMap(meet,r.id); st.picks.forEach(p => items.push({t:p.t||0, txt:r.name+' '+p.p+'  '+((rm[p.u]||{}).n||'?')})); });
    if(last&&!last.classList.contains('say')) last.textContent=items.length?'Last: '+items.sort((a,b) => a.t-b.t).slice(-2).map(x => x.txt).join('     '):'No names yet';
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
      return st?'<td>'+entryCount(st)+'<div class="status">'+esc(st.deviceId===S.deviceId?'this device':(st.deviceName||'a device'))+(others>0?' <span class="warnline">+'+others+' more, see Corrections</span>':'')+'</div></td>':'<td class="miss">missing</td>'; }).join('')+'</tr>';
  });
  return h+'</tbody></table></div>';
}
function resultsHTML(meet){
  const races=meet.config.races;
  if(!races.length) return '<div class="empty"><p>Add a race in Setup first.</p></div>';
  let rid=S.ui.resRace; if(!races.some(r => r.id===rid)){ rid=races[0].id; S.ui.resRace=rid; }
  let h='<section class="sec"><h2>Collected</h2><p class="note">Scan each volunteer\'s code after the race. Lists recorded on this device are already here.</p>'+checklistHTML(meet)+
    '<div class="rowf"><button class="btn pri" data-act="scan">Scan a code</button><button class="btn" data-act="paste-open">Paste a code</button></div></section>';
  const race=raceOf(meet,rid), v=view(meet,rid), nT=v.times.length, nS=v.schools.length, nR=v.R?v.R.picks.length:0, fin=v.r.finishers;
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

  if(v.unplaced.length){
    h+='<section class="sec"><h2>Did not finish or start</h2><p class="note">On the roster with no place. Each is exported as DNS unless you mark DNF.</p><div class="list">'+
      v.unplaced.map(u => { const s=schoolOf(meet,u.s), st=(v.r.status||{})[u.id]||'DNS';
        return '<div class="item"><div class="grow"><strong>'+esc(u.n)+'</strong><div class="status">'+esc(s?s.name:'')+'</div></div><div class="picks">'+
          ['DNS','DNF'].map(k => '<button aria-pressed="'+(st===k)+'" data-act="set-status" data-u="'+esc(u.id)+'" data-st="'+k+'">'+k+'</button>').join('')+'</div></div>'; }).join('')+'</div></section>';
  }

  const sc=X.teamScores(v.rows.map(r => r.school));
  if(sc.length){
    const blanks=v.rows.filter(r => !r.school).length;
    h+='<section class="sec"><h2>Team scores</h2><p class="note">Scored as one meet: top five score, sixth and seventh displace, and a team needs five finishers.'+(blanks?' '+plural(blanks,'finisher')+' with no school yet, so these can still change.':'')+'</p>'+
       '<div class="tscroll"><table class="grid"><thead><tr><th>Score</th><th>School</th><th>Scoring places</th><th>Finishers</th></tr></thead><tbody>'+
       sc.map(x => { const s=schoolOf(meet,x.s); return '<tr><td class="num">'+(x.score==null?'inc.':x.score)+'</td><td><span class="chip"><u style="background:'+esc(s.color)+'"></u><span>'+esc(s.name)+'</span></span></td><td>'+
         (x.score==null?'fewer than five':x.places.slice(0,5).join(', ')+(x.places.length>5?' ('+x.places.slice(5).join(', ')+')':''))+'</td><td>'+x.finishers+'</td></tr>'; }).join('')+
       '</tbody></table></div></section>';
  }

  h+='<section class="sec"><h2>Export</h2><p class="note">Columns are Place, School, Name, Time. Copy, then paste into cell A1 of a Google Sheet.</p><div class="rowf">'+
     '<button class="btn pri" data-act="copy-tsv">Copy '+esc(race.name)+'</button>'+(races.length>1?'<button class="btn" data-act="copy-all">Copy all races</button>':'')+
     '<button class="btn" data-act="dl-csv">Download CSV</button></div><textarea id="outtext" class="out" readonly hidden></textarea></section>';

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
    h=sheet('Send to the organizer', '<p class="note">'+esc(ov.summary)+'</p>'+
      (ov.frames?'<div class="qrbox"><canvas id="qr"></canvas></div><div class="qrmeta" id="qrmeta"></div>'+
        '<p class="note">Hold this screen up to the organizer\'s camera. '+(ov.frames.length>1?'The code changes on its own; keep holding until their screen says it has every part.':'')+'</p>'+
        '<div class="rowf"><button class="btn" data-act="copy-send">Copy as text instead</button>'+(navigator.share?'<button class="btn" data-act="share-send">Share as text</button>':'')+'</div><textarea id="sendout" class="linkbox" readonly hidden></textarea>'
        :'<p class="note">Preparing the code.</p>'));
  }else if(ov.type==='linkqr'){
    h=sheet('Meet link', '<div class="qrbox"><canvas id="qr"></canvas></div><p class="note">Volunteers point their phone camera at this and open the link. If it will not scan from a small screen, text the link instead.</p>');
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
  if(ov.type==='addrunner'){ const a=$('addname'); if(a) a.focus(); }
  if(ov.type==='scan') attachScan();
}
function openSend(){
  const meet=curMeet(); if(!meet) return;
  if(!myStreams(meet).some(hasData)){ toast('Nothing recorded on this device yet'); return; }
  ov={type:'send', frames:null, idx:0, summary:sendSummary(meet)}; renderOverlay();
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
  const link=/#m=([A-Za-z0-9_-]+)/.exec(text);
  if(link){ finishScan(importCode(link[1]), 'link:'+link[1].slice(0,12)); return; }
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

/* ---------- actions ---------- */
function newMeet(){
  const prev=curMeet(), id='m'+rid(6);
  const cfg={id, name:'New meet', date:today(), ver:Date.now(), deleted:false, counter:prev?prev.config.counter||0:0,
    schools:prev?clone(prev.config.schools):[{id:'s'+rid(3), name:'Berkshire', color:'#1F7A4D'}],
    races:prev?clone(prev.config.races):[{id:'g', name:'Girls'},{id:'b', name:'Boys'}],
    runners:prev?clone(prev.config.runners):[]};
  S.meets[id]={config:cfg, streams:{}, results:{}}; S.meetId=id;
  Object.assign(S.ui,{tab:'setup', resRace:null, openRow:null, lock:null, rosterSchool:null}); save(); render();
}
function colEdit(fn){ const meet=curMeet(), r=ensureCols(meet,S.ui.resRace); fn(r.cols,r); touchResult(meet,r); render(); }
function padTo(arr,n,mk){ while(arr.length<n) arr.push(mk()); }
const blankS=() => ({s:null,t:null}), blankT=() => null;
function meetLink(meet){ return X.encodeText(JSON.stringify(X.packConfig(meet.config))).then(meetLinkFor); }
/* The link is prepared ahead of the tap, because phones only allow copying and sharing directly inside a tap. */
let linkCache={id:null, ver:0, link:null};
function refreshLink(){
  const meet=curMeet(); if(!meet) return;
  const id=meet.config.id, ver=meet.config.ver;
  if(linkCache.id===id&&linkCache.ver===ver) return;
  meetLink(meet).then(link => { if(meet.config.ver===ver) linkCache={id, ver, link}; }, () => {});
}
function withLink(meet,fn){
  if(linkCache.id===meet.config.id&&linkCache.ver===meet.config.ver&&linkCache.link) fn(linkCache.link);
  else meetLink(meet).then(fn, () => toast('Could not build the link in this browser'));
}

function act(name,el){
  const meet=curMeet(), d=el?el.dataset:{}, i=d.i!=null?+d.i:-1, raceId=d.race;
  let st, r;
  switch(name){
    case 'tab': S.ui.tab=d.tab; S.ui.openRow=null; save(); render(); $('main').scrollTop=0; break;
    case 'go': if(!meet) break;
      if(d.kind!=='timer'&&!meet.config.schools.length){ toast('Add the schools in Setup first'); break; }
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
    case 'del-meet': meet.config.deleted=true; S.ui.lock=null; S.meetId=(liveMeets()[0]||{config:{}}).config.id||null; save(); render(); break;
    case 'add-school': meet.config.schools.push({id:'s'+rid(3), name:'', color:PRESETS[meet.config.schools.length%PRESETS.length][1]}); touchConfig(meet); render();
      { const ns=$('sc-name-'+(meet.config.schools.length-1)); if(ns) ns.focus(); } break;
    case 'del-school': { const gone=meet.config.schools.splice(i,1)[0]; meet.config.runners=meet.config.runners.filter(u => u.s!==gone.id); touchConfig(meet); render(); break; }
    case 'add-race': meet.config.races.push({id:'r'+rid(3), name:'Race '+(meet.config.races.length+1)}); touchConfig(meet); render(); break;
    case 'del-race': { const gone=meet.config.races.splice(i,1)[0]; meet.config.runners=meet.config.runners.filter(u => u.r!==gone.id); touchConfig(meet); render(); break; }
    case 'copy-link': withLink(meet, link => copyText(link, 'Meet link copied', 'linkout')); break;
    case 'share-link': withLink(meet, link => navigator.share({title:meet.config.name, text:meet.config.name+' finish line', url:link}).catch(shareFail)); break;
    case 'show-link-qr': withLink(meet, link => { if(link.length>2600){ toast('This meet is too big for one QR code. Text the link instead.'); return; } ov={type:'linkqr', link}; renderOverlay(); }); break;

    case 'timer-resume': st=myStream(meet,raceId,'timer'); if(st){ st.endedAt=null; touchStream(meet,st); (S.ui.active=S.ui.active||{}).timer=raceId; S.ui.lock={kind:'timer'}; save(); render(); } break;
    case 'resume-race': st=myStream(meet,raceId,'timer'); if(st){ st.endedAt=null; touchStream(meet,st); render(); } break;
    case 'reset-stream': st=myStream(meet,raceId,d.kind); if(st){ delete meet.streams[st.id]; save(); render(); toast('Erased'); } break;
    case 'undo-time': undoTimer(meet); break;
    case 'end-race': st=myStream(meet,raceId,'timer'); if(st){
        if(st.taps.length) st.endedAt=Date.now(); else{ st.startedAt=null; st.endedAt=null; toast(raceOf(meet,raceId).name+' start cancelled'); }
        touchStream(meet,st); render(); } break;
    case 'exit-lock': { const k=S.ui.lock?S.ui.lock.kind:'timer'; S.ui.lock=null; S.ui.rosterSchool=null; S.ui.tab=k==='school'?'schools':k; save(); render(); break; }
    case 'undo-school': { let best=null;
      meet.config.races.forEach(rc => { const s2=myStream(meet,rc.id,'school'); if(s2&&s2.taps.length&&(!best||s2.taps[s2.taps.length-1].t>best.taps[best.taps.length-1].t)) best=s2; });
      if(!best){ toast('Nothing to undo'); break; }
      best.taps.pop(); touchStream(meet,best); softLock(); toast('Removed '+raceOf(meet,best.raceId).name+' place '+(best.taps.length+1)); break; }

    case 'roster-school': S.ui.rosterSchool=d.s; save(); render(); break;
    case 'roster-back': S.ui.rosterSchool=null; save(); render(); break;
    case 'pick': { const u=runnerMap(meet,raceId)[d.u]; if(u) rosterPick(meet,raceId,u.id,u.n); break; }
    case 'unpick': st=myStream(meet,raceId,'roster'); if(st){ st.picks=st.picks.filter(p => p.u!==d.u); touchStream(meet,st); render(); toast('Removed'); } break;
    case 'undo-pick': { let best=null, bp=null;
      meet.config.races.forEach(rc => { const s2=myStream(meet,rc.id,'roster'); if(!s2) return; s2.picks.forEach(p => { if(!bp||(p.t||0)>=(bp.t||0)){ bp=p; best=s2; } }); });
      if(!bp){ toast('Nothing to undo'); break; }
      best.picks=best.picks.filter(p => p!==bp); touchStream(meet,best); render();
      toast('Removed '+raceOf(meet,best.raceId).name+' '+bp.p+' · '+((runnerMap(meet,best.raceId)[bp.u]||{}).n||'')); break; }
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
    case 'set-status': r=resultOf(meet,S.ui.resRace,true); r.status=r.status||{}; if(d.st==='DNF') r.status[d.u]='DNF'; else delete r.status[d.u]; touchResult(meet,r); render(); break;
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
    case 'dl-csv': { const fname=fileSlug(meet.config.name+' '+raceOf(meet,S.ui.resRace).name)+'.csv', text=toDelimited(meet,[S.ui.resRace],',');
      /* on phones and tablets a share sheet is more dependable than a download */
      let file=null; try{ file=new File([text],fname,{type:'text/csv'}); }catch(e){}
      const touch=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
      if(touch&&file&&navigator.canShare&&navigator.canShare({files:[file]})) navigator.share({files:[file], title:fname}).catch(e => { if(!e||e.name!=='AbortError') download(fname,text); });
      else download(fname,text); break; }
  }
}
function bind(el){
  const meet=curMeet(), d=el.dataset, k=d.bind, i=d.i!=null?+d.i:-1, val=el.value; let r;
  if(!meet&&k!=='device-name'&&k!=='sound'&&k!=='cell-order') return;
  if((k==='school-name'||k==='school-color'||k==='roster')&&!meet.config.schools[i]) return;
  if(k==='race-name'&&!meet.config.races[i]) return;
  if(k==='roster'&&!raceOf(meet,d.race)) return;
  switch(k){
    case 'pick-meet': if(!S.meets[val]) break; S.meetId=val; Object.assign(S.ui,{resRace:null, openRow:null, lock:null, rosterSchool:null}); save(); pendingRender=true; break;
    case 'meet-name': meet.config.name=val.trim()||'Untitled meet'; touchConfig(meet); pendingRender=true; break;
    case 'meet-date': meet.config.date=val; touchConfig(meet); break;
    case 'device-name': S.deviceName=val.trim().slice(0,30); save(); break;
    case 'sound': S.sound=val==='1'; save(); break;
    case 'cell-order': S.cellOrder=val==='fl'?'fl':'lf'; save(); break;
    case 'school-name': meet.config.schools[i].name=val.trim(); touchConfig(meet); break;
    case 'school-color': meet.config.schools[i].color=val; touchConfig(meet); pendingRender=true; break;
    case 'race-name': meet.config.races[i].name=val.trim()||('Race '+(i+1)); touchConfig(meet); break;
    case 'roster': { const lines=val.split(/\r?\n/).map(l => X.parseNameLine(l, S.cellOrder!=='fl'));
      const out=X.syncRoster(meet.config.runners, meet.config.schools[i].id, d.race, lines, meet.config.counter||0);
      meet.config.runners=out.runners; meet.config.counter=out.counter; touchConfig(meet);
      const sum=el.closest('details').querySelector('summary'), c=meet.config, sid=c.schools[i].id;
      el.value=c.runners.filter(u => u.s===sid&&u.r===d.race).map(u => u.n).join('\n');   /* show the names as they were understood */
      if(sum) sum.textContent='Rosters ('+c.races.map(rc => rc.name+' '+c.runners.filter(u => u.s===sid&&u.r===rc.id).length).join(', ')+')'; break; }
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
    st.taps.push(now); touchStream(meet,st); beep(880); buzz(); flash(el); softLock();
  }else if(kind==='school'){
    st=myStream(meet,raceId,'school',true);
    st.taps.push({t:now, s:el.dataset.s||null}); touchStream(meet,st); beep(660); buzz(); flash(el); softLock();
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
let armed=null, armT=null, armedAt=0;
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
document.addEventListener('change', e => {
  const el=e.target; if(!el) return;
  if(el.id==='scanfile'&&el.files&&el.files[0]){ scanFromFile(el.files[0]); el.value=''; return; }
  if(el.dataset&&el.dataset.bind) bind(el);
});

/* ---------- boot ---------- */
function boot(){
  render();
  const m=/#m=([A-Za-z0-9_-]+)/.exec(location.hash||'');
  if(m) importCode(m[1], true).then(res => { if(res.ok) render(); if(!res.quiet) toast(res.msg); });
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.ready.then(() => { offlineReady=true; softHeader(); }).catch(() => {});
  }
  if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
window.addEventListener('hashchange', () => { const m=/#m=([A-Za-z0-9_-]+)/.exec(location.hash||''); if(m) importCode(m[1]).then(res => { toast(res.msg); if(res.ok) render(); }); });
boot();
})();
