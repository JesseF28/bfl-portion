export class InputError extends Error {}
const requireThat=(condition,message)=>{if(!condition)throw new InputError(message);};
const key=name=>name.toLowerCase();
export function cleanName(value) {
  requireThat(typeof value === 'string', 'Player name is required.');
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  requireThat(name.length > 0 && name.length <= 80 && !/[|\u0000-\u001f]/.test(name), 'Use a player name of 1–80 characters without | or control characters.');
  return name;
}
export function validateMatch(input, requireScores = false) {
  requireThat(input && typeof input === 'object', 'Match is required.');
  const date = input.playedAt;
  requireThat(typeof date === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(date) && Number.isFinite(Date.parse(date)), 'Use an ISO date including a timezone.');
  const [year, month, day] = date.slice(0,10).split('-').map(Number);
  const calendar = new Date(0); calendar.setUTCFullYear(year, month - 1, day);
  requireThat(calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && +date.slice(11,13) < 24 && +date.slice(14,16) < 60, 'Match date is not valid.');
  const playedAt = new Date(date).toISOString();
  requireThat(Date.parse(playedAt) <= Date.now() + 300000, 'Match dates cannot be in the future.');
  requireThat(Array.isArray(input.teamA) && Array.isArray(input.teamB), 'Both teams are required.');
  const teamA = input.teamA.map(cleanName), teamB = input.teamB.map(cleanName);
  requireThat(teamA.length >= 1 && teamA.length <= 2 && teamA.length === teamB.length, 'Use equal teams: singles or doubles.');
  const names = [...teamA, ...teamB].map(key);
  requireThat(new Set(names).size === names.length, 'A player can only appear once per game.');
  const hasScore = input.scoreA !== undefined || input.scoreB !== undefined;
  requireThat(!requireScores || hasScore, 'Enter both final point scores.');
  let winner = input.winner;
  if (hasScore) {
    requireThat(Number.isInteger(input.scoreA) && Number.isInteger(input.scoreB) && input.scoreA >= 0 && input.scoreB >= 0 && input.scoreA <= 1000 && input.scoreB <= 1000, 'Scores must be whole numbers between 0 and 1,000. Enter both sides.');
    const derived = input.scoreA > input.scoreB ? 'A' : input.scoreB > input.scoreA ? 'B' : 'DRAW';
    requireThat(!winner || winner === derived, 'The winner does not match the final score.');
    winner = derived;
  }
  requireThat(['A','B','DRAW'].includes(winner), 'Result must be A, B, or DRAW.');
  requireThat(input.event === undefined || typeof input.event === 'string', 'Event must be text.');
  const event = (input.event || '').trim();
  requireThat(event.length <= 120, 'Event names must be 120 characters or fewer.');
  requireThat(input.id === undefined || (typeof input.id === 'string' && /^[\w-]{1,100}$/.test(input.id)), 'Invalid match ID.');
  return { id: input.id, playedAt, teamA, teamB, winner, event, ...(hasScore ? { scoreA: input.scoreA, scoreB: input.scoreB } : {}) };
}
