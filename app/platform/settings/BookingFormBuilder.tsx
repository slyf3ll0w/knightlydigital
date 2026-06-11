"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type {
  BookingFormConfig,
  CustomField,
  CustomFieldType,
  FieldOption,
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
  "w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const smallLabel = "block text-xs font-medium text-gray-500 mb-1";
const sectionTitle = "text-xs font-semibold text-gray-500 uppercase tracking-wide";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
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
}: {
  config: BookingFormConfig;
  onChange: (config: BookingFormConfig) => void;
}) {
  const set = (patch: Partial<BookingFormConfig>) => onChange({ ...config, ...patch });
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
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
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
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        config.appearance.fontSize === value
          ? "bg-gray-900 text-white"
          : "text-gray-600 hover:bg-gray-100 border border-gray-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
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
      <Card title="Standard fields" hint="name, email, and phone are always asked">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showAddress}
              onChange={(e) => set({ showAddress: e.target.checked })}
              className="accent-green-600"
            />
            Ask for service address
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showPreferredDate}
              onChange={(e) => set({ showPreferredDate: e.target.checked })}
              className="accent-green-600"
            />
            Ask for preferred date
          </label>
        </div>
      </Card>

      {/* Service question */}
      <Card title="Service question" hint="becomes the request title">
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
      </Card>

      {/* Custom fields */}
      <Card title="Custom fields" hint="answers are added to the request notes">
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
          className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 rounded hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <Plus size={14} />
          Add field
        </button>
      </Card>

      {/* Message box */}
      <Card title="Message box">
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
                className="h-9 w-12 rounded border border-gray-300 cursor-pointer p-1"
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
