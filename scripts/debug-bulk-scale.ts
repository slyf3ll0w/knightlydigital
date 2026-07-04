/**
 * One-off: prove bulk staging survives >10 records (the 12-client truncation
 * bug). Seeds N throwaway contacts with dash-format phones on the demo co,
 * replays the reformat prompt (stages only — nothing written), counts the
 * staged updates, then deletes the seeds.
 */
import { prisma } from "../lib/db";
import { runAssistant } from "../lib/assistant";
import type { Actor } from "../lib/permissions";

const N = 14;

(async () => {
  const co = await prisma.company.findFirst({
    where: { slug: "streamflare-demo-co" },
    select: { id: true },
  });
  if (!co) throw new Error("demo co not found");
  const owner = await prisma.user.findFirst({
    where: { companyId: co.id, role: "OWNER" },
    select: { id: true, name: true },
  });

  await prisma.contact.createMany({
    data: Array.from({ length: N }, (_, i) => ({
      companyId: co.id,
      firstName: "Bulkseed",
      lastName: `Test${i + 1}`,
      phone: `214-555-9${String(i + 1).padStart(3, "0")}`,
    })),
  });
  console.log(`seeded ${N} contacts with dash phones`);

  try {
    const actor: Actor = {
      id: owner!.id, name: owner!.name, role: "OWNER", companyId: co.id, salesSeePayments: true,
    };
    const r = await runAssistant(actor, [
      {
        role: "user",
        content:
          "please go through each of my clients and reformat their phone numbers so it's like (XXX) XXX-XXXX",
      },
    ]);
    console.log("\nREPLY:", r?.reply ?? "(null)");
    const staged = (r?.proposals ?? []).flatMap((p) => (p.batch ? p.batch : [p]));
    console.log(`\nSTAGED UPDATES: ${staged.length} across ${r?.proposals.length ?? 0} card(s)`);
    for (const p of r?.proposals ?? []) console.log(`card: ${p.title} (${p.batch?.length ?? 1} items)`);
  } finally {
    const del = await prisma.contact.deleteMany({
      where: { companyId: co.id, firstName: "Bulkseed" },
    });
    console.log(`\ncleaned ${del.count} seeded contacts`);
    await prisma.$disconnect();
  }
})();
