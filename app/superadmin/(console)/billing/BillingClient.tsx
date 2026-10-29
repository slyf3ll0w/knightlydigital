"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, InfoTip } from "@/components/ds";
import { Input, Select } from "@/components/Input";

/**
 * "Add a price" + "Re-read Square" for Console → Billing. The lists on the
 * page are server-rendered; this only posts and refreshes.
 */
export default function BillingClient({ products }: { products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [product, setProduct] = useState(products[0]?.id ?? "DISPATCH");
  const [cadence, setCadence] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [name, setName] = useState("");
  const [dollars, setDollars] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function post(action: string, body: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/superadmin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed.");
        return;
      }
      if (action === "add-price") {
        setDone(`Added "${name}". Offer it to a company from that company's Plans card.`);
        setName("");
        setDollars("");
      } else {
        setDone(`Re-read Square: ${data.count} price${data.count === 1 ? "" : "s"}.`);
      }
      router.refresh();
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  const cents = Math.round(Number(dollars.replace(/[^0-9.]/g, "")) * 100);
  const canAdd = name.trim().length > 0 && Number.isFinite(cents) && cents >= 0 && busy === null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="ds-h2">Add a price</h2>
          <InfoTip>
            A new price under that plan in WorkBench&apos;s Square account — a founder deal, a trial price, a test
            amount. It becomes a variation like any other: tick it on a company&apos;s Plans card to sell it on their
            Settings → Plans, or start it for them with &quot;Send by invoice&quot;. The name is what the owner sees next to
            the price. Sell it for $0 to make a free plan Square still tracks.
          </InfoTip>
        </div>
        <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => post("reread", {})}>
          {busy === "reread" ? "Reading…" : "Re-read Square"}
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_1fr_auto] sm:items-end">
        <label className="grid gap-1">
          <span className="ds-label">Plan</span>
          <Select value={product} onChange={(e) => setProduct(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="ds-label">Billed</span>
          <Select value={cadence} onChange={(e) => setCadence(e.target.value === "ANNUAL" ? "ANNUAL" : "MONTHLY")}>
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUAL">Annually</option>
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="ds-label">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Founder price" maxLength={60} />
        </label>
        <label className="grid gap-1">
          <span className="ds-label">Amount ($)</span>
          <Input value={dollars} onChange={(e) => setDollars(e.target.value)} placeholder="10.00" inputMode="decimal" />
        </label>
        <Button variant="primary" size="sm" disabled={!canAdd} onClick={() => post("add-price", { product, cadence, name: name.trim(), cents })}>
          {busy === "add-price" ? "Adding…" : "Add price"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
      {done && <p className="mt-2 text-sm text-[color:var(--ds-good)]">{done}</p>}
    </Card>
  );
}
