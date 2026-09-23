"use client";

import { useEffect, useState } from "react";
import { inputCls } from "@/components/Input";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ChevronRight, FileSignature, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import Modal from "@/components/Modal";

/**
 * The Templates view of /app/contracts — reusable agreement templates.
 * {{client_name}}, {{company_name}}, and {{date}} fill in automatically when
 * an agreement is created from one.
 *
 * The page (a server component) owns the title and the header "New
 * Template" button; that button is a link to `?view=templates&new=1`, which
 * this panel reads to open the editor, so the header stays server-rendered.
 *
 * The editor is a dialog rather than an inline card: the body is a tall
 * textarea, and inline it pushed the template list off the screen on phones.
 * `modal-pop`/`modal-card` make it an iOS bottom sheet under lg (globals.css).
 */

type Template = { id: string; name: string; body: string; isActive: boolean };

const STARTER_BODY =
  "This Service Agreement is made on {{date}} between {{company_name}} and {{client_name}}.\n\n1. Services. \n\n2. Payment. \n\n3. Term & cancellation. \n";

export default function TemplatesPanel({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsNew = searchParams.get("new") === "1";
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = templates.filter((t) => t.isActive);
  const archived = templates.filter((t) => !t.isActive);

  // Header "New Template" arrives as ?new=1 — open the editor on it
  useEffect(() => {
    if (!wantsNew) return;
    setEditing("new");
    setName("");
    setBody(STARTER_BODY);
    setError("");
  }, [wantsNew]);

  // Escape closes the editor (the backdrop tap and Cancel handle the rest)
  useEffect(() => {
    if (editing === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, busy, wantsNew]);

  function close() {
    setEditing(null);
    // Drop ?new=1 so a refresh (or the next save) doesn't reopen the editor
    if (wantsNew) router.replace("/app/contracts?view=templates", { scroll: false });
  }

  function startNew() {
    setEditing("new");
    setName("");
    setBody(STARTER_BODY);
    setError("");
  }

  function startEdit(t: Template) {
    setEditing(t.id);
    setName(t.name);
    setBody(t.body);
    setError("");
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
      // Shown inside the open dialog (below) — the page banner is hidden
      // behind the scrim, so a save failure used to look like a hang
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    close();
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
          "It stops showing up when you create an agreement. Agreements already sent are untouched, and you can restore it any time.",
        confirmLabel: "Archive Template",
        destructive: true,
      }))
    )
      return;
    await setActive(editing, false);
    close();
  }

  const errorBox = (
    <div role="alert" className="form-error flex items-center justify-between">
      {error}
      <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
        <X size={14} />
      </button>
    </div>
  );

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Write an agreement once, send it to any client for an e-signature.{" "}
        <code className="rounded-md bg-gray-100 px-1 text-xs">{"{{client_name}}"}</code>,{" "}
        <code className="rounded-md bg-gray-100 px-1 text-xs">{"{{company_name}}"}</code> and{" "}
        <code className="rounded-md bg-gray-100 px-1 text-xs">{"{{date}}"}</code> fill in
        automatically.
      </p>

      {/* Archive / restore failures land here; save failures show in the dialog */}
      {error && editing === null && <div className="mb-4">{errorBox}</div>}

      {/* Templates — whole-row tap targets with a chevron, the list idiom the
          rest of the app uses */}
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
            <button onClick={startNew} className="btn-primary mt-5 inline-flex">
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
        onClose={() => !busy && close()}
        size="xl"
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
                  Agreement text *
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className={`${inputCls} font-mono text-xs leading-relaxed lg:min-h-[18rem]`}
                />
              </div>
              {error && errorBox}
            </div>

            {/* Actions stack full-width on phones (thumb-sized), inline on
                desktop; archiving lives here now that rows are tap-to-edit. */}
            <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
              <button
                onClick={save}
                disabled={busy || !name.trim() || !body.trim()}
                className="btn-primary h-11 justify-center lg:h-10"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save Template
              </button>
              {/* Cancel sinks to the bottom of the phone stack so the
                  destructive action isn't the last thing under your thumb */}
              <button
                onClick={close}
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
