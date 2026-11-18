// Shared by the live preview and the authoritative server-side rating replay.
export const BASE_RATING = 1000;
export const K_FACTOR = 32;

export function expectedScore(ownRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - ownRating) / 400));
}

export function marginMultiplier(match) {
  if (!Number.isInteger(match.scoreA) || !Number.isInteger(match.scoreB)) return 1;
  return 1 + Math.min(Math.abs(match.scoreA - match.scoreB), 28) / 28;
}

export function calculateEloChange(ownRating, opponentRating, actualScore, multiplier = 1) {
  return K_FACTOR * multiplier * (actualScore - expectedScore(ownRating, opponentRating));
}

export function previewElo(teamARating, teamBRating, match = {}) {
  const multiplier = marginMultiplier(match);
  const aWins = calculateEloChange(teamARating, teamBRating, 1, multiplier);
  const aLoses = calculateEloChange(teamARating, teamBRating, 0, multiplier);
  return {
    expectedA: expectedScore(teamARating, teamBRating), multiplier,
    aWins: { a: aWins, b: -aWins },
    bWins: { a: aLoses, b: -aLoses },
    draw: { a: calculateEloChange(teamARating, teamBRating, 0.5), b: -calculateEloChange(teamARating, teamBRating, 0.5) },
  };
}
