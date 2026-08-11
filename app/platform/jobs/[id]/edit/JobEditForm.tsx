"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { type PickerWorkItem } from "@/components/WorkItemPicker";
import LineItemsEditor, {
  type EditorLineItem,
  emptyEditorLine,
  payloadRecurringInterval,
} from "@/components/LineItemsEditor";

type SavedAddress = {
  id: string;
  label: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type EditJob = {
  id: string;
  title: string;
  description: string;
  address: string;
  propertyId: string;
  leadSource: string;
  contactName: string;
  contactAddress: { address: string | null; city: string | null; state: string | null; zip: string | null };
  savedAddresses: SavedAddress[];
  lineItems: {
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost: number | null;
    workItemId: string | null;
    recurringInterval: string | null;
  }[];
};

export default function JobEditForm({
  job,
  workItems = [],
}: {
  job: EditJob;
  workItems?: PickerWorkItem[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description);
  const [address, setAddress] = useState(job.address);
  const [propertyId, setPropertyId] = useState(job.propertyId);
  const [leadSource, setLeadSource] = useState(job.leadSource);

  // Saved-address quick pick — same convention as the new-job form: picking a
  // saved EXTRA address links the job to that property for history grouping
  const joinLine = (a: { address: string | null; city: string | null; state: string | null; zip: string | null }) =>
    [a.address, a.city, a.state, a.zip].filter(Boolean).join(", ");
  const addressChoices = [
    ...(job.contactAddress.address
      ? [{ key: "primary", label: "Primary", line: joinLine(job.contactAddress) }]
      : []),
    ...job.savedAddresses.map((a) => ({
      key: a.id,
      label: a.label || "Additional",
      line: joinLine(a),
    })),
  ];
  const [lineItems, setLineItems] = useState<EditorLineItem[]>(
    job.lineItems.map((li) => ({
      ...emptyEditorLine,
      name: li.name,
      description: li.description,
      quantity: String(li.quantity),
      unitPrice: String(li.unitPrice),
      unitCost: li.unitCost != null ? String(li.unitCost) : "",
      workItemId: li.workItemId ?? "",
      recurringInterval: li.recurringInterval,
    }))
  );

  const lineTotal = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const price = parseFloat(li.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("The job needs a title.");
      return;
    }
    setError("");
    setLoading(true);

    const { ok, data } = await postJson(
      `/api/app/jobs/${job.id}`,
      {
        title: title.trim(),
        description,
        address,
        propertyId,
        leadSource,
        lineItems: lineItems
          .filter((li) => li.name.trim())
          .map((li, i) => ({
            name: li.name,
            description: li.description,
            quantity: parseFloat(li.quantity) || 1,
            unitPrice: parseFloat(li.unitPrice) || 0,
            unitCost: !li.unitCost ? null : parseFloat(li.unitCost) || 0,
            workItemId: li.workItemId || null,
            // One-time sale of a recurring-capable service sends null — no
            // subscription starts when this job saves
            recurringInterval: payloadRecurringInterval(li),
            sortOrder: i,
          })),
      },
      "PATCH"
    );
    setLoading(false);

    if (!ok) {
      setError((data as { error?: string })?.error ?? GENERIC_ERROR);
      return;
    }

    router.push(`/app/jobs/${job.id}`);
    router.refresh();
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/app/jobs/${job.id}`} className="hidden lg:block text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Edit Job</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Job Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <div className="w-full max-w-xs px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600">
              {job.contactName}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Details about the job, scope, special instructions..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job site address</label>
            {addressChoices.length > 1 && (
              <select
                value=""
                onChange={(e) => {
                  const choice = addressChoices.find((a) => a.key === e.target.value);
                  if (choice) {
                    setAddress(choice.line);
                    setPropertyId(choice.key === "primary" ? "" : choice.key);
                  }
                }}
                className="w-full mb-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Pick a saved address...</option>
                {addressChoices.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}: {a.line}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={address}
              onChange={(e) => {
                // Typing a custom address breaks the saved-property link
                setAddress(e.target.value);
                setPropertyId("");
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lead source</label>
            <input
              type="text"
              list="lead-sources"
              value={leadSource}
              onChange={(e) => setLeadSource(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Where did this job come from?"
            />
            <datalist id="lead-sources">
              <option value="Google" />
              <option value="Referral" />
              <option value="Online booking" />
              <option value="Facebook" />
              <option value="Nextdoor" />
              <option value="Yard sign" />
              <option value="Repeat client" />
              <option value="Door hanger" />
            </datalist>
          </div>
        </div>

        {/* Line items — no overflow-hidden: the price-book dropdown must be
            able to spill past the card edge (it was getting clipped) */}
        <div className="card-ledger">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">
                Product / Service
              </h2>
            </div>
            <LineItemsEditor
              items={lineItems}
              onChange={setLineItems}
              workItems={workItems}
              allowEmpty
            />
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-[7px] max-lg:rounded-b-[13px]">
              <div className="ml-auto w-56 flex justify-between text-sm font-bold">
                <span className="text-gray-900">Total price</span>
                <span className="text-gray-900">${lineTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
          <Link
            href={`/app/jobs/${job.id}`}
            className="px-5 py-2.5 btn-tool-line bg-white text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
