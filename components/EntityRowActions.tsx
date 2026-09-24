"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CheckCircle2, Copy, ExternalLink, FileText, Globe, Mail, Pencil, Phone, Play, Power, Receipt, RotateCcw, Send, Sparkles, Trash2, Wallet, Briefcase } from "lucide-react";
import RowActions, { type QuickAction } from "@/components/QuickMenu";
import { alertSheet, confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * The quick-action menus for list rows, one per entity — the same verbs
 * (and the same confirm copy) as each record's page has under "…", so a
 * right-click / press-and-hold on the list does what the page would.
 * Server pages describe a row with `RowMeta` (plain data) and wrap the row:
 *
 *   <EntityRowActions meta={{ kind: "job", id, title, status, … }}>
 *     <Link …>row</Link>
 *   </EntityRowActions>
 *
 * Actions call the record's own API routes, then refresh the list. Anything
 * the route refuses (a client with work attached, an invoice with payments)
 * is explained in a sheet and left to the record's page, where the heavier
 * confirmations live.
 */

export type RowMeta =
  | { kind: "job"; id: string; title: string; status: "ACTIVE" | "REQUIRES_INVOICING" | "ARCHIVED"; hasInvoice: boolean; scheduledAt: string | null; canEdit: boolean; canInvoice: boolean; canDelete: boolean }
  | { kind: "client"; id: string; name: string; phone: string | null; status: "LEAD" | "ACTIVE" | "ARCHIVED"; canDelete: boolean }
  | { kind: "invoice"; id: string; number: string | number; status: "DRAFT" | "AWAITING_PAYMENT" | "PAID" | "PAST_DUE" | "ARCHIVED"; hasPayments: boolean; hasEmail: boolean; canDelete: boolean }
  | { kind: "quote"; id: string; number: string | number; status: "DRAFT" | "AWAITING_RESPONSE" | "APPROVED" | "CHANGES_REQUESTED" | "CONVERTED" | "ARCHIVED"; hasEmail: boolean; canDelete: boolean }
  | { kind: "request"; id: string; title: string; status: "NEW" | "NEEDS_APPROVAL" | "CONVERTED" | "ARCHIVED"; contactId: string; canDelete: boolean }
  | { kind: "tool"; id: string; name: string; isActive: boolean; isPublic: boolean; manager: boolean };

function fail(data: { error?: string } | null) {
  return alertSheet({ title: "That didn't go through", message: data?.error ?? GENERIC_ERROR });
}

export function useEntityActions(meta: RowMeta, opts: { onRun?: (id: string) => void } = {}): QuickAction[] {
  const router = useRouter();
  const refresh = () => router.refresh();

  return useMemo(() => {
    const out: QuickAction[] = [];
    const call = async (url: string, body?: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") => {
      const { ok, data } = await postJson<{ error?: string; id?: string }>(url, body, method);
      if (!ok) {
        await fail(data);
        return null;
      }
      refresh();
      return data;
    };

    switch (meta.kind) {
      case "job": {
        const base = `/api/app/jobs/${meta.id}`;
        out.push({ key: "open", label: "Open", icon: ExternalLink, href: `/app/jobs/${meta.id}` });
        if (meta.canEdit && meta.status !== "ARCHIVED") out.push({ key: "edit", label: "Edit job", icon: Pencil, href: `/app/jobs/${meta.id}/edit` });
        if (meta.status === "ACTIVE")
          out.push({
            key: "complete",
            label: "Complete job",
            icon: CheckCircle2,
            onSelect: async () => {
              const when = meta.scheduledAt ? new Date(meta.scheduledAt) : null;
              if (when && when.getTime() > Date.now() && !(await confirmSheet({ message: `This job is scheduled for ${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — complete it anyway?`, confirmLabel: "Complete Anyway" }))) return;
              await call(`${base}/status`, { status: meta.hasInvoice ? "ARCHIVED" : "REQUIRES_INVOICING" }, "PATCH");
            },
          });
        if (meta.status === "REQUIRES_INVOICING" && meta.canInvoice && !meta.hasInvoice) out.push({ key: "invoice", label: "Create invoice", icon: Receipt, href: `/app/invoices/new?jobId=${meta.id}` });
        if (meta.status !== "ACTIVE") out.push({ key: "reopen", label: "Reopen job", icon: RotateCcw, onSelect: () => void call(`${base}/status`, { status: "ACTIVE" }, "PATCH") });
        out.push({
          key: "duplicate",
          label: "Duplicate",
          icon: Copy,
          onSelect: async () => {
            const d = await call(`${base}/duplicate`);
            if (d?.id) router.push(`/app/jobs/${d.id}`);
          },
        });
        if (meta.status !== "ARCHIVED" && meta.canInvoice) out.push({ key: "close", label: meta.hasInvoice ? "Close job" : "Close without invoicing", icon: Archive, onSelect: () => void call(`${base}/status`, { status: "ARCHIVED" }, "PATCH") });
        if (meta.canDelete)
          out.push({
            key: "delete",
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: async () => {
              if (!(await confirmSheet({ title: "Permanently delete this job?", message: ["Its notes, photos, and line items are deleted with it.", meta.hasInvoice ? "The invoice created from it stays, but loses its job link." : "", "This cannot be undone."].filter(Boolean).join(" "), confirmLabel: "Delete Job", destructive: true }))) return;
              await call(base, undefined, "DELETE");
            },
          });
        break;
      }
      case "client": {
        const base = `/api/app/contacts/${meta.id}`;
        out.push({ key: "open", label: "Open", icon: ExternalLink, href: `/app/contacts/${meta.id}` });
        out.push({ key: "edit", label: "Edit client", icon: Pencil, href: `/app/contacts/${meta.id}/edit` });
        if (meta.phone) out.push({ key: "call", label: "Call", icon: Phone, hint: meta.phone, href: `tel:${meta.phone.replace(/[^\d+]/g, "")}` });
        out.push({ key: "quote", label: "New quote", icon: FileText, href: `/app/quotes/new?contactId=${meta.id}` });
        out.push({ key: "job", label: "New job", icon: Briefcase, href: `/app/jobs/new?contactId=${meta.id}` });
        if (meta.status === "ARCHIVED") out.push({ key: "reactivate", label: "Reactivate", icon: ArchiveRestore, onSelect: () => void call(base, { status: "ACTIVE" }, "PATCH") });
        else
          out.push({
            key: "archive",
            label: "Archive",
            icon: Archive,
            onSelect: async () => {
              if (!(await confirmSheet({ title: "Archive this client?", message: "They'll be hidden from your client list, but all their quotes, jobs, and invoices stay.", confirmLabel: "Archive Client", destructive: true }))) return;
              await call(base, { status: "ARCHIVED" }, "PATCH");
            },
          });
        if (meta.canDelete)
          out.push({
            key: "delete",
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: async () => {
              if (!(await confirmSheet({ title: "Permanently delete this client?", message: "Their requests are deleted with them. This can't be undone.", confirmLabel: "Delete Client", destructive: true }))) return;
              await call(base, undefined, "DELETE");
            },
          });
        break;
      }
      case "invoice": {
        const base = `/api/app/invoices/${meta.id}`;
        const paid = meta.status === "PAID";
        out.push({ key: "open", label: "Open", icon: ExternalLink, href: `/app/invoices/${meta.id}` });
        if (!paid && meta.status !== "ARCHIVED") out.push({ key: "edit", label: "Edit invoice", icon: Pencil, href: `/app/invoices/${meta.id}/edit` });
        if (!paid && meta.status !== "ARCHIVED")
          out.push({
            key: "send",
            label: meta.status === "DRAFT" ? "Email to client" : "Email to client again",
            icon: Mail,
            disabled: !meta.hasEmail,
            hint: meta.hasEmail ? undefined : "no email on file",
            onSelect: async () => {
              const d = await call(`${base}/send`);
              if (d) await alertSheet({ title: "Sent", message: `Invoice #${meta.number} is on its way.` });
            },
          });
        if (meta.status === "DRAFT") out.push({ key: "sent", label: "Mark as sent (no email)", icon: Send, onSelect: () => void call(`${base}/status`, { status: "AWAITING_PAYMENT" }, "PATCH") });
        if (!paid && meta.status !== "ARCHIVED") out.push({ key: "pay", label: "Record payment", icon: Wallet, href: `/app/payments/new?invoiceId=${meta.id}` });
        out.push({
          key: "duplicate",
          label: "Duplicate",
          icon: Copy,
          onSelect: async () => {
            const d = await call(`${base}/duplicate`);
            if (d?.id) router.push(`/app/invoices/${d.id}`);
          },
        });
        if (meta.status === "ARCHIVED") out.push({ key: "reopen", label: "Reopen invoice", icon: ArchiveRestore, onSelect: () => void call(`${base}/status`, { status: meta.hasPayments ? "PAID" : "AWAITING_PAYMENT" }, "PATCH") });
        else if (!paid)
          out.push({
            key: "archive",
            label: "Archive",
            icon: Archive,
            onSelect: async () => {
              if (!(await confirmSheet({ title: "Archive this invoice?", message: "It moves out of your invoice list and stops payment reminders. Payments already recorded stay. You can reopen it anytime.", confirmLabel: "Archive Invoice" }))) return;
              await call(`${base}/status`, { status: "ARCHIVED" }, "PATCH");
            },
          });
        if (meta.canDelete)
          out.push({
            key: "delete",
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: async () => {
              if (meta.hasPayments) {
                await alertSheet({ title: "This invoice has payments", message: "Open the invoice to delete it — that asks you to confirm the payments go with it." });
                return;
              }
              if (!(await confirmSheet({ title: "Permanently delete this invoice?", message: "This can't be undone.", confirmLabel: "Delete Invoice", destructive: true }))) return;
              await call(base, undefined, "DELETE");
            },
          });
        break;
      }
      case "quote": {
        const base = `/api/app/quotes/${meta.id}`;
        const editable = meta.status === "DRAFT" || meta.status === "AWAITING_RESPONSE" || meta.status === "CHANGES_REQUESTED";
        out.push({ key: "open", label: "Open", icon: ExternalLink, href: `/app/quotes/${meta.id}` });
        if (editable) out.push({ key: "edit", label: "Edit quote", icon: Pencil, href: `/app/quotes/${meta.id}/edit` });
        if (editable)
          out.push({
            key: "send",
            label: meta.status === "DRAFT" ? "Email to client" : "Email to client again",
            icon: Mail,
            disabled: !meta.hasEmail,
            hint: meta.hasEmail ? undefined : "no email on file",
            onSelect: async () => {
              const d = await call(`${base}/send`);
              if (d) await alertSheet({ title: "Sent", message: `Quote #${meta.number} is on its way.` });
            },
          });
        if (meta.status === "DRAFT") out.push({ key: "sent", label: "Mark as sent (no email)", icon: Send, onSelect: () => void call(base, { status: "AWAITING_RESPONSE" }, "PATCH") });
        if (meta.status === "AWAITING_RESPONSE" || meta.status === "CHANGES_REQUESTED") out.push({ key: "approve", label: "Mark approved", icon: CheckCircle2, onSelect: () => void call(base, { status: "APPROVED" }, "PATCH") });
        if (meta.status === "APPROVED")
          out.push({
            key: "convert",
            label: "Convert to job",
            icon: Briefcase,
            onSelect: async () => {
              const d = await call(`${base}/convert`);
              if (d?.id) router.push(`/app/jobs/${d.id}`);
            },
          });
        out.push({
          key: "duplicate",
          label: "Duplicate",
          icon: Copy,
          onSelect: async () => {
            const d = await call(`${base}/duplicate`);
            if (d?.id) router.push(`/app/quotes/${d.id}`);
          },
        });
        if (meta.status === "ARCHIVED") out.push({ key: "reopen", label: "Reopen quote", icon: ArchiveRestore, onSelect: () => void call(base, { status: "DRAFT" }, "PATCH") });
        else if (meta.status !== "CONVERTED") out.push({ key: "archive", label: "Archive", icon: Archive, onSelect: () => void call(base, { status: "ARCHIVED" }, "PATCH") });
        if (meta.canDelete)
          out.push({
            key: "delete",
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: async () => {
              if (!(await confirmSheet({ title: "Delete this quote?", message: meta.status === "CONVERTED" ? "The job it was converted into stays. This cannot be undone." : "This cannot be undone.", confirmLabel: "Delete Quote", destructive: true }))) return;
              await call(base, undefined, "DELETE");
            },
          });
        break;
      }
      case "request": {
        const base = `/api/app/requests/${meta.id}`;
        out.push({ key: "open", label: "Open", icon: ExternalLink, href: `/app/requests/${meta.id}` });
        if (meta.status !== "NEEDS_APPROVAL" && meta.status !== "CONVERTED") {
          out.push({ key: "quote", label: "Make a quote", icon: FileText, href: `/app/quotes/new?contactId=${meta.contactId}&requestId=${meta.id}` });
          out.push({ key: "job", label: "Make a job", icon: Briefcase, href: `/app/jobs/new?contactId=${meta.contactId}&requestId=${meta.id}` });
        }
        if (meta.status === "ARCHIVED") out.push({ key: "restore", label: "Restore to new", icon: ArchiveRestore, onSelect: () => void call(base, { status: "NEW" }, "PATCH") });
        else if (meta.status !== "CONVERTED") out.push({ key: "archive", label: "Archive", icon: Archive, onSelect: () => void call(base, { status: "ARCHIVED" }, "PATCH") });
        if (meta.canDelete)
          out.push({
            key: "delete",
            label: "Delete (spam)",
            icon: Trash2,
            destructive: true,
            onSelect: async () => {
              if (!(await confirmSheet({ title: "Permanently delete this request?", message: "If it's the only thing on a lead's record (spam), the lead is deleted with it. This can't be undone.", confirmLabel: "Delete Request", destructive: true }))) return;
              await call(base, undefined, "DELETE");
            },
          });
        break;
      }
      case "tool": {
        const base = `/api/app/estimators/${meta.id}`;
        out.push({ key: "open", label: "Open", icon: ExternalLink, href: `/app/estimates/${meta.id}` });
        if (meta.isActive) out.push({ key: "run", label: "Run it", icon: Play, onSelect: opts.onRun ? () => opts.onRun?.(meta.id) : undefined, href: opts.onRun ? undefined : `/app/estimates/${meta.id}?s=try` });
        if (meta.manager) {
          out.push({ key: "atlas", label: "Change it with Atlas", icon: Sparkles, href: `/app/estimates/${meta.id}?s=atlas` });
          out.push({ key: "edit", label: "Edit by hand", icon: Pencil, href: `/app/estimates/${meta.id}?s=advanced` });
          out.push({ key: "web", label: meta.isPublic ? "Web form" : "Publish as a web form", icon: Globe, href: `/app/estimates/${meta.id}?s=website` });
          out.push({ key: "power", label: meta.isActive ? "Turn off" : "Turn on", icon: Power, onSelect: () => void call(base, { isActive: !meta.isActive }, "PATCH") });
          out.push({
            key: "delete",
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: async () => {
              if (!(await confirmSheet({ title: `Delete “${meta.name}”?`, message: "Quotes already made with it are untouched. The tool and its history are gone for good.", confirmLabel: "Delete Tool", destructive: true }))) return;
              await call(base, undefined, "DELETE");
            },
          });
        }
        break;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(meta), opts.onRun]);
}

export default function EntityRowActions({ meta, children, className, onRun }: { meta: RowMeta; children: ReactNode; className?: string; onRun?: (id: string) => void }) {
  const actions = useEntityActions(meta, { onRun });
  const title = meta.kind === "job" || meta.kind === "request" ? meta.title : meta.kind === "client" || meta.kind === "tool" ? meta.name : `#${meta.number}`;
  return (
    <RowActions actions={actions} title={title} className={className}>
      {children}
    </RowActions>
  );
}

