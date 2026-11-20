/**
 * Facebook ads, results back: each step a Facebook lead reaches (lead,
 * appointment booked, quote sent, job won, paid) is reported to the company's
 * own Facebook dataset through the Conversions API, so its ads learn which
 * clicks became work. Rules and request shapes: lib/meta-ads-shape.ts (pure).
 * Plan: docs/plans/facebook-ads-2026-11-20.md.
 *
 * Needs nothing from Meta on our side: the owner pastes a dataset id and an
 * access token that Facebook's Events Manager generates for that dataset
 * (Meta: "no need to go through App Review or request any permissions").
 * One MetaConnection per company. Every step sent is written to
 * MetaEventSent first-come, so the hourly cron (step `metaAds`) never sends
 * one twice.
 *
 * WRITTEN FROM META'S DOCUMENTATION (read 2026-11-20) AND NOT YET RUN AGAINST
 * FACEBOOK. The plan lists what the first real send has to confirm.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { isTransientNetworkError, isTransientStatus } from "@/lib/transient-error";
import {
  META_EVENT_WINDOW_DAYS,
  META_BATCH,
  META_GRAPH,
  buildMetaEvents,
  cleanCapiToken,
  cleanDatasetId,
  cleanTestCode,
  eventBodies,
  hasFacebookClick,
  isTokenRefusal,
  metaErrorText,
  parseMetaAnswer,
  testEvent,
  type MetaAnswer,
  type MetaEvent,
  type MetaEventSummary,
  type MetaLeadInput,
} from "@/lib/meta-ads-shape";

const CAPI_SCOPE = "meta-capi";
/** Leads read for one send or one status; far above a week of one company's Facebook leads. */
const READ_CAP = 2000;
/** The lead count on the page looks back this far. */
const LEADS_LOOKBACK_DAYS = 90;

/** What went wrong at Facebook, in words the page can show. */
export class MetaAdsError extends Error {
  constructor(
    message: string,
    /** the token itself was refused: nothing works until a new one is pasted */
    public readonly token = false,
    /** a hiccup on Facebook's side or the network: try again later, nothing is wrong with the setup */
    public readonly transient = false
  ) {
    super(message);
  }
}

const UNREACHABLE = "WorkBench couldn't reach Facebook. It will try again within the hour.";

/** POST one body of events to a dataset. Returns what Facebook answered; throws MetaAdsError with Facebook's own words. */
async function postEvents(datasetId: string, token: string, body: Record<string, unknown>): Promise<MetaAnswer> {
  let res: Response;
  try {
    res = await fetch(`${META_GRAPH}/${datasetId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The token rides in the body, never the address, so it cannot land in a log line.
      body: JSON.stringify({ ...body, access_token: token }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (isTransientNetworkError(err) || (err instanceof Error && err.name === "TimeoutError")) throw new MetaAdsError(UNREACHABLE, false, true);
    throw err;
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return parseMetaAnswer(json);
  if (isTransientStatus(res.status)) throw new MetaAdsError(UNREACHABLE, false, true);
  throw new MetaAdsError(metaErrorText(json, res.status), isTokenRefusal(json, res.status));
}

// ─── Reading the leads ───────────────────────────────────────────────────────

/** Every lead Facebook could match that did something in the last 7 days, with the time of each step. */
async function loadLeads(companyId: string, now: Date): Promise<MetaLeadInput[]> {
  const since = new Date(now.getTime() - META_EVENT_WINDOW_DAYS * 86400000);
  const formLeads = await prisma.metaLead.findMany({
    where: { companyId, contactId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: READ_CAP,
    select: { contactId: true, leadgenId: true },
  });
  const formLeadOf = new Map<string, string>();
  // newest first, so a contact who filled in two forms is matched on the latest
  for (const f of formLeads) if (f.contactId && !formLeadOf.has(f.contactId)) formLeadOf.set(f.contactId, f.leadgenId);

  const contacts = await prisma.contact.findMany({
    where: {
      companyId,
      kind: "CLIENT",
      placeholder: false,
      AND: [
        { OR: [{ leadArrival: { not: Prisma.AnyNull } }, { id: { in: [...formLeadOf.keys()] } }] },
        {
          OR: [
            { createdAt: { gte: since } },
            { wonAt: { gte: since } },
            { appointments: { some: { createdAt: { gte: since } } } },
            { quotes: { some: { sentAt: { gte: since } } } },
            { invoices: { some: { payments: { some: { paidAt: { gte: since }, amount: { gt: 0 } } } } } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: READ_CAP,
    select: {
      id: true,
      createdAt: true,
      wonAt: true,
      leadArrival: true,
      appointments: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
      quotes: { where: { sentAt: { not: null } }, orderBy: { sentAt: "asc" }, take: 1, select: { sentAt: true } },
      invoices: {
        where: { payments: { some: { paidAt: { gte: since }, amount: { gt: 0 } } } },
        select: { payments: { where: { paidAt: { gte: since }, amount: { gt: 0 } }, select: { id: true, amount: true, paidAt: true } } },
      },
    },
  });
  return contacts.map((c) => ({
    contactId: c.id,
    createdAt: c.createdAt,
    arrival: c.leadArrival,
    formLeadId: formLeadOf.get(c.id) ?? null,
    appointmentAt: c.appointments[0]?.createdAt ?? null,
    quoteSentAt: c.quotes[0]?.sentAt ?? null,
    wonAt: c.wonAt,
    payments: c.invoices.flatMap((i) => i.payments.map((p) => ({ id: p.id, amount: Number(p.amount), paidAt: p.paidAt }))),
  }));
}

/** The steps waiting to go to Facebook right now. */
export async function loadMetaEvents(companyId: string, now = new Date()): Promise<MetaEventSummary> {
  const leads = await loadLeads(companyId, now);
  if (leads.length === 0) return { events: [], leads: 0 };
  const sentRows = await prisma.metaEventSent.findMany({
    where: { companyId, contactId: { in: leads.map((l) => l.contactId) } },
    select: { contactId: true, event: true, refId: true },
  });
  const sent = new Set(sentRows.map((r) => `${r.contactId}|${r.event}|${r.refId}`));
  return buildMetaEvents(leads, sent, now);
}

// ─── Turning it on and off ───────────────────────────────────────────────────

/** Save the dataset id and the token from Events Manager. Nothing is sent until the next send. */
export async function saveDataset(companyId: string, datasetIdRaw: unknown, tokenRaw: unknown): Promise<void> {
  const datasetId = cleanDatasetId(datasetIdRaw);
  if (!datasetId) throw new MetaAdsError("That doesn't look like a dataset ID. It is the long number under the dataset's name in Events Manager.");
  const token = cleanCapiToken(tokenRaw);
  if (!token) throw new MetaAdsError("That doesn't look like an access token. Copy the whole token Events Manager shows after Generate access token.");
  const data = { datasetId, capiTokenEnc: sealSecret(token, CAPI_SCOPE), capiNeedsToken: false, lastError: null };
  await prisma.metaConnection.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
}

/** Stop reporting. The record of what was already sent stays, so turning it back on never repeats a step. */
export async function clearDataset(companyId: string): Promise<void> {
  const c = await prisma.metaConnection.findUnique({ where: { companyId }, select: { id: true, pageId: true, userTokenEnc: true } });
  if (!c) return;
  if (!c.pageId && !c.userTokenEnc) {
    await prisma.metaConnection.delete({ where: { id: c.id } });
    return;
  }
  await prisma.metaConnection.update({
    where: { id: c.id },
    data: { datasetId: null, capiTokenEnc: null, capiNeedsToken: false, lastSendAt: null, lastSendCount: null, lastError: null },
  });
}

async function datasetOf(companyId: string) {
  const c = await prisma.metaConnection.findUnique({ where: { companyId } });
  if (!c?.datasetId || !c.capiTokenEnc) return null;
  return { id: c.id, datasetId: c.datasetId, token: openSecret(c.capiTokenEnc, CAPI_SCOPE), needsToken: c.capiNeedsToken };
}

/** One made-up lead sent with Events Manager's test code: it shows on the Test events tab and counts nothing. */
export async function sendTestEvent(companyId: string, testCodeRaw: unknown, now = new Date()): Promise<MetaAnswer & { datasetId: string }> {
  const testCode = cleanTestCode(testCodeRaw);
  if (!testCode) throw new MetaAdsError("Paste the test code from Events Manager's Test events tab (it looks like TEST12345).");
  const target = await datasetOf(companyId);
  if (!target) throw new MetaAdsError("Turn it on first.");
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  const base = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/$/, "");
  const [body] = eventBodies([testEvent(`${base}/book/${company?.slug ?? ""}`, now)], { testCode });
  let answer: MetaAnswer;
  try {
    answer = await postEvents(target.datasetId, target.token, body);
  } catch (err) {
    if (err instanceof MetaAdsError && err.token) {
      await prisma.metaConnection.update({ where: { id: target.id }, data: { capiNeedsToken: true, lastError: err.message.slice(0, 400) } }).catch(() => {});
    }
    throw err;
  }
  // A test that went through proves the token: clear an old refusal.
  await prisma.metaConnection.update({ where: { id: target.id }, data: { capiNeedsToken: false, lastError: null } }).catch(() => {});
  // kept in the server log too: Facebook's trace id is what its support asks for
  console.info(`[meta-ads] test event: dataset ${target.datasetId} received ${answer.received ?? "?"} trace ${answer.trace ?? "-"}${answer.messages.length ? ` messages ${JSON.stringify(answer.messages)}` : ""}`);
  return { ...answer, datasetId: target.datasetId };
}

// ─── Sending the steps ───────────────────────────────────────────────────────

export type MetaSyncResult = { ok: true; sent: number; refused: number } | { ok: false; error: string; transient: boolean; token: boolean };

async function record(companyId: string, events: MetaEvent[], error: string | null): Promise<void> {
  if (events.length === 0) return;
  await prisma.metaEventSent.createMany({
    data: events.map((e) => ({ companyId, contactId: e.contactId, event: e.step, refId: e.refId, error })),
    skipDuplicates: true,
  });
}

/** Sends every step Facebook will still accept and has not had. Safe to run again: sent steps are recorded. */
export async function syncCompany(companyId: string, now = new Date()): Promise<MetaSyncResult> {
  const target = await datasetOf(companyId);
  if (!target) return { ok: false, error: "Reporting to Facebook isn't turned on.", transient: false, token: false };
  let sent = 0;
  let refused = 0;
  let refusal = "";
  try {
    const { events } = await loadMetaEvents(companyId, now);
    const size = META_BATCH;
    for (let i = 0; i < events.length; i += size) {
      const batch = events.slice(i, i + size);
      try {
        await postEvents(target.datasetId, target.token, eventBodies(batch)[0]);
        await record(companyId, batch, null);
        sent += batch.length;
      } catch (err) {
        // a dead token, a hiccup or a bug stops the send; a refusal of the events themselves is narrowed down below
        if (!(err instanceof MetaAdsError) || err.token || err.transient) throw err;
        // Facebook discards a whole request for one bad event: send these one at a time to find it.
        for (const one of batch) {
          try {
            await postEvents(target.datasetId, target.token, eventBodies([one])[0]);
            await record(companyId, [one], null);
            sent += 1;
          } catch (inner) {
            if (!(inner instanceof MetaAdsError) || inner.token || inner.transient) throw inner;
            await record(companyId, [one], inner.message.slice(0, 300));
            refused += 1;
            refusal = inner.message;
          }
        }
      }
    }
    await prisma.metaConnection.update({
      where: { id: target.id },
      data: {
        capiNeedsToken: false,
        lastError: refused > 0 ? `Facebook refused ${refused} ${refused === 1 ? "step" : "steps"}: ${refusal}`.slice(0, 400) : null,
        ...(sent > 0 ? { lastSendAt: now, lastSendCount: sent } : {}),
      },
    });
    return { ok: true, sent, refused };
  } catch (err) {
    const known = err instanceof MetaAdsError;
    const message = known ? err.message : UNREACHABLE;
    if (!known) reportError("[meta-ads] send failed", err);
    await prisma.metaConnection
      .update({
        where: { id: target.id },
        data: {
          lastError: message.slice(0, 400),
          ...(known && err.token ? { capiNeedsToken: true } : {}),
          ...(sent > 0 ? { lastSendAt: now, lastSendCount: sent } : {}),
        },
      })
      .catch(() => {});
    return { ok: false, error: message, transient: known && err.transient, token: known && err.token };
  }
}

/** Cron step: every company reporting to Facebook. Hourly, because Facebook only takes a step for 7 days. */
export async function runMetaAdsSweep(now = new Date()): Promise<{ companies: number; sent: number; refused: number; errors: number }> {
  const due = await prisma.metaConnection.findMany({
    where: { datasetId: { not: null }, capiTokenEnc: { not: null }, capiNeedsToken: false, company: { suspendedAt: null } },
    select: { companyId: true },
    take: 500,
  });
  let sent = 0;
  let refused = 0;
  let errors = 0;
  for (const c of due) {
    const r = await syncCompany(c.companyId, now);
    if (r.ok) {
      sent += r.sent;
      refused += r.refused;
    } else if (!r.transient && !r.token) {
      // a refused token is the owner's to fix and is on their page; a hiccup retries next hour
      errors += 1;
    }
  }
  return { companies: due.length, sent, refused, errors };
}

// ─── Status for the page and the Atlas tool ──────────────────────────────────

export type MetaAdsStatus = {
  on: boolean;
  datasetId: string | null;
  /** Facebook refused the token: a new one has to be pasted */
  needsToken: boolean;
  lastSendAt: string | null;
  lastSendCount: number | null;
  lastError: string | null;
  /** leads of the last 90 days that came from Facebook (a click id or a Facebook form) */
  facebookLeads: number;
  /** steps reported in the last 7 days */
  sentThisWeek: number;
  /** steps that would go out on the next send */
  waiting: number;
};

/** Everything the page and the Atlas tool show. Works while off: the numbers say what turning it on would report. */
export async function loadMetaAdsStatus(companyId: string, now = new Date()): Promise<MetaAdsStatus> {
  const since = new Date(now.getTime() - LEADS_LOOKBACK_DAYS * 86400000);
  const week = new Date(now.getTime() - META_EVENT_WINDOW_DAYS * 86400000);
  const [c, arrivals, formLeads, sentThisWeek, summary] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { companyId } }),
    prisma.contact.findMany({
      where: { companyId, kind: "CLIENT", placeholder: false, createdAt: { gte: since }, leadArrival: { not: Prisma.AnyNull } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { leadArrival: true },
    }),
    prisma.metaLead.count({ where: { companyId, contactId: { not: null }, createdAt: { gte: since } } }),
    prisma.metaEventSent.count({ where: { companyId, sentAt: { gte: week }, error: null } }),
    loadMetaEvents(companyId, now),
  ]);
  const on = !!(c?.datasetId && c.capiTokenEnc);
  return {
    on,
    datasetId: on ? c!.datasetId : null,
    needsToken: on && c!.capiNeedsToken,
    lastSendAt: on && c!.lastSendAt ? c!.lastSendAt.toISOString() : null,
    lastSendCount: on ? c!.lastSendCount : null,
    lastError: on ? c!.lastError : null,
    facebookLeads: arrivals.filter((a) => hasFacebookClick(a.leadArrival)).length + formLeads,
    sentThisWeek,
    waiting: summary.events.length,
  };
}
