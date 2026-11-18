// Formula reference: https://github.com/HankSheehan/EloPy/blob/master/elopy.py
// Independent implementation: fixed K=32; team-average extension for doubles.
import { BASE_RATING, expectedScore, marginMultiplier, calculateEloChange } from './public/elo.js';
export { BASE_RATING, K_FACTOR, marginMultiplier } from './public/elo.js';

export function replay(players, matches) {
  const ratings = new Map(players.map(p => [p.id, { ...p, rating: BASE_RATING,
    wins: 0, losses: 0, draws: 0, played: 0, lastChange: 0, history: [] }]));
  const history = [...matches].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id)).map(match => {
    const a = match.teamA.map(id => ratings.get(id));
    const b = match.teamB.map(id => ratings.get(id));
    if (a.some(p => !p) || b.some(p => !p)) throw new Error('Match references an unknown player');
    const average = team => team.reduce((sum, p) => sum + p.rating, 0) / team.length;
    const aRating = average(a), bRating = average(b);
    const expectedA = expectedScore(aRating, bRating);
    const scoreA = match.winner === 'A' ? 1 : match.winner === 'B' ? 0 : 0.5;
    const multiplier = marginMultiplier(match);
    const delta = calculateEloChange(aRating, bRating, scoreA, multiplier);
    const changes = {};
    for (const [team, change, score] of [[a, delta, scoreA], [b, -delta, 1 - scoreA]]) {
      for (const p of team) {
        const before = p.rating;
        p.rating += change;
        p.lastChange = change;
        p.played++;
        p.wins += score === 1 ? 1 : 0;
        p.losses += score === 0 ? 1 : 0;
        p.draws += score === 0.5 ? 1 : 0;
        changes[p.id] = { before, after: p.rating, delta: change };
        p.history.push({ matchId: match.id, playedAt: match.playedAt, rating: p.rating, delta: change });
      }
    }
    return { ...match, expectedA, multiplier, changes };
  });
  const ordered=[...ratings.values()].sort((a,b)=>Number(b.played>0)-Number(a.played>0) || b.rating-a.rating || a.name.localeCompare(b.name));
  const ranked=ordered.map((player,index)=>({...player,rank:player.played ? index+1 : null}));
  for(let i=1;i<ranked.length;i++)if(ranked[i].played && ranked[i].rating===ranked[i-1].rating)ranked[i].rank=ranked[i-1].rank;
  return { players:ranked, matches:history.reverse() };
}

export function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"') {
      if (value || closed) throw new Error('Unexpected quote in CSV');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(value); value = ''; closed = false;
      if (c !== ',') {
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw new Error('Unexpected text after CSV quote');
      value += c;
    }
  }
  if (quoted) throw new Error('Unclosed quote in CSV');
  row.push(value);
  if (row.some(v => v.trim())) rows.push(row);
  if (!rows.length) throw new Error('CSV is empty');
  const headers = rows.shift().map(v => v.trim().toLowerCase());
  const required = ['played_at', 'team_a', 'team_b', 'winner'];
  if (new Set(headers).size !== headers.length || required.some(h => !headers.includes(h))) {
    throw new Error('CSV needs played_at, team_a, team_b, winner headers (optional: id, event)');
  }
  if (!rows.length) throw new Error('CSV has no matches');
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${i + 2} has the wrong number of columns`);
    const r = Object.fromEntries(headers.map((h, j) => [h, values[j].trim()]));
    const score = value => value === undefined || value === '' ? undefined : /^\d+$/.test(value) ? Number(value) : NaN;
    return { id: r.id || undefined, playedAt: r.played_at, teamA: r.team_a.split('|'),
      teamB: r.team_b.split('|'), winner: r.winner.toUpperCase(), event: r.event || '', scoreA: score(r.score_a), scoreB: score(r.score_b) };
  });
}
