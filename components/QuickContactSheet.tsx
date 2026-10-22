"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { Input, inputCls } from "@/components/Input";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { Button } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { formatPhoneAsTyped, splitName, titleCaseName } from "@/lib/phone-input";
import type { PickerContact } from "@/components/ContactPicker";

/**
 * Add a client without leaving the form. The quote, invoice and job forms
 * all start with a client picker, and a brand-new company has nobody to
 * pick — the picker said "No matching clients." and the only way out was to
 * abandon the form, add the client on its own page, and start over (audit
 * 2026-10-12). Three boxes — name, phone, email — one POST to
 * /api/app/contacts, and the new person is selected in the picker that
 * opened this. The phone formats itself as it's typed; a lowercase name is
 * capitalised on the way out (streamline batch 1, 2026-10-16).
 */
export default function QuickContactSheet({
  open,
  onClose,
  onCreated,
  initialName = "",
  kind = "CLIENT",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: PickerContact) => void;
  /** What they typed in the picker's search box — becomes the name. */
  initialName?: string;
  kind?: "CLIENT" | "CONTACT";
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  // A client with no address can't be a stop on a route — the first "Add
  // client" without one says so and waits; the second saves anyway
  // (David 2026-10-19: nudge, don't block).
  const [nudged, setNudged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fresh draft on every open, seeded from the search text.
  useEffect(() => {
    if (!open) return;
    setName(initialName.trim());
    setPhone("");
    setEmail("");
    setAddress("");
    setNudged(false);
    setError("");
    setBusy(false);
  }, [open, initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // The sheet is a portaled <form> inside the host page's own <form>
    // (ContactPicker sits in the job / quote / invoice / request /
    // appointment / series / agreement forms), and React carries synthetic
    // events through portals along the component tree — without this, Enter
    // here also submitted the host (same trap as EstimatorRunner).
    e.stopPropagation();
    if (busy) return;
    const { firstName, lastName } = splitName(titleCaseName(name));
    if (!firstName) {
      setError("Name is required.");
      return;
    }
    if (kind === "CLIENT" && !address.trim() && !nudged) {
      setNudged(true);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ id: string; firstName: string; lastName: string; address?: string | null }>("/api/app/contacts", {
      firstName,
      lastName,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      kind,
      // A person you are quoting or billing is a client, not a lead to chase
      status: "ACTIVE",
    });
    setBusy(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    onCreated({ id: data.id, firstName: data.firstName ?? firstName, lastName: data.lastName ?? lastName, address: address.trim() || null });
    onClose();
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} dismissible={!busy} portal>
      {/* onChange stops too: the hosts mark themselves dirty on any change, and typing here is not an edit to them */}
      <form onSubmit={submit} onChange={(e) => e.stopPropagation()} className="ds">
        <h2 className="text-lg font-semibold text-gray-900">New client</h2>
        {error && (
          <p role="alert" className="form-error mt-3">
            {error}
          </p>
        )}
        <div className="mt-4">
          <label htmlFor="qc-name" className="mb-1 block text-sm font-medium text-gray-700">
            Name *
          </label>
          <Input
            id="qc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setName((n) => titleCaseName(n))}
            autoFocus
            required
            autoComplete="off"
            placeholder="Mike Jones"
          />
        </div>
        <div className="mt-3">
          <label htmlFor="qc-phone" className="mb-1 block text-sm font-medium text-gray-700">
            Phone
          </label>
          <Input
            id="qc-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhoneAsTyped(e.target.value))}
            placeholder="(214) 555-0100"
          />
        </div>
        <div className="mt-3">
          <label htmlFor="qc-email" className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <Input id="qc-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        {kind === "CLIENT" && (
          <div className="mt-3">
            <label htmlFor="qc-address" className="mb-1 block text-sm font-medium text-gray-700">
              Address
            </label>
            <AddressAutocomplete
              id="qc-address"
              endpoint="/api/app/geocode/suggest"
              value={address}
              onChange={(v) => {
                setAddress(v);
                if (v.trim()) setNudged(false);
              }}
              onPick={(a) => {
                setAddress(a.label);
                setNudged(false);
              }}
              placeholder="Street, city, state"
              className={inputCls}
            />
            {nudged && !address.trim() && (
              <p role="status" className="mt-2 rounded-lg bg-[color:var(--ds-warn-soft)] px-3 py-2 text-[13px] text-[color:var(--ds-warn)]">
                No address yet — their jobs won&apos;t show on the map or a route until one is on file. Add it here, or save without.
              </p>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {nudged && !address.trim() ? "Save without address" : "Add client"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
