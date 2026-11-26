"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import "@/app/client-heavy.css";

/** Inside the portal the heavy pieces take the portal's own button color (hub-heavy.css --hh-accent). */
const HUB_ACCENT = { "--ch-accent": "var(--hh-accent)", "--ch-on-accent": "var(--hh-on-accent)" } as React.CSSProperties;

/** Back arrow + the form's title, on the portal ground. */
export function HubFormHeader({ base, title, description }: { base: string; title: string; description?: string | null }) {
  return (
    <div className="mb-5">
      <Link href={base} className="hk-back" aria-label="Back to your hub">
        <ArrowLeft size={16} strokeWidth={2.4} /> Home
      </Link>
      <h1 className="hk-title">{title}</h1>
      {description && <p className="hk-note">{description}</p>}
    </div>
  );
}

export default function HubRequestForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/hub/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, title, details }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="ch-card px-6 py-10 text-center" style={HUB_ACCENT}>
        <div className="ch-done-mark mb-5">
          <CheckCircle size={30} />
        </div>
        <h2 className="ch-h2 mb-2 text-gray-900">Request received!</h2>
        <p className="mb-6 text-[15px] text-gray-600">We&apos;ll review the details and get back to you shortly.</p>
        <Link href={`/hub/${token}`} className="ch-btn-2 is-auto">
          Back to your hub
        </Link>
      </div>
    );
  }

  return (
    <div style={HUB_ACCENT}>
      <HubFormHeader base={`/hub/${token}`} title="New request" />

      <form onSubmit={handleSubmit} className="ch-card space-y-5 p-5 sm:p-7">
        {error && <div className="ch-error">{error}</div>}
        <div>
          <label htmlFor="hub-request-title" className="ch-label">
            What do you need done? *
          </label>
          <input
            id="hub-request-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Driveway and patio pressure wash"
            className="ch-input"
          />
        </div>
        <div>
          <label htmlFor="hub-request-details" className="ch-label">
            Details
          </label>
          <textarea
            id="hub-request-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={5}
            placeholder="Please provide as much information as you can..."
            className="ch-input resize-none"
          />
        </div>
        <button type="submit" disabled={loading} className="ch-btn is-auto">
          {loading && <Loader2 size={16} className="animate-spin" />}
          Send request
        </button>
      </form>
    </div>
  );
}
