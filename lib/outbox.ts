"use client";

import { postJson } from "@/lib/safe-fetch";

/**
 * Offline write outbox. Field techs lose signal mid-driveway; the writes that
 * matter out there (clock punches, notes, checklist ticks, status changes,
 * sign-offs) queue here when the network dies and flush when it comes back.
 *
 * Design rules:
 * - Only NETWORK failures queue (postJson status 0). A server rejection
 *   (4xx/5xx) is a real answer and is shown to the user immediately.
 * - Items flush strictly in order (a clock-out must land after its clock-in,
 *   checklist ticks before the completion they gate). A network failure stops
 *   the flush; a server rejection drops just that item and continues.
 * - Idempotency lives server-side: callers put a clientKey in the body where
 *   the route supports one, so a flush that half-landed can safely re-run.
 * - Durable across reloads via localStorage (in-memory fallback when storage
 *   is blocked); OfflineSupport owns the flush triggers + pending-count pill.
 */

export type OutboxItem = {
  id: string;
  url: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  /** Human label for the pill/error surface, e.g. "Clock out" */
  label: string;
  createdAt: number;
};

export type FlushResult = {
  /** Items that reached the server and succeeded */
  flushed: number;
  /** Items the server rejected (4xx/5xx) — dropped, with the reason */
  dropped: { label: string; error: string }[];
};

const KEY = "wb-outbox-v1";
let memoryQueue: OutboxItem[] | null = null; // storage-blocked fallback
let flushing = false;
const listeners = new Set<(count: number) => void>();

function load(): OutboxItem[] {
  if (memoryQueue) return memoryQueue;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    memoryQueue = memoryQueue ?? [];
    return memoryQueue;
  }
}

function save(queue: OutboxItem[]) {
  if (memoryQueue) {
    memoryQueue = queue;
  } else {
    try {
      localStorage.setItem(KEY, JSON.stringify(queue));
    } catch {
      memoryQueue = queue;
    }
  }
  for (const cb of listeners) cb(queue.length);
}

export function outboxCount(): number {
  if (typeof window === "undefined") return 0;
  return load().length;
}

export function subscribeOutbox(cb: (count: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * POST/PATCH that queues on network failure instead of erroring. Returns
 * { queued: true } when the write is parked for later — callers should show
 * their optimistic "saved, will sync" state. Any HTTP response (success or
 * rejection) comes back exactly like postJson.
 */
export async function sendOrQueue<T = unknown>(item: {
  url: string;
  method?: "POST" | "PATCH";
  body: Record<string, unknown>;
  label: string;
}): Promise<
  | { queued: true }
  | { queued: false; ok: boolean; status: number; data: (T & { error?: string }) | null }
> {
  const method = item.method ?? "POST";
  // Anything already queued must land first — otherwise a note typed offline
  // arrives after one typed a minute later back on wifi.
  if (outboxCount() === 0) {
    const res = await postJson<T>(item.url, item.body, method);
    if (res.status !== 0) return { queued: false, ...res };
  }
  const queue = load();
  queue.push({
    id: crypto.randomUUID(),
    url: item.url,
    method,
    body: item.body,
    label: item.label,
    createdAt: Date.now(),
  });
  save(queue);
  // A non-empty queue with a live network flushes immediately (covers the
  // "wifi came back between taps" case without waiting for the next trigger)
  if (navigator.onLine) void flushOutbox();
  return { queued: true };
}

/** Push queued writes to the server, oldest first. Safe to call anytime. */
export async function flushOutbox(): Promise<FlushResult> {
  const result: FlushResult = { flushed: 0, dropped: [] };
  if (flushing || typeof window === "undefined") return result;
  flushing = true;
  try {
    let queue = load();
    while (queue.length > 0) {
      const item = queue[0];
      const res = await postJson(item.url, item.body, item.method);
      if (res.status === 0) break; // still offline — keep everything
      queue = queue.slice(1);
      save(queue);
      if (res.ok) {
        result.flushed += 1;
      } else {
        result.dropped.push({
          label: item.label,
          error: res.data?.error ?? `Rejected (${res.status})`,
        });
      }
    }
  } finally {
    flushing = false;
  }
  return result;
}
