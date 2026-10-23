"use client";

import { useState } from "react";
import { Card, Chip } from "@/components/ds";

const DOCS = [
  { key: "quote", label: "Estimate", states: ["open", "approved", "expired", "withdrawn"] },
  { key: "invoice", label: "Invoice", states: ["open", "partial", "paid", "withdrawn"] },
] as const;
const BRANDS = [
  { key: "navy", label: "Navy + orange" },
  { key: "default", label: "Unbranded" },
  { key: "yellow", label: "Yellow (light brand)" },
  { key: "black", label: "Black and white" },
] as const;

function Picker<T extends string>({ value, options, onChange }: { value: T; options: readonly { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} className="rounded-full">
          <Chip tone={o.key === value ? "primary" : "neutral"}>{o.label}</Chip>
        </button>
      ))}
    </div>
  );
}

export default function ClientGallery() {
  const [doc, setDoc] = useState<(typeof DOCS)[number]["key"]>("quote");
  const [state, setState] = useState<string>("open");
  const [brand, setBrand] = useState<(typeof BRANDS)[number]["key"]>("navy");
  const [nonce, setNonce] = useState(0);
  const states = DOCS.find((d) => d.key === doc)!.states;
  const src = `/client-preview?doc=${doc}&state=${states.includes(state as never) ? state : "open"}&brand=${brand}&n=${nonce}`;

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5">
        <Picker value={doc} options={DOCS.map((d) => ({ key: d.key, label: d.label }))} onChange={(v) => { setDoc(v); setState("open"); }} />
        <Picker value={states.includes(state as never) ? state : "open"} options={states.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1) }))} onChange={setState} />
        <Picker value={brand} options={BRANDS} onChange={setBrand} />
        <div>
          <button type="button" className="ds-small underline underline-offset-2" onClick={() => setNonce((n) => n + 1)}>
            Reload the previews
          </button>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[390px_1fr]">
        <Card className="overflow-hidden p-0">
          <p className="ds-small px-4 py-2">Phone · 390</p>
          <iframe key={`p-${src}`} src={src} title="Phone preview" className="block h-[820px] w-[390px] border-0 bg-white" />
        </Card>
        <Card className="overflow-hidden p-0">
          <p className="ds-small px-4 py-2">Desk · 900</p>
          <iframe key={`d-${src}`} src={src} title="Desk preview" className="block h-[820px] w-full border-0 bg-white" />
        </Card>
      </div>
    </div>
  );
}
