import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, InputError } from './store.mjs';
import { parseCsv } from './ratings.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.BFL_DATA_FILE || join(root, 'data', 'bfl.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const store = openStore(dbPath);
const port = Number(process.env.PORT || 3033);
const host = '127.0.0.1';
const allowedHost = `${host}:${port}`;
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/elo.js':['elo.js','text/javascript'], '/style.css': ['style.css', 'text/css'], '/import-template.csv': ['import-template.csv', 'text/csv'], '/example.csv': ['import-template.csv', 'text/csv'] };
const server = http.createServer(async (req, res) => {
  const send = (code, value, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
    res.end(type === 'application/json' ? JSON.stringify(value) : value);
  };
  try {
    // This app is a private loopback service. Reject cross-origin writes and DNS rebinding.
    if (![allowedHost, `localhost:${port}`].includes(req.headers.host)) return send(403, { error: 'Invalid host' });
    const url = new URL(req.url, `http://${allowedHost}`);
    if (req.method === 'GET' && url.pathname === '/api/state') return send(200, store.snapshot());
    if (req.method === 'GET' && url.pathname === '/api/backup') {
      res.setHeader('Content-Disposition', 'attachment; filename="bfl-backup.json"');
      return send(200, store.backup());
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (origin && ![`http://${allowedHost}`, `http://localhost:${port}`].includes(origin)) return send(403, { error: 'Cross-origin write blocked' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 5_000_000) return send(413, { error: 'Import must be smaller than 5 MB' });
      }
      let input;
      try { input = JSON.parse(body); } catch { throw new InputError('Invalid JSON'); }
      if (!input || typeof input !== 'object') throw new InputError('Object required');
      let result;
      if (url.pathname === '/api/players') result = store.addPlayer(input.name);
      else if (url.pathname === '/api/matches') result = store.record(input);
      else if (url.pathname === '/api/correct') result = store.correct(input);
      else if (url.pathname === '/api/import') {
        let rows, names = [];
        if (typeof input.csv === 'string') {
          try { rows = parseCsv(input.csv); } catch (e) { throw new InputError(e.message); }
        } else {
          const backup = input.backup;
          if (backup?.format !== 'pong-royale-history' || backup.version !== 1) throw new InputError('Choose a BFL JSON backup or a CSV');
          if(backup.pending?.length)throw new InputError('This backup includes unconfirmed games. Resolve those in the original app before importing.');
          rows = backup.matches; names = backup.players;
        }
        result = store.importMatches(rows, names);
      } else return send(404, { error: 'Not found' });
      return send(200, { result, state: store.snapshot() });
    }
    if (req.method === 'GET' && assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      return send(200, readFileSync(join(root, 'public', file)), type);
    }
    send(404, { error: 'Not found' });
  } catch (e) {
    if (!(e instanceof InputError)) console.error(e);
    send(e instanceof InputError ? 400 : 500, { error: e instanceof InputError ? e.message : 'Could not save. Please try again.' });
  }
});
server.listen(port, host, () => console.log(`BFL: http://${allowedHost}\nDatabase: ${dbPath}\nNo sign-in required. Press Ctrl+C to stop.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
