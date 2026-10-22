"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Loader2, MapPin, Pencil, Plus, Route as RouteIcon, Warehouse, X } from "lucide-react";
import Modal from "@/components/Modal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { Button, Chip, DsPage, Hint, InfoTip, ListRow, PageHeader } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { PLACE_KIND_LABELS, PLACE_KINDS, PLACE_NAME_MAX, PLACE_NOTES_MAX, type PlaceDTO, type PlaceKind } from "@/lib/places-shared";

type Draft = { id: string | null; name: string; kind: PlaceKind; address: string; notes: string };

const EMPTY: Draft = { id: null, name: "", kind: "SUPPLY", address: "", notes: "" };

/**
 * Places — one list, one sheet. Desktop and phone share the rows; the
 * sheet is a Modal (glass, portaled) with four fields. No map here: a
 * place is an address the crew already knows, and "Add a stop" is where
 * it gets used.
 */
export default function PlacesClient({ initial, canArchive }: { initial: PlaceDTO[]; canArchive: boolean }) {
  const [places, setPlaces] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(() => places.filter((p) => !p.archived), [places]);
  const archived = useMemo(() => places.filter((p) => p.archived), [places]);

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    const body = { name: draft.name.trim(), kind: draft.kind, address: draft.address.trim(), notes: draft.notes.trim() || null };
    const { ok, data } = await postJson<{ place?: PlaceDTO; error?: string }>(
      draft.id ? `/api/app/places/${draft.id}` : "/api/app/places",
      body,
      draft.id ? "PATCH" : "POST"
    );
    setBusy(false);
    if (!ok || !data?.place) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    const place = data.place;
    setPlaces((cur) => (draft.id ? cur.map((p) => (p.id === place.id ? place : p)) : [...cur, place]).sort((a, b) => a.name.localeCompare(b.name)));
    setDraft(null);
  }

  async function setArchived(p: PlaceDTO, value: boolean) {
    setBusy(true);
    const { ok, data } = await postJson<{ place?: PlaceDTO; error?: string }>(`/api/app/places/${p.id}`, { archived: value }, "PATCH");
    setBusy(false);
    if (!ok || !data?.place) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    const place = data.place;
    setPlaces((cur) => cur.map((x) => (x.id === place.id ? place : x)));
  }

  const row = (p: PlaceDTO) => (
    <ListRow
      key={p.id}
      lead={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
          {p.kind === "SUPPLY" ? <Warehouse size={16} /> : <MapPin size={16} />}
        </span>
      }
      title={p.name}
      sub={`${PLACE_KIND_LABELS[p.kind]} · ${p.address}`}
      trail={
        <span className="flex items-center gap-1.5">
          {p.lat == null && <Chip tone="warn">No pin</Chip>}
          {!p.archived && (
            <button
              type="button"
              onClick={() => setDraft({ id: p.id, name: p.name, kind: p.kind, address: p.address, notes: p.notes ?? "" })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]"
              aria-label={`Edit ${p.name}`}
            >
              <Pencil size={14} />
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setArchived(p, !p.archived)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)] disabled:opacity-50"
              aria-label={p.archived ? `Restore ${p.name}` : `Archive ${p.name}`}
              title={p.archived ? "Put it back" : "Archive"}
            >
              {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            </button>
          )}
        </span>
      }
    />
  );

  return (
    <DsPage>
      <PageHeader
        eyebrow="Routes"
        title="Places"
        info="The spots your crew drives to that aren't clients: supply houses, the dump, the yard. Save them once and they're two taps away when you add a stop to someone's route."
        actions={
          <>
            <Button href="/app/routes" variant="ghost" icon={RouteIcon}>
              Routes
            </Button>
            <Button onClick={() => setDraft(EMPTY)} icon={Plus}>
              New place
            </Button>
          </>
        }
      />

      {error && !draft && (
        <div role="alert" className="form-error mb-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {active.length === 0 ? (
        <div className="ds-card mt-4">
          <Hint
            title="No places yet"
            info="Add the supply house you hit most — it shows up first when someone adds a stop to a route."
          />
          <div className="flex justify-center pb-8">
            <Button onClick={() => setDraft(EMPTY)} icon={Plus}>
              New place
            </Button>
          </div>
        </div>
      ) : (
        <div className="ds-card mt-4 divide-y divide-[color:var(--ds-line)] overflow-hidden">{active.map(row)}</div>
      )}

      {archived.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-[13px] font-medium text-[color:var(--ds-muted)] hover:underline">
            {showArchived ? "Hide" : "Show"} {archived.length} archived
          </button>
          {showArchived && <div className="ds-card mt-2 divide-y divide-[color:var(--ds-line)] overflow-hidden opacity-70">{archived.map(row)}</div>}
        </div>
      )}

      <Modal open={Boolean(draft)} onClose={() => !busy && setDraft(null)} size="md" dismissible={!busy}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="ds-h2 flex items-center gap-1.5">
                {draft.id ? "Edit place" : "New place"}
                <InfoTip>A place is an address, not a client. Errands and tasks made from it copy the address, so archiving it later changes nothing on a route.</InfoTip>
              </h3>
              <button type="button" onClick={() => !busy && setDraft(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]">
                <X size={16} />
              </button>
            </div>
            {error && <div role="alert" className="form-error">{error}</div>}
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-ink-2)]" htmlFor="place-name">
                Name
              </label>
              <input
                id="place-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={PLACE_NAME_MAX}
                placeholder="Ferguson on Plano Pkwy"
                autoFocus
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-ink-2)]" htmlFor="place-kind">
                Kind
              </label>
              <select id="place-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PlaceKind })} className={inputCls}>
                {PLACE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PLACE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-ink-2)]" htmlFor="place-address">
                Address
              </label>
              <AddressAutocomplete
                id="place-address"
                endpoint="/api/app/geocode/suggest"
                value={draft.address}
                onChange={(v) => setDraft({ ...draft, address: v })}
                onPick={(a) => setDraft({ ...draft, address: a.label })}
                placeholder="Street, city, state"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-ink-2)]" htmlFor="place-notes">
                Notes
              </label>
              <textarea
                id="place-notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                maxLength={PLACE_NOTES_MAX}
                rows={2}
                placeholder="Ask for Dave at the counter · closes at 5"
                className={inputCls}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => !busy && setDraft(null)} className="rounded-[10px] px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button type="submit" disabled={busy || !draft.name.trim() || !draft.address.trim()} className="btn-primary">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {draft.id ? "Save" : "Add place"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </DsPage>
  );
}
