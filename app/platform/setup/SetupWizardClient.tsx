"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CalendarClock,
  ExternalLink,
  FileSignature,
  Globe,
  ListChecks,
  Loader2,
  MapPin,
  RefreshCcw,
  Sparkles,
  Upload,
  Users,
  Wand2,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { INDUSTRIES } from "@/lib/pricebooks";
import { DAY_KEYS, DAY_LABELS, type BusinessHours, type DayKey } from "@/lib/business-hours";
import type { DraftNewService, DraftQuestion, SetupDraft } from "@/lib/setup-wizard";

/**
 * Setup assistant flow: intake → generating → review (everything editable,
 * nothing saved) → apply → next-steps checklist. AI drafts, the owner
 * decides — the Apply button is the only thing that writes.
 */

const TEAM_SIZES = ["Just me", "2–5 people", "6–10 people", "11+ people"];

const RADIUS_OPTIONS = [
  { value: "my-city", label: "Just my city" },
  { value: "15mi", label: "About 15 miles out" },
  { value: "30mi", label: "About 30 miles out" },
  { value: "50mi", label: "50+ miles out" },
];

const DURATION_OPTIONS = [
  { value: "", label: "Not bookable" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "360", label: "6 hours" },
  { value: "480", label: "8 hours" },
];

const WINDOW_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
];

const GENERATING_LINES = [
  "Looking at how businesses like yours price their work...",
  "Mapping your service area...",
  "Drafting business hours that fit your trade...",
  "Writing your service agreement...",
  "Picking the questions pros in your trade ask up front...",
];

const inputCls =
  "px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const smallInputCls =
  "px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

type Step = "intake" | "generating" | "review" | "done";

type EditExisting = {
  workItemId: string;
  name: string;
  price: string;
  durationMinutes: number | null;
};
type EditNew = DraftNewService & { include: boolean; priceText: string };
type EditQuestion = DraftQuestion & { include: boolean };

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-ledger p-5">
      <div className="mb-4 flex items-start gap-3">
        <Icon size={18} className="mt-0.5 shrink-0 text-gray-400" />
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function QuestionList({
  items,
  onChange,
}: {
  items: EditQuestion[];
  onChange: (next: EditQuestion[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((q, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            checked={q.include}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))
            }
            className="accent-green-600"
          />
          <input
            type="text"
            value={q.label}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
            className={`${smallInputCls} w-64 ${q.include ? "" : "opacity-50"}`}
          />
          {q.type === "select" && (
            <span className={`text-xs text-gray-400 ${q.include ? "" : "opacity-50"}`}>
              choices: {q.options.join(" · ")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SetupWizardClient({
  companyName,
  companySlug,
  currentTimezone,
  serviceCount,
  bookableCount,
  prefill,
}: {
  companyName: string;
  companySlug: string;
  currentTimezone: string;
  serviceCount: number;
  bookableCount: number;
  prefill: { industry: string; city: string; state: string; teamSize: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intake");
  const [error, setError] = useState("");

  // ── intake ──
  const knownIndustry = (INDUSTRIES as readonly string[]).includes(prefill.industry);
  const [industry, setIndustry] = useState(knownIndustry ? prefill.industry : prefill.industry ? "Other" : "");
  const [industryOther, setIndustryOther] = useState(knownIndustry ? "" : prefill.industry);
  const [city, setCity] = useState(prefill.city);
  const [stateCode, setStateCode] = useState(prefill.state);
  const [radius, setRadius] = useState("15mi");
  const [teamSize, setTeamSize] = useState(prefill.teamSize);
  const [description, setDescription] = useState("");

  // ── generating ──
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    if (step !== "generating") return;
    const t = setInterval(() => setLineIdx((i) => (i + 1) % GENERATING_LINES.length), 2600);
    return () => clearInterval(t);
  }, [step]);

  // ── review (draft, all editable) ──
  const [source, setSource] = useState<SetupDraft["source"]>("ai");
  const [timezone, setTimezone] = useState<string | null>(null);
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [windowMinutes, setWindowMinutes] = useState(120);
  const [zipsText, setZipsText] = useState("");
  const [existing, setExisting] = useState<EditExisting[]>([]);
  const [news, setNews] = useState<EditNew[]>([]);
  const [contractInclude, setContractInclude] = useState(true);
  const [contractName, setContractName] = useState("");
  const [contractBody, setContractBody] = useState("");
  const [contractOpen, setContractOpen] = useState(false);
  const [intakeQs, setIntakeQs] = useState<EditQuestion[]>([]);
  const [clientFs, setClientFs] = useState<EditQuestion[]>([]);
  const [enableSelfSchedule, setEnableSelfSchedule] = useState(true);
  const [recurringIdeas, setRecurringIdeas] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  const effectiveIndustry = industry === "Other" ? industryOther.trim() : industry;

  async function generate() {
    setError("");
    setStep("generating");
    const { ok, data } = await postJson<{ draft: SetupDraft }>("/api/app/setup/generate", {
      industry: effectiveIndustry,
      city: city.trim(),
      state: stateCode.trim(),
      radius,
      teamSize,
      description: description.trim(),
    });
    if (!ok || !data?.draft) {
      setStep("intake");
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    const d = data.draft;
    setSource(d.source);
    setTimezone(d.timezone);
    setHours(d.businessHours);
    setWindowMinutes(d.arrivalWindowMinutes);
    setZipsText(d.serviceZips.join(", "));
    setExisting(
      d.existingServices.map((s) => ({
        workItemId: s.workItemId,
        name: s.name,
        price: String(s.price),
        durationMinutes: s.durationMinutes,
      }))
    );
    setNews(d.newServices.map((s) => ({ ...s, include: true, priceText: String(s.price) })));
    setContractInclude(true);
    setContractName(d.contract.name);
    setContractBody(d.contract.body);
    setIntakeQs(d.intakeQuestions.map((q) => ({ ...q, include: true })));
    setClientFs(d.clientFields.map((q) => ({ ...q, include: true })));
    setRecurringIdeas(d.recurringPlanIdeas);
    const anyDuration =
      d.existingServices.some((s) => s.durationMinutes) ||
      d.newServices.some((s) => s.durationMinutes);
    const anyHours = Object.values(d.businessHours).some((r) => r.length > 0);
    setEnableSelfSchedule(anyDuration && anyHours);
    setStep("review");
  }

  const bookableDraftCount = useMemo(
    () =>
      existing.filter((s) => s.durationMinutes).length +
      news.filter((s) => s.include && s.durationMinutes).length,
    [existing, news]
  );

  async function apply() {
    if (!hours) return;
    setApplying(true);
    setError("");
    const { ok, data } = await postJson("/api/app/setup/apply", {
      industry: effectiveIndustry,
      city: city.trim(),
      state: stateCode.trim(),
      teamSize,
      timezone,
      businessHours: hours,
      arrivalWindowMinutes: windowMinutes,
      serviceZips: zipsText
        .split(/[\s,;]+/)
        .map((z) => z.trim())
        .filter(Boolean),
      existingServices: existing.map((s) => ({
        workItemId: s.workItemId,
        price: Number(s.price),
        durationMinutes: s.durationMinutes,
      })),
      newServices: news
        .filter((s) => s.include && s.name.trim())
        .map((s) => ({
          name: s.name,
          description: s.description,
          price: Number(s.priceText),
          cost: s.cost,
          durationMinutes: s.durationMinutes,
          priceDisplay: s.priceDisplay,
        })),
      contract: contractInclude && contractBody.trim() ? { name: contractName, body: contractBody } : null,
      intakeQuestions: intakeQs.filter((q) => q.include && q.label.trim()),
      clientFields: clientFs.filter((q) => q.include && q.label.trim()),
      enableSelfSchedule,
    });
    setApplying(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setStep("done");
    router.refresh();
  }

  // ─── Intake ────────────────────────────────────────────────────────────────
  if (step === "intake") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <Wand2 size={20} className="text-green-600" />
            <h1 className="text-xl font-semibold text-gray-900">Set up your business</h1>
          </div>
          <p className="text-sm text-gray-600">
            Answer a few questions and we&apos;ll draft your{" "}
            {serviceCount > 0 ? "service durations, " : "price list, "}
            business hours, service area, contract, and booking form — you review and edit
            everything before it&apos;s saved.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">What do you do?</label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={`${inputCls} w-full`}>
              <option value="">Pick your trade...</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            {industry === "Other" && (
              <input
                type="text"
                value={industryOther}
                onChange={(e) => setIndustryOther(e.target.value)}
                placeholder="e.g. Chimney sweeping, Holiday lighting..."
                className={`${inputCls} mt-2 w-full`}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Allen" className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
              <input type="text" value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="TX" maxLength={20} className={`${inputCls} w-full`} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">How far do you travel for work?</label>
            <select value={radius} onChange={(e) => setRadius(e.target.value)} className={`${inputCls} w-full`}>
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Team size</label>
            <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className={`${inputCls} w-full`}>
              <option value="">Select...</option>
              {TEAM_SIZES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Anything else about your business? <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="e.g. Residential only, we specialize in soft washing and never use high pressure on siding."
              className={`${inputCls} w-full`}
            />
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={!effectiveIndustry || !city.trim()}
            className="flex w-full items-center justify-center gap-2 rounded bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50"
          >
            <Sparkles size={15} />
            Draft my setup
          </button>
          <p className="text-center text-xs text-gray-400">
            Nothing is saved until you review and approve the draft.
          </p>
        </div>
      </div>
    );
  }

  // ─── Generating ────────────────────────────────────────────────────────────
  if (step === "generating") {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center py-24 text-center">
        <Loader2 size={32} className="mb-4 animate-spin text-green-600" />
        <p className="text-sm font-semibold text-gray-900">Drafting your setup...</p>
        <p className="mt-1 text-sm text-gray-500">{GENERATING_LINES[lineIdx]}</p>
      </div>
    );
  }

  // ─── Done / next steps ─────────────────────────────────────────────────────
  if (step === "done") {
    const steps = [
      {
        icon: ExternalLink,
        title: "See your booking page",
        body: "This is what your clients see — it's live right now.",
        href: `/book/${companySlug}`,
        external: true,
        linkLabel: "Open booking page",
      },
      {
        icon: Globe,
        title: "Put booking on your website",
        body: "Grab the copy-paste embed snippet from your form settings.",
        href: "/app/settings/booking",
        linkLabel: "Get the embed code",
      },
      ...(bookableCount === 0 && enableSelfSchedule
        ? [
            {
              icon: Users,
              title: "Mark someone bookable",
              body: "Online booking needs at least one bookable team member — that can be you.",
              href: "/app/settings/team",
              linkLabel: "Open Team settings",
            },
          ]
        : [
            {
              icon: Users,
              title: "Invite your team",
              body: "Add your crew and choose what each person can see and do.",
              href: "/app/settings/team",
              linkLabel: "Open Team settings",
            },
          ]),
      {
        icon: Upload,
        title: "Bring in your client list",
        body: "Import clients from a CSV — Jobber and Housecall Pro exports map automatically.",
        href: "/app/contacts",
        linkLabel: "Go to Clients",
      },
      ...(recurringIdeas.length > 0
        ? [
            {
              icon: RefreshCcw,
              title: "Set up recurring plans",
              body: `Businesses like yours often sell: ${recurringIdeas.join(" · ")}. Add a subscription when you land your first recurring client.`,
              href: "/app/subscriptions",
              linkLabel: "Open Subscriptions",
            },
          ]
        : []),
    ];
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check size={24} className="text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Your account is set up!</h1>
          <p className="mt-1 text-sm text-gray-600">
            Everything you approved is live. A few things worth doing next:
          </p>
        </div>
        <div className="space-y-3">
          {steps.map((s) => (
            <div key={s.title} className="card-ledger flex items-start gap-3 p-4">
              <s.icon size={17} className="mt-0.5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500">{s.body}</p>
              </div>
              <Link
                href={s.href}
                target={"external" in s && s.external ? "_blank" : undefined}
                className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-green-500 hover:text-green-700"
              >
                {s.linkLabel}
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/app/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline">
            Go to your dashboard <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  // ─── Review ────────────────────────────────────────────────────────────────
  if (!hours) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <Wand2 size={20} className="text-green-600" />
          <h1 className="text-xl font-semibold text-gray-900">Review your setup</h1>
        </div>
        <p className="text-sm text-gray-600">
          {source === "ai"
            ? "Here's the draft — edit anything, uncheck what you don't want, then apply."
            : "Our assistant is unavailable right now, so this is a standard starter draft for your trade — edit anything, then apply."}{" "}
          Nothing is saved until you click Apply.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Services */}
        <SectionCard
          icon={ListChecks}
          title={existing.length > 0 ? "Your services, made bookable" : "Your starter price list"}
          subtitle="Time on site is what powers online self-scheduling — leave it off for anything you'd rather quote first."
        >
          <div className="space-y-1.5">
            {existing.map((s, i) => (
              <div key={s.workItemId} className="flex flex-wrap items-center gap-2">
                <span className="w-56 truncate text-sm text-gray-800">{s.name}</span>
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  $
                  <input
                    type="number"
                    value={s.price}
                    min={0}
                    onChange={(e) =>
                      setExisting(existing.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                    }
                    className={`${smallInputCls} w-24`}
                  />
                </span>
                <select
                  value={s.durationMinutes ?? ""}
                  onChange={(e) =>
                    setExisting(
                      existing.map((x, j) =>
                        j === i ? { ...x, durationMinutes: e.target.value ? Number(e.target.value) : null } : x
                      )
                    )
                  }
                  className={smallInputCls}
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {news.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <label className="flex w-56 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.include}
                    onChange={(e) => setNews(news.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    className="accent-green-600"
                  />
                  <span className={`truncate text-sm text-gray-800 ${s.include ? "" : "opacity-50"}`} title={s.description}>
                    {s.name}
                  </span>
                  <span className="stamp shrink-0 border-green-600/30 bg-green-600/[0.06] text-[10px] text-green-700">New</span>
                </label>
                <span className={`flex items-center gap-1 text-sm text-gray-500 ${s.include ? "" : "opacity-50"}`}>
                  $
                  <input
                    type="number"
                    value={s.priceText}
                    min={0}
                    onChange={(e) => setNews(news.map((x, j) => (j === i ? { ...x, priceText: e.target.value } : x)))}
                    className={`${smallInputCls} w-24`}
                  />
                </span>
                <select
                  value={s.durationMinutes ?? ""}
                  onChange={(e) =>
                    setNews(
                      news.map((x, j) =>
                        j === i ? { ...x, durationMinutes: e.target.value ? Number(e.target.value) : null } : x
                      )
                    )
                  }
                  className={`${smallInputCls} ${s.include ? "" : "opacity-50"}`}
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Hours + arrival window */}
        <SectionCard
          icon={CalendarClock}
          title="Business hours"
          subtitle={`All times in ${(timezone ?? currentTimezone).replace(/_/g, " ")}${timezone && timezone !== currentTimezone ? " (updated from your city)" : ""}.`}
        >
          <div className="space-y-1.5">
            {DAY_KEYS.map((day: DayKey) => {
              const ranges = hours[day];
              const isOpen = ranges.length > 0;
              return (
                <div key={day} className="flex flex-wrap items-center gap-2">
                  <label className="flex w-28 cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={isOpen}
                      onChange={(e) =>
                        setHours({ ...hours, [day]: e.target.checked ? [{ start: "08:00", end: "17:00" }] : [] })
                      }
                      className="accent-green-600"
                    />
                    {DAY_LABELS[day]}
                  </label>
                  {isOpen ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={ranges[0].start}
                        onChange={(e) => setHours({ ...hours, [day]: [{ ...ranges[0], start: e.target.value }, ...ranges.slice(1)] })}
                        className={smallInputCls}
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="time"
                        value={ranges[0].end}
                        onChange={(e) => setHours({ ...hours, [day]: [{ ...ranges[0], end: e.target.value }, ...ranges.slice(1)] })}
                        className={smallInputCls}
                      />
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Arrival window</p>
              <p className="text-xs text-gray-500">What clients are promised — &quot;we&apos;ll arrive between 8:00 and 10:00&quot;.</p>
            </div>
            <select value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))} className={smallInputCls}>
              {WINDOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        {/* Service area */}
        <SectionCard
          icon={MapPin}
          title="Service area"
          subtitle="Bookings outside these ZIP codes are politely turned away. Double-check the list — leave it empty to accept any address."
        >
          <textarea
            value={zipsText}
            onChange={(e) => setZipsText(e.target.value)}
            rows={2}
            placeholder="75002, 75013, 75025..."
            className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </SectionCard>

        {/* Contract */}
        <SectionCard
          icon={FileSignature}
          title="Service agreement template"
          subtitle="A reusable contract your clients e-sign — attach it to services or send it with quotes."
        >
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={contractInclude} onChange={(e) => setContractInclude(e.target.checked)} className="accent-green-600" />
            Create this template
          </label>
          {contractInclude && (
            <div className="space-y-2">
              <input type="text" value={contractName} onChange={(e) => setContractName(e.target.value)} className={`${inputCls} w-full`} />
              {contractOpen ? (
                <textarea
                  value={contractBody}
                  onChange={(e) => setContractBody(e.target.value)}
                  rows={14}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              ) : (
                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <p className="line-clamp-3 whitespace-pre-line text-xs text-gray-600">{contractBody}</p>
                </div>
              )}
              <button type="button" onClick={() => setContractOpen((v) => !v)} className="text-xs font-semibold text-green-700 hover:underline">
                {contractOpen ? "Collapse" : "Read & edit the full text"}
              </button>
            </div>
          )}
        </SectionCard>

        {/* Booking form questions */}
        <SectionCard
          icon={ListChecks}
          title="Booking form questions"
          subtitle="Added to your booking form — the details pros in your trade ask about before quoting."
        >
          <QuestionList items={intakeQs} onChange={setIntakeQs} />
          {intakeQs.length === 0 && <p className="text-xs text-gray-400">No extra questions suggested.</p>}
        </SectionCard>

        {/* Client fields */}
        <SectionCard
          icon={Users}
          title="Client record fields"
          subtitle="Custom fields kept on every client — gate codes, pets, preferences."
        >
          <QuestionList items={clientFs} onChange={setClientFs} />
          {clientFs.length === 0 && <p className="text-xs text-gray-400">No custom fields suggested.</p>}
        </SectionCard>

        {/* Self-scheduling toggle + apply */}
        <div className="card-ledger p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={enableSelfSchedule}
              onChange={(e) => setEnableSelfSchedule(e.target.checked)}
              className="mt-0.5 accent-green-600"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                Let clients book online
              </span>
              <span className="block text-xs text-gray-500">
                Puts a time-slot picker on your booking form for the {bookableDraftCount} service
                {bookableDraftCount === 1 ? "" : "s"} with a duration. Every booking still lands as
                &quot;needs approval&quot; — you accept or decline each one.
                {bookableCount === 0 && " You'll also need to mark someone bookable on the Team page (next step)."}
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={apply}
            disabled={applying}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50"
          >
            {applying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Apply this setup
          </button>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={() => setStep("intake")} className="text-xs text-gray-400 hover:text-gray-600">
              ← Change my answers
            </button>
            <button
              type="button"
              onClick={generate}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <RefreshCcw size={11} /> Redraft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
