/**
 * A small in-memory diary of what voice mode did in this tab — which engine
 * ran, how long the token / mic / socket took, when audio started, each
 * tool call, why a fallback happened. It costs nothing to keep and it is
 * what "Report this conversation" sends along, so a "it was slow" report
 * arrives with the timings instead of a guess (David 2026-10-23).
 */
type Entry = { t: number; event: string; detail?: string };

const MAX = 400;
let entries: Entry[] = [];

export function voiceLog(event: string, detail?: unknown): void {
  let text: string | undefined;
  if (typeof detail === "string") text = detail;
  else if (detail instanceof Error) text = `${detail.name}: ${detail.message}`;
  else if (detail !== undefined) {
    try {
      text = JSON.stringify(detail);
    } catch {
      text = String(detail);
    }
  }
  entries.push({ t: Date.now(), event, detail: text ? text.slice(0, 300) : undefined });
  if (entries.length > MAX) entries = entries.slice(-MAX);
}

/** The diary as lines: wall-clock time, gap since the previous line, event, detail. */
export function voiceLogLines(): string[] {
  let prev = 0;
  return entries.map((e) => {
    const gap = prev ? `+${((e.t - prev) / 1000).toFixed(2)}s` : "";
    prev = e.t;
    const when = new Date(e.t).toISOString().slice(11, 23);
    return `${when} ${gap.padStart(8)} ${e.event}${e.detail ? ` ${e.detail}` : ""}`;
  });
}

export function clearVoiceLog(): void {
  entries = [];
}
