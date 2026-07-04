/** One-off: replay David's bulk phone-reformat ask through runAssistant (stages only, no writes). */
import { prisma } from "../lib/db";
import { runAssistant } from "../lib/assistant";
import type { Actor } from "../lib/permissions";

(async () => {
  const co = await prisma.company.findFirst({
    where: { slug: "streamflare-demo-co" },
    select: { id: true, contacts: { select: { firstName: true, lastName: true, phone: true } } },
  });
  if (!co) throw new Error("demo co not found");
  console.log("current phones:", JSON.stringify(co.contacts));
  const owner = await prisma.user.findFirst({
    where: { companyId: co.id, role: "OWNER" },
    select: { id: true, name: true },
  });
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
  console.log(
    "\nPROPOSALS:",
    (r?.proposals ?? []).map((p) => `${p.title}: ${JSON.stringify(p.payload)}`).join("\n")
  );
  await prisma.$disconnect();
})();
