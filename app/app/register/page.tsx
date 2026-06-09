"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Briefcase, Loader2, Check } from "lucide-react";
import Link from "next/link";

const perks = [
  "Unlimited jobs, contacts & users",
  "Quotes, invoices & online payments",
  "Scheduling calendar & dispatch",
  "Automated payment reminders",
  "Online booking widget",
  "Always free — we earn on payments",
];

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    companyName: "",
    yourName: "",
    email: "",
    password: "",
    phone: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/app/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    // Auto sign in after registration
    await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    router.push("/app/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-center bg-[#0C0F0C] text-white px-12 w-96 xl:w-[480px] shrink-0">
        <div className="flex items-center gap-2 mb-12">
          <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center">
            <Briefcase size={14} className="text-black" />
          </div>
          <span className="font-bold text-lg tracking-wide uppercase">JobFlow</span>
        </div>
        <h2 className="text-3xl font-bold mb-3">Run your field service business — free.</h2>
        <p className="text-white/60 mb-8 text-sm leading-relaxed">
          Everything Housecall Pro and Jobber charge hundreds per month for. Free forever. We make
          money when you get paid, not before.
        </p>
        <ul className="space-y-3">
          {perks.map((perk) => (
            <li key={perk} className="flex items-center gap-3 text-sm text-white/80">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <Check size={11} className="text-green-400" />
              </div>
              {perk}
            </li>
          ))}
        </ul>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 justify-center mb-8 lg:hidden">
            <div className="w-8 h-8 bg-[#0C0F0C] rounded flex items-center justify-center">
              <Briefcase size={14} className="text-green-400" />
            </div>
            <span className="font-bold text-lg tracking-wide uppercase text-gray-900">JobFlow</span>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900 mb-1">Create your account</h1>
            <p className="text-sm text-gray-500 mb-6">Get your business running in 60 seconds</p>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business name
                </label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Acme HVAC & Cooling"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                <input
                  type="text"
                  value={form.yourName}
                  onChange={(e) => set("yourName", e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Jane Smith"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="you@acmehvac.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="(214) 555-0100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Min. 8 characters"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Create free account
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              No credit card required. Free forever.
            </p>
          </div>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{" "}
            <Link href="/app/login" className="text-green-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
