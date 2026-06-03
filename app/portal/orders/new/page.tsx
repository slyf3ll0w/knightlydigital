"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PortalShell } from "@/components/PortalShell";
import { services } from "@/lib/services";

export default function NewOrderPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [serviceName, setServiceName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!serviceName) { setError("Please select a service."); return; }
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/portal/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceName, notes }),
    });

    if (res.ok) {
      router.push("/portal/orders");
    } else {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <PortalShell userName={session?.user?.name ?? ""}>
      <div className="max-w-xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Orders</p>
          <h1 className="text-3xl font-black uppercase">Request a Service</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Select the service you&apos;re interested in and tell us a little about what you need. Your account manager will follow up within one business day.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-border p-8 flex flex-col gap-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Service *
            </label>
            <select
              required
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
            >
              <option value="">— Select a Service —</option>
              {services.map((s) => (
                <option key={s.slug} value={s.name}>
                  {s.name}
                </option>
              ))}
              <option value="General Inquiry">General Inquiry / Not Sure Yet</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Details & Goals
            </label>
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder="Describe what you're looking to accomplish, your timeline, any specific requirements..."
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="bg-accent text-accent-foreground font-bold px-8 py-4 text-sm tracking-widest uppercase hover:bg-accent/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm text-muted-foreground hover:text-foreground font-bold uppercase tracking-wide transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}
