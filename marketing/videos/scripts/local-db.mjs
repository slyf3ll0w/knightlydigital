// Throwaway local Postgres for the app b-roll build (port 54329, data in work/pgdata). Leave running; Ctrl+C stops it.
// node scripts/local-db.mjs
import fs from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';
const pg = new EmbeddedPostgres({databaseDir: './work/pgdata', user: 'wb', password: 'wb', port: 54329, persistent: true});
if (!fs.existsSync('./work/pgdata')) await pg.initialise();
await pg.start();
try { await pg.createDatabase('workbench'); } catch {}
console.log('PG READY  DATABASE_URL=postgresql://wb:wb@localhost:54329/workbench');
const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
