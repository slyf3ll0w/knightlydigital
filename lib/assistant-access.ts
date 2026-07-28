/**
 * Who gets Atlas. Every assistant turn is real AI spend, and WorkBench is
 * monetized by payment processing — so by default the assistant is reserved
 * for companies that went through real Finix underwriting. Companies that
 * bypassed it (superadmin payments waiver, or the sandbox test-approve
 * shortcut) default to OFF.
 *
 * assistantEnabled is the per-company superadmin override:
 *   true  → Atlas on regardless of how they onboarded
 *   false → Atlas off
 *   null  → default policy above
 *
 * Enforced in app/platform/layout.tsx (hides the bubble) AND in
 * app/api/app/assistant/route.ts (rejects direct calls) — the UI hide alone
 * wouldn't stop a hand-crafted request.
 */
export type AssistantAccessCompany = {
  assistantEnabled: boolean | null;
  paymentsWaived: boolean;
  finixSandboxApproved: boolean;
};

export function assistantAllowed(company: AssistantAccessCompany): boolean {
  if (company.assistantEnabled !== null) return company.assistantEnabled;
  return !company.paymentsWaived && !company.finixSandboxApproved;
}
