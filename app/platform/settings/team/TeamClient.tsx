"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus, UserPlus, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Team management — add members (free, no seat limits), change roles,
 * deactivate, reset passwords; plus the company's lead-routing and
 * sales-payments policies.
 */

type Member = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  bookable: boolean;
  createdAt: string;
};

const roleLabel: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  USER: "Sales + Tech",
  SALES: "Sales",
  TECH: "Tech",
  SUPERADMIN: "Superadmin",
};

const roleDescriptions: Record<string, string> = {
  OWNER: "Everything, including team management",
  ADMIN: "Everything except managing owners and admins",
  USER: "Sales and field work combined — no settings or team access",
  SALES: "Their assigned leads: requests, quotes, and converting to jobs",
  TECH: "Their assigned jobs and schedule — no pricing",
};

function rolesManageableBy(actorRole: string): string[] {
  if (actorRole === "OWNER") return ["OWNER", "ADMIN", "USER", "SALES", "TECH"];
  if (actorRole === "ADMIN") return ["USER", "SALES", "TECH"];
  return [];
}

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function TeamClient({
  actorId,
  actorRole,
  users,
  defaultLeadUserId,
  salesSeePayments,
}: {
  actorId: string;
  actorRole: string;
  users: Member[];
  defaultLeadUserId: string;
  salesSeePayments: boolean;
}) {
  const router = useRouter();
  const manageable = rolesManageableBy(actorRole);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "TECH", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [policyBusy, setPolicyBusy] = useState(false);

  const canManage = (m: Member) => m.id !== actorId && manageable.includes(m.role);
  const activeMembers = users.filter((u) => u.isActive);

  async function addMember() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson("/api/app/team", form, "POST");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setForm({ name: "", email: "", phone: "", role: "TECH", password: "" });
    setShowAdd(false);
    router.refresh();
  }

  async function patchMember(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/team/${id}`, body, "PATCH");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return false;
    }
    router.refresh();
    return true;
  }

  async function patchPolicy(body: Record<string, unknown>) {
    setPolicyBusy(true);
    setError("");
    const { ok, data } = await postJson("/api/app/team/settings", body, "PATCH");
    setPolicyBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <div>
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Add as many team members as you need — free, no per-user charges.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          Add Team Member
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Add member */}
      {showAdd && (
        <div className="card-ledger p-5 mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <UserPlus size={13} />
            New team member
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={inputCls}
              >
                {manageable.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">{roleDescriptions[form.role]}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Starting password *</label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters — share it with them; they can change it later"
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={addMember}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Add Member
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Member list */}
      <div className="card-ledger divide-y divide-gray-100 mb-6">
        {users.map((m) => (
          <div key={m.id} className={`px-4 py-3 ${m.isActive ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={m.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {m.name}
                  {m.id === actorId && <span className="text-xs text-gray-400"> (you)</span>}
                  {!m.isActive && <span className="text-xs text-red-500"> · deactivated</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ""}
                </p>
              </div>

              {m.isActive && (canManage(m) || m.id === actorId) && (
                <label
                  className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"
                  title="This person's open time shows in the online booking slot picker"
                >
                  <input
                    type="checkbox"
                    checked={m.bookable}
                    disabled={busy}
                    onChange={(e) => patchMember(m.id, { bookable: e.target.checked })}
                    className="accent-green-600"
                  />
                  Bookable online
                </label>
              )}

              {canManage(m) ? (
                <select
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => patchMember(m.id, { role: e.target.value })}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {manageable.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="px-2 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                  {roleLabel[m.role] ?? m.role}
                </span>
              )}

              {canManage(m) && (
                <>
                  <button
                    onClick={() => {
                      setResetFor(resetFor === m.id ? null : m.id);
                      setResetPassword("");
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="Reset password"
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={() => patchMember(m.id, { isActive: !m.isActive })}
                    disabled={busy}
                    className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                      m.isActive
                        ? "text-red-600 hover:bg-red-50"
                        : "text-green-700 hover:bg-green-50"
                    }`}
                  >
                    {m.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </>
              )}
            </div>

            {resetFor === m.id && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pl-11">
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="New password (8+ characters)"
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-64"
                />
                <button
                  onClick={async () => {
                    if (await patchMember(m.id, { password: resetPassword })) {
                      setResetFor(null);
                      setResetPassword("");
                    }
                  }}
                  disabled={busy || resetPassword.length < 8}
                  className="px-3 py-1.5 chamfer bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded disabled:opacity-50"
                >
                  Set Password
                </button>
                <button
                  onClick={() => setResetFor(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Policies */}
      <div className="card-ledger p-5 space-y-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Lead routing &amp; permissions
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Website leads go to</p>
            <p className="text-xs text-gray-500">
              New requests from your booking form are assigned to this person.
            </p>
          </div>
          <select
            value={defaultLeadUserId}
            disabled={policyBusy}
            onChange={(e) => patchPolicy({ defaultLeadUserId: e.target.value || null })}
            className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Company owner (default)</option>
            {activeMembers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Sales can see invoices &amp; payments</p>
            <p className="text-xs text-gray-500">
              When off, Sales members only see their leads, requests, and quotes.
            </p>
          </div>
          <button
            onClick={() => patchPolicy({ salesSeePayments: !salesSeePayments })}
            disabled={policyBusy}
            role="switch"
            aria-checked={salesSeePayments}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              salesSeePayments ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                salesSeePayments ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
