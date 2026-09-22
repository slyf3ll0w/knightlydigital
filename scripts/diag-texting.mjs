// Texting registration status for every company with a line, from our rows AND
// Telnyx (toll-free verification / 10DLC brand + campaign). Read-only.
//   { railway variables -s Streamflaire --json; echo "<<<SEP>>>"; railway variables -s Postgres --json; } | node scripts/diag-texting.mjs
import { PrismaClient } from "@prisma/client";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const [appRaw, pgRaw] = raw.split("<<<SEP>>>");
const app = JSON.parse(appRaw.trim());
const pg = JSON.parse(pgRaw.trim());
process.env.DATABASE_URL = pg.DATABASE_PUBLIC_URL;
const key = app.TELNYX_API_KEY;
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };
const get = async (p) => {
  const r = await fetch(`https://api.telnyx.com/v2${p}`, { headers: h });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const prisma = new PrismaClient();
const regs = await prisma.messagingRegistration.findMany({
  include: { company: { select: { name: true, lineNumber: true, lineType: true, smsAcknowledgedAt: true } } },
});
for (const r of regs) {
  console.log(`\n== ${r.company.name} · ${r.company.lineNumber} (${r.company.lineType ?? "?"}) · smsAcknowledged=${r.company.smsAcknowledgedAt ? "yes" : "no"}`);
  console.log(`   kind=${r.kind} status=${r.status} brand=${r.brandStatus ?? "-"} campaign=${r.campaignStatus ?? "-"} assignment=${r.assignmentStatus ?? "-"} verification=${r.verificationStatus ?? "-"}`);
  console.log(`   submitted=${r.submittedAt?.toISOString() ?? "-"} approved=${r.approvedAt?.toISOString() ?? "-"} lastChecked=${r.lastCheckedAt?.toISOString() ?? "-"} rejection=${r.rejectionReason ?? "-"}`);
  if (r.verificationId) {
    const v = await get(`/messaging_tollfree/verification/requests/${r.verificationId}`);
    const d = v.json ?? {};
    console.log(`   Telnyx toll-free verification (${v.status}): status=${d.verificationStatus} created=${d.createdAt} updated=${d.updatedAt} reason=${d.reason ?? "-"}`);
    if (Array.isArray(d.status_history)) for (const s of d.status_history) console.log(`     history ${s.status_updated_at ?? s.updated_at ?? ""} ${s.status ?? s.verificationStatus ?? ""} ${s.reason ?? ""}`);
  }
  if (r.brandId) {
    const b = await get(`/10dlc/brand/${r.brandId}`);
    console.log(`   Telnyx brand (${b.status}): identityStatus=${b.json.identityStatus} status=${b.json.status} created=${b.json.createDate}`);
  }
  if (r.campaignId) {
    const c = await get(`/10dlc/campaign/${r.campaignId}`);
    console.log(`   Telnyx campaign (${c.status}): status=${c.json.campaignStatus ?? c.json.status} tcrStatus=${c.json.tcrCampaignStatus ?? "-"} created=${c.json.createDate} failureReasons=${JSON.stringify(c.json.failureReasons ?? null)}`);
  }
}
if (regs.length === 0) console.log("no MessagingRegistration rows");
await prisma.$disconnect();
