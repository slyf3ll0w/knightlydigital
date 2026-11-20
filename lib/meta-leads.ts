/**
 * Facebook lead forms straight in ("Connect Facebook"). The owner signs in
 * with Facebook and picks a Page; WorkBench subscribes to that Page's
 * `leadgen` webhook, and each lead from a Facebook or Instagram instant form
 * lands on the Leads board within seconds, like a website lead
 * (lib/lead-intake.ts). Pure rules: lib/meta-leads-shape.ts. Plan:
 * docs/plans/facebook-ads-2026-11-20.md.
 *
 * Env (the Connect card is hidden until the first three are set):
 *   META_APP_ID, META_APP_SECRET       WorkBench's Meta app (a Business app)
 *   META_LOGIN_CONFIG_ID               its Facebook Login for Business configuration
 *   META_WEBHOOK_VERIFY_TOKEN          any secret string, typed into the app's Webhooks page too
 * Redirect address to register: ${NEXTAUTH_URL}/api/app/integrations/meta/callback
 * Webhook address to register:  ${NEXTAUTH_URL}/api/public/webhooks/meta (object Page, field leadgen)
 *
 * The same sign-in also reports results back, with nothing pasted ("the
 * seamless route"): it lists the business's datasets, the owner picks one
 * (one dataset = picked for them), and lib/meta-ads.ts sends the steps with
 * the sign-in's own token (MetaConnection.datasetVia = "connect"). Built for
 * a Facebook Login for Business configuration of type SYSTEM-USER access
 * token, whose token does not expire and names the business
 * (client_business_id). A user-token configuration works too, but its token
 * lasts about 60 days, after which the page asks to connect again.
 *
 * The webhook only names a lead; its answers are then read from Facebook
 * with the Page's own token, so a forged notice can file nothing. Each lead
 * is a MetaLead row, unique on Facebook's lead id: a resent notice is a
 * no-op, and the id is what later steps are matched on when results are
 * reported back (lib/meta-ads.ts).
 *
 * WRITTEN FROM META'S DOCUMENTATION (read 2026-11-20) AND NOT YET RUN AGAINST
 * FACEBOOK. Until Meta's App Review passes, only people with a role on the
 * Meta app can connect.
 */
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { openSecret, sealSecret, signMessage } from "@/lib/secret-box";
import { isTransientNetworkError, isTransientStatus } from "@/lib/transient-error";
import { createInboundLead } from "@/lib/lead-intake";
import { META_GRAPH, isTokenRefusal, metaErrorText } from "@/lib/meta-ads-shape";
import { timingSafeEqual } from "crypto";
import {
  LEADS_ACCESS_FIX,
  LEAD_FIELDS,
  META_DIALOG_URL,
  formLeadSource,
  isLeadsAccessRefusal,
  leadFromFacebook,
  parseClientBusinessId,
  parseDatasets,
  parsePages,
  type FacebookDataset,
  type FacebookPage,
  type LeadgenNotice,
} from "@/lib/meta-leads-shape";

const PAGE_SCOPE = "meta-page";
const USER_SCOPE = "meta-user";
const STATE_SCOPE = "meta-state";
/** A lead whose answers could not be read is tried again hourly, this many times in all. */
const MAX_TRIES = 8;

export function isMetaLeadsConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_LOGIN_CONFIG_ID);
}

function redirectUri(): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/app/integrations/meta/callback`;
}

/** What went wrong at Facebook, in words the page can show. */
export class MetaLeadsError extends Error {
  constructor(
    message: string,
    /** the sign-in itself is dead: connect again */
    public readonly reconnect = false,
    /** Facebook or the network hiccuped: nothing is wrong with the setup */
    public readonly transient = false,
    /** the Page's business has not given WorkBench leads access */
    public readonly leadsAccess = false
  ) {
    super(message);
  }
}

const UNREACHABLE = "WorkBench couldn't reach Facebook.";

async function graph(path: string, token: string, init: { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string> } = {}): Promise<unknown> {
  const url = new URL(`${META_GRAPH}/${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    // The token rides in a header, never the address, so it cannot land in a log line.
    res = await fetch(url, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    if (isTransientNetworkError(err) || (err instanceof Error && err.name === "TimeoutError")) throw new MetaLeadsError(UNREACHABLE, false, true);
    throw err;
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return json;
  if (isTransientStatus(res.status)) throw new MetaLeadsError(UNREACHABLE, false, true);
  if (isLeadsAccessRefusal(json)) throw new MetaLeadsError(metaErrorText(json, res.status), false, false, true);
  throw new MetaLeadsError(metaErrorText(json, res.status), isTokenRefusal(json, res.status));
}

// ─── Sign-in: address + signed state ─────────────────────────────────────────

// state = companyId.userId.expiresAtMs.hmac, 10 minutes. The callback also
// requires the signed-in person to be that user in that company.
const stateSignature = (companyId: string, userId: string, expiresAt: number) => signMessage(`${companyId}.${userId}.${expiresAt}`, STATE_SCOPE);

export function buildLoginUrl(actor: { id: string; companyId: string }): string {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri(),
    state: `${actor.companyId}.${actor.id}.${expiresAt}.${stateSignature(actor.companyId, actor.id, expiresAt)}`,
    // Facebook Login for Business: the configuration names the permissions, not a scope list
    config_id: process.env.META_LOGIN_CONFIG_ID ?? "",
    response_type: "code",
    override_default_response_type: "true",
  });
  return `${META_DIALOG_URL}?${params.toString()}`;
}

export function verifyState(state: string): { companyId: string; userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [companyId, userId, expiresRaw, sig] = parts;
  const expiresAt = Number(expiresRaw);
  if (!companyId || !userId || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  const want = Buffer.from(stateSignature(companyId, userId, expiresAt));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? { companyId, userId } : null;
}

/**
 * code → the sign-in's token. A system-user configuration answers with a token that does not expire and
 * names the business it acts for; that one is kept as is. A user configuration answers with a short-lived
 * user token, which is traded for a long-lived one (about 60 days; the Page tokens made from it do not expire).
 */
async function exchangeCode(code: string): Promise<{ token: string; businessId: string | null }> {
  const ask = async (params: Record<string, string>) => {
    const url = new URL(`${META_GRAPH}/oauth/access_token`);
    let res: Response;
    try {
      // Facebook takes these as form fields too, which keeps the app secret out of the address
      res = await fetch(url, { method: "POST", body: new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", ...params }), signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      if (isTransientNetworkError(err) || (err instanceof Error && err.name === "TimeoutError")) throw new MetaLeadsError(UNREACHABLE, false, true);
      throw err;
    }
    const json = (await res.json().catch(() => null)) as { access_token?: unknown } | null;
    if (!res.ok || typeof json?.access_token !== "string") throw new MetaLeadsError(metaErrorText(json, res.status));
    return json.access_token;
  };
  const first = await ask({ redirect_uri: redirectUri(), code });
  // only a system-user token has this field; a user token is refused for asking, which is the answer
  const businessId = parseClientBusinessId(await graph("me", first, { params: { fields: "client_business_id" } }).catch(() => null));
  if (businessId) return { token: first, businessId };
  return { token: await ask({ grant_type: "fb_exchange_token", fb_exchange_token: first }), businessId: null };
}

/** The datasets this sign-in can send to. A refusal of one list is not the end: the others may answer. */
async function datasetsFor(token: string, businessId: string | null): Promise<FacebookDataset[]> {
  const answers: unknown[] = [];
  const tryList = async (path: string, fields: string) => {
    try {
      answers.push(await graph(path, token, { params: { fields, limit: "100" } }));
    } catch (err) {
      if (!(err instanceof MetaLeadsError) || err.reconnect) throw err;
      console.warn(`[meta-leads] ${path} answered:`, err.message);
    }
  };
  if (businessId) {
    await tryList(`${businessId}/owned_pixels`, "id,name,is_unavailable");
    await tryList(`${businessId}/client_pixels`, "id,name,is_unavailable");
  }
  // a personal sign-in has no business to ask; its ad accounts carry their datasets
  if (!businessId || answers.length === 0) await tryList("me/adaccounts", "adspixels{id,name,is_unavailable}");
  return parseDatasets(...answers);
}

async function pagesFor(userToken: string): Promise<FacebookPage[]> {
  return parsePages(await graph("me/accounts", userToken, { params: { fields: "id,name,access_token,tasks", limit: "100" } }));
}

/** Point a Page's lead notices at WorkBench and remember the Page. */
async function usePage(connectionId: string, companyId: string, page: FacebookPage): Promise<void> {
  const taken = await prisma.metaConnection.findFirst({ where: { pageId: page.id, companyId: { not: companyId } }, select: { id: true } });
  if (taken) throw new MetaLeadsError("That Facebook Page is already connected to another WorkBench company. Disconnect it there first.");
  await graph(`${page.id}/subscribed_apps`, page.token, { method: "POST", params: { subscribed_fields: "leadgen" } });
  await prisma.metaConnection.update({
    where: { id: connectionId },
    data: { pageId: page.id, pageName: page.name, pageTokenEnc: sealSecret(page.token, PAGE_SCOPE), needsReconnect: false, lastLeadError: null },
  });
}

/** Finishes the sign-in. One Page → it is picked. Several → the page lists them. */
export async function connectCompany(opts: { companyId: string; userId: string; code: string }): Promise<"connected" | "pick_page" | "no_pages"> {
  const { token: userToken, businessId } = await exchangeCode(opts.code);
  const me = (await graph("me", userToken, { params: { fields: "name" } })) as { name?: unknown } | null;
  const pages = (await pagesFor(userToken)).filter((p) => p.canAdvertise);
  if (pages.length === 0) return "no_pages";
  const data = {
    connectedById: opts.userId,
    fbUserName: typeof me?.name === "string" ? me.name.slice(0, 120) : null,
    userTokenEnc: sealSecret(userToken, USER_SCOPE),
    businessId,
    needsReconnect: false,
    lastLeadError: null,
  };
  const connection = await prisma.metaConnection.upsert({ where: { companyId: opts.companyId }, create: { companyId: opts.companyId, ...data }, update: data });
  // Results back, with nothing pasted: one dataset under this sign-in = it is the one. Several = the page lists them.
  // A company already reporting through a pasted token keeps that until it chooses otherwise. Never fatal to the connect.
  try {
    if (connection.datasetVia === "connect" || !connection.datasetId) {
      const datasets = await datasetsFor(userToken, businessId);
      const keep = datasets.find((d) => d.id === connection.datasetId) ?? (datasets.length === 1 ? datasets[0] : null);
      await prisma.metaConnection.update({
        where: { id: connection.id },
        data: keep ? { datasetId: keep.id, datasetVia: "connect", capiTokenEnc: null, capiNeedsToken: false, lastError: null } : { datasetId: null, datasetVia: null },
      });
    }
  } catch (err) {
    reportError("[meta-leads] listing datasets at connect failed", err);
  }
  if (pages.length > 1) return "pick_page";
  await usePage(connection.id, opts.companyId, pages[0]);
  return "connected";
}

/** The datasets to pick from. Names and ids only. */
export async function datasetsToPick(companyId: string): Promise<FacebookDataset[]> {
  const c = await prisma.metaConnection.findUnique({ where: { companyId }, select: { userTokenEnc: true, businessId: true } });
  if (!c?.userTokenEnc) return [];
  return datasetsFor(openSecret(c.userTokenEnc, USER_SCOPE), c.businessId);
}

/** Report results to this dataset through the sign-in. Only a dataset Facebook lists for this sign-in is accepted. */
export async function chooseDataset(companyId: string, datasetIdRaw: unknown): Promise<void> {
  const c = await prisma.metaConnection.findUnique({ where: { companyId }, select: { id: true, userTokenEnc: true, businessId: true } });
  if (!c?.userTokenEnc) throw new MetaLeadsError("Connect Facebook first.");
  const want = typeof datasetIdRaw === "string" ? datasetIdRaw : "";
  const dataset = (await datasetsFor(openSecret(c.userTokenEnc, USER_SCOPE), c.businessId)).find((d) => d.id === want);
  if (!dataset) throw new MetaLeadsError("That dataset isn't one this Facebook sign-in can use.");
  await prisma.metaConnection.update({
    where: { id: c.id },
    data: { datasetId: dataset.id, datasetVia: "connect", capiTokenEnc: null, capiNeedsToken: false, lastError: null },
  });
}

/** The Pages to pick from while one still has to be picked. Names and ids only: tokens never leave the server. */
export async function pagesToPick(companyId: string): Promise<{ id: string; name: string }[]> {
  const c = await prisma.metaConnection.findUnique({ where: { companyId }, select: { userTokenEnc: true } });
  if (!c?.userTokenEnc) return [];
  const pages = await pagesFor(openSecret(c.userTokenEnc, USER_SCOPE));
  return pages.filter((p) => p.canAdvertise).map((p) => ({ id: p.id, name: p.name }));
}

/** Only a Page Facebook lists for this sign-in is accepted. */
export async function choosePage(companyId: string, pageIdRaw: unknown): Promise<void> {
  const c = await prisma.metaConnection.findUnique({ where: { companyId }, select: { id: true, userTokenEnc: true } });
  if (!c?.userTokenEnc) throw new MetaLeadsError("Connect Facebook first.");
  const want = typeof pageIdRaw === "string" ? pageIdRaw : "";
  const page = (await pagesFor(openSecret(c.userTokenEnc, USER_SCOPE))).find((p) => p.id === want && p.canAdvertise);
  if (!page) throw new MetaLeadsError("That Page isn't one this Facebook sign-in can use.");
  await usePage(c.id, companyId, page);
}

/** Stop the lead notices and forget the sign-in. Leads already filed stay; so does reporting results back, if it is on. */
export async function disconnectPage(companyId: string): Promise<void> {
  const c = await prisma.metaConnection.findUnique({ where: { companyId } });
  if (!c) return;
  if (c.pageId && c.pageTokenEnc) {
    try {
      await graph(`${c.pageId}/subscribed_apps`, openSecret(c.pageTokenEnc, PAGE_SCOPE), { method: "DELETE" });
    } catch {
      // best effort: the owner can also remove WorkBench under the Page's Business integrations
    }
  }
  // reporting that ran on this sign-in stops with it; a pasted dataset and token carry on
  if (!c.datasetId || c.datasetVia === "connect" || !c.capiTokenEnc) {
    await prisma.metaConnection.delete({ where: { id: c.id } });
    return;
  }
  await prisma.metaConnection.update({
    where: { id: c.id },
    data: { connectedById: null, fbUserName: null, userTokenEnc: null, businessId: null, pageId: null, pageName: null, pageTokenEnc: null, needsReconnect: false, lastLeadAt: null, lastLeadError: null },
  });
}

// ─── Leads arriving ──────────────────────────────────────────────────────────

/** Record the leads a webhook delivery named. Returns the row ids that are new (a resent notice returns none). */
export async function recordNotices(notices: LeadgenNotice[]): Promise<string[]> {
  if (notices.length === 0) return [];
  const connections = await prisma.metaConnection.findMany({
    where: { pageId: { in: [...new Set(notices.map((n) => n.pageId))] }, company: { suspendedAt: null } },
    select: { pageId: true, companyId: true },
  });
  const companyOf = new Map(connections.map((c) => [c.pageId, c.companyId]));
  const fresh: string[] = [];
  for (const n of notices) {
    const companyId = companyOf.get(n.pageId);
    // a Page nobody has connected (or a suspended company): nothing to file it under
    if (!companyId) continue;
    try {
      const row = await prisma.metaLead.create({ data: { leadgenId: n.leadgenId, companyId, pageId: n.pageId, formId: n.formId, adId: n.adId }, select: { id: true } });
      fresh.push(row.id);
    } catch (err) {
      // P2002 = this lead was already recorded: Facebook resends until it gets a 200
      if ((err as { code?: string } | null)?.code !== "P2002") throw err;
    }
  }
  return fresh;
}

/**
 * Read one recorded lead's answers from Facebook and file it. Claimed first
 * (fetchedAt), so the webhook and the cron never file the same lead twice.
 * Returns what happened; never throws.
 */
export async function fileLead(metaLeadId: string, now = new Date()): Promise<"filed" | "skipped" | "retry" | "failed"> {
  const claim = await prisma.metaLead.updateMany({ where: { id: metaLeadId, contactId: null, OR: [{ fetchedAt: null }, { fetchedAt: { lt: new Date(now.getTime() - 15 * 60000) } }] }, data: { fetchedAt: now, tries: { increment: 1 } } });
  if (claim.count === 0) return "skipped";
  const row = await prisma.metaLead.findUnique({ where: { id: metaLeadId } });
  if (!row) return "skipped";
  const connection = await prisma.metaConnection.findUnique({ where: { companyId: row.companyId }, include: { company: { select: { id: true, name: true, email: true, suspendedAt: true } } } });
  // disconnected (or moved to another Page) since the notice: nothing can read it
  if (!connection?.pageTokenEnc || connection.pageId !== row.pageId || connection.company.suspendedAt) {
    await prisma.metaLead.update({ where: { id: row.id }, data: { error: "The Page was disconnected before this lead was read." } });
    return "failed";
  }
  try {
    const json = await graph(row.leadgenId, openSecret(connection.pageTokenEnc, PAGE_SCOPE), { params: { fields: LEAD_FIELDS } });
    const lead = leadFromFacebook(json);
    if (!lead) {
      await prisma.metaLead.update({ where: { id: row.id }, data: { error: "The form gave no name, or neither an email nor a phone." } });
      return "failed";
    }
    const source = formLeadSource({ adId: lead.adId ?? row.adId });
    const filed = await createInboundLead(connection.company, { ...lead, source, door: "facebook_form" });
    await prisma.metaLead.update({ where: { id: row.id }, data: { contactId: filed.contactId, requestId: filed.requestId, error: null, adId: lead.adId ?? row.adId } });
    await prisma.metaConnection.update({ where: { id: connection.id }, data: { lastLeadAt: now, lastLeadError: null, needsReconnect: false } }).catch(() => {});
    return "filed";
  } catch (err) {
    const known = err instanceof MetaLeadsError;
    if (!known) reportError("[meta-leads] filing a lead failed", err);
    const message = known ? (err.leadsAccess ? LEADS_ACCESS_FIX : err.message) : "WorkBench couldn't file this lead.";
    // released for the next hourly pass (fetchedAt back to null) unless it has had its tries
    const spent = row.tries >= MAX_TRIES;
    await prisma.metaLead.update({ where: { id: row.id }, data: { fetchedAt: spent ? now : null, error: message.slice(0, 400) } }).catch(() => {});
    if (known && !err.transient) {
      await prisma.metaConnection
        .update({ where: { id: connection.id }, data: { lastLeadError: message.slice(0, 400), ...(err.reconnect ? { needsReconnect: true } : {}) } })
        .catch(() => {});
    }
    return spent ? "failed" : "retry";
  }
}

/** Cron step: leads whose answers have not been read yet (Facebook hiccup, leads access not given yet, a crashed pass). */
export async function runMetaLeadsSweep(now = new Date()): Promise<{ waiting: number; filed: number; errors: number }> {
  if (!isMetaLeadsConfigured()) return { waiting: 0, filed: 0, errors: 0 };
  const stale = new Date(now.getTime() - 15 * 60000);
  const rows = await prisma.metaLead.findMany({
    where: {
      contactId: null,
      tries: { lt: MAX_TRIES },
      // Facebook keeps a lead readable for 90 days
      createdAt: { gte: new Date(now.getTime() - 90 * 86400000) },
      OR: [{ fetchedAt: null, createdAt: { lt: new Date(now.getTime() - 2 * 60000) } }, { fetchedAt: { lt: stale }, error: null }],
      company: { suspendedAt: null, metaAds: { is: { needsReconnect: false, pageId: { not: null } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true },
  });
  let filed = 0;
  let errors = 0;
  for (const r of rows) {
    const outcome = await fileLead(r.id, now);
    if (outcome === "filed") filed += 1;
    else if (outcome === "failed") errors += 1;
  }
  return { waiting: rows.length, filed, errors };
}

// ─── Status for the page and the Atlas tool ──────────────────────────────────

export type MetaLeadsStatus = {
  /** The Connect button exists on this server (env vars set). */
  available: boolean;
  connected: boolean;
  fbUserName: string | null;
  pageName: string | null;
  /** signed in, several Pages, none picked yet */
  needsPage: boolean;
  /** a Facebook sign-in is on file (it can list datasets and send results) */
  signedIn: boolean;
  needsReconnect: boolean;
  lastLeadAt: string | null;
  lastLeadError: string | null;
  /** leads from Facebook forms filed in the last 30 days */
  leads30: number;
  /** leads Facebook named that WorkBench has not been able to read */
  unread: number;
};

export async function loadMetaLeadsStatus(companyId: string, now = new Date()): Promise<MetaLeadsStatus> {
  const available = isMetaLeadsConfigured();
  const c = available ? await prisma.metaConnection.findUnique({ where: { companyId } }) : null;
  const connected = !!(c?.pageId && c.pageTokenEnc);
  const [leads30, unread] = connected
    ? await Promise.all([
        prisma.metaLead.count({ where: { companyId, contactId: { not: null }, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } } }),
        prisma.metaLead.count({ where: { companyId, contactId: null, pageId: c!.pageId!, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } } }),
      ])
    : [0, 0];
  return {
    available,
    connected,
    fbUserName: c?.fbUserName ?? null,
    pageName: connected ? c!.pageName : null,
    needsPage: !!c?.userTokenEnc && !connected,
    signedIn: !!c?.userTokenEnc,
    needsReconnect: connected && c!.needsReconnect,
    lastLeadAt: connected && c!.lastLeadAt ? c!.lastLeadAt.toISOString() : null,
    lastLeadError: connected ? c!.lastLeadError : null,
    leads30,
    unread,
  };
}
