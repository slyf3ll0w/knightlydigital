"use client";

import { Plus, Trash2 } from "lucide-react";
import WorkItemPicker, { type PickerWorkItem } from "@/components/WorkItemPicker";

/**
 * THE line-item rows — one implementation shared by the quote editor, the
 * invoice editor, and both job forms. Before this, three near-identical
 * copies had already drifted apart (the invoice copy silently dropped
 * unitCost, only the job copy allowed fractional quantities, and none of
 * them let the user choose one-time vs recurring). Parents own the list
 * state and their totals footer; this owns the rows.
 */

export type EditorLineItem = {
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost?: string; // hidden; carried for margin tracking
  workItemId?: string; // source price-book item, when picked
  recurringInterval?: string | null; // price-book recurring cadence, when any
  /**
   * User's call on a recurring-capable service: true (default) starts/keeps
   * the client's recurring plan when saved; false sells it one-time. Send
   * `payloadRecurringInterval(li)` to the API so a one-time sale carries no
   * recurring snapshot and never spawns a subscription.
   */
  startRecurring?: boolean;
  isOptional?: boolean; // quotes: client may opt out in the hub
  requiresAgreement?: boolean; // quotes: snapshot of the price-book flag
  serviceDate?: string | null; // invoices: preserved through edits
};

export const emptyEditorLine: EditorLineItem = {
  name: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  unitCost: "",
  workItemId: "",
  recurringInterval: null,
  startRecurring: true,
  isOptional: false,
  requiresAgreement: false,
  serviceDate: null,
};

/** The recurringInterval to SEND: null when the user chose a one-time sale. */
export function payloadRecurringInterval(li: EditorLineItem): string | null {
  return li.startRecurring === false ? null : (li.recurringInterval ?? null);
}

const RECURRING_LABEL: Record<string, string> = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  SEMIANNUAL: "every 6 months",
  ANNUAL: "yearly",
};

export default function LineItemsEditor({
  items,
  onChange,
  workItems = [],
  integerQty = false,
  showOptional = false,
  allowEmpty = false,
}: {
  items: EditorLineItem[];
  onChange: (items: EditorLineItem[]) => void;
  workItems?: PickerWorkItem[];
  /** Quotes/invoices bill whole quantities; job line items may be fractional. */
  integerQty?: boolean;
  /** Quotes: show the per-line "Optional" checkbox. */
  showOptional?: boolean;
  /** Jobs: the last row may be deleted (a job without line items is valid). */
  allowEmpty?: boolean;
}) {
  function update(i: number, patch: Partial<EditorLineItem>) {
    onChange(items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  }

  function applyWorkItem(i: number, item: PickerWorkItem) {
    update(i, {
      name: item.name,
      description: item.description ?? items[i].description,
      unitPrice: String(Number(item.unitPrice)),
      unitCost: item.unitCost != null ? String(Number(item.unitCost)) : "",
      workItemId: item.id,
      recurringInterval: item.recurringInterval ?? null,
      startRecurring: true,
      requiresAgreement: Boolean(item.requiresAgreement),
    });
  }

  return (
    <div className="p-5">
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No line items yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((li, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
              {/* Phone: name + delete on row 1, qty/price on row 2; sm+: one row */}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,1fr)_70px_110px_32px] gap-2 items-start">
                <div className="col-span-2 sm:col-span-1 min-w-0 sm:order-1">
                  <WorkItemPicker
                    value={li.name}
                    items={workItems}
                    onChange={(text) => update(i, { name: text })}
                    onSelect={(item) => applyWorkItem(i, item)}
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                  disabled={!allowEmpty && items.length === 1}
                  className="p-2 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-0 sm:order-4"
                >
                  <Trash2 size={14} />
                </button>
                <input
                  type="number"
                  inputMode={integerQty ? "numeric" : "decimal"}
                  placeholder="Qty"
                  value={li.quantity}
                  onChange={(e) =>
                    update(i, {
                      quantity: integerQty
                        ? e.target.value.replace(/[^0-9]/g, "")
                        : e.target.value,
                    })
                  }
                  min={integerQty ? "1" : "0"}
                  step={integerQty ? "1" : "0.001"}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:order-2"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Unit price"
                  value={li.unitPrice}
                  onChange={(e) => update(i, { unitPrice: e.target.value })}
                  min="0"
                  step="0.01"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:order-3"
                />
              </div>
              <input
                type="text"
                placeholder="Description"
                value={li.description}
                onChange={(e) => update(i, { description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {(showOptional || li.recurringInterval) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {/* Recurring-capable service: sell it once, or start the plan */}
                  {li.recurringInterval && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
                      <select
                        value={li.startRecurring === false ? "once" : "recurring"}
                        onChange={(e) =>
                          update(i, { startRecurring: e.target.value !== "once" })
                        }
                        className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="recurring">
                          Recurring ({RECURRING_LABEL[li.recurringInterval] ?? "repeats"})
                        </option>
                        <option value="once">One-time</option>
                      </select>
                      <span className="text-gray-400">
                        {li.startRecurring === false
                          ? "billed once, no plan"
                          : "starts a recurring plan for this client"}
                      </span>
                    </label>
                  )}
                  {showOptional && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(li.isOptional)}
                        onChange={(e) => update(i, { isOptional: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      Optional (client can remove it before approving)
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...items, { ...emptyEditorLine }])}
        className="mt-3 flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
      >
        <Plus size={13} /> Add line item
      </button>
    </div>
  );
}
