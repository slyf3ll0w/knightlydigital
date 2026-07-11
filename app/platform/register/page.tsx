"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, ArrowLeft, ArrowRight, Check, CreditCard, Banknote, Bell } from "lucide-react";
import Link from "next/link";
import TurnstileWidget from "@/components/TurnstileWidget";
import { INDUSTRIES } from "@/lib/pricebooks";

/**
 * One-question-per-screen signup (Typeform style): question panel left,
 * stock photo right. Deliberately short — just enough to create the account
 * and seed a price book. Everything else (hours, service area, branding,
 * booking form) belongs to the AI setup assistant this flow lands on, so
 * nothing is asked twice. Answers are held client-side and submitted in one
 * POST at the end (register API is rate-limited to 3/hr).
 */

const STOCK = {
  basics: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80",
  account: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1600&q=80",
  industry: "https://images.unsplash.com/photo-1426927308491-6380b6a9936f?auto=format&fit=crop&w=1600&q=80",
  payments: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1600&q=80",
  finish: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1600&q=80",
} as const;

type StepId = "basics" | "account" | "industry" | "payments" | "finish";

const STEPS: { id: StepId; image: string }[] = [
  { id: "basics", image: STOCK.basics },
  { id: "account", image: STOCK.account },
  { id: "industry", image: STOCK.industry },
  { id: "payments", image: STOCK.payments },
  { id: "finish", image: STOCK.finish },
];

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [otherIndustry, setOtherIndustry] = useState("");
  const [form, setForm] = useState({
    yourName: "",
    companyName: "",
    phone: "",
    email: "",
    password: "",
    industry: "",
    teamSize: "",
    currentSoftware: "",
    topPriority: "",
    referralSource: "",
  });

  const current = STEPS[step];
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function next() {
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  /** Single-select steps: record the answer, then auto-advance. */
  function pick(field: keyof typeof form, value: string) {
    set(field, value);
    next();
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);

    const industry =
      form.industry === "Other" && otherIndustry.trim()
        ? `Other: ${otherIndustry.trim().slice(0, 70)}`
        : form.industry;

    const res = await fetch("/api/app/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, industry, captchaToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    // Auto sign in after registration, then do a full page load so the app
    // layout re-renders with the new session (sidebar included). Land in the
    // setup assistant — it owns everything signup doesn't ask (hours, service
    // area, branding, booking form), so the two flows never repeat a question.
    await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    window.location.href = "/app/setup";
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const optionClass =
    "w-full text-left px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors hover:border-green-500 hover:bg-green-50";
  const continueClass =
    "px-6 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold text-sm rounded-full transition-colors flex items-center gap-2 disabled:opacity-50";

  function selectedClass(selected: boolean) {
    return selected
      ? `${optionClass} border-green-500 bg-green-50 text-green-700`
      : `${optionClass} border-gray-300 text-gray-700`;
  }

  return (
    <div className="app-ui h-screen bg-white flex overflow-hidden">
      {/* Question panel */}
      <div className="flex-1 flex flex-col h-screen min-w-0">
        {/* Header: logo + progress */}
        <div className="px-6 lg:px-12 pt-6 shrink-0">
          <div className="flex items-center justify-between mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/streamflaire-hub-logo.png" alt="Streamflaire Hub" className="h-6 w-auto" />
            <span className="text-xs text-gray-400 font-medium">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question body — my-auto centers short steps, tall steps scroll */}
        <div className="flex-1 overflow-y-auto flex flex-col px-6 lg:px-12 py-8">
          <div key={current.id} className="w-full max-w-lg mx-auto my-auto wizard-step">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {current.id === "basics" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  next();
                }}
              >
                <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">Let&apos;s get you set up</h1>
                <p className="text-sm text-gray-500 mb-6">
                  Free forever — we make money when you get paid, not before.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Your name</label>
                    <input
                      type="text"
                      value={form.yourName}
                      onChange={(e) => set("yourName", e.target.value)}
                      required
                      autoFocus
                      className={inputClass}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Business name</label>
                    <input
                      type="text"
                      value={form.companyName}
                      onChange={(e) => set("companyName", e.target.value)}
                      required
                      className={inputClass}
                      placeholder="Acme HVAC & Cooling"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Phone <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      className={inputClass}
                      placeholder="(214) 555-0100"
                    />
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <button type="submit" className={continueClass}>
                    Continue <ArrowRight size={14} />
                  </button>
                  <p className="text-sm text-gray-500">
                    Have an account?{" "}
                    <Link href="/app/login" className="text-green-600 hover:underline font-medium">
                      Sign in
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {current.id === "account" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  next();
                }}
              >
                <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">Create your login</h1>
                <p className="text-sm text-gray-500 mb-6">
                  You&apos;ll use this to sign in to {form.companyName || "your account"}.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      required
                      autoFocus
                      autoComplete="email"
                      className={inputClass}
                      placeholder="you@acmehvac.com"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className={inputClass}
                      placeholder="Min. 8 characters"
                    />
                  </div>
                </div>
                <button type="submit" className={`${continueClass} mt-6`}>
                  Continue <ArrowRight size={14} />
                </button>
              </form>
            )}

            {current.id === "industry" && (
              <div>
                <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">What kind of work do you do?</h1>
                <p className="text-sm text-gray-500 mb-6">
                  We&apos;ll pre-load your price book with services for your industry — you can edit
                  everything later.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      type="button"
                      onClick={() => {
                        if (ind === "Other") {
                          set("industry", "Other");
                        } else {
                          pick("industry", ind);
                        }
                      }}
                      className={selectedClass(form.industry === ind)}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
                {form.industry === "Other" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      next();
                    }}
                    className="mt-4"
                  >
                    <label className={labelClass}>
                      What&apos;s your industry?{" "}
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otherIndustry}
                        onChange={(e) => setOtherIndustry(e.target.value)}
                        autoFocus
                        maxLength={70}
                        className={inputClass}
                        placeholder="e.g. Mobile detailing"
                      />
                      <button type="submit" className={continueClass}>
                        Continue <ArrowRight size={14} />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {current.id === "payments" && (
              <div>
                <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">Getting paid</h1>
                <p className="text-sm text-gray-500 mb-6">
                  Record cash, check, Venmo, Zelle, and Cash App payments from day one. Online card
                  payments are on the way.
                </p>
                {/* Placeholder for the payment processor onboarding — replaced with the
                    real merchant application once the processor goes live. */}
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  <div className="flex items-start gap-3 p-4">
                    <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <Banknote size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Available now</p>
                      <p className="text-sm text-gray-500">
                        Invoice clients and record manual payments — cash, check, Venmo, Zelle, Cash App.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <CreditCard size={16} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        Online card payments
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded-lg">
                          Coming soon
                        </span>
                      </p>
                      <p className="text-sm text-gray-500">
                        Let clients pay invoices online and collect deposits on quote approval.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Bell size={16} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">We&apos;ll let you know</p>
                      <p className="text-sm text-gray-500">
                        You&apos;ll be invited to set up payment processing right from your dashboard
                        when it launches.
                      </p>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={next} className={`${continueClass} mt-6`}>
                  Sounds good <ArrowRight size={14} />
                </button>
              </div>
            )}

            {current.id === "finish" && (
              <div>
                <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">
                  You&apos;re all set{form.yourName ? `, ${form.yourName.split(" ")[0]}` : ""}!
                </h1>
                <p className="text-sm text-gray-500 mb-6">
                  Here&apos;s what we&apos;ll set up for {form.companyName || "your business"}:
                </p>
                <ul className="space-y-3 mb-6">
                  {[
                    form.industry && form.industry !== "Other"
                      ? `A ${form.industry} starter price book`
                      : "An empty price book ready for your services",
                    "Quotes, jobs, invoices & scheduling",
                    "Your client hub and online booking form",
                    "A 2-minute assistant to finish setup — it finds your business online and pulls in your info, logo & colors",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-gray-700">
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <Check size={11} className="text-green-600" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
                <TurnstileWidget onToken={setCaptchaToken} />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className={`${continueClass} w-full justify-center py-3`}
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Create my free account
                </button>
                <p className="text-xs text-gray-400 text-center mt-4">
                  No credit card required. Free forever.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stock image panel */}
      <div className="hidden lg:block w-[42%] xl:w-[45%] relative h-screen shrink-0">
        <img
          key={current.image}
          src={current.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover wizard-step"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      <style>{`
        @keyframes wizard-fade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .wizard-step { animation: wizard-fade 0.35s ease both; }
      `}</style>
    </div>
  );
}
