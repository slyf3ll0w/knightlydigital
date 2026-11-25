import { fmtPhone } from "@/lib/format";
import { arrivalLines, sanitizeArrival } from "@/lib/lead-source";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, canSeeMoney, contactScope, seesAllLeads, isManager } from "@/lib/permissions";
import Link from "next/link";
import { Fragment } from "react";
import { mapsSearchHref } from "@/lib/time-entries";
import SectionHeader from "@/components/SectionHeader";
import { Phone, Mail, MapPin, ChevronRight, Pencil, Eye, MessageCircle } from "lucide-react";
import { money, shortDate, clientMessageStatus, type StatusKind } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import BackLink from "@/components/BackLink";
import BackParent from "@/components/BackParent";
import PageTitle from "@/components/PageTitle";
import Monogram from "@/components/Monogram";
import { StatCard } from "@/components/ListBands";
import ContactStatus from "@/components/ContactStatus";
import CallTextButtons from "@/components/CallTextButtons";
import CallLink from "@/components/CallLink";
import CallRow from "@/components/CallRow";
import JobActionRow from "@/components/JobActionRow";
import ContactCreateMenu from "./ContactCreateMenu";
import ContactActionsMenu from "./ContactActionsMenu";
import AssignLead from "./AssignLead";
import CustomFieldsCard from "./CustomFieldsCard";
import ContactNoteForm from "./ContactNoteForm";
import ContactNoteItem from "./ContactNoteItem";
import PortalAccessCard from "./PortalAccessCard";
import EmailClientButton from "./EmailClientButton";
import AddressesCard from "./AddressesCard";
import PeopleCard from "./PeopleCard";
import SavedCardsCard from "./SavedCardsCard";
import PipelineCard from "./PipelineCard";
import { getActiveFieldDefs } from "@/lib/contact-fields";
import { invoiceBalance } from "@/lib/payments";
import { clientPayConfig } from "@/lib/pay-client-config";
import RunAutomationMenu from "@/components/RunAutomationMenu";
import PdfLink from "@/components/PdfLink";
import TitleSentinel from "@/components/TitleSentinel";
import { DsPage, OpenSection } from "@/components/ds";

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ work?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { id } = await params;
  const workTabRaw = (await searchParams)?.work;

  const canReassign = seesAllLeads(actor.role);

  const [contact, teamUsers, senderUser, recentCalls] = await Promise.all([
    prisma.contact.findFirst({
      where: { id, companyId, ...contactScope(actor) },
      include: {
        company: {
          select: {
            name: true,
            slug: true,
            phone: true,
            website: true,
            logoUrl: true,
            finixMerchantId: true,
            finixOnboardingState: true, squareMerchantId: true, squareConnectedAt: true, squareLocationId: true,
            smsAcknowledgedAt: true,
            lineNumber: true,
            lineForwardTo: true,
            timezone: true,
            lineVoiceAppAt: true,
            messagingRegistration: { select: { status: true } },
          },
        },
        savedCards: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { id: true, label: true, isDefault: true },
        },
        requests: { orderBy: { createdAt: "desc" } },
        appointments: { orderBy: { createdAt: "desc" } },
        contracts: { orderBy: { createdAt: "desc" } },
        clientMessages: { orderBy: { createdAt: "desc" } },
        contactNotes: { include: { user: true }, orderBy: { createdAt: "asc" } },
        quotes: { orderBy: { createdAt: "desc" } },
        jobs: { orderBy: { createdAt: "desc" } },
        invoices: { include: { payments: true }, orderBy: { createdAt: "desc" } },
        payments: true,
        assignedTo: { select: { id: true, name: true } },
        pipelineStage: { select: { isConverted: true } },
        addresses: { orderBy: { createdAt: "asc" } },
        people: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    }),
    canReassign
      ? prisma.user.findMany({
          where: { companyId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { name: true, emailSignature: true, phone: true },
    }),
    // Business-line calls with this client (lib/voice.ts) — the rail card
    prisma.call.findMany({
      where: { contactId: id, companyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        direction: true,
        status: true,
        customerNumber: true,
        durationSec: true,
        voicemailSec: true,
        voicemailRecordingId: true,
        seenAt: true,
        createdAt: true,
        contact: { select: { id: true, firstName: true, lastName: true, status: true } },
        user: { select: { name: true } },
        via: true,
        answeredBy: { select: { name: true } },
      },
    }),
  ]);

  if (!contact) notFound();

  // Prefill for the compose modal's editable signature
  const emailSignature =
    senderUser?.emailSignature?.trim() ||
    [senderUser?.name, contact.company.name, contact.company.phone, contact.company.website]
      .filter(Boolean)
      .join("\n");

  const fieldDefs = await getActiveFieldDefs(companyId);

  // Pipeline card data — only when this contact has a card on the Leads board
  const pipelineStages = contact.pipelineStageId
    ? await prisma.pipelineStage.findMany({
        where: { companyId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      })
    : [];
  // Repeat = worked with the company before THIS pipeline run — a first-time
  // conversion sitting in Converted isn't a repeat
  const isRepeat = contact.pipelineStage?.isConverted
    ? contact.timesWon > 1
    : contact.status === "ACTIVE" || contact.timesWon > 0;

  // Dates render in the company's zone — the server clock is UTC
  const tz = contact.company.timezone;
  // Payments, balances and invoice rows are money: SALES with payments
  // hidden works the client but never sees what they've paid or owe
  const seeMoney = canSeeMoney(actor);

  const lifetimeValue = contact.payments.reduce((s, p) => s + Number(p.amount), 0);
  const currentBalance = contact.invoices
    .filter((i) => i.status !== "DRAFT")
    .reduce((s, inv) => s + Math.max(0, invoiceBalance(inv)), 0);

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const hubUrl = `${baseUrl}/hub/${contact.hubToken}`;

  // Unified work overview rows (Jobber's client work table)
  const workRows = [
    ...contact.requests.map((r) => ({
      key: `r-${r.id}`,
      href: `/app/requests/${r.id}`,
      type: "Request",
      label: r.title,
      date: r.createdAt,
      kind: "request" as StatusKind,
      status: r.status as string,
      amount: null as number | null,
      viewed: null as Date | null,
    })),
    ...contact.appointments.map((a) => ({
      key: `a-${a.id}`,
      href: `/app/appointments/${a.id}`,
      type: "Appointment",
      label: a.title,
      date: a.createdAt,
      kind: "appointment" as StatusKind,
      status: a.status as string,
      amount: null as number | null,
      viewed: null as Date | null,
    })),
    ...contact.contracts.map((ct) => ({
      key: `ct-${ct.id}`,
      href: `/app/contracts/${ct.id}`,
      type: "Contract",
      label: ct.title,
      date: ct.createdAt,
      kind: "contract" as StatusKind,
      status: ct.status as string,
      amount: null as number | null,
      viewed: ct.firstViewedAt,
    })),
    ...contact.quotes.map((q) => ({
      key: `q-${q.id}`,
      href: `/app/quotes/${q.id}`,
      type: "Quote",
      label: q.title || `Quote #${q.quoteNumber}`,
      date: q.createdAt,
      kind: "quote" as StatusKind,
      status: q.status as string,
      amount: Number(q.total),
      viewed: q.firstViewedAt,
    })),
    ...contact.jobs.map((j) => ({
      key: `j-${j.id}`,
      href: `/app/jobs/${j.id}`,
      type: "Job",
      label: `#${j.jobNumber} ${j.title}`,
      date: j.createdAt,
      kind: "job" as StatusKind,
      status: j.status as string,
      amount: null as number | null,
      viewed: null as Date | null,
    })),
    ...(seeMoney ? contact.invoices : []).map((inv) => ({
      key: `i-${inv.id}`,
      href: `/app/invoices/${inv.id}`,
      type: "Invoice",
      label: inv.subject || `Invoice #${inv.invoiceNumber}`,
      date: inv.createdAt,
      kind: "invoice" as StatusKind,
      status: inv.status as string,
      amount: Number(inv.total),
      viewed: inv.firstViewedAt,
    })),
    ...contact.clientMessages.map((m) => ({
      key: `m-${m.id}`,
      href: `/app/messages/${m.id}`,
      type: "Email",
      label: m.subject,
      date: m.createdAt,
      kind: "message" as StatusKind,
      status: clientMessageStatus(m),
      amount: null as number | null,
      // "Seen" only for the certain signals — page view or confident pixel
      viewed:
        m.firstViewedAt ?? (m.emailOpenKind === "confident" ? m.emailOpenedAt : null),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Provider texts need the attestation switch AND a registered business line
  // (lib/business-line.ts); the chip below says which one is missing.
  const lineNumber = contact.company.lineNumber;
  const hasLine = Boolean(lineNumber && !lineNumber.startsWith("pending:"));
  const lineRegistered = contact.company.messagingRegistration?.status === "ACTIVE";
  const textsReady = Boolean(contact.company.smsAcknowledgedAt) && hasLine && lineRegistered;
  // Calls from the business number (lib/voice.ts): every Call control on the
  // page dials from the line once it is on the voice app (components/CallLink.tsx
  // reads the layout's flag); this only decides whether the Recent-calls card shows.
  const canCallFromLine = Boolean(contact.company.lineVoiceAppAt && contact.phone);
  const textsSetupHint = !hasLine
    ? "Set up a business line in Settings → Phone & texting to start texting clients"
    : !lineRegistered
      ? "Texting registration is still with the carriers — reminders switch to text once it clears"
      : "Turn on text notifications in Settings → Phone & texting to start texting clients";

  const backTo =
    contact.kind === "CONTACT" ? "/app/contacts?status=CONTACTS" : contact.status === "LEAD" ? "/app/leads" : "/app/contacts";

  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const backLabel = contact.kind === "CONTACT" ? "Contacts" : contact.status === "LEAD" ? "Leads" : "Clients";

  // Status chips: phone row and the desktop title share them
  const chips = (
    <>
        <ContactStatus status={contact.status} kind={contact.kind} />
        {isRepeat && contact.pipelineStageId && (
          <span className="ds-chip ds-chip-primary" title="Has worked with you before">
            Repeat
          </span>
        )}
        {contact.phone && (
          <span
            className={`ds-chip ${
              contact.smsOptOut
                ? "ds-chip-bad"
                : contact.smsDisabled || !textsReady
                  ? "ds-chip-neutral"
                  : "ds-chip-good"
            }`}
            title={
              contact.smsOptOut
                ? "Replied STOP — automated texts are off until they reply START"
                : contact.smsDisabled
                  ? contact.smsConsentSource === "booking_declined"
                    ? "Left the text box unchecked when they booked — edit the client to turn texts on"
                    : "Texts switched off for this client — edit the client to turn them on"
                  : !textsReady
                    ? textsSetupHint
                    : `Reminders and links go out by text${contact.smsConsentNote ? ` · ${contact.smsConsentNote}` : ""}`
            }
          >
            {contact.smsOptOut
              ? "Texts: opted out"
              : contact.smsDisabled
                ? "Texts: off"
                : !textsReady
                  ? hasLine && !lineRegistered
                    ? "Texts: pending"
                    : "Texts: not set up"
                  : "Texts: on"}
          </span>
        )}
        {contact.remindersOff && (
          <span className="ds-chip ds-chip-neutral" title="Visit and appointment reminders are off for this client: edit the client to turn them on">
            Reminders: off
          </span>
        )}
    </>
  );

  // The page's actions — one row on phones (below the head card), the right
  // side of the header at a desk. Two instances, one per width (menus only
  // listen while open, so the hidden copy is inert).
  const phoneActions = (desk: boolean) => (
    <>
          {/* Message = the WorkBench conversation: texts from the business line
              once texting is on (client portal + email otherwise), replies in
              the inbox. The Text button beside it is the phone's own Messages
              app from the tech's number. Phones get the 52px circles instead. */}
          {desk && (
          <Link
            prefetch={false}
            href={`/app/messages/thread/${contact.id}`}
            className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold rounded-[10px] transition-colors"
            title={
              textsReady && !contact.smsOptOut && !contact.smsDisabled
                ? `Text ${contact.firstName} from ${fmtPhone(lineNumber!)} — replies land in Messages`
                : `Message ${contact.firstName} — reaches their client portal and email; texts once texting is on`
            }
          >
            <MessageCircle size={14} />
            Message
          </Link>
          )}
          {desk && contact.phone && (
            <div className="flex items-center gap-2">
              <CallTextButtons phone={contact.phone} contactId={contact.id} name={fullName} />
            </div>
          )}
          {contact.email && (
            <EmailClientButton
              contactId={contact.id}
              contactName={fullName}
              contactEmail={contact.email}
              signature={emailSignature}
              hasLogo={!!contact.company.logoUrl}
            />
          )}
          <Link
            prefetch={false} href={`/app/contacts/${contact.id}/edit`}
            className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold rounded-[10px] transition-colors"
          >
            <Pencil size={14} />
            Edit
          </Link>
          <RunAutomationMenu entity="contact" entityId={contact.id} manager={isManager(actor.role)} />
          <ContactActionsMenu
            contactId={contact.id}
            contactName={fullName}
            status={contact.status}
            canDelete={isManager(actor.role)}
            counts={{
              requests: contact.requests.length,
              appointments: contact.appointments.length,
              quotes: contact.quotes.length,
              jobs: contact.jobs.length,
              invoices: contact.invoices.length,
              payments: contact.payments.length,
            }}
          />
          <ContactCreateMenu contactId={contact.id} canSeeMoney={canSeeMoney(actor)} />
    </>
  );

  // Desk (2026-11-24, David: simplify the client page): ONE primary action
  // (Create), the rest in the "…" menu — Message, Send an email (the page's
  // EmailClientButton listens for it), Edit, Archive, Delete. Call/text/email
  // are the links in the context line under the name. Run automation shows
  // only for managers who have runnable rules.
  const actions = (desk: boolean) =>
    desk ? (
      <>
        <RunAutomationMenu entity="contact" entityId={contact.id} manager={isManager(actor.role)} />
        {contact.email && (
          <EmailClientButton
            listenOnly
            contactId={contact.id}
            contactName={fullName}
            contactEmail={contact.email}
            signature={emailSignature}
            hasLogo={!!contact.company.logoUrl}
          />
        )}
        <ContactActionsMenu
          contactId={contact.id}
          contactName={fullName}
          status={contact.status}
          canDelete={isManager(actor.role)}
          messageHref={`/app/messages/thread/${contact.id}`}
          canEmail={!!contact.email}
          counts={{
            requests: contact.requests.length,
            appointments: contact.appointments.length,
            quotes: contact.quotes.length,
            jobs: contact.jobs.length,
            invoices: contact.invoices.length,
            payments: contact.payments.length,
          }}
        />
        <ContactCreateMenu contactId={contact.id} canSeeMoney={canSeeMoney(actor)} />
      </>
    ) : (
      phoneActions(false)
    );

  // The desk's facts: one clickable line under the name, and the summary strip
  const fullAddress = [contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(", ");
  const deskFacts = [
    contact.companyName ? <span key="co">{contact.companyName}</span> : null,
    contact.phone ? (
      <CallLink key="ph" phone={contact.phone} contactId={contact.id} name={fullName} className="cp-ctx-link">
        {fmtPhone(contact.phone)}
      </CallLink>
    ) : null,
    contact.email ? (
      <a key="em" href={`mailto:${contact.email}`} className="cp-ctx-link">
        {contact.email}
      </a>
    ) : null,
    fullAddress ? (
      <a key="ad" href={mapsSearchHref(fullAddress)} target="_blank" rel="noopener noreferrer" className="cp-ctx-link">
        {fullAddress}
      </a>
    ) : null,
  ].filter(Boolean);
  const nowMs = Date.now();
  const lastJob = contact.jobs
    .map((j) => j.completedAt ?? (j.scheduledAt && j.scheduledAt.getTime() < nowMs ? j.scheduledAt : null))
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const nextVisit = [
    ...contact.jobs.filter((j) => j.status === "ACTIVE" && j.scheduledAt && j.scheduledAt.getTime() >= nowMs).map((j) => j.scheduledAt as Date),
    ...contact.appointments.filter((a) => a.status === "SCHEDULED" && a.scheduledAt.getTime() >= nowMs).map((a) => a.scheduledAt),
  ].sort((a, b) => a.getTime() - b.getTime())[0];

  // Open page (2026-11-24): at a desk the page's own header — crumbs, the
  // monogram + name (title wipe kept), the chips, a context line, actions.
  // Phones keep the head card and action row exactly as before.
  const header = (
    <>
      {/* the collapsed-header title, once for both widths */}
      <TitleSentinel title={fullName} />
      <div className="ds-pagehead cp-head hidden lg:flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ds-eyebrow ds-eyebrow-plain bb-crumbs">
            <Link prefetch={false} href={backTo} className="hover:text-[color:var(--ds-primary)]">
              ← {backLabel}
            </Link>
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-3">
            <span className="ds-client-mono">
              <Monogram name={fullName} size={40} />
            </span>
            <h1 className="ds-title flex min-w-0 items-center gap-2">
              <span className="ds-wipe min-w-0">
                <span className="ds-wipe-text truncate">{fullName}</span>
                <span className="ds-wipe-bar" aria-hidden />
              </span>
            </h1>
            <span className="flex flex-wrap items-center gap-1.5">{chips}</span>
          </div>
          {deskFacts.length > 0 && (
            <div className="cp-context">
              {deskFacts.map((n, i) => (
                <Fragment key={i}>
                  {i > 0 && (
                    <span aria-hidden className="cp-ctx-dot">
                      ·
                    </span>
                  )}
                  {n}
                </Fragment>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">{actions(true)}</div>
      </div>

      {/* ─── Phone (unchanged) ─── */}
      <div className="flex flex-wrap items-center gap-3 mb-4 lg:hidden">
        {/* A lead's list is the Leads board, not Clients (David 2026-10-06) */}
        <BackLink href={backTo} />
        {contact.status === "LEAD" && <BackParent to="/app/leads" />}
        {chips}
      </div>

      {/* Heavy look (2026-11-21): who the client is and how to reach them,
          on the page; what they're worth / owe as two number cards. */}
      <section className="ds-client-head ds-rise mb-5 lg:hidden" style={{ "--ds-i": 1 } as React.CSSProperties}>
        <div className="flex min-w-0 items-start gap-4">
          <span className="ds-client-mono">
            <Monogram name={`${contact.firstName} ${contact.lastName}`.trim()} size={60} />
          </span>
          <div className="min-w-0">
          <PageTitle heavy>
            <>{fullName}</>
          </PageTitle>
          {contact.companyName && (
            <p className="mt-0.5 text-[15px] font-semibold opacity-85">{contact.companyName}</p>
          )}
          <div className="ds-client-facts mt-3">
            {contact.phone && (
              <CallLink
                phone={contact.phone}
                contactId={contact.id}
                name={`${contact.firstName} ${contact.lastName}`.trim()}
                className="flex items-center gap-1.5 hover:underline"
              >
                <Phone size={14} />
                {fmtPhone(contact.phone)}
              </CallLink>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-1.5 hover:underline"
              >
                <Mail size={14} />
                {contact.email}
              </a>
            )}
            {contact.address && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {[contact.address, contact.city, contact.state, contact.zip]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
          </div>
          </div>
        </div>
        {seeMoney && (
          <div className="ds-client-stats">
            <StatCard i={2} tone="good" label="Lifetime value" value={money(lifetimeValue)} sub="Paid, all time" />
            <StatCard
              i={3}
              tone={currentBalance > 0 ? "bad" : "neutral"}
              label="Balance owed"
              value={money(currentBalance)}
              sub={currentBalance > 0 ? "Open invoices" : "All paid up"}
            />
          </div>
        )}
      </section>

      <div className="mb-6 flex flex-wrap items-center justify-end gap-2 lg:hidden">{actions(false)}</div>
    </>
  );

  // Work tabs (desk): All / Quotes / Jobs / Invoices with counts, via ?work=
  const workTabs = [
    { value: "", label: "All", n: workRows.length },
    { value: "quotes", label: "Quotes", n: workRows.filter((r) => r.kind === "quote").length },
    { value: "jobs", label: "Jobs", n: workRows.filter((r) => r.kind === "job").length },
    ...(seeMoney ? [{ value: "invoices", label: "Invoices", n: workRows.filter((r) => r.kind === "invoice").length }] : []),
  ];
  const workTab = workTabs.some((t) => t.value === workTabRaw) ? (workTabRaw as string) : "";
  const workKind = workTab === "quotes" ? "quote" : workTab === "jobs" ? "job" : workTab === "invoices" ? "invoice" : null;
  const deskWorkRows = workKind ? workRows.filter((r) => r.kind === workKind) : workRows;

  const workTable = (
    <div id="work" className="hidden scroll-mt-24 lg:block">
    <OpenSection
      title="Work"
      aside={
        workRows.length > 0 ? (
          <nav className="clx-tabs cp-work-tabs" aria-label="Show">
            {workTabs.map((t) => (
              <Link
                prefetch={false}
                key={t.value || "all"}
                href={t.value ? `?work=${t.value}#work` : "?#work"}
                scroll={false}
                className={`clx-tab ${workTab === t.value ? "is-on" : ""}`}
                aria-current={workTab === t.value ? "page" : undefined}
              >
                {t.label}
                <span className="clx-tab-n">{t.n}</span>
              </Link>
            ))}
          </nav>
        ) : undefined
      }
    >
      {deskWorkRows.length === 0 ? (
        <p className="ds-small py-6">
          {workRows.length === 0 ? "No work yet — use Create to add a request, quote, or job." : "Nothing here yet."}
        </p>
      ) : (
        <table className="bb-table">
          <thead>
            <tr>
              <th style={{ width: 104 }}>Type</th>
              <th>Item</th>
              <th style={{ width: 118 }}>Date</th>
              <th style={{ width: 150 }}>Status</th>
              <th className="r" style={{ width: 110 }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {deskWorkRows.map((row) => (
              <tr key={row.key}>
                <td className="text-[13px] font-medium text-[color:var(--ds-muted)]">{row.type}</td>
                <td className="max-w-0">
                  <Link prefetch={false} href={row.href} className="block truncate">
                    <span className="bb-name bb-strong">{row.label}</span>
                  </Link>
                </td>
                <td className="text-[color:var(--ds-ink-2)]">{shortDate(row.date, tz)}</td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <StatusChip kind={row.kind} status={row.status} />
                    {row.viewed && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-faint)]" title="Client opened this document">
                        <Eye size={11} />
                        {shortDate(row.viewed, tz)}
                      </span>
                    )}
                  </span>
                </td>
                <td className="r ds-num bb-strong">{row.amount !== null ? money(row.amount) : <span className="text-[color:var(--ds-faint)]">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </OpenSection>
    </div>
  );

  // Desk summary strip: what they owe, what they've paid, and the facts
  const summary = (
    <div className="cp-sum hidden lg:flex">
      {seeMoney && (
        <Link prefetch={false} href="?work=invoices#work" className="cp-sum-lead">
          <span className="bb-label">Balance owed</span>
          <span className={`bb-big ${currentBalance > 0 ? "cp-owed" : ""}`}>{money(currentBalance)}</span>
          <span className="ds-small">{currentBalance > 0 ? "Open invoices" : "All paid up"}</span>
        </Link>
      )}
      {seeMoney && (
        <div className="cp-sum-kv">
          <span className="bb-label">Lifetime value</span>
          <span className="cp-sum-v">{money(lifetimeValue)}</span>
          <span className="ds-small">
            {contact.status === "LEAD" ? "Lead" : contact.kind === "CONTACT" ? "Contact" : "Client"} since {shortDate(contact.createdAt, tz)}
          </span>
        </div>
      )}
      <div className="cp-sum-kv">
        <span className="bb-label">Last job</span>
        <span className={lastJob ? "cp-sum-v" : "cp-sum-v cp-sum-none"}>{lastJob ? shortDate(lastJob, tz) : "None yet"}</span>
      </div>
      <div className="cp-sum-kv">
        <span className="bb-label">Next visit</span>
        <span className={nextVisit ? "cp-sum-v" : "cp-sum-v cp-sum-none"}>{nextVisit ? shortDate(nextVisit, tz) : "Nothing booked"}</span>
      </div>
    </div>
  );

  return (
    <DsPage open header={header} className="cp-page">
      {/* Phone quick actions — the contact-card circle treatment (lg:hidden
          inside the component) */}
      <JobActionRow
        phone={contact.phone}
        messageHref={`/app/messages/thread/${contact.id}`}
        contactId={contact.id}
        name={`${contact.firstName} ${contact.lastName}`.trim()}
        address={
          [contact.address, contact.city, contact.state, contact.zip]
            .filter(Boolean)
            .join(", ") || null
        }
      />

      {summary}

      <div className="cp-body grid lg:grid-cols-3 gap-6">
        {/* Main: work overview */}
        <div className="lg:col-span-2 space-y-4">
          {workTable}
          <div className="ds-card ds-card-raised overflow-hidden lg:hidden">
            <div className="flex items-baseline justify-between px-4 pt-4 pb-3 lg:px-5">
              <h2 className="ds-heavy-h2">Work</h2>
              {workRows.length > 0 && <span className="text-[13px] font-semibold text-[color:var(--ds-muted)]">{workRows.length} {workRows.length === 1 ? "item" : "items"}</span>}
            </div>
            {workRows.length === 0 ? (
              <p className="px-4 py-10 text-sm text-gray-400 text-center">
                No work yet — use Create to add a request, quote, or job.
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                <div className="hidden lg:grid grid-cols-[90px_1fr_110px_140px_90px_30px] gap-3 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                  <span>Item</span>
                  <span></span>
                  <span>Date</span>
                  <span>Status</span>
                  <span className="text-right">Amount</span>
                  <span></span>
                </div>
                {workRows.map((row) => (
                  <Link
                    key={row.key}
                    href={row.href}
                    className="block px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors lg:grid lg:grid-cols-[90px_1fr_110px_140px_90px_30px] lg:items-center lg:gap-3"
                  >
                    {/* Phones: name + amount on the first line, then a quiet
                        "Type · date" meta line with the status pill. */}
                    <span className="hidden text-xs font-semibold text-gray-500 lg:block">
                      {row.type}
                    </span>
                    <span className="flex items-baseline justify-between gap-3 lg:block lg:min-w-0">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-900 lg:block lg:truncate">
                        {row.label}
                      </span>
                      {row.amount !== null && (
                        <span className="numeral-ledger shrink-0 text-sm font-semibold text-gray-900 lg:hidden">
                          {money(row.amount)}
                        </span>
                      )}
                    </span>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {shortDate(row.date, tz)}
                    </span>
                    <span className="mt-1 flex items-center gap-2 lg:mt-0 lg:flex-col lg:items-start lg:gap-0.5">
                      <span className="text-xs text-gray-500 lg:hidden">
                        {row.type} · {shortDate(row.date, tz)}
                      </span>
                      <StatusChip kind={row.kind} status={row.status} />
                      {row.viewed && (
                        <span
                          className="hidden lg:inline-flex items-center gap-1 text-[10px] text-gray-400"
                          title="Client opened this document"
                        >
                          <Eye size={10} />
                          Seen {shortDate(row.viewed, tz)}
                        </span>
                      )}
                    </span>
                    <span className="hidden text-sm font-semibold text-gray-900 lg:block lg:text-right">
                      {row.amount !== null ? money(row.amount) : "—"}
                    </span>
                    <ChevronRight size={13} className="text-gray-300 hidden lg:block" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Phones: who they are, their cards and addresses, as before. At a
              desk these sit in the right column (below). */}
          <div className="space-y-4 lg:hidden">
            {/* Contact info */}
            <div className="ds-card p-4">
              <SectionHeader title="Details" className="mb-3" />
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs">Payment terms</dt>
                  <dd className="text-gray-800">Net {contact.paymentTermsDays}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">Lead source</dt>
                  <dd className="text-gray-800">{contact.leadSource || "—"}</dd>
                  {arrivalLines(sanitizeArrival(contact.leadArrival)).map((l) => (
                    <dd key={l.label} className="truncate text-xs text-gray-500">
                      {l.label}: {l.value}
                    </dd>
                  ))}
                </div>
                {contact.notes && (
                  <div className="col-span-2">
                    <dt className="text-gray-500 text-xs">Notes</dt>
                    <dd className="text-gray-700 whitespace-pre-wrap">{contact.notes}</dd>
                  </div>
                )}
              </dl>
              {canSeeMoney(actor) && (
                <PdfLink
                  href={`/api/app/contacts/${contact.id}/statement-pdf`}
                  className="mt-3 inline-block text-xs font-medium text-[color:var(--ds-primary)] hover:underline" fallbackName="statement.pdf">
                  Download statement (PDF)
                </PdfLink>
              )}
            </div>

            {canSeeMoney(actor) && (
              <SavedCardsCard
                contactId={contact.id}
                cards={contact.savedCards}
                canManage={isManager(actor.role)}
                pay={clientPayConfig(contact.company)}
              />
            )}

            <AddressesCard
              contactId={contact.id}
              primary={
                [contact.address, contact.city, contact.state, contact.zip]
                  .filter(Boolean)
                  .join(", ") || null
              }
              addresses={contact.addresses.map((a) => ({
                id: a.id,
                label: a.label,
                address: a.address,
                city: a.city,
                state: a.state,
                zip: a.zip,
              }))}
              history={Object.fromEntries(
                contact.addresses.map((a) => [
                  a.id,
                  [
                    ...contact.jobs
                      .filter((j) => j.propertyId === a.id)
                      .map((j) => ({
                        key: `j-${j.id}`,
                        kind: "Job",
                        title: j.title,
                        href: `/app/jobs/${j.id}`,
                        date: (j.scheduledAt ?? j.createdAt).toISOString(),
                      })),
                    ...contact.quotes
                      .filter((q) => q.propertyId === a.id)
                      .map((q) => ({
                        key: `q-${q.id}`,
                        kind: "Quote",
                        title: q.title || `Quote #${q.quoteNumber}`,
                        href: `/app/quotes/${q.id}`,
                        date: q.createdAt.toISOString(),
                      })),
                    ...contact.appointments
                      .filter((ap) => ap.propertyId === a.id)
                      .map((ap) => ({
                        key: `a-${ap.id}`,
                        kind: "Appointment",
                        title: ap.title,
                        href: `/app/appointments/${ap.id}`,
                        date: ap.scheduledAt.toISOString(),
                      })),
                  ].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")),
                ])
              )}
            />

            <PeopleCard
              contactId={contact.id}
              primaryName={`${contact.firstName} ${contact.lastName}`.trim()}
              primaryRole={contact.companyName}
              people={contact.people.map((p) => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                role: p.role,
                email: p.email,
                phone: p.phone,
                notes: p.notes,
              }))}
            />

          </div>

          {/* Notes & activity (same pattern as job notes) */}
          <div className="ds-card">
            <div className="px-5 py-4 border-b border-gray-100">
              <SectionHeader title="Notes & Activity" />
            </div>
            <div className="p-4 space-y-3">
              {contact.contactNotes.map((note) => (
                <ContactNoteItem
                  key={note.id}
                  contactId={contact.id}
                  note={{
                    id: note.id,
                    body: note.body,
                    userName: note.user.name,
                    createdAtLabel: note.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: tz,
                    }),
                  }}
                  canEdit={note.userId === actor.id}
                  canDelete={note.userId === actor.id || isManager(actor.role)}
                />
              ))}
              <ContactNoteForm contactId={contact.id} />
            </div>
          </div>
        </div>

        {/* Rail: overview + hub link (flex + gap: hidden/empty items take no space) */}
        <div className="flex flex-col gap-4">
          {/* Desk (2026-11-24): the inspector, quieter — contact, addresses, cards
              on file, portal, fields, stage, owner, calls, then the account details.
              lg:order-* sets the desk order; phones keep the old order. */}
          <div className="hidden lg:order-1 lg:block cp-desk">
            <PeopleCard
              contactId={contact.id}
              primaryName={`${contact.firstName} ${contact.lastName}`.trim()}
              primaryRole={contact.companyName}
              people={contact.people.map((p) => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                role: p.role,
                email: p.email,
                phone: p.phone,
                notes: p.notes,
              }))}
            />

          </div>
          <div className="hidden lg:order-2 lg:block cp-desk">
            <AddressesCard
              contactId={contact.id}
              primary={
                [contact.address, contact.city, contact.state, contact.zip]
                  .filter(Boolean)
                  .join(", ") || null
              }
              addresses={contact.addresses.map((a) => ({
                id: a.id,
                label: a.label,
                address: a.address,
                city: a.city,
                state: a.state,
                zip: a.zip,
              }))}
              history={Object.fromEntries(
                contact.addresses.map((a) => [
                  a.id,
                  [
                    ...contact.jobs
                      .filter((j) => j.propertyId === a.id)
                      .map((j) => ({
                        key: `j-${j.id}`,
                        kind: "Job",
                        title: j.title,
                        href: `/app/jobs/${j.id}`,
                        date: (j.scheduledAt ?? j.createdAt).toISOString(),
                      })),
                    ...contact.quotes
                      .filter((q) => q.propertyId === a.id)
                      .map((q) => ({
                        key: `q-${q.id}`,
                        kind: "Quote",
                        title: q.title || `Quote #${q.quoteNumber}`,
                        href: `/app/quotes/${q.id}`,
                        date: q.createdAt.toISOString(),
                      })),
                    ...contact.appointments
                      .filter((ap) => ap.propertyId === a.id)
                      .map((ap) => ({
                        key: `a-${ap.id}`,
                        kind: "Appointment",
                        title: ap.title,
                        href: `/app/appointments/${ap.id}`,
                        date: ap.scheduledAt.toISOString(),
                      })),
                  ].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")),
                ])
              )}
            />

          </div>
          <div className="hidden lg:order-3 lg:block cp-desk">
            {canSeeMoney(actor) && (
              <SavedCardsCard
                contactId={contact.id}
                cards={contact.savedCards}
                canManage={isManager(actor.role)}
                pay={clientPayConfig(contact.company)}
              />
            )}

          </div>
          <div className="hidden lg:order-9 lg:block cp-desk">
            {/* Contact info */}
            <div className="ds-card p-4">
              <SectionHeader title="Details" className="mb-3" />
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs">Payment terms</dt>
                  <dd className="text-gray-800">Net {contact.paymentTermsDays}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">Lead source</dt>
                  <dd className="text-gray-800">{contact.leadSource || "—"}</dd>
                  {arrivalLines(sanitizeArrival(contact.leadArrival)).map((l) => (
                    <dd key={l.label} className="truncate text-xs text-gray-500">
                      {l.label}: {l.value}
                    </dd>
                  ))}
                </div>
                {contact.notes && (
                  <div className="col-span-2">
                    <dt className="text-gray-500 text-xs">Notes</dt>
                    <dd className="text-gray-700 whitespace-pre-wrap">{contact.notes}</dd>
                  </div>
                )}
              </dl>
              {canSeeMoney(actor) && (
                <PdfLink
                  href={`/api/app/contacts/${contact.id}/statement-pdf`}
                  className="mt-3 inline-block text-xs font-medium text-[color:var(--ds-primary)] hover:underline" fallbackName="statement.pdf">
                  Download statement (PDF)
                </PdfLink>
              )}
            </div>

          </div>
          <div className="lg:order-6">
            {contact.pipelineStageId && pipelineStages.length > 0 && (
              <PipelineCard
                contactId={contact.id}
                contactName={`${contact.firstName} ${contact.lastName}`.trim()}
                stages={pipelineStages}
                currentStageId={contact.pipelineStageId}
                daysInStage={Math.floor(
                  (Date.now() - (contact.stageChangedAt ?? contact.createdAt).getTime()) / 86400000
                )}
                isLead={contact.status === "LEAD"}
              />
            )}
          </div>
          <div className="lg:order-7">
            <div className="ds-card p-4">
              <SectionHeader title="Assigned to" className="mb-2" />
              {canReassign ? (
                <AssignLead
                  contactId={contact.id}
                  assignedToId={contact.assignedTo?.id ?? ""}
                  users={teamUsers}
                />
              ) : (
                <p className="text-sm text-gray-800">{contact.assignedTo?.name ?? "Unassigned"}</p>
              )}
            </div>
          </div>

          <div className="lg:order-5">
            <CustomFieldsCard
              contactId={contact.id}
              defs={fieldDefs}
              values={(contact.customFields as Record<string, string>) ?? {}}
            />
          </div>


          <div className="lg:order-8">
            {(recentCalls.length > 0 || canCallFromLine) && (
              <div className="ds-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionHeader title="Recent calls" />
                  {recentCalls.length > 0 && (
                    <Link href={`/app/calls?contact=${contact.id}`} className="text-xs text-gray-500 underline hover:text-gray-700">
                      All
                    </Link>
                  )}
                </div>
                {recentCalls.length === 0 ? (
                  <p className="text-xs text-gray-500">No calls on your business line with this client yet — the Call button above dials from it.</p>
                ) : (
                  <div className="ds-card divide-y divide-gray-100 overflow-hidden">
                    {recentCalls.map((c) => (
                      <CallRow key={c.id} call={c} showContact={false} tz={contact.company.timezone} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:order-4">
            <PortalAccessCard
              contactId={contact.id}
              hubUrl={hubUrl}
              portalLoginUrl={`${baseUrl}/portal/${contact.company.slug}`}
              hasEmail={!!contact.email}
              lastVisitLabel={contact.hubLastVisitAt ? shortDate(contact.hubLastVisitAt, tz) : null}
              canReset={isManager(actor.role)}
            />
          </div>
        </div>
      </div>
    </DsPage>
  );
}
