"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminShell } from "@/components/AdminShell";
import Link from "next/link";

type StaffMember = { id: string; name: string; role: string };

export default function NewClientPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [form, setForm] = useState({
    name: "", email: "", password: "", company: "", phone: "", accountManagerId: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/staff")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setStaff(data) : setStaff([]));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      router.push("/admin/clients");
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
      setSubmitting(false);
    }
  }

  const inputClass = "w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors text-foreground placeholder:text-muted-foreground";
  const labelClass = "block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5";

  return (
    <AdminShell userName={session?.user?.name ?? "Admin"} userRole={session?.user?.role}>
      <div className="max-w-2xl">
        <div className="mb-8">
          <Link
            href="/admin/clients"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors inline-flex items-center gap-1.5 mb-4"
          >
            ← Back to Clients
          </Link>
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Admin</p>
          <h1 className="text-3xl font-black uppercase">New Client</h1>
          <p className="text-sm text-muted-foreground mt-1">Create a client account. They&apos;ll use the email and password below to log in to their portal.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-border">
          <div className="p-6 border-b border-border">
            <h2 className="text-xs font-black uppercase tracking-widest mb-5">Contact Information</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="name">Full Name <span className="text-destructive">*</span></label>
                <input id="name" name="name" type="text" required value={form.name} onChange={handleChange} className={inputClass} placeholder="Jane Smith" />
              </div>
              <div>
                <label className={labelClass} htmlFor="email">Email Address <span className="text-destructive">*</span></label>
                <input id="email" name="email" type="email" required value={form.email} onChange={handleChange} className={inputClass} placeholder="jane@company.com" />
              </div>
              <div>
                <label className={labelClass} htmlFor="company">Company</label>
                <input id="company" name="company" type="text" value={form.company} onChange={handleChange} className={inputClass} placeholder="Acme Corp" />
              </div>
              <div>
                <label className={labelClass} htmlFor="phone">Phone</label>
                <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} className={inputClass} placeholder="(214) 555-0000" />
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-border">
            <h2 className="text-xs font-black uppercase tracking-widest mb-5">Portal Access</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="password">Temporary Password <span className="text-destructive">*</span></label>
                <input id="password" name="password" type="text" required value={form.password} onChange={handleChange} className={inputClass} placeholder="Give them a password to log in with" />
                <p className="text-xs text-muted-foreground mt-1.5">Share this with the client. They can update it later.</p>
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-border">
            <h2 className="text-xs font-black uppercase tracking-widest mb-5">Account Manager</h2>
            <div>
              <label className={labelClass} htmlFor="accountManagerId">Assign To</label>
              <select id="accountManagerId" name="accountManagerId" value={form.accountManagerId} onChange={handleChange} className={`${inputClass} cursor-pointer`}>
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.role === "ADMIN" ? " (Admin)" : " (Account Manager)"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          <div className="p-6 flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="bg-accent text-accent-foreground font-black text-xs uppercase tracking-widest px-8 py-3 hover:bg-accent/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create Client Account"}
            </button>
            <Link href="/admin/clients" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
