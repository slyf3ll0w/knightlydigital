import { docTotals, lineTotal, money, type ToolDoc } from "@/lib/tool-doc";

/**
 * Live, on-page rendering of the generator's document — the same layout
 * as the PDF (lib/pdf.tsx: logo + company block, type + number, accent
 * rule, table, totals, message) so what the visitor sees is what they
 * download. Pure markup; the PDF itself is rendered server-side.
 */
export default function DocPreview({ doc, logo }: { doc: ToolDoc; logo: string | null }) {
  const t = docTotals(doc);
  const isEstimate = doc.kind === "estimate";
  const word = isEstimate ? "Estimate" : "Invoice";
  const b = doc.business;
  const c = doc.client;
  const cityLine = (p: { city: string; state: string; zip: string }) => [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const fmtDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const hasOptional = isEstimate && doc.lines.some((l) => l.optional);

  return (
    <div className="rounded-[4px] border border-gray-200 bg-white p-6 text-[12px] leading-snug text-gray-800 shadow-[0_12px_40px_-18px_rgba(16,36,74,0.35)] sm:p-8" aria-label={`${word} preview`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="mb-2 max-h-12 w-auto max-w-[160px] object-contain" />
          )}
          <p className="text-[15px] font-extrabold text-gray-900">{b.name || "Your business name"}</p>
          <p className="mt-0.5 whitespace-pre-line text-[11px] text-gray-500">
            {[b.address, cityLine(b)].filter(Boolean).join("\n")}
            {(b.address || cityLine(b)) && (b.phone || b.email) ? "\n" : ""}
            {[b.phone, b.email].filter(Boolean).join("  ·  ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: isEstimate ? "#15803D" : "#0369A1" }}>
            {word}
          </p>
          <p className="text-[12px] font-bold text-gray-900">#{doc.number}</p>
          <p className="text-[11px] text-gray-500">Date: {fmtDate(doc.issuedAt)}</p>
          {doc.dueAt && (
            <p className="text-[11px] text-gray-500">
              {isEstimate ? "Valid through" : "Due"}: {fmtDate(doc.dueAt)}
            </p>
          )}
        </div>
      </div>
      <div className="my-4 h-[3px] w-full rounded" style={{ backgroundColor: doc.accent }} />

      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{isEstimate ? "Prepared for" : "Bill to"}</p>
        <p className="font-bold text-gray-900">{c.name || "Client name"}</p>
        <p className="whitespace-pre-line text-[11px] text-gray-500">
          {[c.address, cityLine(c)].filter(Boolean).join("\n")}
          {(c.address || cityLine(c)) && (c.phone || c.email) ? "\n" : ""}
          {[c.phone, c.email].filter(Boolean).join("  ·  ")}
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
            <th className="py-1.5 text-left font-bold">Item</th>
            <th className="py-1.5 text-right font-bold">Qty</th>
            <th className="py-1.5 text-right font-bold">Price</th>
            <th className="py-1.5 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 align-top">
              <td className="py-2 pr-3">
                <p className="font-semibold text-gray-900">
                  {l.name || l.description || "Item"}
                  {l.optional && isEstimate && <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-bold uppercase text-gray-500">Optional</span>}
                </p>
                {l.name && l.description && <p className="text-[11px] text-gray-500">{l.description}</p>}
              </td>
              <td className="py-2 text-right tabular-nums">{l.quantity}</td>
              <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{money(lineTotal(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 ml-auto w-full max-w-[240px] space-y-1 text-[11.5px]">
        <Row label="Subtotal" value={money(t.subtotal)} />
        {t.discount > 0 && <Row label={doc.discountType === "PERCENT" ? `Discount (${doc.discountValue}%)` : "Discount"} value={`-${money(t.discount)}`} />}
        {t.tax != null && <Row label={`Tax (${doc.taxRate}%)`} value={money(t.tax)} />}
        <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 text-[13px] font-extrabold text-gray-900">
          <span>Total</span>
          <span className="tabular-nums" style={{ color: doc.accent }}>
            {money(t.total)}
          </span>
        </div>
        {isEstimate && t.deposit > 0 && <Row label={doc.depositType === "PERCENT" ? `Deposit due (${doc.depositValue}%)` : "Deposit due"} value={money(t.deposit)} bold />}
      </div>
      {hasOptional && <p className="mt-2 text-[10.5px] text-gray-400">Optional items are included in the total; the client can leave them off.</p>}

      {doc.clientMessage && <p className="mt-5 whitespace-pre-line border-t border-gray-100 pt-4 text-[11.5px] text-gray-600">{doc.clientMessage}</p>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
