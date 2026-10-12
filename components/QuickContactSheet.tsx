"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { Input } from "@/components/Input";
import { Button } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import type { PickerContact } from "@/components/ContactPicker";

/**
 * Add a client without leaving the form. The quote, invoice and job forms
 * all start with a client picker, and a brand-new company has nobody to
 * pick — the picker said "No matching clients." and the only way out was to
 * abandon the form, add the client on its own page, and start over (audit
 * 2026-10-12). Four fields, one POST to /api/app/contacts, and the new
 * person is selected in the picker that opened this.
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fresh draft on every open, seeded from the search text ("Maria Lopez"
  // → first + last).
  useEffect(() => {
    if (!open) return;
    const [first = "", ...rest] = initialName.trim().split(/\s+/);
    setFirstName(first);
    setLastName(rest.join(" "));
    setPhone("");
    setEmail("");
    setError("");
    setBusy(false);
  }, [open, initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ id: string; firstName: string; lastName: string }>("/api/app/contacts", {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      kind,
      // A person you are quoting or billing is a client, not a lead to chase
      status: "ACTIVE",
    });
    setBusy(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    onCreated({ id: data.id, firstName: data.firstName ?? firstName.trim(), lastName: data.lastName ?? lastName.trim() });
    onClose();
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} dismissible={!busy} portal>
      <form onSubmit={submit} className="ds">
        <h2 className="text-lg font-semibold text-gray-900">New client</h2>
        {error && (
          <p role="alert" className="form-error mt-3">
            {error}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="qc-first" className="mb-1 block text-sm font-medium text-gray-700">
              First name *
            </label>
            <Input id="qc-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus required />
          </div>
          <div>
            <label htmlFor="qc-last" className="mb-1 block text-sm font-medium text-gray-700">
              Last name
            </label>
            <Input id="qc-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="qc-phone" className="mb-1 block text-sm font-medium text-gray-700">
            Phone
          </label>
          <Input id="qc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(214) 555-0100" />
        </div>
        <div className="mt-3">
          <label htmlFor="qc-email" className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <Input id="qc-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Add client
          </Button>
        </div>
      </form>
    </Modal>
  );
}
