"use client";

import { useState, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { AdminShell } from "@/components/AdminShell";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: { clients: number };
};

export default function StaffPage() {
  const { data: session } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchStaff() {
    const res = await fetch("/api/admin/staff");
    if (res.ok) setStaff(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchStaff(); }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ name: "", email: "", password: "" });
      setShowForm(false);
      fetchStaff();
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
    }
    setSubmitting(false);
  }

  const inputClass = "w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors text-foreground placeholder:text-muted-foreground";

  return (
    <AdminShell userName={session?.user?.name ?? "Admin"} userRole={session?.user?.role}>
      <div className="max-w-4xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Admin</p>
            <h1 className="text-3xl font-black uppercase">Team</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage account managers and admin users.</p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-accent text-accent-foreground font-black text-xs uppercase tracking-widest px-6 py-3 hover:bg-accent/85 transition-colors shrink-0"
            >
              + Add Member
            </button>
          )}
        </div>

        {/* Add Member Form */}
        {showForm && (
          <div className="bg-white border border-border mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-xs font-black uppercase tracking-widest">Add Team Member</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="name">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <input id="name" name="name" type="text" required value={form.name} onChange={handleChange} className={inputClass} placeholder="Alex Johnson" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="s-email">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <input id="s-email" name="email" type="email" required value={form.email} onChange={handleChange} className={inputClass} placeholder="alex@streamflaremedia.com" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="s-password">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <input id="s-password" name="password" type="text" required value={form.password} onChange={handleChange} className={inputClass} placeholder="Temporary password" />
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-600 mb-4 font-medium">{error}</p>
              )}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={submitting} className="bg-accent text-accent-foreground font-black text-xs uppercase tracking-widest px-6 py-2.5 hover:bg-accent/85 transition-colors disabled:opacity-50">
                  {submitting ? "Adding..." : "Add Member"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError(""); }} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Staff List */}
        {loading ? (
          <div className="bg-white border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <div className="bg-white border border-border divide-y divide-border">
            {staff.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">No team members yet.</p>
            ) : (
              staff.map((member) => (
                <div key={member.id} className="px-6 py-5 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-0.5">
                      <p className="font-bold text-sm">{member.name}</p>
                      <span className={`text-xs font-black uppercase tracking-wide px-1.5 py-0.5 ${
                        member.role === "ADMIN" ? "bg-primary text-primary-foreground" : "bg-accent/15 text-accent"
                      }`}>
                        {member.role === "ADMIN" ? "Admin" : "Account Manager"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{member._count.clients}</p>
                    <p className="text-xs text-muted-foreground">Clients</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
