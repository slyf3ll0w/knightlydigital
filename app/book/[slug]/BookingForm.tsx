"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

export default function BookingForm({ companySlug }: { companySlug: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", service: "", preferredDate: "", message: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch(`/api/public/book/${companySlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={28} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Request received!</h2>
        <p className="text-gray-500 text-sm">
          We&apos;ll be in touch within 1 business day to confirm your appointment.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First name *</label>
          <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last name *</label>
          <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
          <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Service address</label>
        <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
          placeholder="123 Main St, Dallas, TX 75201"
          className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Service needed *</label>
        <input type="text" value={form.service} onChange={(e) => set("service", e.target.value)} required
          placeholder="e.g. AC tune-up, Lawn mowing, Roof inspection"
          className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Preferred date</label>
        <input type="date" value={form.preferredDate} onChange={(e) => set("preferredDate", e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={3}
          placeholder="Any additional details..."
          className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
      </div>
      <button type="submit" disabled={loading}
        className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
        {loading && <Loader2 size={14} className="animate-spin" />}
        Request Appointment
      </button>
    </form>
  );
}
