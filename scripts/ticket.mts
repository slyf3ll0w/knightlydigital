/**
 * Pull a feedback ticket — a "Suggest a change" request, an Atlas report or
 * a plain bug/suggestion — with its picture and capture, so Claude can act
 * on it without anyone describing anything.
 *
 *   npx tsx scripts/ticket.mts <id | id-suffix | latest | open>
 *
 * Needs DATABASE_URL (or DATABASE_PUBLIC_URL) and, for the picture, the
 * R2_* variables. From a laptop against production the Railway CLI won't
 * run as a child of node here, so pipe both services' variables in — the
 * values stay inside this process, nothing is printed:
 *
 *   { railway variables -s Streamflaire -e production --json; echo "<<<SEP>>>"; railway variables -s Postgres -e production --json; } \
 *     | npx tsx scripts/ticket.mts --stdin <id>
 *
 * Output: the ticket text on stdout, and in .tickets/ (gitignored) the text
 * as <short>.md, the raw capture as <short>.json and the picture as
 * <short>.png|jpg — Read the picture to see the screen.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const useStdin = args.includes("--stdin");
const what = args.find((a) => !a.startsWith("--")) ?? "open";

if (useStdin) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const [appRaw, pgRaw] = raw.split("<<<SEP>>>");
  const app = JSON.parse(appRaw.trim()) as Record<string, string>;
  const pg = JSON.parse(pgRaw.trim()) as Record<string, string>;
  if (!pg.DATABASE_PUBLIC_URL) throw new Error("Postgres service has no DATABASE_PUBLIC_URL");
  process.env.DATABASE_URL = pg.DATABASE_PUBLIC_URL;
  for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"]) {
    if (app[k]) process.env[k] = app[k];
  }
} else {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
}
if (!process.env.DATABASE_URL) {
  console.error("No DATABASE_URL. Set it, or pipe the Railway variables in with --stdin (see the header).");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const { isBlobStorageConfigured, signedGetUrl } = await import("../lib/blob-storage");
const { shortTicketId } = await import("../lib/change-request");
const prisma = new PrismaClient();

const OUT = ".tickets";
const select = {
  id: true,
  type: true,
  status: true,
  title: true,
  details: true,
  pageUrl: true,
  response: true,
  screenshotKey: true,
  capture: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
  company: { select: { name: true, isTest: true } },
} as const;

function line(t: { id: string; type: string; status: string; title: string; createdAt: Date; company: { name: string } }): string {
  return `#${shortTicketId(t.id)}  ${t.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${t.type.padEnd(10)} ${t.status.padEnd(8)} ${t.company.name} — ${t.title}`;
}

try {
  if (what === "open") {
    const rows = await prisma.feedbackTicket.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 50, select });
    console.log(rows.length ? rows.map(line).join("\n") : "No open tickets.");
  } else {
    let ticket =
      what === "latest"
        ? await prisma.feedbackTicket.findFirst({ orderBy: { createdAt: "desc" }, select })
        : await prisma.feedbackTicket.findUnique({ where: { id: what }, select });
    if (!ticket && what !== "latest") {
      const matches = await prisma.feedbackTicket.findMany({ where: { id: { endsWith: what } }, orderBy: { createdAt: "desc" }, take: 10, select });
      if (matches.length > 1) {
        console.log(`${matches.length} tickets end in "${what}" — give more of the id:\n${matches.map(line).join("\n")}`);
        process.exit(2);
      }
      ticket = matches[0] ?? null;
    }
    if (!ticket) {
      console.error(`No ticket matches "${what}".`);
      process.exit(1);
    }

    const short = shortTicketId(ticket.id);
    mkdirSync(OUT, { recursive: true });
    const header = [
      `# Ticket #${short} — ${ticket.title}`,
      "",
      `- id: ${ticket.id}`,
      `- type: ${ticket.type} · status: ${ticket.status} · tag: ${ticket.pageUrl ?? "(none)"}`,
      `- from: ${ticket.user ? `${ticket.user.name} <${ticket.user.email}>` : "deleted user"} · ${ticket.company.name}${ticket.company.isTest ? " (test account)" : ""}`,
      `- filed: ${ticket.createdAt.toISOString()}`,
      ticket.response ? `- reply on file: ${ticket.response}` : "",
      "",
    ]
      .filter((l) => l !== "")
      .join("\n");

    let pictureNote = "";
    if (ticket.screenshotKey) {
      if (!isBlobStorageConfigured()) {
        pictureNote = `- picture: on the ticket (${ticket.screenshotKey}) but R2_* is not set here, so it was not downloaded`;
      } else {
        try {
          const url = await signedGetUrl(ticket.screenshotKey, 120);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`R2 answered ${res.status}`);
          const ext = ticket.screenshotKey.split(".").pop() ?? "png";
          const file = join(OUT, `${short}.${ext}`);
          writeFileSync(file, Buffer.from(await res.arrayBuffer()));
          pictureNote = `- picture: ${file}`;
        } catch (err) {
          pictureNote = `- picture: download failed (${err instanceof Error ? err.message : String(err)})`;
        }
      }
    }

    const md = `${header}\n${pictureNote ? `${pictureNote}\n` : ""}\n---\n\n${ticket.details}\n`;
    writeFileSync(join(OUT, `${short}.md`), md);
    if (ticket.capture) writeFileSync(join(OUT, `${short}.json`), JSON.stringify(ticket.capture, null, 2));

    console.log(md);
    console.log(`\nSaved: ${join(OUT, `${short}.md`)}${ticket.capture ? `, ${join(OUT, `${short}.json`)}` : ""}${pictureNote.startsWith("- picture: .") ? `, ${pictureNote.slice("- picture: ".length)}` : ""}`);
  }
} finally {
  await prisma.$disconnect();
}
