"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  sanitizeBookingForm,
  type BookingFormConfig,
  type CustomField,
  type CustomFieldType,
  type FieldOption,
} from "@/lib/booking-form";

/**
 * Settings card for customizing the booking/embed form: the service question,
 * the message box, optional built-in fields, and custom fields. Custom field
 * answers land in the request notes as "Label - value" lines.
 *
 * Saves on its own (PATCH { bookingForm }) so it doesn't tangle with the main
 * settings form.
 */

const fieldTypeLabels: Record<CustomFieldType, string> = {
  text: "Short text",
  textarea: "Paragraph",
  select: "Dropdown",
  radio: "Multiple choice",
};

/** Options textarea encoding: one per line, "Label | optional description". */
function optionsToText(options?: FieldOption[]): string {
  return (options ?? [])
    .map((o) => (o.description ? `${o.label} | ${o.description}` : o.label))
    .join("\n");
}

function textToOptions(text: string): FieldOption[] {
  return text
    .split("\n")
    .map((line) => {
      const [label, ...rest] = line.split("|");
      return { label: label.trim(), description: rest.join("|").trim() || undefined };
    })
    .filter((o) => o.label);
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const smallLabel = "block text-xs font-medium text-gray-500 mb-1";

export default function BookingFormBuilder({ initial }: { initial: unknown }) {
  const [config, setConfig] = useState<BookingFormConfig>(() => sanitizeBookingForm(initial));
  // Options live as raw text while editing so typing "|" or blank lines works
  const [optionTexts, setOptionTexts] = useState<Record<string, string>>(() => {
    const c = sanitizeBookingForm(initial);
    const map: Record<string, string> = { service: optionsToText(c.service.options) };
    for (const f of c.customFields) map[f.id] = optionsToText(f.options);
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setService(patch: Partial<BookingFormConfig["service"]>) {
    setConfig((c) => ({ ...c, service: { ...c.service, ...patch } }));
  }

  function setMessage(patch: Partial<BookingFormConfig["message"]>) {
    setConfig((c) => ({ ...c, message: { ...c.message, ...patch } }));
  }

  function setButton(patch: Partial<BookingFormConfig["button"]>) {
    setConfig((c) => ({ ...c, button: { ...c.button, ...patch } }));
  }

  function setField(id: string, patch: Partial<CustomField>) {
    setConfig((c) => ({
      ...c,
      customFields: c.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function addField() {
    const id = `field-${Math.random().toString(36).slice(2, 8)}`;
    setConfig((c) => ({
      ...c,
      customFields: [
        ...c.customFields,
        { id, label: "", type: "text", required: false } satisfies CustomField,
      ],
    }));
    setOptionTexts((t) => ({ ...t, [id]: "" }));
  }

  function removeField(id: string) {
    setConfig((c) => ({ ...c, customFields: c.customFields.filter((f) => f.id !== id) }));
  }

  function moveField(id: string, dir: -1 | 1) {
    setConfig((c) => {
      const fields = [...c.customFields];
      const i = fields.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= fields.length) return c;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...c, customFields: fields };
    });
  }

  async function save() {
    setSaving(true);
    const payload: BookingFormConfig = {
      ...config,
      service: { ...config.service, options: textToOptions(optionTexts.service ?? "") },
      customFields: config.customFields.map((f) => ({
        ...f,
        options:
          f.type === "select" || f.type === "radio"
            ? textToOptions(optionTexts[f.id] ?? "")
            : undefined,
      })),
    };
    await fetch("/api/app/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingForm: payload }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const optionsEditor = (key: string, hint: string) => (
    <div>
      <label className={smallLabel}>Choices — one per line, add a description with &quot;|&quot;</label>
      <textarea
        value={optionTexts[key] ?? ""}
        onChange={(e) => setOptionTexts((t) => ({ ...t, [key]: e.target.value }))}
        rows={3}
        placeholder={hint}
        className={`${inputClass} resize-none font-mono text-xs`}
      />
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Booking Form Fields</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Customize what clients fill out on your booking page and embedded form. Name, email, and
          phone are always asked.
        </p>
      </div>

      {/* Built-in toggles */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showAddress}
            onChange={(e) => setConfig((c) => ({ ...c, showAddress: e.target.checked }))}
            className="accent-green-600"
          />
          Ask for service address
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showPreferredDate}
            onChange={(e) => setConfig((c) => ({ ...c, showPreferredDate: e.target.checked }))}
            className="accent-green-600"
          />
          Ask for preferred date
        </label>
      </div>

      {/* Service question */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Service question <span className="font-normal normal-case text-gray-400">— becomes the request title</span>
        </p>
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
          optionsEditor("service", "Build Only | I have my parts — just need assembly\nParts + Build | Source the parts and build for me")
        )}
      </div>

      {/* Custom fields */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom fields</p>
        {config.customFields.length === 0 && (
          <p className="text-xs text-gray-400">
            None yet — add questions specific to your business (budget, city, gate code...).
          </p>
        )}
        {config.customFields.map((f, i) => (
          <div key={f.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                <div>
                  <label className={smallLabel}>Label</label>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => setField(f.id, { label: e.target.value })}
                    placeholder="e.g. Budget"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={smallLabel}>Type</label>
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
              </div>
              <div className="flex flex-col gap-1 pt-5">
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
              optionsEditor(f.id, "Springfield\nNixa\nOzark")
            ) : (
              <div>
                <label className={smallLabel}>Placeholder</label>
                <input
                  type="text"
                  value={f.placeholder ?? ""}
                  onChange={(e) => setField(f.id, { placeholder: e.target.value })}
                  placeholder="e.g. $800 – $1,200"
                  className={inputClass}
                />
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
                onClick={() => removeField(f.id)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={12} />
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addField}
          className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 rounded hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <Plus size={14} />
          Add field
        </button>
        <p className="text-xs text-gray-400">
          Custom answers are added to the request notes, e.g. <span className="font-mono">Budget - $1,500</span>.
        </p>
      </div>

      {/* Message box */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message box</p>
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
      </div>

      {/* Send button */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Send button</p>
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
        <p className="text-xs text-gray-400">
          The color is also used for selected choices and the success checkmark, so the whole form
          matches your website.
        </p>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
        {saved ? "Saved!" : "Save Form Fields"}
      </button>
    </div>
  );
}
