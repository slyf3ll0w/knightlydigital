// Softphone diagnosis against a live environment (no secrets printed):
//   railway run node scripts/diag-softphone.mjs [hoursBack=6]
// Prints the company's line + voice routing, every user's softphone presence,
// today's Call rows with their browser legs, and Telnyx's own view of the
// credential connection + credentials. Read-only.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const hours = Number(process.argv[2] ?? 6);
const since = new Date(Date.now() - hours * 3600_000);
const ago = (d) => (d ? `${Math.round((Date.now() - d.getTime()) / 1000)}s ago` : "never");

const companies = await prisma.company.findMany({
  where: { lineNumber: { not: null } },
  select: { id: true, name: true, lineNumber: true, lineForwardTo: true, lineVoiceAppAt: true, lineSipConnectionId: true, addonActiveAt: true },
});
for (const c of companies) {
  console.log(`\n== ${c.name} (${c.id})`);
  console.log(`   line=${c.lineNumber} forwardTo=${c.lineForwardTo} voiceApp=${c.lineVoiceAppAt ? "yes" : "NO"} sipConn=${c.lineSipConnectionId ?? "none"} addon=${c.addonActiveAt ? "yes" : "NO"}`);
  const users = await prisma.user.findMany({
    where: { companyId: c.id, isActive: true },
    select: { id: true, name: true, role: true, phone: true, softphoneEnabled: true, softphoneSeenAt: true, sipUsername: true, sipCredentialId: true },
  });
  for (const u of users) {
    console.log(`   user ${u.name} [${u.role}] phone=${u.phone ?? "-"} softphone=${u.softphoneEnabled ? "on" : "off"} seen=${ago(u.softphoneSeenAt)} sipUser=${u.sipUsername ? u.sipUsername.slice(0, 12) + "…" : "none"} cred=${u.sipCredentialId ? "yes" : "no"}`);
  }
  const calls = await prisma.call.findMany({
    where: { companyId: c.id, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    include: { legs: true, answeredBy: { select: { name: true } }, user: { select: { name: true } } },
  });
  console.log(`   calls in last ${hours}h: ${calls.length}`);
  for (const k of calls) {
    console.log(
      `   - ${k.createdAt.toISOString().slice(11, 19)} ${k.direction} ${k.status} via=${k.via ?? "-"} cause=${k.hangupCause ?? "-"} appRingAt=${k.appRingAt ? "set" : "-"} agent=${k.agentCallId ? (k.agentCallId.startsWith("pending") ? "pending" : "leg") : "-"} customer=${k.telnyxCallId ? (k.telnyxCallId.startsWith("pending") ? "pending" : "leg") : "-"} answeredAt=${k.answeredAt ? "yes" : "-"} dur=${k.durationSec ?? "-"} vm=${k.voicemailRecordingId ? "rec" : k.voicemailSec ?? "-"} by=${k.user?.name ?? "-"} answeredBy=${k.answeredBy?.name ?? "-"}`
    );
    for (const l of k.legs) {
      console.log(`       browser leg user=${l.userId?.slice(0, 8)} ended=${l.endedAt ? "yes" : "OPEN"} cause=${l.hangupCause ?? "-"} created+${Math.round((l.createdAt.getTime() - k.createdAt.getTime()) / 1000)}s`);
    }
  }
}

const key = process.env.TELNYX_API_KEY;
if (key) {
  const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const get = async (p) => {
    const r = await fetch(`https://api.telnyx.com/v2${p}`, { headers: h });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const cc = await get("/credential_connections?page[size]=20");
  console.log(`\n== Telnyx credential connections (${cc.status})`);
  for (const c of cc.json.data ?? []) {
    console.log(`   ${c.id} "${c.connection_name}" active=${c.active} webrtc? inbound.codecs=${JSON.stringify(c.inbound?.codecs ?? null)} sip_uri_calling=${c.sip_uri_calling_preference ?? "-"} outbound_profile=${c.outbound?.outbound_voice_profile_id ?? "none"}`);
  }
  const tc = await get("/telephony_credentials?page[size]=20");
  console.log(`== Telnyx telephony credentials (${tc.status})`);
  for (const c of tc.json.data ?? []) {
    console.log(`   ${c.id} name=${c.name} user=${(c.sip_username ?? "").slice(0, 12)}… expired=${c.expired} conn=${c.resource_id ?? c.connection_id ?? "-"}`);
  }
  // Registration status: is any device currently registered on that credential?
  for (const c of tc.json.data ?? []) {
    const reg = await get(`/telephony_credentials/${c.id}`);
    const d = reg.json.data ?? {};
    const extra = Object.fromEntries(Object.entries(d).filter(([k]) => !["sip_password", "sip_username"].includes(k)));
    console.log(`   detail ${c.id}: ${JSON.stringify(extra).slice(0, 400)}`);
  }
  const ev = await get(`/call_events?filter[occurred_at][gte]=${encodeURIComponent(since.toISOString())}&page[size]=50`);
  console.log(`== Telnyx call events since ${since.toISOString()} (${ev.status})`);
  for (const e of ev.json.data ?? []) {
    const p = e.metadata ?? e.payload ?? {};
    console.log(`   ${e.occurred_at ?? e.event_timestamp ?? ""} ${e.name ?? e.event_type} to=${p.to ?? ""} from=${p.from ?? ""} cause=${p.hangup_cause ?? ""} sip=${p.sip_hangup_cause ?? ""} ${e.type ?? ""}`);
  }
  if (ev.status !== 200) console.log("   ", JSON.stringify(ev.json).slice(0, 300));
}
await prisma.$disconnect();
