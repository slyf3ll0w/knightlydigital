"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Trash2, ArrowLeft } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import WorkItemPicker, { type PickerWorkItem } from "@/components/WorkItemPicker";

type LineItem = {
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string; // hidden; carried for margin tracking
  recurringInterval: string | null; // hidden; display-only snapshot
};

const emptyLine: LineItem = {
  name: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  unitCost: "",
  recurringInterval: null,
};

export type EditJob = {
  id: string;
  title: string;
  description: string;
  address: string;
  leadSource: string;
  contactName: string;
  lineItems: {
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost: number | null;
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
  const [leadSource, setLeadSource] = useState(job.leadSource);
  const [lineItems, setLineItems] = useState<LineItem[]>(
    job.lineItems.map((li) => ({
      name: li.name,
      description: li.description,
      quantity: String(li.quantity),
      unitPrice: String(li.unitPrice),
      unitCost: li.unitCost != null ? String(li.unitCost) : "",
      recurringInterval: li.recurringInterval,
    }))
  );

  function addLine() {
    setLineItems((l) => [...l, { ...emptyLine }]);
  }

  function removeLine(i: number) {
    setLineItems((l) => l.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLineItems((l) => l.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  function applyWorkItem(i: number, item: PickerWorkItem) {
    setLineItems((l) =>
      l.map((li, idx) =>
        idx === i
          ? {
              ...li,
              name: item.name,
              description: item.description ?? li.description,
              unitPrice: String(Number(item.unitPrice)),
              unitCost: item.unitCost !== null ? String(Number(item.unitCost)) : "",
              recurringInterval: item.recurringInterval ?? null,
            }
          : li
      )
    );
  }

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
        leadSource,
        lineItems: lineItems
          .filter((li) => li.name.trim())
          .map((li, i) => ({
            name: li.name,
            description: li.description,
            quantity: parseFloat(li.quantity) || 1,
            unitPrice: parseFloat(li.unitPrice) || 0,
            unitCost: li.unitCost === "" ? null : parseFloat(li.unitCost) || 0,
            recurringInterval: li.recurringInterval,
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
        <Link href={`/app/jobs/${job.id}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Edit Job</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Job Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <div className="w-full max-w-xs px-3 py-2.5 border border-gray-200 rounded text-sm bg-gray-50 text-gray-600">
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
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Details about the job, scope, special instructions..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job site address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lead source</label>
            <input
              type="text"
              list="lead-sources"
              value={leadSource}
              onChange={(e) => setLeadSource(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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

        {/* Line items */}
        <div className="card-ledger overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Product / Service
              </h2>
            </div>
            <div className="p-5">
              {lineItems.length === 0 ? (
                <p className="text-sm text-gray-400">No line items on this job.</p>
              ) : (
                <div className="space-y-4">
                  {lineItems.map((li, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,1fr)_70px_110px_32px] gap-2 items-start">
                        <div className="col-span-2 sm:col-span-1 min-w-0 sm:order-1">
                          <WorkItemPicker
                            value={li.name}
                            items={workItems}
                            onChange={(text) => updateLine(i, "name", text)}
                            onSelect={(item) => applyWorkItem(i, item)}
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="p-2 text-gray-300 hover:text-red-400 transition-colors sm:order-4"
                        >
                          <Trash2 size={14} />
                        </button>
                        <input
                          type="number"
                          placeholder="Qty"
                          value={li.quantity}
                          onChange={(e) => updateLine(i, "quantity", e.target.value)}
                          min="0"
                          step="0.001"
                          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:order-2"
                        />
                        <input
                          type="number"
                          placeholder="Unit price"
                          value={li.unitPrice}
                          onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                          min="0"
                          step="0.01"
                          className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:order-3"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Description"
                        value={li.description}
                        onChange={(e) => updateLine(i, "description", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={addLine}
                className="mt-3 flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
              >
                <Plus size={13} />
                Add line item
              </button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
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
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
          <Link
            href={`/app/jobs/${job.id}`}
            className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
