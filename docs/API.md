# BFL API

The standalone server uses JSON on `/api/*`. There are no authentication endpoints or login requirements. POST requests require `Content-Type: application/json`. Successful writes return `{ "result": ..., "state": ... }`; errors return `{ "error": "message" }` with a non-2xx status.

## Read league state

`GET /api/state`

Returns `players`, `matches`, `settings`, and `revisionCount`. Player records include their stable local `id`, `name`, full-precision `rating`, `rank`, `played`, wins/losses/draws, `lastChange`, and rating `history`. `rank` is null until a player has a saved game.

Matches are newest first. Their `teamA` and `teamB` fields contain player IDs, with football scores where known, a derived winner, a revision number, and calculated `changes` by player ID. The stored history is authoritative; ratings are recalculated rather than accepted from the client.

## Add a roster player

`POST /api/players`

```json
{ "name": "Player name" }
```

Adds a real player explicitly. Names are normalized; an existing matching name returns the existing player. Adding a name does not fabricate games or award a rank.

## Record a BFL game

`POST /api/matches`

```json
{
  "playedAt": "2026-01-01T20:00:00Z",
  "teamA": ["First player's roster name", "Partner's roster name"],
  "teamB": ["Opponent's roster name", "Other opponent's roster name"],
  "scoreA": 28,
  "scoreB": 21,
  "event": "Friday BFL"
}
```

This illustrates the payload shape; it is not seeded data. Write payloads use **roster names**, while state responses use **player IDs**. All four friends must exist first. Final scores are whole numbers from 0 to 1,000. The server derives A/B/DRAW. `event` and an explicit `id` are optional. If a game tag is provided, it must be `bfl`.

## Correct a saved game

`POST /api/correct`

Send the complete corrected game payload plus its existing `id`, current `revision`, and a `reason` of 3–500 characters. The current game format is preserved. An out-of-date revision rejects the edit. Previous data and the correction reason are retained, and all subsequent ratings are recalculated.

## Import history

`POST /api/import`

Send either `{ "csv": "CSV text" }` or `{ "backup": <backup object> }`. CSV columns:

```csv
id,played_at,team_a,team_b,winner,score_a,score_b,event
```

Use `|` between teammates and A/B/DRAW for results. Dates include timezones. Legacy imports may omit both scores; no scores are inferred. Imported history can include old 1v1 games. Imports create historical roster names and are atomic. Identical existing IDs are skipped; conflicting IDs reject the batch. See the README for limits and backup compatibility.

## Back up history

`GET /api/backup`

Downloads a `pong-royale-history` version-1 JSON backup. It contains roster names, all saved matches, settings, player-ID mappings, and revision records. This format name is kept for compatibility with the earlier BFL export. No live database or personal account data is committed to this repository.
