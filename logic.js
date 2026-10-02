/* XC Finish Line: pure logic. No DOM in here, so it can be tested with `node test/logic.test.js`. */
(function (root) {
'use strict';

/* ---------- time formatting ---------- */
function pad2(n){ return (n<10?'0':'')+n; }
function fmtTime(ms){
  if(ms==null||isNaN(ms)) return '';
  var neg=ms<0, t=Math.round(Math.abs(ms)/100);
  var m=Math.floor(t/600), s=Math.floor((t%600)/10), d=t%10;
  return (neg?'-':'')+m+':'+pad2(s)+'.'+d;
}
function parseTime(str){
  str=String(str||'').trim(); if(!str) return null;
  var parts=str.split(':'), sec=0;
  for(var i=0;i<parts.length;i++){ var v=parseFloat(parts[i]); if(isNaN(v)||v<0) return null; sec=sec*60+v; }
  return Math.round(sec*1000);
}

/* ---------- matching time taps to school taps by timestamp ---------- */
function median(a){
  if(!a.length) return 0;
  var b=a.slice().sort(function(x,y){return x-y;}), m=b.length>>1;
  return b.length%2?b[m]:(b[m-1]+b[m])/2;
}
function nearestDiffs(A,B,off){
  var d=[], i=0;
  for(var k=0;k<B.length;k++){
    var b=B[k]-off;
    while(i<A.length-1 && Math.abs(A[i+1]-b)<=Math.abs(A[i]-b)) i++;
    d.push(b-A[i]);
  }
  return d;
}
/* Constant offset between two devices (clock difference plus reaction lag), found without trusting row order. */
function estimateOffset(A,B){
  var best=0, bestScore=Infinity;
  for(var off=-600000; off<=600000; off+=500){
    var d=nearestDiffs(A,B,off), sc=0;
    for(var k=0;k<d.length;k++) sc+=Math.min(Math.abs(d[k]),3000);
    sc+=Math.abs(off)*0.002;
    if(sc<bestScore){ bestScore=sc; best=off; }
  }
  return best+median(nearestDiffs(A,B,best));
}
/* True when the two lists really do describe the same finishers once the offset is removed. */
function offsetFits(A,B,off){
  return median(nearestDiffs(A,B,off).map(Math.abs))<=2500;
}
/* Cheapest in-order pairing of two lists. cost(i,j) prices a pair; GAP prices leaving one entry unpaired. */
function alignGeneric(n,m,cost,GAP){
  var D=[], P=[], i, j;
  for(i=0;i<=n;i++){ D.push(new Float64Array(m+1)); P.push(new Uint8Array(m+1)); }
  for(i=1;i<=n;i++){ D[i][0]=i*GAP; P[i][0]=1; }
  for(j=1;j<=m;j++){ D[0][j]=j*GAP; P[0][j]=2; }
  for(i=1;i<=n;i++) for(j=1;j<=m;j++){
    var best=D[i-1][j-1]+cost(i-1,j-1), p=0;
    if(D[i-1][j]+GAP<best){ best=D[i-1][j]+GAP; p=1; }
    if(D[i][j-1]+GAP<best){ best=D[i][j-1]+GAP; p=2; }
    D[i][j]=best; P[i][j]=p;
  }
  var pairs=[], unA=[], unB=[]; i=n; j=m;
  while(i>0||j>0){
    var q=P[i][j];
    if(i>0&&j>0&&q===0){ pairs.push([i-1,j-1]); i--; j--; }
    else if(i>0&&(q===1||j===0)){ unA.push(i-1); i--; }
    else { unB.push(j-1); j--; }
  }
  pairs.reverse(); unA.reverse(); unB.reverse();
  return {pairs:pairs, unA:unA, unB:unB};
}
function align(A,B,off){
  return alignGeneric(A.length,B.length,function(i,j){ return Math.min(Math.abs(B[j]-off-A[i]),6000); },3000);
}
/* First place where the time column and the school-tap column stop lining up, or null.
   times[i] and schT[i] are ms since the start (null for a blank). */
function findIssue(times, schT){
  var ai=[],A=[],bi=[],B=[];
  times.forEach(function(t,i){ if(t!=null){ ai.push(i); A.push(t); } });
  schT.forEach(function(t,j){ if(t!=null){ bi.push(j); B.push(t); } });
  if(A.length<3||B.length<3) return null;
  var off=estimateOffset(A,B);
  if(Math.abs(off)>605000||!offsetFits(A,B,off)) return {kind:'noFit', index:-1, offset:off};
  var al=align(A,B,off), pI=-1, pJ=-1, unA={}, unB={};
  al.unA.forEach(function(a){ unA[ai[a]]=1; }); al.unB.forEach(function(b){ unB[bi[b]]=1; });
  for(var k=0;k<al.pairs.length;k++){
    var i=ai[al.pairs[k][0]], j=bi[al.pairs[k][1]], x;
    if(i-j>0){
      var ti=pI+1; for(x=pI+1;x<i;x++){ if(unA[x]){ ti=x; break; } }
      return {kind:'timeAlone', index:ti, offset:off};
    }
    if(i-j<0){
      var sj=pJ+1; for(x=pJ+1;x<j;x++){ if(unB[x]){ sj=x; break; } }
      return {kind:'schoolAlone', index:sj, offset:off};
    }
    pI=i; pJ=j;
  }
  return null;
}
/* Compare the school sequence tapped at the line with the school sequence the roster station recorded
   (both indexed by place, null where unknown). Returns the first place where one list has slipped
   relative to the other, or null. Single disagreements (a wrong tile, two runners swapping) are not slips. */
function findSeqIssue(tap, ros){
  var L=Math.max(tap.length, ros.length), a=[], b=[], na=0, nb=0, i;
  for(i=0;i<L;i++){
    a.push(tap[i]==null?null:tap[i]); b.push(ros[i]==null?null:ros[i]);
    if(a[i]!=null) na++; if(b[i]!=null) nb++;
  }
  if(na<3||nb<3) return null;
  function cost(x,y){ return (a[x]==null||b[y]==null||a[x]===b[y])?0:1; }
  var al=alignGeneric(L,L,cost,1.1);
  var unA={}, unB={}, pI=-1, pJ=-1;
  al.unA.forEach(function(x){ unA[x]=1; }); al.unB.forEach(function(x){ unB[x]=1; });
  var P=al.pairs;
  for(var k=0;k<P.length;k++){
    var p=P[k][0], q=P[k][1], d=p-q, x;
    if(d!==0){
      /* Over the stretch where this offset holds, how many disagreements does it remove compared with
         no offset? A real slip removes many; a runner who moved a few places removes only a few. */
      var e=k; while(e+1<P.length&&(P[e+1][0]-P[e+1][1])===d) e++;
      var saved=0;
      for(x=k;x<=e;x++) saved+=cost(P[x][1],P[x][1])-cost(P[x][0],P[x][1]);
      if(saved>=5){
        if(d>0){
          var ex=pI+1; for(x=pI+1;x<p;x++){ if(unA[x]){ ex=x; break; } }
          return {kind:'lineExtra', index:ex};
        }
        var mi=pJ+1; for(x=pJ+1;x<q;x++){ if(unB[x]){ mi=x; break; } }
        return {kind:'lineMissing', index:mi};
      }
      k=e; pI=P[e][0]; pJ=P[e][1]; continue;
    }
    pI=p; pJ=q;
  }
  return null;
}

/* ---------- scoring ---------- */
/* Standard cross country scoring: top 5 score, 6th and 7th displace, teams under 5 do not score. */
function teamScores(rowSchools){
  var count={}, seen={}, teams={}, pts=0;
  rowSchools.forEach(function(s){ if(s) count[s]=(count[s]||0)+1; });
  rowSchools.forEach(function(s){
    if(!s||count[s]<5) return;
    seen[s]=(seen[s]||0)+1; if(seen[s]>7) return;
    pts++; (teams[s]=teams[s]||[]).push(pts);
  });
  var out=Object.keys(count).map(function(s){
    var p=teams[s]||[];
    return {s:s, finishers:count[s], places:p, score:count[s]>=5?p.slice(0,5).reduce(function(x,y){return x+y;},0):null, sixth:p[5]||Infinity};
  });
  out.sort(function(x,y){ return ((x.score==null)-(y.score==null)) || (x.score-y.score) || (x.sixth-y.sixth) || (x.s<y.s?-1:1); });
  return out;
}
function csvCell(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }

/* ---------- roster helpers ---------- */
/* Replace one school's roster for one race from a pasted list, keeping the ids of names that were already there. */
function syncRoster(runners, schoolId, raceId, lines, counter){
  var keep=[], pool={}, group=[], seen={};
  runners.forEach(function(r){
    if(r.s===schoolId&&r.r===raceId) (pool[r.n]=pool[r.n]||[]).push(r.id); else keep.push(r);
  });
  lines.forEach(function(n){
    n=String(n).replace(/\s+/g,' ').trim(); if(!n||seen[n]) return; seen[n]=1;
    var id=(pool[n]&&pool[n].length)?pool[n].shift():(counter++).toString(36);
    group.push({id:id, n:n, s:schoolId, r:raceId});
  });
  return {runners:keep.concat(group), counter:counter};
}
/* One pasted roster line -> "First Last". Accepts a plain name, "Last, First", or two spreadsheet cells
   (tab-separated; read as last name then first name unless cellsLastFirst is false). */
function parseNameLine(line, cellsLastFirst){
  function clean(x){ return String(x).replace(/\s+/g,' ').trim(); }
  line=String(line==null?'':line);
  var parts;
  if(line.indexOf('\t')>=0){
    parts=line.split('\t').map(clean).filter(Boolean);
    if(parts.length>=2) return cellsLastFirst===false?parts[0]+' '+parts[1]:parts[1]+' '+parts[0];
    return parts[0]||'';
  }
  parts=line.split(',').map(clean);
  if(parts.length===2&&parts[0]&&parts[1]&&!/^(jr|sr|ii|iii|iv)\.?$/i.test(parts[1])) return parts[1]+' '+parts[0];
  return clean(line);
}
function nameKey(n){
  n=String(n||'').trim().toLowerCase();
  if(n.indexOf(',')>=0) return n;
  var parts=n.split(' '); return parts[parts.length-1]+' '+n;
}
/* Lowest place number not used yet. */
function nextPlace(filled){
  var p=1; while(filled[p]) p++; return p;
}

/* ---------- compact transfer encoding ---------- */
function b64uFromBytes(u8){
  var s=''; for(var i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function bytesFromB64u(str){
  str=str.replace(/-/g,'+').replace(/_/g,'/'); while(str.length%4) str+='=';
  var bin=atob(str), u8=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  return u8;
}
function canCompress(){
  return typeof CompressionStream!=='undefined'&&typeof DecompressionStream!=='undefined'&&typeof Response!=='undefined'&&typeof Blob!=='undefined';
}
function pipe(u8, stream){
  return new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer().then(function(b){ return new Uint8Array(b); });
}
/* text -> short URL-safe code. 'z' = deflated, 'p' = plain. */
function encodeText(str){
  var raw=new TextEncoder().encode(str);
  if(!canCompress()) return Promise.resolve('p'+b64uFromBytes(raw));
  return pipe(raw,new CompressionStream('deflate-raw')).then(function(z){
    return z.length<raw.length?'z'+b64uFromBytes(z):'p'+b64uFromBytes(raw);
  }, function(){ return 'p'+b64uFromBytes(raw); });
}
function decodeText(code){
  var kind=code.charAt(0), bytes;
  try{ bytes=bytesFromB64u(code.slice(1)); }catch(e){ return Promise.reject(new Error('bad-code')); }
  if(kind==='p') return Promise.resolve(new TextDecoder().decode(bytes));
  if(kind!=='z') return Promise.reject(new Error('bad-code'));
  if(!canCompress()) return Promise.reject(new Error('old-browser'));
  return pipe(bytes,new DecompressionStream('deflate-raw')).then(function(u){ return new TextDecoder().decode(u); },
    function(){ throw new Error('bad-code'); });
}
function hash36(str){
  var h=5381; for(var i=0;i<str.length;i++) h=((h*33)^str.charCodeAt(i))>>>0;
  return h.toString(36);
}
/* Split a code into QR-sized frames: XCF1.<msg>.<i>.<n>.<data> */
function makeFrames(code, size){
  size=size||500;
  var n=Math.max(1,Math.ceil(code.length/size)), msg=hash36(code), out=[];
  for(var i=0;i<n;i++) out.push('XCF1.'+msg+'.'+(i+1)+'.'+n+'.'+code.slice(i*size,(i+1)*size));
  return out;
}
function parseFrame(text){
  var m=/^XCF1\.([0-9a-z]+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(text||'').trim());
  if(!m) return null;
  var i=+m[2], n=+m[3]; if(!n||i<1||i>n) return null;
  return {msg:m[1], i:i, n:n, data:m[4]};
}
/* Collects frames in any order. add() returns {have,total,done,code?,dup?} or null for a non-frame. */
function Assembler(){ this.msg=null; this.parts={}; this.total=0; }
Assembler.prototype.add=function(text){
  var f=parseFrame(text); if(!f) return null;
  if(f.msg!==this.msg||f.n!==this.total){ this.msg=f.msg; this.total=f.n; this.parts={}; }
  var dup=!!this.parts[f.i]; this.parts[f.i]=f.data;
  var have=Object.keys(this.parts).length, res={have:have, total:f.n, done:have===f.n, dup:dup};
  if(res.done){ var c=''; for(var i=1;i<=f.n;i++) c+=this.parts[i]; res.code=c; }
  return res;
};

/* Meet setup <-> compact object (goes into the meet link). */
function packConfig(c){
  var sIdx={}, rIdx={}, groups={}, order=[];
  c.schools.forEach(function(s,i){ sIdx[s.id]=i; }); c.races.forEach(function(r,i){ rIdx[r.id]=i; });
  (c.runners||[]).forEach(function(u){
    if(sIdx[u.s]==null||rIdx[u.r]==null) return;
    var k=sIdx[u.s]+'.'+rIdx[u.r];
    if(!groups[k]){ groups[k]=[sIdx[u.s], rIdx[u.r], []]; order.push(k); }
    groups[k][2].push(u.id, u.n);
  });
  return {x:2, i:c.id, n:c.name, d:c.date||'', v:c.ver||0, c:c.counter||0,
    s:c.schools.map(function(s){ return [s.id,s.name,s.color]; }),
    r:c.races.map(function(r){ return [r.id,r.name]; }),
    u:order.map(function(k){ return groups[k]; })};
}
function unpackConfig(o){
  if(!o||o.x!==2||!o.i||!Array.isArray(o.s)||!Array.isArray(o.r)) return null;
  var c={id:String(o.i), name:String(o.n||'Meet'), date:String(o.d||''), ver:+o.v||0, counter:+o.c||0, deleted:false,
    schools:o.s.map(function(s){ return {id:String(s[0]), name:String(s[1]||''), color:String(s[2]||'#7D858C')}; }),
    races:o.r.map(function(r){ return {id:String(r[0]), name:String(r[1]||'')}; }), runners:[]};
  (o.u||[]).forEach(function(g){
    var s=c.schools[g[0]], r=c.races[g[1]], list=g[2]||[]; if(!s||!r) return;
    for(var i=0;i+1<list.length;i+=2) c.runners.push({id:String(list[i]), n:String(list[i+1]), s:s.id, r:r.id});
  });
  return c;
}
/* One device's tap lists <-> compact object (goes into the hand-off QR codes). */
function packStreams(meta, streams){
  var st=[];
  streams.forEach(function(s){
    var prev, d=[];
    if(s.kind==='timer'){
      prev=s.startedAt||0; s.taps.forEach(function(t){ d.push(t-prev); prev=t; });
      st.push({k:'t', r:s.raceId, u:s.updatedAt||0, s:s.startedAt||0, e:s.endedAt||0, d:d});
    }else if(s.kind==='school'){
      var ids=[], idx={}, c=[], base=s.taps.length?s.taps[0].t:0; prev=base;
      s.taps.forEach(function(x){
        d.push(x.t-prev); prev=x.t;
        if(!x.s){ c.push(-1); return; }
        if(idx[x.s]==null){ idx[x.s]=ids.length; ids.push(x.s); }
        c.push(idx[x.s]);
      });
      st.push({k:'s', r:s.raceId, u:s.updatedAt||0, b:base, d:d, i:ids, c:c});
    }else if(s.kind==='roster'){
      var p=[]; (s.picks||[]).forEach(function(x){ p.push(x.p, x.u); });
      st.push({k:'r', r:s.raceId, u:s.updatedAt||0, p:p, a:(s.added||[]).map(function(a){ return [a.id,a.n,a.s]; })});
    }
  });
  return {x:2, m:meta.meetId, v:meta.ver||0, d:meta.deviceId, n:meta.deviceName||'', st:st};
}
function unpackStreams(o){
  if(!o||o.x!==2||!o.m||!o.d||!Array.isArray(o.st)) return null;
  var dev=String(o.d), name=String(o.n||''), out=[];
  o.st.forEach(function(c){
    var r=String(c.r), prev, base={raceId:r, deviceId:dev, deviceName:name, updatedAt:+c.u||0};
    if(c.k==='t'){
      prev=+c.s||0;
      base.kind='timer'; base.id=r+'.timer.'+dev; base.startedAt=+c.s||null; base.endedAt=+c.e||null;
      base.taps=(c.d||[]).map(function(x){ prev+=+x; return prev; });
    }else if(c.k==='s'){
      prev=+c.b||0;
      base.kind='school'; base.id=r+'.school.'+dev;
      base.taps=(c.d||[]).map(function(x,i){ prev+=+x; var ci=c.c?c.c[i]:-1; return {t:prev, s:(ci>=0&&c.i&&c.i[ci]!=null)?String(c.i[ci]):null}; });
    }else if(c.k==='r'){
      base.kind='roster'; base.id=r+'.roster.'+dev; base.picks=[];
      for(var i=0;c.p&&i+1<c.p.length;i+=2) base.picks.push({p:+c.p[i], u:String(c.p[i+1])});
      base.added=(c.a||[]).map(function(a){ return {id:String(a[0]), n:String(a[1]), s:a[2]==null?null:String(a[2])}; });
    }else return;
    out.push(base);
  });
  return {meetId:String(o.m), ver:+o.v||0, deviceId:dev, deviceName:name, streams:out};
}

var api={pad2:pad2, fmtTime:fmtTime, parseTime:parseTime, median:median, estimateOffset:estimateOffset, align:align,
  nearestDiffs:nearestDiffs, findIssue:findIssue, findSeqIssue:findSeqIssue, teamScores:teamScores, csvCell:csvCell, syncRoster:syncRoster, parseNameLine:parseNameLine, nameKey:nameKey,
  nextPlace:nextPlace, encodeText:encodeText, decodeText:decodeText, makeFrames:makeFrames, parseFrame:parseFrame,
  Assembler:Assembler, packConfig:packConfig, unpackConfig:unpackConfig, packStreams:packStreams, unpackStreams:unpackStreams};
if(typeof module!=='undefined'&&module.exports) module.exports=api;
root.XC=api;
})(typeof self!=='undefined'?self:globalThis);
