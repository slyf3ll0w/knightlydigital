"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * CSV client importer: upload → map columns → import (chunked) → summary
 * with one-click undo. Header auto-detection covers our template plus the
 * Jobber / Housecall Pro export formats — pure string matching, no AI.
 */

const TARGETS = [
  { key: "", label: "— Ignore —" },
  { key: "fullName", label: "Full name (split into first/last)" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "companyName", label: "Company name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "notes", label: "Notes" },
  { key: "leadSource", label: "Lead source" },
] as const;

// header synonyms (lowercased, non-alphanumerics stripped)
const HEADER_MAP: Record<string, string> = {
  firstname: "firstName", first: "firstName", fname: "firstName", givenname: "firstName",
  lastname: "lastName", last: "lastName", lname: "lastName", surname: "lastName", familyname: "lastName",
  name: "fullName", fullname: "fullName", clientname: "fullName", customername: "fullName", contactname: "fullName",
  company: "companyName", companyname: "companyName", business: "companyName", businessname: "companyName", organization: "companyName",
  email: "email", emailaddress: "email", primaryemail: "email",
  phone: "phone", phonenumber: "phone", mobile: "phone", cell: "phone", mobilephone: "phone",
  mainphone: "phone", primaryphone: "phone", telephone: "phone", homephone: "phone",
  address: "address", street: "address", streetaddress: "address", address1: "address",
  addressline1: "address", billingaddress: "address", serviceaddress: "address",
  city: "city", town: "city",
  state: "state", province: "state", region: "state", stateprovince: "state",
  zip: "zip", zipcode: "zip", postalcode: "zip", postcode: "zip",
  notes: "notes", note: "notes", comments: "notes", description: "notes", tags: "notes",
  leadsource: "leadSource", source: "leadSource", referral: "leadSource", referralsource: "leadSource",
};

const TEMPLATE_CSV =
  "First Name,Last Name,Company Name,Email,Phone,Street Address,City,State,ZIP,Notes,Lead Source\n" +
  'John,Rivera,,john@example.com,(214) 555-0142,512 Oak Hollow Dr,Allen,TX,75013,Backyard gate code 4412,Referral\n';

const CHUNK_SIZE = 200;

type Step = "upload" | "map" | "importing" | "done";
type Summary = { created: number; updated: number; skippedDuplicates: number; errors: { row: number; reason: string }[] };

const inputCls =
  "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

function detectTarget(header: string): string {
  return HEADER_MAP[header.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? "";
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export default function ImportClient({
  actorId,
  users,
  fieldDefs = [],
}: {
  actorId: string;
  users: { id: string; name: string }[];
  fieldDefs?: { id: string; label: string }[];
}) {
  const allTargets = [
    ...TARGETS,
    ...fieldDefs.map((d) => ({ key: `cf:${d.id}`, label: `Custom: ${d.label}` })),
  ];
  const detectWithCustom = (header: string): string => {
    const builtIn = detectTarget(header);
    if (builtIn) return builtIn;
    const norm = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = fieldDefs.find((d) => d.label.toLowerCase().replace(/[^a-z0-9]/g, "") === norm);
    return match ? `cf:${match.id}` : "";
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [status, setStatus] = useState<"LEAD" | "ACTIVE">("LEAD");
  const [assignedToId, setAssignedToId] = useState(actorId);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update">("skip");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [batchId, setBatchId] = useState("");
  const [undone, setUndone] = useState<{ deleted: number; kept: number } | null>(null);
  const [undoing, setUndoing] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "client-import-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      if (parsed.length < 2) {
        setError("That file needs a header row plus at least one client row.");
        return;
      }
      const head = parsed[0].map((h) => h.trim());
      setFileName(file.name);
      setHeaders(head);
      setRows(parsed.slice(1));
      setMapping(head.map(detectWithCustom));
      setStep("map");
    };
    reader.readAsText(file);
  }

  function buildRow(cells: string[]): Record<string, unknown> {
    const out: Record<string, string> = {};
    const customFields: Record<string, string> = {};
    mapping.forEach((target, i) => {
      const value = (cells[i] ?? "").trim();
      if (!target || !value) return;
      if (target.startsWith("cf:")) {
        customFields[target.slice(3)] = value;
        return;
      }
      if (target === "fullName") {
        const { firstName, lastName } = splitFullName(value);
        if (!out.firstName) out.firstName = firstName;
        if (!out.lastName) out.lastName = lastName;
      } else if (out[target]) {
        // two columns mapped to the same target (e.g. Tags + Notes → Notes)
        out[target] = `${out[target]}\n${value}`;
      } else {
        out[target] = value;
      }
    });
    return Object.keys(customFields).length > 0 ? { ...out, customFields } : out;
  }

  const mappedTargets = new Set(mapping.filter(Boolean));
  const hasNameMapping =
    mappedTargets.has("fullName") || mappedTargets.has("firstName") ||
    mappedTargets.has("lastName") || mappedTargets.has("companyName");
  const readyRows = rows.filter((r) => {
    const m = buildRow(r);
    return m.firstName || m.lastName || m.companyName;
  }).length;

  async function runImport() {
    if (!hasNameMapping) {
      setError("Map at least one name column (full name, first/last, or company).");
      return;
    }
    setError("");
    setStep("importing");
    setProgress(0);

    const id = crypto.randomUUID();
    setBatchId(id);
    const mapped = rows.map(buildRow);
    const totals: Summary = { created: 0, updated: 0, skippedDuplicates: 0, errors: [] };

    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      const { ok, data } = await postJson<Summary>("/api/app/contacts/import", {
        rows: chunk,
        batchId: id,
        status,
        assignedToId,
        duplicateMode,
      });
      if (!ok || !data) {
        setError(data?.error ?? GENERIC_ERROR);
        setStep("map");
        return;
      }
      totals.created += data.created;
      totals.updated += data.updated;
      totals.skippedDuplicates += data.skippedDuplicates;
      totals.errors.push(...data.errors.map((e) => ({ ...e, row: e.row + i + 2 }))); // +2: header + 1-based
      setProgress(Math.min(100, Math.round(((i + chunk.length) / mapped.length) * 100)));
    }

    setSummary(totals);
    setStep("done");
  }

  async function undoImport() {
    if (!confirm("Remove every client created by this import? Anyone who already has work attached is kept.")) return;
    setUndoing(true);
    const { ok, data } = await postJson<{ deleted: number; kept: number }>(
      `/api/app/contacts/import?batchId=${batchId}`,
      undefined,
      "DELETE"
    );
    setUndoing(false);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setUndone(data);
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/app/contacts" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Import Clients</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        Bring your client list over from a spreadsheet or another CRM — Jobber and Housecall Pro
        exports are recognized automatically.
      </p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Step 1: upload ── */}
      {step === "upload" && (
        <div className="space-y-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-white p-10 text-center hover:border-green-400 hover:bg-green-50/30 transition-colors"
          >
            <Upload size={28} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-900">Choose a CSV file</p>
            <p className="text-xs text-gray-500 mt-1">
              Using Excel or Google Sheets? Use File → Save as / Download → CSV first.
            </p>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div className="card-ledger p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Starting from paper?</p>
              <p className="text-xs text-gray-500">
                Type your clients into our template, then upload it here.
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 btn-tool-line bg-white rounded-[10px] text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download size={14} />
              Download template
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: map columns ── */}
      {step === "map" && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileSpreadsheet size={15} className="text-green-600" />
            <span className="font-medium text-gray-900">{fileName}</span>
            <span>— {rows.length} rows</span>
            <button
              onClick={() => setStep("upload")}
              className="ml-auto text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Choose a different file
            </button>
          </div>

          <div className="card-ledger overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-4 py-2 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
              <span>Your column</span>
              <span>Example</span>
              <span>Imports as</span>
            </div>
            <div className="divide-y divide-gray-100">
              {headers.map((h, i) => {
                const sample = rows.find((r) => (r[i] ?? "").trim())?.[i] ?? "";
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-3 px-4 py-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{h || `Column ${i + 1}`}</span>
                    <span className="text-xs text-gray-500 truncate">{sample}</span>
                    <select
                      value={mapping[i]}
                      onChange={(e) => setMapping(mapping.map((m, j) => (j === i ? e.target.value : m)))}
                      className={`${inputCls} w-full ${mapping[i] ? "" : "text-gray-400"}`}
                    >
                      {allTargets.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-ledger p-4 grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Import as</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as "LEAD" | "ACTIVE")} className={`${inputCls} w-full`}>
                <option value="LEAD">Leads</option>
                <option value="ACTIVE">Active clients</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Assign to</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={`${inputCls} w-full`}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">If a client already exists</label>
              <select value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value as "skip" | "update")} className={`${inputCls} w-full`}>
                <option value="skip">Skip the row</option>
                <option value="update">Update their info</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{readyRows}</span> of {rows.length} rows ready
              {readyRows < rows.length && <span className="text-gray-400"> (rest have no name)</span>}
            </p>
            <button
              onClick={runImport}
              disabled={readyRows === 0}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
            >
              Import {readyRows} Clients
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: importing ── */}
      {step === "importing" && (
        <div className="card-ledger p-10 text-center">
          <Loader2 size={28} className="mx-auto animate-spin text-green-500 mb-4" />
          <p className="text-sm font-semibold text-gray-900 mb-3">Importing clients…</p>
          <div className="h-2 max-w-sm mx-auto bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* ── Step 4: summary ── */}
      {step === "done" && summary && (
        <div className="space-y-4">
          <div className="card-ledger p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                <Check size={16} className="text-green-600" />
              </span>
              <h2 className="text-lg font-bold text-gray-900">Import finished</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-2xl font-bold text-green-700">{summary.created}</p>
                <p className="text-xs text-green-700">added</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-2xl font-bold text-blue-700">{summary.updated}</p>
                <p className="text-xs text-blue-700">updated</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-2xl font-bold text-gray-700">{summary.skippedDuplicates + summary.errors.length}</p>
                <p className="text-xs text-gray-600">skipped</p>
              </div>
            </div>
            {summary.errors.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Rows that couldn&apos;t import:</p>
                {summary.errors.slice(0, 20).map((e, i) => (
                  <p key={i}>
                    Row {e.row}: {e.reason}
                  </p>
                ))}
                {summary.errors.length > 20 && <p>…and {summary.errors.length - 20} more</p>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/app/contacts"
              className="px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
            >
              View Clients
            </Link>
            {summary.created > 0 && !undone && (
              <button
                onClick={undoImport}
                disabled={undoing}
                className="flex items-center gap-1.5 px-4 py-2.5 btn-tool-line bg-white rounded-[10px] text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {undoing ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                Undo this import
              </button>
            )}
            {undone && (
              <p className="text-sm text-gray-600">
                Removed {undone.deleted} imported {undone.deleted === 1 ? "client" : "clients"}
                {undone.kept > 0 && ` (${undone.kept} kept — they already have work)`}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
