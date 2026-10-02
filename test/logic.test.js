/* Run with: node test/logic.test.js */
const X = require('../logic.js');
let fails = 0, n = 0;
function ok(name, cond, extra){ n++; if(!cond){ fails++; console.log('FAIL', name, extra===undefined?'':JSON.stringify(extra)); } }
function canon(v){ if(Array.isArray(v)) return v.map(canon); if(v&&typeof v==='object'){ const o={}; Object.keys(v).sort().forEach(k=>{ o[k]=canon(v[k]); }); return o; } return v; }
function eq(name, a, b){ const x=JSON.stringify(canon(a)), y=JSON.stringify(canon(b)); ok(name, x===y, x.length+y.length<600?{got:a, want:b}:'(large values differ)'); }

// deterministic pseudo-random
let seed = 11; const rnd = () => { seed = (seed*1103515245+12345) & 0x7fffffff; return seed/0x7fffffff; };

// ---- time formatting
eq('fmt 18:42.3', X.fmtTime(1122349), '18:42.3');
eq('fmt rollover', X.fmtTime(59960), '1:00.0');
eq('fmt null', X.fmtTime(null), '');
eq('parse mm:ss.t', X.parseTime('18:42.3'), 1122300);
eq('parse seconds', X.parseTime('75.5'), 75500);
eq('parse junk', X.parseTime('abc'), null);

// ---- a simulated race: 40 finishers, 4 schools
function race(N){
  let t = 16*60000; const fin = [];
  for(let i=0;i<N;i++){ t += Math.round(1200 + rnd()*7000); fin.push({t, s:'s'+Math.floor(rnd()*4)}); }
  return fin;
}
const fin = race(40);
const times = fin.map(f => f.t + Math.round((rnd()-0.3)*300));
const schFull = fin.map(f => f.t + 900 + Math.round(rnd()*800));   // other device: clock +0.9s, slower reactions

eq('clean race has no issue', X.findIssue(times, schFull), null);
eq('23 s clock offset still clean', X.findIssue(times, schFull.map(t => t+23000)), null);
eq('-41 s clock offset still clean', X.findIssue(times, schFull.map(t => t-41000)), null);

{ const s = schFull.slice(); s.splice(11,1); const r = X.findIssue(times, s);
  ok('missed school tap located', r && r.kind==='timeAlone' && Math.abs(r.index-11)<=1, r);
  const fixed = s.slice(); fixed.splice(r.index,0,null); eq('blank school fixes it', X.findIssue(times, fixed), null); }
{ const t = times.slice(); t.splice(19,1); const r = X.findIssue(t, schFull);
  ok('missed time tap located', r && r.kind==='schoolAlone' && Math.abs(r.index-19)<=1, r);
  const fixed = t.slice(); fixed.splice(r.index,0,null); eq('blank time fixes it', X.findIssue(fixed, schFull), null); }
{ const t = times.slice(); t.splice(5,0,times[5]+250); const r = X.findIssue(t, schFull);
  ok('double time tap located', r && r.kind==='timeAlone' && Math.abs(r.index-5)<=1, r); }
{ const s = schFull.slice(); s[8] += 5000; eq('one late tap (5 s) is not flagged', X.findIssue(times, s), null); }
{ // timer misses #8, school misses #30: both found, one at a time
  const t = times.slice(); t.splice(8,1); const s = schFull.slice(); s.splice(30,1);
  const r1 = X.findIssue(t, s); ok('first of two slips', r1 && r1.kind==='schoolAlone' && Math.abs(r1.index-8)<=1, r1);
  t.splice(r1.index,0,null); const r2 = X.findIssue(t, s);
  ok('second of two slips', r2 && r2.kind==='timeAlone' && Math.abs(r2.index-30)<=1, r2); }

// ---- school taps vs roster sequence
const line = fin.map(f => f.s);
eq('identical sequences', X.findSeqIssue(line, line.slice()), null);
{ const r = line.slice(); const a=r[14]; r[14]=r[15]; r[15]=a; eq('two runners swapping is not a slip', X.findSeqIssue(line, r), null); }
{ const r = line.slice(); r[20] = r[20]==='s0'?'s1':'s0'; eq('one wrong tile is not a slip', X.findSeqIssue(line, r), null); }
{ const r = line.slice(); r[3]=null; r[4]=null; r.length=35; eq('roster gaps and a short roster are not slips', X.findSeqIssue(line, r), null); }
{ const l = line.slice(); l.splice(12,1); const r = X.findSeqIssue(l, line);
  ok('line missing a runner located', r && r.kind==='lineMissing' && Math.abs(r.index-12)<=3, r); }
{ const l = line.slice(); l.splice(12,0,'s2'); const r = X.findSeqIssue(l, line);
  ok('extra line tap located', r && r.kind==='lineExtra' && Math.abs(r.index-12)<=3, r); }

{ const r = line.slice(); const a = r.splice(10,1)[0]; r.splice(12,0,a); eq('one runner moving two places is not a slip', X.findSeqIssue(line, r), null); }
{ let bad = 0; for(let pos=1; pos<37; pos++){ const r = line.slice(); const a = r.splice(pos,1)[0]; r.splice(pos+2,0,a); if(X.findSeqIssue(line, r)) bad++; }
  eq('no position where a two-place move reads as a slip', bad, 0); }
{ const two = fin.map((f,i) => (i*7%3===0)?'s0':'s1'); const r = two.slice(); [r[9],r[10]]=[r[10],r[9]]; [r[13],r[14]]=[r[14],r[13]];
  eq('two schools, two nearby swaps: not a slip', X.findSeqIssue(two, r), null);
  const l = two.slice(); l.splice(20,1); const res = X.findSeqIssue(l, two); ok('two schools: a real missed runner is still found', res && res.kind==='lineMissing', res); }
{ const r = X.findIssue(times, schFull.map(t => t+61000)); eq('61 s clock offset still clean', r, null); }
{ const r = X.findIssue(times, schFull.map(t => t+400000)); eq('6.7 min clock offset still clean', r, null); }
{ const junk = times.map((t,i) => 5000000 + i*977); const r = X.findIssue(times, junk); ok('lists that cannot be lined up say so', r && r.kind==='noFit', r); }

// ---- scoring
{ const order = 'A B A C A B A B C A B A C A B C A'.split(' ');
  const sc = X.teamScores(order);
  eq('winner', [sc[0].s, sc[0].score], ['A', 22]);
  eq('second', [sc[1].s, sc[1].score], ['B', 35]);
  eq('incomplete team', [sc[2].s, sc[2].score], ['C', null]);
  eq('eighth runner removed', sc[0].places.length, 7); }

// ---- roster editing keeps ids
{ let r = X.syncRoster([], 's1', 'g', ['Ann Lee', 'Bea Cho', 'Cy Dunn'], 0);
  eq('ids assigned', r.runners.map(u => u.id), ['0','1','2']);
  r = X.syncRoster(r.runners, 's1', 'g', ['Cy Dunn', 'Dee Fox', 'Ann Lee', 'Ann Lee'], r.counter);
  eq('ids kept, new id for new name, duplicate dropped', r.runners.map(u => u.id+':'+u.n), ['2:Cy Dunn','3:Dee Fox','0:Ann Lee']);
  eq('other groups untouched', X.syncRoster(r.runners, 's1', 'b', ['Ed Go'], r.counter).runners.length, 4); }
eq('next place fills the lowest gap', X.nextPlace({1:1,2:1,4:1}), 3);
eq('sort key by last name', [X.nameKey('Ann Zed') > X.nameKey('Zoe Abel'), X.nameKey('Lee, Ann')], [true, 'lee, ann']);

// ---- frames
{ const code = 'z' + 'Ab9_-'.repeat(260); const frames = X.makeFrames(code, 500);
  eq('frame count', frames.length, 3);
  const asm = new X.Assembler(); let res;
  [2,0,2,1].forEach(i => { res = asm.add(frames[i]); });
  ok('assembles out of order with a repeat', res.done && res.code===code, res);
  eq('non-frame ignored', asm.add('https://example.com'), null);
  ok('max frame length fits a version 15 QR (520 bytes)', frames.every(f => f.length<=520), frames.map(f=>f.length)); }

(async () => {
  // ---- meet setup round trip
  const cfg = {id:'m1', name:'Berkshire Invitational', date:'2026-10-10', ver:123, counter:0, deleted:false,
    schools:[{id:'s1',name:'Berkshire',color:'#1F7A4D'},{id:'s2',name:'School B',color:'#1B2A5C'}], races:[{id:'g',name:'Girls'},{id:'b',name:'Boys'}], runners:[]};
  let c = 0; for(const s of cfg.schools) for(const r of cfg.races){
    const names = Array.from({length:40}, (_,i) => 'First'+i+' Lastname'+s.id+r.id+i);
    const o = X.syncRoster(cfg.runners, s.id, r.id, names, c); cfg.runners = o.runners; c = o.counter; }
  cfg.counter = c;
  const code = await X.encodeText(JSON.stringify(X.packConfig(cfg)));
  const back = X.unpackConfig(JSON.parse(await X.decodeText(code)));
  eq('meet setup survives the link', back, cfg);
  console.log('meet link code for 160 runners:', code.length, 'chars');

  // ---- stream round trip
  const start = 1759600000000;
  const streams = [
    {id:'g.timer.dA', raceId:'g', kind:'timer', deviceId:'dA', deviceName:'iPad', startedAt:start, endedAt:start+1500000, updatedAt:start+1500000, taps:times.map(t => start+t)},
    {id:'b.timer.dA', raceId:'b', kind:'timer', deviceId:'dA', deviceName:'iPad', startedAt:start+300000, endedAt:null, updatedAt:start+9, taps:[]},
    {id:'g.school.dA', raceId:'g', kind:'school', deviceId:'dA', deviceName:'iPad', updatedAt:5, taps:fin.map((f,i) => ({t:start+schFull[i], s:i===7?null:f.s}))},
    {id:'g.roster.dA', raceId:'g', kind:'roster', deviceId:'dA', deviceName:'iPad', updatedAt:6, picks:fin.map((f,i) => ({p:i+1, u:(i*3).toString(36)})), added:[{id:'xdA1', n:'Late Entry', s:'s2'}]}
  ];
  const packed = X.packStreams({meetId:'m1', ver:123, deviceId:'dA', deviceName:'iPad'}, streams);
  const code2 = await X.encodeText(JSON.stringify(packed));
  const frames = X.makeFrames(code2, 500);
  const asm = new X.Assembler(); let res; frames.slice().reverse().forEach(f => { res = asm.add(f); });
  const un = X.unpackStreams(JSON.parse(await X.decodeText(res.code)));
  eq('streams survive the hand-off', un.streams, streams);
  eq('hand-off meta', [un.meetId, un.ver, un.deviceId, un.deviceName], ['m1', 123, 'dA', 'iPad']);
  console.log('hand-off for 40 finishers x 3 lists:', code2.length, 'chars in', frames.length, 'QR code(s)');
  let threw = false; try { await X.decodeText('zNOTVALID!!'); } catch(e){ threw = true; }
  ok('garbage code rejected', threw);

  console.log(fails ? fails+' of '+n+' checks FAILED' : 'all '+n+' checks passed');
  process.exit(fails?1:0);
})();
