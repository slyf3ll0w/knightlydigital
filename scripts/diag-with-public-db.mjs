// Wrapper for scripts/diag-softphone.mjs from a laptop. The Railway CLI won't
// run as a child of node here, so pipe both services' variables in:
//
//   { railway variables -s Streamflaire --json; echo "<<<SEP>>>"; railway variables -s Postgres --json; } \
//     | node scripts/diag-with-public-db.mjs [hoursBack]
//
// The values stay inside this process (env for the diagnosis), nothing is
// written to disk or printed.
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const [appRaw, pgRaw] = raw.split("<<<SEP>>>");
const app = JSON.parse(appRaw.trim());
const pg = JSON.parse(pgRaw.trim());
if (!pg.DATABASE_PUBLIC_URL) throw new Error("Postgres service has no DATABASE_PUBLIC_URL");
process.env.DATABASE_URL = pg.DATABASE_PUBLIC_URL;
process.env.TELNYX_API_KEY = app.TELNYX_API_KEY ?? "";
process.env.TELNYX_VOICE_APP_ID = app.TELNYX_VOICE_APP_ID ?? "";
console.log(`db: public url ok · telnyx key: ${process.env.TELNYX_API_KEY ? "yes" : "NO"} · voice app: ${process.env.TELNYX_VOICE_APP_ID ? "set" : "unset"}`);
await import("./diag-softphone.mjs");
