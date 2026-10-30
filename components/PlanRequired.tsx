import Link from "next/link";
import { Lock } from "lucide-react";
import { PLANS, featureBlurb, featureLabel, featurePlan, formatCents, type GatedFeature } from "@/lib/plans";

/**
 * What a gated PAGE renders instead of its content once PLAN_GATING is live
 * and the company isn't on the plan (lib/plans.ts featureAllowed). One card
 * for every Pro feature: the feature's name, one line of what it does, the
 * plan's price, "See plans" (Settings → Plans, where an owner can add it in
 * two taps) and a way back. Server-safe — no hooks — so pages can return it
 * straight from the gate check:
 *
 *   if (!(await featureAllowedFor(actor.companyId, "estimator")))
 *     return <PlanRequired feature="estimator" back={{ href: "/app/quotes", label: "Back to quotes" }} />;
 *
 * Phone and desktop are the same card, centered and full width.
 */
export default function PlanRequired({
  feature,
  back,
  compact = false,
}: {
  feature: GatedFeature;
  /** Where "Back" goes; omit for no back link. */
  back?: { href: string; label: string };
  /** Inline inside another page (a card, not a whole screen). */
  compact?: boolean;
}) {
  const plan = PLANS[featurePlan(feature)];
  const label = featureLabel(feature);
  const others = plan.includes
    .filter((s) => !s.toLowerCase().includes(label.toLowerCase().replace(/^the /, "").split(" ")[0]))
    .slice(0, 3)
    .map((s) => s.replace(/\s*\(beta\)/i, "").toLowerCase());
  return (
    <div
      className={`ds mx-auto w-full ${compact ? "max-w-xl rounded-2xl border border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] px-5 py-6" : "max-w-lg px-4 py-14"} text-center`}
      data-plan-required={feature}
    >
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
        <Lock size={20} />
      </span>
      <h1 className="text-lg font-bold text-[color:var(--ds-ink)]">
        {plan.comingSoon ? `${label} is coming soon` : `${label} is part of ${plan.name}`}
      </h1>
      <p className="mt-2 text-sm text-[color:var(--ds-ink-soft)]">{featureBlurb(feature)}</p>
      <p className="mt-2 text-sm text-[color:var(--ds-ink-soft)]">
        {plan.comingSoon
          ? `It will be part of the ${plan.name} plan, ${formatCents(plan.monthlyCents)} a month.`
          : `${plan.name} is ${formatCents(plan.monthlyCents)} a month and also includes ${others.join(", ")} and more.`}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/app/settings/plans" className="btn-primary">
          See plans
        </Link>
        {back && (
          <Link
            href={back.href}
            className="rounded-[10px] btn-tool-line bg-white px-3 py-2 text-sm font-medium text-gray-700"
          >
            {back.label}
          </Link>
        )}
      </div>
    </div>
  );
}
