# Adding BFL to D-Pong

This is the BFL portion only. The original D-Pong application is not included, and this repository does not modify its Firebase project. It runs independently so the developer can inspect the behavior before merging the relevant code into D-Pong.

## Intended combined app

- Two game tabs: **D-Pong** and **BFL**.
- One shared player identity and username, supplied by the host app.
- Two independent ratings per person: their existing D-Pong Elo and their BFL Elo.
- D-Pong keeps its existing cup graphic, cup rules, and game history.
- BFL uses rotating 2v2 partners, final football scores, and its own permanent history.

This BFL source has no sign-in implementation. If the combined app has sign-in, reuse the host app's account rather than creating a second BFL login. The standalone version saves scores immediately and has no account-based opponent confirmation.

## Source to reuse

| File | Purpose |
| --- | --- |
| `public/index.html` | BFL leaderboard, roster, game form, history, imports, and profile dialogs |
| `public/app.js` | BFL rendering, API calls, score entry, Elo preview, history charts |
| `public/style.css` | BFL presentation |
| `public/elo.js` | Pure Elo functions shared by browser and server |
| `ratings.mjs` | Replays BFL history into individual ratings and rankings |
| `validation.mjs` | Validates names, dates, teams, and football scores |
| `store.mjs` | SQLite schema, persistent results, revisions, and imports |
| `server.mjs` | Working local API and static-file server |

The frontend currently owns a full page and uses document-wide selectors. When mounting it beside D-Pong, move its markup into a BFL panel/component, scope its selectors to that panel, and scope its CSS or use a shadow root. The files cannot be pasted into a second panel unchanged without doing that work. Keep the D-Pong panel mounted when switching tabs to preserve its current screen and form state.

## Keep game data separate

Use the same stable player ID for a person in both games. The standalone SQLite store generates IDs; map these to the host app's existing player IDs when porting storage. Its name-based imports are a convenience for old records, not proof that two accounts belong to the same person.

Store BFL matches separately from D-Pong matches, or tag every match with a game identifier and filter before replay. Run `replay(players, bflMatches)` only on BFL results. Never write BFL ratings into D-Pong's existing `rating`, wins, losses, or games-played fields. In the combined player record, use distinct fields such as `bflRating` and `dpongRating`, or derive each game's ratings from its own history.

BFL starts its calculation at **1,000**. A player with no saved BFL games is **Unranked**, regardless of their D-Pong record. The roster and leaderboard start empty; no demonstration players or fabricated games are seeded.

## Backend choices

The supplied Node server and SQLite store are a complete local implementation. If the combined app retains this backend, route its BFL requests to a dedicated prefix such as `/api/bfl` and translate the existing `/api` routes accordingly. The frontend's `api()` helper in `public/app.js` is the place to change the request destination.

If the host app stays entirely on Firebase, port `store.mjs` persistence to its existing trusted backend and retain the response shapes in [API.md](API.md). `public/elo.js`, `ratings.mjs`, and `validation.mjs` are the reusable calculation and validation code. No Firebase configuration, credentials, rules changes, or deployment scripts for another person's project are included.

The supplied server binds to `127.0.0.1` for local development. Publishing the combined app requires an appropriate shared backend and persistent storage. A static hosting upload alone does not run the SQLite server.

## Result behavior to preserve

1. New BFL games contain four different existing players, split into two temporary pairs.
2. Both final football scores are required; the server derives the winner.
3. Team-average pre-game ratings determine the expected result. Upsets earn more and favorites winning earn less.
4. Point margins multiply the usual Elo change, capped at a 28-point difference.
5. Both partners get the same BFL change; the other pair gets its negative.
6. Backdated games and corrections replay all later BFL ratings in date order.
7. Corrections require a reason, retain the prior record, and reject stale revisions.
8. D-Pong results never change BFL ratings, and BFL results never change D-Pong ratings.

Run the included tests after adapting the backend, and add a host-app check that switching tabs and saving a BFL game leaves D-Pong's rating and history unchanged.
