"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  servicePriceLabel,
  type BookingFormConfig,
  type CustomField,
  type CustomFieldType,
  type FieldOption,
} from "@/lib/booking-form";

/**
 * Controlled editor for the booking form config — the Booking Form page owns
 * the state and renders the live preview next to this. Every control updates
 * the config immediately; the page-level Save persists it.
 */

const fieldTypeLabels: Record<CustomFieldType, string> = {
  text: "Short text",
  textarea: "Paragraph",
  select: "Dropdown",
  radio: "Multiple choice",
};

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const smallLabel = "block text-xs font-medium text-gray-500 mb-1";
const sectionTitle = "text-xs font-semibold text-gray-500 uppercase tracking-wide";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card-ledger p-4 space-y-3">
      <p className={sectionTitle}>
        {title}
        {hint && <span className="font-normal normal-case text-gray-400"> — {hint}</span>}
      </p>
      {children}
    </div>
  );
}

/** Choice list edited as rows — no syntax to learn. */
function OptionRows({
  options,
  onChange,
  withDescriptions,
}: {
  options: FieldOption[];
  onChange: (options: FieldOption[]) => void;
  withDescriptions: boolean;
}) {
  function setOption(i: number, patch: Partial<FieldOption>) {
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  }
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={o.label}
              onChange={(e) => setOption(i, { label: e.target.value })}
              placeholder={`Choice ${i + 1}`}
              className={inputClass}
            />
            {withDescriptions && (
              <input
                type="text"
                value={o.description ?? ""}
                onChange={(e) => setOption(i, { description: e.target.value || undefined })}
                placeholder="Description (optional)"
                className={inputClass}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="mt-2 text-gray-300 hover:text-red-500 transition-colors"
            aria-label="Remove choice"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { label: "" }])}
        className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
      >
        <Plus size={12} />
        Add choice
      </button>
    </div>
  );
}

export default function BookingFormBuilder({
  config,
  onChange,
  formType = "BOOKING",
  contactFieldDefs = [],
  priceBookItems = [],
}: {
  config: BookingFormConfig;
  onChange: (config: BookingFormConfig) => void;
  formType?: "INQUIRY" | "BOOKING" | "SERVICE_REQUEST";
  contactFieldDefs?: { id: string; label: string }[];
  priceBookItems?: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    priceDisplay?: "FIXED" | "STARTING_AT" | "HOURLY" | "QUOTE";
    durationMinutes?: number | null;
  }[];
}) {
  const set = (patch: Partial<BookingFormConfig>) => onChange({ ...config, ...patch });
  const setHeader = (patch: Partial<BookingFormConfig["header"]>) =>
    set({ header: { ...config.header, ...patch } });
  const setStd = (key: "email" | "phone" | "address" | "date", patch: Partial<BookingFormConfig["fields"]["email"]>) =>
    set({
      fields: { ...config.fields, [key]: { ...config.fields[key], ...patch } },
      ...(key === "address" && patch.show !== undefined ? { showAddress: patch.show } : {}),
      ...(key === "date" && patch.show !== undefined ? { showPreferredDate: patch.show } : {}),
    });
  const setSR = (patch: Partial<BookingFormConfig["serviceRequest"]>) =>
    set({ serviceRequest: { ...config.serviceRequest, ...patch } });
  const setSelfSchedule = (patch: Partial<BookingFormConfig["selfSchedule"]>) =>
    set({ selfSchedule: { ...config.selfSchedule, ...patch } });
  const setAppearance = (patch: Partial<BookingFormConfig["appearance"]>) =>
    set({ appearance: { ...config.appearance, ...patch } });
  const setService = (patch: Partial<BookingFormConfig["service"]>) =>
    set({ service: { ...config.service, ...patch } });
  const setMessage = (patch: Partial<BookingFormConfig["message"]>) =>
    set({ message: { ...config.message, ...patch } });
  const setButton = (patch: Partial<BookingFormConfig["button"]>) =>
    set({ button: { ...config.button, ...patch } });

  function setField(id: string, patch: Partial<CustomField>) {
    set({ customFields: config.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  }

  function addField() {
    const id = `field-${Math.random().toString(36).slice(2, 8)}`;
    set({
      customFields: [
        ...config.customFields,
        { id, label: "", type: "text", required: false } satisfies CustomField,
      ],
    });
  }

  function moveField(id: string, dir: -1 | 1) {
    const fields = [...config.customFields];
    const i = fields.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fields.length) return;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    set({ customFields: fields });
  }

  const themeButton = (value: BookingFormConfig["appearance"]["theme"], label: string) => (
    <button
      type="button"
      onClick={() => setAppearance({ theme: value })}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        config.appearance.theme === value
          ? "bg-gray-900 text-white"
          : "text-gray-600 hover:bg-gray-100 border border-gray-200"
      }`}
    >
      {label}
    </button>
  );

  const sizeButton = (value: BookingFormConfig["appearance"]["fontSize"], label: string) => (
    <button
      type="button"
      onClick={() => setAppearance({ fontSize: value })}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        config.appearance.fontSize === value
          ? "bg-gray-900 text-white"
          : "text-gray-600 hover:bg-gray-100 border border-gray-200"
      }`}
    >
      {label}
    </button>
  );

  const stdRow = (key: "email" | "phone" | "address" | "date", title: string) => {
    const f = config.fields[key];
    return (
      <div className="flex flex-wrap items-center gap-3 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">{title}</span>
        <input
          type="text"
          value={f.label}
          onChange={(e) => setStd(key, { label: e.target.value })}
          className={`${inputClass} flex-1 min-w-[140px]`}
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={f.show}
            onChange={(e) => setStd(key, { show: e.target.checked })}
            className="accent-green-600"
          />
          Show
        </label>
        <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${f.show ? "text-gray-600" : "text-gray-300"}`}>
          <input
            type="checkbox"
            checked={f.required}
            disabled={!f.show}
            onChange={(e) => setStd(key, { required: e.target.checked })}
            className="accent-green-600"
          />
          Required
        </label>
      </div>
    );
  };

  function setServiceRow(id: string, patch: Partial<BookingFormConfig["services"][number]>) {
    set({ services: config.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  return (
    <div className="space-y-4">
      {/* Header text */}
      <Card title="Header" hint="the title and description shown at the top of the form">
        <div>
          <label className={smallLabel}>Title</label>
          <input
            type="text"
            value={config.header.title}
            onChange={(e) => setHeader({ title: e.target.value })}
            placeholder="Defaults to your company name"
            className={inputClass}
          />
        </div>
        <div>
          <label className={smallLabel}>Description</label>
          <input
            type="text"
            value={config.header.description}
            onChange={(e) => setHeader({ description: e.target.value })}
            placeholder="A short line under the title"
            className={inputClass}
          />
        </div>
      </Card>

      {/* Appearance */}
      <Card title="Appearance" hint="saved with the form — applies everywhere it's shown">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <label className={smallLabel}>Style</label>
            <div className="flex items-center gap-1">
              {themeButton("light", "Light")}
              {themeButton("dark", "Dark")}
              {themeButton("transparent", "Transparent")}
            </div>
          </div>
          <div>
            <label className={smallLabel}>Text size</label>
            <div className="flex items-center gap-1">
              {sizeButton("sm", "Small")}
              {sizeButton("md", "Normal")}
              {sizeButton("lg", "Large")}
            </div>
          </div>
        </div>
        <div>
          <label className={smallLabel}>Font</label>
          <input
            type="text"
            value={config.appearance.font ?? ""}
            onChange={(e) => setAppearance({ font: e.target.value || undefined })}
            placeholder="Default — or any Google Font name, e.g. Oxanium"
            className={inputClass}
          />
        </div>
        <p className="text-xs text-gray-400">
          Transparent has no background of its own — it sits directly on your website.
        </p>
      </Card>

      {/* Built-in fields */}
      <Card title="Standard fields" hint="rename anything; name is the only field that always shows">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={smallLabel}>First-name label</label>
            <input
              type="text"
              value={config.fields.nameFirstLabel}
              onChange={(e) => set({ fields: { ...config.fields, nameFirstLabel: e.target.value } })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={smallLabel}>Last-name label</label>
            <input
              type="text"
              value={config.fields.nameLastLabel}
              onChange={(e) => set({ fields: { ...config.fields, nameLastLabel: e.target.value } })}
              className={inputClass}
            />
          </div>
        </div>
        <div className="space-y-2">
          {stdRow("email", "Email")}
          {stdRow("phone", "Phone")}
          {stdRow("address", "Address")}
          {stdRow("date", "Date")}
        </div>
        <p className="text-xs text-gray-400">
          At least one of email or phone stays on the form so you can reach the person.
        </p>
      </Card>

      {/* Online scheduling (booking forms) — clients pick a real time slot */}
      {formType === "BOOKING" && (
        <Card
          title="Online scheduling"
          hint="clients pick a real time instead of just a preferred date"
        >
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.selfSchedule.enabled}
              onChange={(e) => setSelfSchedule({ enabled: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 accent-green-600"
            />
            <span className="text-sm text-gray-700">
              Let clients pick an arrival window
              <span className="block text-xs text-gray-500">
                They choose a service and an open time; you get a booking to approve or
                decline. Off = the form keeps asking for a preferred date like before.
              </span>
            </span>
          </label>

          {config.selfSchedule.enabled && (
            <>
              <div className="space-y-2 pt-1">
                <label className={smallLabel}>Services clients can book</label>
                {config.services.map((s) => {
                  const wi = priceBookItems.find((w) => w.id === s.workItemId);
                  const noDuration = !wi || wi.durationMinutes == null;
                  return (
                    <div key={s.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-400">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={s.price}
                            onChange={(e) => setServiceRow(s.id, { price: Number(e.target.value) || 0 })}
                            className={`${inputClass} w-24`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => set({ services: config.services.filter((x) => x.id !== s.id) })}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {noDuration ? (
                        <p className="mt-1.5 text-xs text-amber-700">
                          No time-on-site set — this service won&apos;t show in the slot picker.{" "}
                          <a href="/app/settings/products" target="_blank" rel="noreferrer" className="underline">
                            Set it in your price book
                          </a>
                          , then reload.
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-gray-400">
                          Takes {wi!.durationMinutes! % 60 === 0 ? `${wi!.durationMinutes! / 60}h` : `${wi!.durationMinutes}m`} on site
                        </p>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const available = priceBookItems.filter(
                    (w) => !config.services.some((s) => s.workItemId === w.id)
                  );
                  if (priceBookItems.length === 0) {
                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Your price book is empty — add the services you offer there first.{" "}
                        <a href="/app/settings/products" target="_blank" rel="noreferrer" className="font-semibold underline">
                          Open price book
                        </a>
                      </div>
                    );
                  }
                  if (available.length === 0) {
                    return (
                      <p className="text-xs text-gray-400">Every price-book service is already on this form.</p>
                    );
                  }
                  return (
                    <select
                      value=""
                      onChange={(e) => {
                        const item = priceBookItems.find((w) => w.id === e.target.value);
                        if (!item) return;
                        set({
                          services: [
                            ...config.services,
                            {
                              id: `svc-${Math.random().toString(36).slice(2, 8)}`,
                              workItemId: item.id,
                              name: item.name,
                              price: item.price,
                              priceDisplay: item.priceDisplay,
                              description: item.description ?? undefined,
                            },
                          ],
                        });
                      }}
                      className={`${inputClass} bg-white`}
                    >
                      <option value="">+ Add a service from your price book...</option>
                      {available.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} — {servicePriceLabel({ price: w.price, priceDisplay: w.priceDisplay })}
                          {w.durationMinutes == null ? " (no duration set)" : ""}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={smallLabel}>Earliest booking</label>
                  <select
                    value={config.selfSchedule.leadHours}
                    onChange={(e) => setSelfSchedule({ leadHours: Number(e.target.value) })}
                    className={`${inputClass} bg-white`}
                  >
                    <option value={2}>2 hours from now</option>
                    <option value={4}>4 hours from now</option>
                    <option value={8}>8 hours from now</option>
                    <option value={24}>1 day from now</option>
                    <option value={48}>2 days from now</option>
                  </select>
                </div>
                <div>
                  <label className={smallLabel}>How far out</label>
                  <select
                    value={config.selfSchedule.horizonDays}
                    onChange={(e) => setSelfSchedule({ horizonDays: Number(e.target.value) })}
                    className={`${inputClass} bg-white`}
                  >
                    <option value={7}>1 week</option>
                    <option value={14}>2 weeks</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Open times come from your business hours, service area, and bookable team
                members — set those under{" "}
                <a href="/app/settings/booking" target="_blank" rel="noreferrer" className="underline">
                  Online scheduling settings
                </a>{" "}
                and on the Team page. The preferred-date field is replaced by the time picker
                while this is on.
              </p>
            </>
          )}
        </Card>
      )}

      {/* Services (service-request forms) — sourced from the price book */}
      {formType === "SERVICE_REQUEST" && (
        <Card title="Services offered" hint="a submission auto-creates a quote for the chosen services">
          <div>
            <label className={smallLabel}>Section headline</label>
            <input
              type="text"
              value={config.service.label}
              onChange={(e) => setService({ label: e.target.value })}
              placeholder="e.g. What can we do for you?"
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            {config.services.map((s) => (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm font-medium text-gray-900 truncate">{s.name}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={s.price}
                      onChange={(e) => setServiceRow(s.id, { price: Number(e.target.value) || 0 })}
                      className={`${inputClass} w-24`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => set({ services: config.services.filter((x) => x.id !== s.id) })}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  value={s.description ?? ""}
                  onChange={(e) => setServiceRow(s.id, { description: e.target.value || undefined })}
                  placeholder="Short description shown on the form (optional)"
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          {(() => {
            const available = priceBookItems.filter(
              (w) => !config.services.some((s) => s.workItemId === w.id)
            );
            if (priceBookItems.length === 0) {
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Your price book is empty — add the services you offer there first, then pick
                  them here.{" "}
                  <a
                    href="/app/settings/products"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline"
                  >
                    Open price book
                  </a>
                </div>
              );
            }
            return (
              <div className="space-y-2">
                {available.length > 0 ? (
                  <select
                    value=""
                    onChange={(e) => {
                      const item = priceBookItems.find((w) => w.id === e.target.value);
                      if (!item) return;
                      set({
                        services: [
                          ...config.services,
                          {
                            id: `svc-${Math.random().toString(36).slice(2, 8)}`,
                            workItemId: item.id,
                            name: item.name,
                            price: item.price,
                            priceDisplay: item.priceDisplay,
                            description: item.description ?? undefined,
                          },
                        ],
                      });
                    }}
                    className={`${inputClass} bg-white`}
                  >
                    <option value="">+ Add a service from your price book...</option>
                    {available.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} — {servicePriceLabel({ price: w.price, priceDisplay: w.priceDisplay })}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400">
                    Every price-book service is already on this form.
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  Don&apos;t see a service?{" "}
                  <a
                    href="/app/settings/products"
                    target="_blank"
                    rel="noreferrer"
                    className="text-green-600 underline"
                  >
                    Add it to your price book
                  </a>{" "}
                  then reload this page.
                </p>
              </div>
            );
          })()}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.serviceRequest.allowMultiple}
                onChange={(e) => setSR({ allowMultiple: e.target.checked })}
                className="accent-green-600"
              />
              Clients can pick more than one
            </label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Quote:</label>
              <select
                value={config.serviceRequest.quoteMode}
                onChange={(e) => setSR({ quoteMode: e.target.value as "draft" | "send" })}
                className={`${inputClass} bg-white w-auto`}
              >
                <option value="draft">Save as draft for review</option>
                <option value="send">Auto-send to client for approval</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* Service question */}
      {formType !== "SERVICE_REQUEST" && (
      <Card title="Service question" hint="becomes the request title">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.service.show}
            onChange={(e) => set({ service: { ...config.service, show: e.target.checked } })}
            className="accent-green-600"
          />
          Ask what service they need
        </label>
        {config.service.show && (
        <>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.service.required}
            onChange={(e) => set({ service: { ...config.service, required: e.target.checked } })}
            className="accent-green-600"
          />
          Required
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={smallLabel}>Label</label>
            <input
              type="text"
              value={config.service.label}
              onChange={(e) => setService({ label: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={smallLabel}>Type</label>
            <select
              value={config.service.type}
              onChange={(e) => setService({ type: e.target.value as "text" | "select" | "radio" })}
              className={`${inputClass} bg-white`}
            >
              <option value="text">Text input</option>
              <option value="select">Dropdown</option>
              <option value="radio">Multiple choice</option>
            </select>
          </div>
        </div>
        {config.service.type === "text" ? (
          <div>
            <label className={smallLabel}>Placeholder</label>
            <input
              type="text"
              value={config.service.placeholder ?? ""}
              onChange={(e) => setService({ placeholder: e.target.value })}
              className={inputClass}
            />
          </div>
        ) : (
          <OptionRows
            options={config.service.options}
            onChange={(options) => setService({ options })}
            withDescriptions={config.service.type === "radio"}
          />
        )}
        </>
        )}
      </Card>
      )}

      {/* Custom fields */}
      <Card title="Custom fields" hint="answers go to the request notes — or map them to a client field">
        {config.customFields.length === 0 && (
          <p className="text-xs text-gray-400">
            None yet — add questions specific to your business (budget, city, gate code...).
          </p>
        )}
        <div className="space-y-3">
          {config.customFields.map((f, i) => (
            <div key={f.id} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/50">
              <div className="flex items-start gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => setField(f.id, { label: e.target.value })}
                    placeholder="Question label, e.g. Budget"
                    className={inputClass}
                  />
                  <select
                    value={f.type}
                    onChange={(e) => setField(f.id, { type: e.target.value as CustomFieldType })}
                    className={`${inputClass} bg-white`}
                  >
                    {(Object.keys(fieldTypeLabels) as CustomFieldType[]).map((t) => (
                      <option key={t} value={t}>{fieldTypeLabels[t]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-0.5 pt-1.5">
                  <button type="button" onClick={() => moveField(f.id, -1)} disabled={i === 0}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Move up">
                    <ChevronUp size={15} />
                  </button>
                  <button type="button" onClick={() => moveField(f.id, 1)}
                    disabled={i === config.customFields.length - 1}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30" aria-label="Move down">
                    <ChevronDown size={15} />
                  </button>
                </div>
              </div>
              {f.type === "select" || f.type === "radio" ? (
                <OptionRows
                  options={f.options ?? []}
                  onChange={(options) => setField(f.id, { options })}
                  withDescriptions={f.type === "radio"}
                />
              ) : (
                <input
                  type="text"
                  value={f.placeholder ?? ""}
                  onChange={(e) => setField(f.id, { placeholder: e.target.value || undefined })}
                  placeholder="Placeholder text (optional), e.g. $800 – $1,200"
                  className={inputClass}
                />
              )}
              {contactFieldDefs.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Save answer to client field:</label>
                  <select
                    value={f.contactFieldId ?? ""}
                    onChange={(e) => setField(f.id, { contactFieldId: e.target.value || undefined })}
                    className={`${inputClass} bg-white`}
                  >
                    <option value="">Request notes only</option>
                    {contactFieldDefs.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => setField(f.id, { required: e.target.checked })}
                    className="accent-green-600"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => set({ customFields: config.customFields.filter((x) => x.id !== f.id) })}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addField}
          className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 rounded-full hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <Plus size={14} />
          Add field
        </button>
      </Card>

      {/* Message box */}
      <Card title="Message box">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.message.show}
            onChange={(e) => setMessage({ show: e.target.checked })}
            className="accent-green-600"
          />
          Show a message box
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={smallLabel}>Label</label>
            <input
              type="text"
              value={config.message.label}
              onChange={(e) => setMessage({ label: e.target.value })}
              placeholder="e.g. Tell us about your build"
              className={inputClass}
            />
          </div>
          <div>
            <label className={smallLabel}>Placeholder</label>
            <input
              type="text"
              value={config.message.placeholder ?? ""}
              onChange={(e) => setMessage({ placeholder: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.message.required}
            onChange={(e) => setMessage({ required: e.target.checked })}
            className="accent-green-600"
          />
          Required
        </label>
      </Card>

      {/* Send button */}
      <Card title="Send button" hint="the color is the whole form's accent">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={smallLabel}>Button text</label>
            <input
              type="text"
              value={config.button.label}
              onChange={(e) => setButton({ label: e.target.value })}
              placeholder="e.g. Send My Request"
              maxLength={40}
              className={inputClass}
            />
          </div>
          <div>
            <label className={smallLabel}>Button color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.button.color ?? "#16A34A"}
                onChange={(e) => setButton({ color: e.target.value })}
                className="h-9 w-12 rounded-lg border border-gray-300 cursor-pointer p-1"
              />
              <span className="text-xs font-mono text-gray-500">
                {config.button.color ?? "Brand color"}
              </span>
              {config.button.color && (
                <button
                  type="button"
                  onClick={() => setButton({ color: undefined })}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
