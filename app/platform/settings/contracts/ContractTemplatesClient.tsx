"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  ChevronRight,
  FileSignature,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import Modal from "@/components/Modal";

/**
 * Reusable contract templates. {{client_name}}, {{company_name}}, and
 * {{date}} fill in automatically when a contract is created from one.
 *
 * The editor is a dialog rather than an inline card: the body is a tall
 * textarea, and inline it pushed the template list off the screen on phones.
 * `modal-pop`/`modal-card` make it an iOS bottom sheet under lg (globals.css).
 */

type Template = { id: string; name: string; body: string; isActive: boolean };

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

const STARTER_BODY =
  "This Service Agreement is made on {{date}} between {{company_name}} and {{client_name}}.\n\n1. Services. \n\n2. Payment. \n\n3. Term & cancellation. \n";

export default function ContractTemplatesClient({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = templates.filter((t) => t.isActive);
  const archived = templates.filter((t) => !t.isActive);

  // Escape closes the editor (the backdrop tap and Cancel handle the rest)
  useEffect(() => {
    if (editing === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setEditing(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, busy]);

  function startNew() {
    setEditing("new");
    setName("");
    setBody(STARTER_BODY);
  }

  function startEdit(t: Template) {
    setEditing(t.id);
    setName(t.name);
    setBody(t.body);
  }

  async function save() {
    setBusy(true);
    setError("");
    const { ok, data } =
      editing === "new"
        ? await postJson("/api/app/contract-templates", { name, body }, "POST")
        : await postJson(`/api/app/contract-templates/${editing}`, { name, body }, "PATCH");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function setActive(id: string, isActive: boolean) {
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/contract-templates/${id}`, { isActive }, "PATCH");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  /** Archive from inside the editor — the row itself is a tap-to-edit target. */
  async function archiveCurrent() {
    if (editing === null || editing === "new") return;
    if (
      !(await confirmSheet({
        title: "Archive this template?",
        message:
          "It stops showing up when you create a contract. Agreements already sent are untouched, and you can restore it any time.",
        confirmLabel: "Archive Template",
        destructive: true,
      }))
    )
      return;
    await setActive(editing, false);
    setEditing(null);
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      {/* Title row: the desktop back arrow keeps its place; on phones the
          shell header owns going back, and the New button is icon-sized so
          the long title never has to share a line with a wide label. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/app/settings" className="hidden shrink-0 text-gray-400 hover:text-gray-600 lg:block">
            <ArrowLeft size={18} />
          </Link>
          <PageTitle section="contracts" icon={FileSignature}>
            Contracts
          </PageTitle>
        </div>
        <button
          onClick={startNew}
          aria-label="New template"
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 sm:px-4"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Template</span>
        </button>
      </div>
      <p className="mb-5 mt-2 text-sm text-gray-500 lg:ml-8 lg:mb-6">
        Write your agreements once, send them to any client for an e-signature.{" "}
        <code className="rounded-md bg-gray-100 px-1 text-xs">{"{{client_name}}"}</code>,{" "}
        <code className="rounded-md bg-gray-100 px-1 text-xs">{"{{company_name}}"}</code> and{" "}
        <code className="rounded-md bg-gray-100 px-1 text-xs">{"{{date}}"}</code> fill in
        automatically.
      </p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Templates — whole-row tap targets with a chevron, the list idiom the
          rest of the mobile app uses (the old row crammed a pencil and an
          Archive button into 44px of trailing space). */}
      <div className="card-ledger mb-6 divide-y divide-gray-100">
        {active.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span
              className="chip-tool flex h-11 w-11 items-center justify-center rounded-[12px]"
              style={{
                backgroundColor: SECTION_HUES.contracts,
                color: hueInk(SECTION_HUES.contracts),
              }}
              aria-hidden
            >
              <FileSignature size={20} strokeWidth={2.25} />
            </span>
            <p className="mt-3.5 text-sm font-semibold text-gray-900">No templates yet</p>
            <p className="mt-1 max-w-xs text-sm text-gray-500">
              Write your first service agreement once and reuse it on every client.
            </p>
            <button
              onClick={startNew}
              className="mt-5 inline-flex items-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700"
            >
              <Plus size={15} />
              New Template
            </button>
          </div>
        ) : (
          active.map((t) => (
            <button
              key={t.id}
              onClick={() => startEdit(t)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-gray-900 lg:text-sm">{t.name}</p>
                <p className="truncate text-xs text-gray-500">
                  {t.body.replace(/\s+/g, " ").slice(0, 120)}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-gray-300" />
            </button>
          ))
        )}
      </div>

      {archived.length > 0 && (
        <div>
          <h2 className="mb-2 px-1 text-[13px] font-semibold text-gray-500">Archived</h2>
          <div className="card-ledger divide-y divide-gray-100">
            {archived.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <p className="min-w-0 flex-1 truncate text-sm text-gray-600">{t.name}</p>
                <button
                  onClick={() => setActive(t.id, true)}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  <RotateCcw size={12} />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor — centered dialog on desktop, bottom sheet on phones */}
      <Modal
        open={editing !== null}
        onClose={() => !busy && setEditing(null)}
        cardClassName="w-full max-w-xl rounded-lg bg-white p-5 text-left shadow-xl"
      >
        {editing !== null && (
          <>
            <h2 className="mb-3 text-base font-semibold text-gray-900">
              {editing === "new" ? "New Template" : "Edit Template"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Template name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Recurring Lawn Care Agreement"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Contract text *
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className={`${inputCls} font-mono text-xs leading-relaxed lg:min-h-[18rem]`}
                />
              </div>
            </div>

            {/* Actions stack full-width on phones (thumb-sized), inline on
                desktop; archiving lives here now that rows are tap-to-edit. */}
            <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
              <button
                onClick={save}
                disabled={busy || !name.trim() || !body.trim()}
                className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50 lg:h-10"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save Template
              </button>
              {/* Cancel sinks to the bottom of the phone stack so the
                  destructive action isn't the last thing under your thumb */}
              <button
                onClick={() => setEditing(null)}
                disabled={busy}
                className="order-last flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 lg:order-none lg:h-10"
              >
                Cancel
              </button>
              {editing !== "new" && (
                <button
                  onClick={archiveCurrent}
                  disabled={busy}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 lg:ml-auto lg:h-10"
                >
                  <Archive size={14} />
                  Archive
                </button>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
