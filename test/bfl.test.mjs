import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store.mjs';
import { parseCsv } from '../ratings.mjs';
import { expectedScore, calculateEloChange } from '../public/elo.js';
const names=['Alex','Sam','Jordan','Taylor'];
const match={id:'game-1',playedAt:'2026-01-01T20:00:00Z',teamA:names.slice(0,2),teamB:names.slice(2),scoreA:28,scoreB:21};
function fixture(t){const s=openStore(':memory:');t.after(()=>s.close());names.forEach(n=>s.addPlayer(n));return s;}

test('starts empty and real roster entries remain unranked',t=>{
  const s=openStore(':memory:');t.after(()=>s.close());assert.equal(s.snapshot().players.length,0);
  s.addPlayer('Alex');assert.equal(s.snapshot().players[0].rank,null);assert.equal(s.snapshot().matches.length,0);
});
test('football scores produce individual 2v2 Elo with capped margins',t=>{
  const s=fixture(t);s.record(match);let state=s.snapshot();
  assert.equal(state.matches[0].multiplier,1.25);assert.equal(state.players.find(p=>p.name==='Alex').rating,1020);
  assert.equal(state.players.find(p=>p.name==='Jordan').rating,980);
  s.record({...match,id:'blowout',playedAt:'2026-01-02T20:00:00Z',scoreA:100,scoreB:0});
  assert.equal(s.snapshot().matches[0].multiplier,2);
});
test('lower-rated winners earn more and higher-rated losers lose more',()=>{
  assert(expectedScore(800,1200)<0.1);
  const upset=calculateEloChange(800,1200,1,1.25),favorite=calculateEloChange(1200,800,1,1.25);
  assert(upset>favorite*9-0.001);assert.equal(calculateEloChange(1200,800,0,1.25),-upset);
});
test('new entries require four existing friends, both scores, and unique players',t=>{
  const s=fixture(t);
  assert.throws(()=>s.record({...match,teamB:['Jordan','Unknown']}),/Add Unknown/);
  assert.throws(()=>s.record({...match,teamB:['Alex','Taylor']}),/once/);
  assert.throws(()=>s.record({...match,scoreB:undefined}),/whole numbers/);
  assert.throws(()=>s.record({...match,teamA:['Alex'],teamB:['Jordan']}),/four/);
  assert.throws(()=>s.record({...match,game:'dpong'}),/BFL/);
  assert.equal(s.snapshot().matches.length,0);assert.equal(s.snapshot().players.length,4);
});
test('corrections preserve audit, reject stale edits, and replay subsequent games',t=>{
  const s=fixture(t);s.record(match);s.record({...match,id:'later',playedAt:'2026-01-02T20:00:00Z'});
  const old=s.snapshot().players.find(p=>p.name==='Alex').rating;
  s.correct({...match,scoreA:14,scoreB:28,revision:1,reason:'Correct final score'});
  assert.notEqual(s.snapshot().players.find(p=>p.name==='Alex').rating,old);
  assert.throws(()=>s.correct({...match,revision:1,reason:'Stale edit'}),/changed/);
  const correction=s.backup().revisions.at(-1);assert(correction.before_json);assert.match(correction.after_json,/Correct final score/);
});
test('CSV and JSON round-trip, duplicate imports are skipped, conflicts are atomic',t=>{
  const s=fixture(t);const csv='id,played_at,team_a,team_b,winner,score_a,score_b,event\ngame-1,2026-01-01T20:00:00Z,Alex|Sam,Jordan|Taylor,A,28,21,Friday';
  const rows=parseCsv(csv);assert.equal(s.importMatches(rows).added,1);assert.equal(s.importMatches(rows).skipped,1);
  assert.throws(()=>s.importMatches([{...match,id:'new'}, {...match,scoreA:35}]),/different/);
  assert.equal(s.snapshot().matches.length,1);
  const backup=s.backup(),restored=openStore(':memory:');t.after(()=>restored.close());
  restored.importMatches(backup.matches,backup.players);
  assert.deepEqual(restored.snapshot().players.map(p=>[p.name,p.rating,p.rank]),s.snapshot().players.map(p=>[p.name,p.rating,p.rank]));
});
test('historical win/loss-only records do not invent football scores',t=>{
  const s=fixture(t);s.importMatches([{playedAt:match.playedAt,teamA:['Alex'],teamB:['Jordan'],winner:'B'}]);
  assert.equal(s.snapshot().matches[0].scoreA,undefined);assert.equal(s.snapshot().matches[0].multiplier,1);
});
test('SQLite preserves real history across closing and reopening the store',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bfl-persistence-')),file=join(dir,'league.sqlite');
  try {let s=openStore(file);names.forEach(n=>s.addPlayer(n));s.record(match);s.close();
    s=openStore(file);try{assert.equal(s.snapshot().matches.length,1);assert.equal(s.snapshot().players.find(p=>p.name==='Alex').rating,1020);}finally{s.close();}
  } finally {rmSync(dir,{recursive:true});}
});
