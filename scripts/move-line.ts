/**
 * Move a business line (number + routing + texting registration) from the
 * company that holds it to another company — lib/business-line.ts moveLine,
 * the same thing the superadmin "Move number there" button does. DB only;
 * nothing changes at Telnyx. From a laptop, with the two services' variables
 * piped in so nothing secret touches the disk:
 *
 *   { railway variables -e production -s Streamflaire --json; echo "<<<SEP>>>"; railway variables -e production -s Postgres --json; } \
 *     | npx tsx scripts/move-line.ts <lineNumber E.164> <target company slug or id> [--dry-run]
 *
 * --dry-run shows both companies and what would move, and stops.
 */
async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const [appRaw, pgRaw] = raw.split("<<<SEP>>>");
  const app = JSON.parse(appRaw.trim()) as Record<string, string>;
  const pg = JSON.parse(pgRaw.trim()) as Record<string, string>;
  process.env.DATABASE_URL = pg.DATABASE_PUBLIC_URL;
  for (const k of ["TELNYX_API_KEY", "TELNYX_MESSAGING_PROFILE_ID", "TELNYX_PUBLIC_KEY", "NEXTAUTH_URL", "AUTH_SECRET"]) {
    if (app[k]) process.env[k] = app[k];
  }
  const number = process.argv[2];
  const target = process.argv[3];
  const dryRun = process.argv.includes("--dry-run");
  if (!number?.startsWith("+") || !target) throw new Error("Usage: … | npx tsx scripts/move-line.ts +1XXXXXXXXXX <slug or id> [--dry-run]");

  const { prisma } = await import("../lib/db");
  const bl = await import("../lib/business-line");
  const select = {
    id: true,
    name: true,
    slug: true,
    lineNumber: true,
    lineType: true,
    lineForwardTo: true,
    lineVoiceAppAt: true,
    addonActiveAt: true,
    smsAcknowledgedAt: true,
    messagingRegistration: { select: { id: true, kind: true, status: true, verificationStatus: true, legalName: true } },
  } as const;
  const from = await prisma.company.findUnique({ where: { lineNumber: number }, select });
  if (!from) throw new Error(`No company owns ${number}`);
  const to = await prisma.company.findFirst({ where: { OR: [{ id: target }, { slug: target }] }, select });
  if (!to) throw new Error(`No company with the slug or id "${target}"`);
  console.log("from:", JSON.stringify(from));
  console.log("to:  ", JSON.stringify(to));
  const why = bl.lineMoveCheck(from, to);
  if (why) throw new Error(why);
  if (dryRun) {
    console.log("dry run — nothing moved");
    await prisma.$disconnect();
    return;
  }
  const out = await bl.moveLine(from.id, to.id);
  console.log("moved:", JSON.stringify(out));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
