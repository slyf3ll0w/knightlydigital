"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Check,
  CalendarClock,
  ExternalLink,
  FileSignature,
  Globe,
  ListChecks,
  Loader2,
  MapPin,
  RefreshCcw,
  Search,
  Star,
  Upload,
  Users,
} from "lucide-react";
import AtlasIcon from "@/components/AtlasIcon";
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
  { value: "anywhere", label: "Anywhere — we travel to the work" },
];

/** Mirror of lib/business-lookup.ts BusinessLookupResult (client copy). */
type LookupBusiness = {
  found: boolean;
  name: string;
  website: string | null;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  mapsUrl: string | null;
  reviewLink: string | null;
  rating: number | null;
  reviewCount: number | null;
  summary: string;
  logoUrl: string | null;
  brandColor: string | null;
};

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
  hasReviewLink,
  aiAvailable,
  prefill,
}: {
  companyName: string;
  companySlug: string;
  currentTimezone: string;
  serviceCount: number;
  bookableCount: number;
  hasReviewLink: boolean;
  aiAvailable: boolean;
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

  // ── business lookup ("Find my business") ──
  const [lookupName, setLookupName] = useState(companyName);
  const [lookupWebsite, setLookupWebsite] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMiss, setLookupMiss] = useState(false);
  const [candidate, setCandidate] = useState<LookupBusiness | null>(null); // awaiting "is this you?"
  const [biz, setBiz] = useState<LookupBusiness | null>(null); // confirmed

  async function findBusiness() {
    if ((!lookupName.trim() && !lookupWebsite.trim()) || lookupBusy) return;
    setLookupBusy(true);
    setLookupMiss(false);
    setCandidate(null);
    const { ok, data } = await postJson<{ business: LookupBusiness | null }>(
      "/api/app/setup/lookup",
      {
        name: lookupName.trim(),
        city: city.trim(),
        state: stateCode.trim(),
        industry: effectiveIndustry,
        website: lookupWebsite.trim(),
      }
    );
    setLookupBusy(false);
    if (!ok || !data?.business?.found) {
      setLookupMiss(true);
      return;
    }
    setCandidate(data.business);
  }

  function confirmBusiness() {
    if (!candidate) return;
    setBiz(candidate);
    if (candidate.city) setCity(candidate.city);
    if (candidate.state) setStateCode(candidate.state);
    if (candidate.summary && !description.trim()) setDescription(candidate.summary);
    setProfilePhone(candidate.phone);
    setProfileAddress(candidate.streetAddress);
    setProfileZip(candidate.zip);
    setProfileWebsite(candidate.website ?? "");
    setProfileReviewLink(candidate.reviewLink ?? "");
    setBrandingInclude(Boolean(candidate.logoUrl || candidate.brandColor));
    setLogoBroken(false);
    setCandidate(null);
  }

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

  // ── company profile & branding (from the confirmed lookup, all editable) ──
  const [profileInclude, setProfileInclude] = useState(true);
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileZip, setProfileZip] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileReviewLink, setProfileReviewLink] = useState("");
  const [brandingInclude, setBrandingInclude] = useState(true);
  const [logoBroken, setLogoBroken] = useState(false);

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
      website: biz?.website ?? "",
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
      profile:
        biz && profileInclude
          ? {
              phone: profilePhone.trim(),
              address: profileAddress.trim(),
              zip: profileZip.trim(),
              website: profileWebsite.trim(),
              reviewLink: profileReviewLink.trim(),
            }
          : null,
      branding:
        biz && brandingInclude
          ? {
              logoUrl: logoBroken ? null : biz.logoUrl,
              brandColor: biz.brandColor,
            }
          : null,
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
            <AtlasIcon size={20} className="text-green-600" />
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

        {aiAvailable && (
          <div className="card-ledger mb-4 p-5">
            {!biz && !candidate && (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <Search size={15} className="text-green-600" />
                  <p className="text-sm font-semibold text-gray-900">Find your business</p>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  We&apos;ll look up your website and Google Business Profile to pull in your
                  contact info, logo, and services automatically.
                </p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={lookupName}
                      onChange={(e) => setLookupName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && findBusiness()}
                      placeholder="Your business name"
                      className={`${inputCls} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      onClick={findBusiness}
                      disabled={(!lookupName.trim() && !lookupWebsite.trim()) || lookupBusy}
                      className="flex shrink-0 items-center gap-1.5 chamfer rounded bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                    >
                      {lookupBusy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      {lookupBusy ? "Searching..." : "Search"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={lookupWebsite}
                    onChange={(e) => setLookupWebsite(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && findBusiness()}
                    placeholder="yourwebsite.com — optional, helps us find your logo & colors"
                    className={`${inputCls} w-full`}
                  />
                </div>
                {lookupMiss && (
                  <p className="mt-2 text-xs text-gray-500">
                    {lookupWebsite.trim()
                      ? "We couldn't pull anything from that — double-check the website address, or just fill in the details below."
                      : "We couldn't find your listing. If you have a website, paste it above and we'll grab your info and branding from there — or just fill in the details below."}
                  </p>
                )}
              </>
            )}

            {candidate && (
              <div>
                <p className="mb-3 text-sm font-semibold text-gray-900">Is this your business?</p>
                <div className="flex items-start gap-3 rounded border border-gray-200 bg-gray-50 p-3">
                  {candidate.logoUrl && !logoBroken && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={candidate.logoUrl}
                      alt=""
                      onError={() => setLogoBroken(true)}
                      className="h-12 w-12 shrink-0 rounded-md bg-white object-contain p-1 ring-1 ring-gray-200"
                    />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-gray-900">{candidate.name}</p>
                    {candidate.rating !== null && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        {candidate.rating.toFixed(1)}
                        {candidate.reviewCount !== null && ` · ${candidate.reviewCount} Google reviews`}
                      </p>
                    )}
                    {candidate.summary && <p className="mt-1 text-xs text-gray-600">{candidate.summary}</p>}
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {[candidate.streetAddress, candidate.city, candidate.state]
                        .filter(Boolean)
                        .join(", ")}
                      {candidate.phone && ` · ${candidate.phone}`}
                    </p>
                    {candidate.website && (
                      <p className="truncate text-xs text-green-700">{candidate.website}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={confirmBusiness}
                    className="flex items-center gap-1.5 chamfer rounded bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
                  >
                    <Check size={14} /> Yes, that&apos;s us
                  </button>
                  <button
                    type="button"
                    onClick={() => setCandidate(null)}
                    className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-400"
                  >
                    Not us
                  </button>
                </div>
              </div>
            )}

            {biz && (
              <div className="flex items-center gap-3">
                {biz.logoUrl && !logoBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={biz.logoUrl}
                    alt=""
                    onError={() => setLogoBroken(true)}
                    className="h-10 w-10 shrink-0 rounded-md bg-white object-contain p-1 ring-1 ring-gray-200"
                  />
                ) : (
                  <Building2 size={20} className="shrink-0 text-green-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <Check size={14} className="text-green-600" /> {biz.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {biz.website ?? "Found your Google Business Profile"} — we&apos;ll use it to
                    draft your real services.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBiz(null)}
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                >
                  Undo
                </button>
              </div>
            )}
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
            className="flex w-full items-center justify-center gap-2 chamfer rounded bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50"
          >
            <AtlasIcon size={15} />
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
      ...(!hasReviewLink
        ? [
            {
              icon: Star,
              title: "Collect Google reviews automatically",
              body: "Google your business name, open your Business Profile, click \"Ask for reviews\", copy the link, and paste it into Settings — finished jobs can then request a review for you.",
              href: "/app/settings",
              linkLabel: "Open Settings",
            },
          ]
        : []),
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
          <h1 className="text-xl font-semibold text-gray-900">Your account is set up</h1>
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
          <AtlasIcon size={20} className="text-green-600" />
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
        {/* Business profile & branding (from the confirmed lookup) */}
        {biz && (
          <SectionCard
            icon={Building2}
            title="Your business info & branding"
            subtitle="Pulled from your website and Google listing — shown on your booking page, quotes, and invoices."
          >
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={profileInclude}
                onChange={(e) => setProfileInclude(e.target.checked)}
                className="accent-green-600"
              />
              Save this contact info to my company profile
            </label>
            {profileInclude && (
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Business phone</label>
                  <input type="text" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} className={`${smallInputCls} w-full`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Website</label>
                  <input type="text" value={profileWebsite} onChange={(e) => setProfileWebsite(e.target.value)} className={`${smallInputCls} w-full`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Street address</label>
                  <input type="text" value={profileAddress} onChange={(e) => setProfileAddress(e.target.value)} className={`${smallInputCls} w-full`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">ZIP</label>
                  <input type="text" value={profileZip} onChange={(e) => setProfileZip(e.target.value)} className={`${smallInputCls} w-28`} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Google reviews link
                  </label>
                  <input
                    type="text"
                    value={profileReviewLink}
                    onChange={(e) => setProfileReviewLink(e.target.value)}
                    placeholder="https://g.page/r/... — where customers leave you a Google review"
                    className={`${smallInputCls} w-full`}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Used for automatic review requests when a job is completed.
                  </p>
                </div>
              </div>
            )}
            {(biz.logoUrl || biz.brandColor) && (
              <div className="border-t border-gray-100 pt-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={brandingInclude}
                    onChange={(e) => setBrandingInclude(e.target.checked)}
                    className="mt-0.5 accent-green-600"
                  />
                  <span>
                    Use my {biz.logoUrl && !logoBroken ? "logo" : ""}
                    {biz.logoUrl && !logoBroken && biz.brandColor ? " and " : ""}
                    {biz.brandColor ? "brand color" : ""} everywhere — dashboard, booking page,
                    quotes, and invoices
                  </span>
                </label>
                <div className={`mt-2 flex items-center gap-3 pl-6 ${brandingInclude ? "" : "opacity-40"}`}>
                  {biz.logoUrl && !logoBroken && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={biz.logoUrl}
                      alt="Logo preview"
                      onError={() => setLogoBroken(true)}
                      className="h-14 w-auto max-w-[180px] rounded-md bg-white object-contain p-1 ring-1 ring-gray-200"
                    />
                  )}
                  {biz.brandColor && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span
                        className="inline-block h-6 w-6 rounded-full ring-1 ring-gray-300"
                        style={{ backgroundColor: biz.brandColor }}
                      />
                      {biz.brandColor}
                    </span>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        )}

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
        {radius === "anywhere" ? (
          <SectionCard
            icon={MapPin}
            title="Service area"
            subtitle="You told us you travel anywhere."
          >
            <p className="text-sm text-gray-700">
              Your booking form will accept any address — no ZIP-code limit. If that ever
              changes, you can add a ZIP list in Settings → Online booking.
            </p>
          </SectionCard>
        ) : (
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
        )}

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
            className="mt-4 flex w-full items-center justify-center gap-2 chamfer rounded bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50"
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
