/**
 * The free tools (/tools/*) and the home page's "Make a quote" render the
 * app's OWN New Quote / New Invoice screens (QuoteEditor, InvoiceEditor)
 * in "tool mode" (David 2026-11-18: "the exact same thing as in the app").
 * A visitor has no account, so in tool mode:
 *  - "New client" keeps the person in the page (QuickContactSheet `local`),
 *  - Save hands the document to `onSave` instead of the API,
 *  - the back link, Cancel and the leave-page warning are hidden.
 * components/wb/tools/DocGenerator.tsx then asks for the visitor's business
 * and offers Send / Download / Preview / open an account.
 */

export type ToolClient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
};

export type ToolEditorLine = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  isOptional: boolean;
};

export type ToolEditorDoc = {
  client: ToolClient | null;
  title: string;
  /** "8.25" — percent as typed. */
  taxRatePercent: string;
  discountType: "NONE" | "PERCENT" | "FIXED";
  discountValue: string;
  depositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
  depositValue: string;
  clientMessage: string;
  /** Quote: valid until. Invoice: due date. "YYYY-MM-DD" or "". */
  date: string;
  lines: ToolEditorLine[];
};

export type ToolEditorMode = {
  /** What to start from (a saved draft, or "Edit" after saving). */
  initial?: ToolEditorDoc | null;
  onSave: (doc: ToolEditorDoc) => void;
};

export type LocalClientDraft = Omit<ToolClient, "id">;

export function newLocalClient(d: LocalClientDraft): ToolClient {
  return { id: `local-${Math.random().toString(36).slice(2, 10)}`, ...d };
}
