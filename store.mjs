import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { replay, BASE_RATING, K_FACTOR } from './ratings.mjs';
import { InputError, cleanName, validateMatch } from './validation.mjs';
export { InputError } from './validation.mjs';

function check(condition, message) { if (!condition) throw new InputError(message); }
const key = name => name.toLowerCase();

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, played_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, recorded_at TEXT NOT NULL, match_id TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL);`);
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function addPlayer(value) {
    const name = cleanName(value);
    const existing = db.prepare('SELECT id, name FROM players WHERE name_key=?').get(key(name));
    if (existing) return existing;
    const player = { id: randomUUID(), name };
    db.prepare('INSERT INTO players VALUES (?, ?, ?)').run(player.id, name, key(name));
    return player;
  }
  const byId = id => {
    const row = db.prepare('SELECT payload FROM matches WHERE id=?').get(id);
    return row ? JSON.parse(row.payload) : null;
  };
  function saveMatch(input, { imported = false, replacing = false } = {}) {
    check(!input.game || input.game==='bfl','This app accepts BFL results only.');
    const m = validateMatch(input, !imported && !replacing);
    if(!imported && !replacing)check(m.teamA.length===2 && m.teamB.length===2,'New games require four different friends for 2v2.');
    if(!imported)for(const name of [...m.teamA,...m.teamB])check(db.prepare('SELECT id FROM players WHERE name_key=?').get(key(name)),`Add ${name} to Friends before recording a game.`);
    // Stable import IDs make re-import safe. Explicit IDs support repeated games at the same time.
    m.id ||= imported ? 'csv_' + createHash('sha256').update(JSON.stringify({
      date: m.playedAt, a: m.teamA.map(key).sort(), b: m.teamB.map(key).sort(), event: m.event,
    })).digest('hex').slice(0, 32) : randomUUID();
    const before = byId(m.id);
    if (before && !replacing) {
      const named = namedMatch(before);
      const equivalent = named.playedAt === m.playedAt && named.winner === m.winner && named.event === m.event && named.scoreA===m.scoreA && named.scoreB===m.scoreB &&
        JSON.stringify(named.teamA.map(key).sort()) === JSON.stringify(m.teamA.map(key).sort()) &&
        JSON.stringify(named.teamB.map(key).sort()) === JSON.stringify(m.teamB.map(key).sort());
      check(imported && equivalent, `Match ${m.id} already exists with different data. Edit it in History to correct it.`);
      return false;
    }
    if (replacing) {
      check(before, 'Match not found');
      check(input.revision===(before.revision||1),'This score changed. Refresh before correcting it.');
      check(typeof input.reason==='string' && input.reason.trim().length>=3 && input.reason.length<=500,'Add a short reason for the correction.');
      check(m.teamA.length===before.teamA.length && m.teamB.length===before.teamB.length,'Keep the existing game format.');
    }
    const stored = { ...m, revision:before?(before.revision||1)+1:1, ...(replacing?{reason:input.reason.trim()}:{}), teamA: m.teamA.map(n => addPlayer(n).id), teamB: m.teamB.map(n => addPlayer(n).id) };
    db.prepare('INSERT INTO matches VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET played_at=excluded.played_at, payload=excluded.payload').run(m.id, m.playedAt, JSON.stringify(stored));
    db.prepare('INSERT INTO revisions (recorded_at, match_id, before_json, after_json) VALUES (?, ?, ?, ?)').run(new Date().toISOString(), m.id, before ? JSON.stringify(before) : null, JSON.stringify(stored));
    return true;
  }
  function namedMatch(m) {
    const name = id => db.prepare('SELECT name FROM players WHERE id=?').get(id)?.name;
    return { ...m, teamA: m.teamA.map(name), teamB: m.teamB.map(name) };
  }
  function snapshot() {
    const players = db.prepare('SELECT id, name FROM players').all();
    const matches = db.prepare('SELECT payload FROM matches ORDER BY played_at, id').all().map(r => JSON.parse(r.payload));
    const calculated = replay(players, matches);
    return { ...calculated, settings: { baseRating: BASE_RATING, kFactor: K_FACTOR, marginCap:28 },
      revisionCount: db.prepare('SELECT count(*) n FROM revisions').get().n };
  }
  function importMatches(rows, playerNames = []) {
    check(Array.isArray(rows) && rows.length <= 10000, 'Import up to 10,000 matches at once');
    check(Array.isArray(playerNames) && playerNames.length <= 10000, 'Invalid player list');
    return transaction(() => {
      playerNames.forEach(addPlayer);
      let added = 0;
      rows.forEach((row, i) => {
        try { if (saveMatch(row, { imported: true })) added++; }
        catch (e) { throw new InputError(`Match ${i + 1}: ${e.message}`); }
      });
      return { added, skipped: rows.length - added };
    });
  }
  return {
    close: () => db.close(), snapshot,
    addPlayer: name => transaction(() => addPlayer(name)),
    record: input => transaction(() => saveMatch(input)),
    correct: input => transaction(() => saveMatch(input, { replacing: true })),
    importMatches,
    backup: () => ({ format: 'pong-royale-history', version: 1, exportedAt: new Date().toISOString(),
      settings: { baseRating: BASE_RATING, kFactor: K_FACTOR },
      players: db.prepare('SELECT name FROM players').all().map(p => p.name),
      matches: snapshot().matches.reverse().map(({ changes, expectedA, ...m }) => namedMatch(m)),
      // Revisions contain original player IDs; include their mapping for a complete audit trail.
      playerRecords: db.prepare('SELECT id, name FROM players').all(),
      revisions: db.prepare('SELECT * FROM revisions ORDER BY sequence').all() }),
  };
}
