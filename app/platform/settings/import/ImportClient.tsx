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
  Users,
  X,
} from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { confirmSheet } from "@/components/ConfirmSheet";

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

type Step = "upload" | "map" | "combine" | "importing" | "done";
type Summary = { created: number; updated: number; skippedDuplicates: number; errors: { row: number; reason: string }[] };

/** A column mapped to CREATE_FIELD becomes a new custom field named after its
 *  own header — the escape hatch for "my list has a Date Added column and
 *  yours doesn't". */
const CREATE_FIELD = "new";

/**
 * What kind of custom field a column should become, read off its own values.
 * A "Date Added" column is worth storing as a date rather than loose text,
 * and the importer already has the samples to tell.
 */
function guessFieldType(samples: string[]): "TEXT" | "NUMBER" | "DATE" {
  const vals = samples.filter(Boolean).slice(0, 25);
  if (vals.length === 0) return "TEXT";
  // Bare 4-digit years and ZIPs parse as dates in most engines, so a value
  // only counts as a date if it carries a separator a date would have.
  const dateish = vals.filter(
    (v) => /[/-]/.test(v) && !Number.isNaN(Date.parse(v))
  ).length;
  if (dateish >= vals.length * 0.8) return "DATE";
  const numeric = vals.filter((v) => v !== "" && !Number.isNaN(Number(v))).length;
  if (numeric === vals.length) return "NUMBER";
  return "TEXT";
}

const TYPE_LABEL: Record<string, string> = { TEXT: "Text", NUMBER: "Number", DATE: "Date" };

/** Rows the wizard thinks belong to one client. */
type Group = {
  key: string;
  kind: "company" | "household";
  title: string;
  rowIdxs: number[];
  primaryIdx: number;
  combine: boolean;
};

const norm = (s: unknown) =>
  typeof s === "string" ? s.trim().toLowerCase().replace(/\s+/g, " ") : "";

// The import API keeps at most 50 additional people per client (same ceiling
// as the contact page). A bigger group is offered but not pre-checked, so we
// never silently drop the overflow on the user's behalf.
const MAX_COMBINE_ROWS = 51;

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
  const [groups, setGroups] = useState<Group[]>([]);
  const [busyPreparing, setBusyPreparing] = useState(false);
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

  // `map` is a parameter because the mapping changes mid-flow: columns set to
  // CREATE_FIELD become real cf: ids only once their fields exist, and React
  // state won't have caught up in the same tick.
  function buildRow(cells: string[], map: string[] = mapping): Record<string, unknown> {
    const out: Record<string, string> = {};
    const customFields: Record<string, string> = {};
    map.forEach((target, i) => {
      const value = (cells[i] ?? "").trim();
      if (!target || target === CREATE_FIELD || !value) return;
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

  /**
   * Rows that look like the same client: two people at one business, or two
   * names at one address. CRM exports are full of these — one row per person —
   * and importing them straight through scatters a single customer's history
   * across three records. We group them and let the user decide.
   */
  function findGroups(mapped: Record<string, unknown>[]): Group[] {
    const buckets = new Map<string, number[]>();
    mapped.forEach((m, i) => {
      // Someone with no personal name is just the business itself; there's no
      // second person to keep, so nothing to combine.
      if (!m.firstName && !m.lastName) return;
      const company = norm(m.companyName);
      const last = norm(m.lastName);
      const address = norm(m.address);
      const key = company
        ? `c:${company}`
        : last && address
          ? `h:${last}|${address}`
          : null;
      if (!key) return;
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    });

    const out: Group[] = [];
    for (const [key, rowIdxs] of buckets) {
      if (rowIdxs.length < 2) continue;
      // Identical names aren't two people — that's a duplicate row, and the
      // duplicate rule on the previous step already covers it.
      const names = new Set(
        rowIdxs.map((i) => `${norm(mapped[i].firstName)} ${norm(mapped[i].lastName)}`.trim())
      );
      if (names.size < 2) continue;
      const first = mapped[rowIdxs[0]];
      out.push({
        key,
        kind: key.startsWith("c:") ? "company" : "household",
        title: key.startsWith("c:")
          ? String(first.companyName ?? "")
          : `${first.lastName ?? ""} household — ${first.address ?? ""}`,
        rowIdxs,
        primaryIdx: rowIdxs[0],
        combine: rowIdxs.length <= MAX_COMBINE_ROWS,
      });
    }
    return out.sort((a, b) => b.rowIdxs.length - a.rowIdxs.length);
  }

  /**
   * The rows we actually POST. Combined groups collapse to their primary row
   * carrying the rest as `people`; every other row passes through. `lines`
   * tracks the CSV line each payload row came from so the summary can still
   * point at a real row number after the collapse.
   */
  function buildPayload(
    map: string[],
    combineGroups: Group[]
  ): { rows: Record<string, unknown>[]; lines: number[] } {
    const mapped = rows.map((r) => buildRow(r, map));
    // Which rows are folded into which primary
    const folded = new Map<number, number[]>();
    const absorbed = new Set<number>();
    for (const g of combineGroups) {
      if (!g.combine) continue;
      // Past the ceiling the API would drop the tail, so keep only what fits
      // and let the remainder import as ordinary clients — over-combining
      // must never mean losing rows.
      const others = g.rowIdxs
        .filter((i) => i !== g.primaryIdx)
        .slice(0, MAX_COMBINE_ROWS - 1);
      if (others.length === 0) continue;
      folded.set(g.primaryIdx, others);
      others.forEach((i) => absorbed.add(i));
    }

    const out: Record<string, unknown>[] = [];
    const lines: number[] = [];
    mapped.forEach((m, i) => {
      if (absorbed.has(i)) return;
      const others = folded.get(i);
      if (others?.length) {
        out.push({
          ...m,
          people: others.map((j) => ({
            firstName: mapped[j].firstName ?? "",
            lastName: mapped[j].lastName ?? "",
            email: mapped[j].email ?? "",
            phone: mapped[j].phone ?? "",
          })),
        });
      } else {
        out.push(m);
      }
      lines.push(i + 2); // +2: header row, and CSV rows are 1-based
    });
    return { rows: out, lines };
  }

  const mappedTargets = new Set(mapping.filter(Boolean));
  const hasNameMapping =
    mappedTargets.has("fullName") || mappedTargets.has("firstName") ||
    mappedTargets.has("lastName") || mappedTargets.has("companyName");
  const readyRows = rows.filter((r) => {
    const m = buildRow(r);
    return m.firstName || m.lastName || m.companyName;
  }).length;

  /**
   * Leaving the mapping step: create any custom fields the user asked for,
   * then look for rows that belong to the same client. Only stops to ask
   * about combining when there's actually something to combine.
   */
  async function prepare() {
    if (!hasNameMapping) {
      setError("Map at least one name column (full name, first/last, or company).");
      return;
    }
    setError("");

    let effective = mapping;
    const toCreate = mapping
      .map((t, i) => (t === CREATE_FIELD ? i : -1))
      .filter((i) => i >= 0);

    if (toCreate.length > 0) {
      setBusyPreparing(true);
      const next = [...mapping];
      for (const i of toCreate) {
        const label = (headers[i] || `Column ${i + 1}`).slice(0, 80);
        const samples = rows.map((r) => (r[i] ?? "").trim());
        const { ok, data } = await postJson<{ id: string; error?: string }>(
          "/api/app/contact-fields",
          { label, type: guessFieldType(samples) }
        );
        if (!ok || !data?.id) {
          setBusyPreparing(false);
          setError(data?.error ?? `Couldn't create the custom field "${label}".`);
          return;
        }
        next[i] = `cf:${data.id}`;
      }
      setBusyPreparing(false);
      setMapping(next);
      effective = next;
    }

    const mapped = rows.map((r) => buildRow(r, effective));
    const found = findGroups(mapped);
    if (found.length > 0) {
      setGroups(found);
      setStep("combine");
      return;
    }
    await runImport(effective, []);
  }

  async function runImport(map: string[], combineGroups: Group[]) {
    setError("");
    setStep("importing");
    setProgress(0);

    const id = crypto.randomUUID();
    setBatchId(id);
    const { rows: mapped, lines } = buildPayload(map, combineGroups);
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
      // Combining collapses rows, so the chunk index isn't the CSV line — map
      // back through the line table built alongside the payload.
      totals.errors.push(...data.errors.map((e) => ({ ...e, row: lines[e.row + i] ?? e.row + i + 2 })));
      setProgress(Math.min(100, Math.round(((i + chunk.length) / mapped.length) * 100)));
    }

    setSummary(totals);
    setStep("done");
  }

  async function undoImport() {
    if (
      !(await confirmSheet({
        title: "Undo this import?",
        message:
          "Every client it created is removed — anyone who already has work attached is kept.",
        confirmLabel: "Remove Clients",
        destructive: true,
      }))
    )
      return;
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
        <Link href="/app/contacts" className="hidden lg:block text-gray-400 hover:text-gray-600">
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
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
              <span>Your column</span>
              <span>Example</span>
              <span>Imports as</span>
            </div>
            <div className="divide-y divide-gray-100">
              {headers.map((h, i) => {
                const sample = rows.find((r) => (r[i] ?? "").trim())?.[i] ?? "";
                const label = h || `Column ${i + 1}`;
                const newType = guessFieldType(rows.map((r) => (r[i] ?? "").trim()));
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr] items-start gap-3 px-4 py-2">
                    <span className="text-sm font-medium text-gray-900 truncate pt-2">{label}</span>
                    <span className="text-xs text-gray-500 truncate pt-2.5">{sample}</span>
                    <div>
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
                        {/* Their column, their field name — the way a "Date
                            added" column gets a home without leaving here. */}
                        <option value={CREATE_FIELD}>+ Create custom field…</option>
                      </select>
                      {mapping[i] === CREATE_FIELD && (
                        <p className="mt-1 text-[11px] text-green-700">
                          Creates a {TYPE_LABEL[newType]} field called{" "}
                          <span className="font-semibold">{label}</span>
                        </p>
                      )}
                    </div>
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
              onClick={prepare}
              disabled={readyRows === 0 || busyPreparing}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
            >
              {busyPreparing && <Loader2 size={13} className="animate-spin" />}
              Import {readyRows} Clients
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2b: combine people who share a client ── */}
      {step === "combine" && (
        <div className="space-y-5">
          <div className="card-ledger p-4">
            <div className="flex items-start gap-2.5">
              <Users size={16} className="mt-0.5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {groups.length === 1
                    ? "One set of rows looks like the same client"
                    : `${groups.length} sets of rows look like the same client`}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Combining keeps every name — one becomes the client, the rest become
                  contacts on that client, so their quotes, jobs and invoices all live in one
                  history. Leave a set unchecked to import those rows as separate clients.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {groups.map((g, gi) => {
              const set = (patch: Partial<Group>) =>
                setGroups(groups.map((x, j) => (j === gi ? { ...x, ...patch } : x)));
              return (
                <div key={g.key} className="card-ledger overflow-hidden">
                  <label className="flex cursor-pointer items-center gap-2.5 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={g.combine}
                      onChange={(e) => set({ combine: e.target.checked })}
                      className="h-4 w-4 accent-green-600"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                      {g.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {g.rowIdxs.length} rows
                    </span>
                  </label>
                  {g.rowIdxs.length > MAX_COMBINE_ROWS && (
                    <p className="border-b border-gray-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
                      Too many to combine — a client holds {MAX_COMBINE_ROWS - 1} extra contacts.
                      Left unchecked, these import as separate clients so nothing is lost.
                    </p>
                  )}
                  <div className="divide-y divide-gray-100">
                    {g.rowIdxs.map((ri) => {
                      const m = buildRow(rows[ri], mapping);
                      const name =
                        `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || `Row ${ri + 2}`;
                      const isPrimary = g.primaryIdx === ri;
                      return (
                        <label
                          key={ri}
                          className={`flex items-center gap-2.5 px-4 py-2 ${
                            g.combine ? "cursor-pointer" : "opacity-60"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`primary-${g.key}`}
                            checked={isPrimary}
                            disabled={!g.combine}
                            onChange={() => set({ primaryIdx: ri })}
                            className="h-3.5 w-3.5 accent-green-600"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                            {name}
                          </span>
                          <span className="hidden shrink-0 text-xs text-gray-500 sm:block">
                            {String(m.email ?? m.phone ?? "")}
                          </span>
                          {g.combine && (
                            <span className="shrink-0 text-[11px] font-medium text-gray-400">
                              {isPrimary ? "Client" : "Contact"}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("map")}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Back to columns
            </button>
            <button
              onClick={() => runImport(mapping, groups)}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
            >
              Import
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
