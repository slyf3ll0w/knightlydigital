/**
 * Re-file a company's toll-free verification with the current wording, in
 * place (lib/business-line.ts refileTollFree). From a laptop, with the two
 * services' variables piped in so nothing secret touches the disk:
 *
 *   { railway variables -s Streamflaire --json; echo "<<<SEP>>>"; railway variables -s Postgres --json; } \
 *     | npx tsx scripts/refile-tollfree.ts <lineNumber E.164> [--dry-run]
 *
 * --dry-run prints the payload that would be sent and stops.
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
  const dryRun = process.argv.includes("--dry-run");
  if (!number?.startsWith("+")) throw new Error("Usage: … | npx tsx scripts/refile-tollfree.ts +1XXXXXXXXXX [--dry-run]");

  const { prisma } = await import("../lib/db");
  const bl = await import("../lib/business-line");
  const company = await prisma.company.findUnique({ where: { lineNumber: number }, select: { id: true, name: true } });
  if (!company) throw new Error(`No company owns ${number}`);
  const reg = await prisma.messagingRegistration.findUnique({ where: { companyId: company.id } });
  if (!reg) throw new Error("No registration row");
  const form = bl.registrationFormOf(reg);
  console.log(`company: ${company.name} · platform line: ${bl.isPlatformOwnLine(form)} · current status: ${reg.verificationStatus}`);
  if (dryRun) {
    const input = bl.isPlatformOwnLine(form) ? bl.platformTollFreeInput(number, form) : null;
    console.log(JSON.stringify(input, null, 2));
    await prisma.$disconnect();
    return;
  }
  const out = await bl.refileTollFree(company.id);
  console.log("re-filed:", out);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
