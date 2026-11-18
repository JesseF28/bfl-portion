# BFL Portion

Complete, standalone BFL app for a friend group. There is no Google or ChatGPT login, no account setup, and no external service dependency. Players are names in your roster. New games are rotating-partner 2v2, and everyone has an individual Elo.

This repository contains the BFL source to share with the D-Pong developer. It includes the complete interface, Elo formulas, SQLite backend, imports, backups, and tests. See [D-Pong integration notes](docs/DPONG_INTEGRATION.md) for adding BFL to an existing app, and [API reference](docs/API.md) for the backend contract.

## Start

Install Node.js 24 or later, extract the ZIP, and open a terminal inside this folder:

```sh
node server.mjs
```

Or clone the repository:

```sh
git clone https://github.com/JesseF28/bfl-portion.git
cd bfl-portion
node server.mjs
```

Open **http://127.0.0.1:3033**. On Windows, you can also double-click `start-bfl.cmd`. There is no `npm install` step. If npm is available, `npm start` runs the same server. Stop with Ctrl+C and start again with the same command.

1. Click **Add friend** to add the real people who play.
2. Click **Record a 2v2 game**, select four friends, and enter the final football score.
3. Ratings update immediately when the game is saved. With no accounts, this edition has no opponent-confirmation or admin roles.
4. **Match history → Correct result** preserves the old score and correction reason, then recalculates subsequent ratings.

The app starts empty. No sample players, games, rankings, account identifiers, credentials, or live database records are included.

## Saved history

The server creates `data/bfl.sqlite` automatically. This database survives restarts. Keep the `data` folder to keep your results. **Back up data** exports a portable JSON backup containing roster names, saved games, rating settings, and the revision log. CSV and JSON imports restore historical results and recalculate ratings. Original revision logs remain in a backup for reference; restored games start a new local revision trail.

This package runs on this computer at a loopback address. It does not connect to, modify, or synchronize with the existing hosted app. Copying the source to another computer starts an independent league unless you import a backup. To copy the database file itself, stop the server first.

## Elo

Each player starts the calculation at 1,000 and remains **Unranked** until they have a saved game. The expected result uses each side's average individual Elo:

```text
expectedA = 1 / (1 + 10 ** ((averageB - averageA) / 400))
marginWeight = 1 + min(abs(scoreA - scoreB), 28) / 28
changeA = 32 * marginWeight * (actualA - expectedA)
```

Wins use `actualA = 1`, losses use 0, and draws use 0.5. Draws and historical results without final scores use weight 1. Both teammates receive the same signed change; the opposing side receives its negative. Beating stronger opponents earns more, and losing to weaker opponents costs more. A seven-point margin uses 1.25× normal Elo, fourteen points uses 1.5×, and twenty-eight or more is capped at 2×.

The frontend preview and backend replay use the same `public/elo.js` calculations. Ratings retain full precision; displayed values are rounded. History is replayed in UTC date order, then match ID for ties. Backdated games and corrections rebuild all later ratings.

## Imports

Download the blank CSV template in the app. Columns are:

```csv
id,played_at,team_a,team_b,winner,score_a,score_b,event
```

Use `|` between teammates, A/B/DRAW for the winner, and a timestamp with a timezone. Final point scores are optional only for legacy imported results; new games require both scores. Old 1v1 history can be imported, while new entries require 2v2. Imports can create historical roster names. Repeated identical IDs are skipped; conflicts reject the batch. If IDs are absent, date, teams, and event form a stable ID. Use distinct IDs for separate games with the same timestamp and teams.

Imports are atomic and accept up to 10,000 games. The UI file limit is 3.9 MB. Backups with pending/unconfirmed games must be resolved in the original app before importing. Only BFL game records are accepted.

## Source files

- `server.mjs`: HTTP server, static files, and API routes.
- `store.mjs`: SQLite schema, persistent matches, transactional imports, corrections, and backups.
- `validation.mjs`: names, dates, rosters, and final-score validation.
- `ratings.mjs`: chronological Elo replay, rankings, and CSV parsing.
- `public/index.html`, `public/app.js`, `public/style.css`: complete BFL interface.
- `public/elo.js`: shared Elo formulas and preview calculations.
- `test/bfl.test.mjs`: persistence, rating, correction, import, and validation checks.

Optional environment variables: `PORT` (default 3033) and `BFL_DATA_FILE` (database path).

```sh
node --test test/*.test.mjs
```

Based on the BFL friend-group edition derived from [Pong Royale](https://github.com/thomaskiefer/pong-royale). The standard Elo formula was independently implemented with [EloPy](https://github.com/HankSheehan/EloPy) as a reference. Football margin weighting, rotating doubles, persistence, and the no-sign-in server are app-specific additions.
