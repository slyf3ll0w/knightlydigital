// Dump the full Telnyx call events for legs dialed at SIP URIs (softphone legs)
// since N hours ago. Pipe the app service's variables in, same as
// diag-with-public-db.mjs:  railway variables -s Streamflaire --json | node scripts/diag-telnyx-events.mjs 8
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const vars = JSON.parse(raw.trim());
const key = vars.TELNYX_API_KEY;
const hours = Number(process.argv[2] ?? 8);
const since = new Date(Date.now() - hours * 3600_000).toISOString();
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };
const r = await fetch(`https://api.telnyx.com/v2/call_events?filter[occurred_at][gte]=${encodeURIComponent(since)}&page[size]=100`, { headers: h });
const j = await r.json();
console.log("status", r.status, "events", (j.data ?? []).length);
const scrub = (s) => JSON.stringify(s).replace(/gencred[A-Za-z0-9]+/g, "gencred…").replace(/\+1469833\d{4}/g, "+1469833xxxx");
// Group by call_session_id so the SIP legs' hangup payloads sit with their dial.
const bySession = new Map();
for (const e of j.data ?? []) {
  const sid = e.call_session_id ?? e.metadata?.call_session_id ?? "?";
  if (!bySession.has(sid)) bySession.set(sid, []);
  bySession.get(sid).push(e);
}
for (const [sid, evs] of bySession) {
  const text = scrub(evs);
  
  console.log(`\n--- session ${sid} (${evs.length} events)`);
  for (const e of evs) {
    const m = e.payload ?? e.metadata ?? {};
    const keep = Object.fromEntries(Object.entries(m).filter(([k]) => !/^(call_control_id|call_leg_id|call_session_id|connection_id|client_state)$/.test(k)));
    console.log(`  ${e.occurred_at} ${e.type}:${e.name}`, scrub(keep).slice(0, 500));
  }
}
