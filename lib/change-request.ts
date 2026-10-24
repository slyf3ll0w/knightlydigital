/**
 * "Suggest a change" (2026-10-23) — the visual/functional twin of the Atlas
 * "Report a problem" button. A tester taps the thing they want changed on
 * any app page, says what to change in a line, and everything they could
 * never describe comes along: the page rendered to a picture with the tapped
 * element boxed, the element's own HTML and classes (enough to grep straight
 * to the component), the route, viewport, device and theme, the pages they
 * came through, and any console errors or failed requests from the last few
 * minutes. It lands as a SUGGESTION FeedbackTicket tagged
 * pageUrl "change-request" so /superadmin/feedback shows the picture and
 * `npx tsx scripts/ticket.mts <id>` pulls the whole thing for Claude.
 *
 * This module is shared by the client (components/SuggestChange.tsx builds a
 * ChangeCapture), the API (sanitizes it, renders the ticket text) and the
 * pull script (renders it again from the stored JSON). Pure: no DOM, no DB.
 */

export const CHANGE_REQUEST_TAG = "change-request";

export type ChangeKind = "looks" | "works" | "both";

export type ChangeTarget = {
  /** Lower-case tag name, e.g. "button" */
  tag: string;
  /** Visible text, trimmed */
  text: string;
  /** The element's class attribute (Tailwind utilities are the best grep key we have) */
  classes: string;
  /** Interesting attributes: id, role, aria-label, title, placeholder, name, href, type, data-* */
  attrs: Record<string, string>;
  /** Ancestor chain, outermost first: "main > div.flex.gap-2 > button.ds-btn" */
  path: string;
  /** The element's outer HTML, trimmed (svg paths and data URLs stripped) */
  html: string;
  /** Viewport box at pick time */
  rect: { x: number; y: number; w: number; h: number };
};

export type ChangePage = {
  url: string;
  title: string;
  /** Pathnames visited before this one in this tab, oldest first */
  history: string[];
  viewport: { w: number; h: number; dpr: number };
  /** "light" / "dark" (the OS preference plus whatever the app applied) */
  theme: string;
  ua: string;
  platform: string;
  /** Installed PWA / native shell vs a browser tab */
  standalone: boolean;
  lang: string;
  online: boolean;
};

export type DiagError = { at: string; kind: string; message: string };
export type DiagRequest = { at: string; method: string; url: string; status: number | string; ms: number };

export type ChangeDiag = { errors: DiagError[]; requests: DiagRequest[] };

export type ChangeCapture = {
  kind: ChangeKind;
  /** null = "the whole page" */
  target: ChangeTarget | null;
  page: ChangePage;
  diag: ChangeDiag;
  /** How the picture was made: rendered by the app, attached by the user, or none */
  shot: "auto" | "own" | "none";
  /** Why the app's own picture failed, when it did (shot none/own after a failed render) */
  shotError?: string;
  capturedAt: string;
};

export const KIND_LABEL: Record<ChangeKind, string> = {
  looks: "How it looks",
  works: "How it works",
  both: "Looks and works",
};

const SEP = "\n\n────────\n\n";
export const DETAILS_SEPARATOR = SEP;

const MAX_HTML = 4000;
const MAX_ERRORS = 30;
const MAX_REQUESTS = 30;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
}

/** Clamp a client-built capture to sane sizes; never trust its shape. */
export function sanitizeCapture(raw: unknown): ChangeCapture {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind: ChangeKind = r.kind === "works" || r.kind === "both" ? r.kind : "looks";

  let target: ChangeTarget | null = null;
  if (r.target && typeof r.target === "object") {
    const t = r.target as Record<string, unknown>;
    const attrs: Record<string, string> = {};
    if (t.attrs && typeof t.attrs === "object") {
      for (const [k, v] of Object.entries(t.attrs as Record<string, unknown>).slice(0, 20)) {
        if (typeof v === "string") attrs[k.slice(0, 40)] = v.slice(0, 300);
      }
    }
    const rect = (t.rect && typeof t.rect === "object" ? t.rect : {}) as Record<string, unknown>;
    target = {
      tag: str(t.tag, 30).toLowerCase() || "element",
      text: str(t.text, 200),
      classes: str(t.classes, 600),
      attrs,
      path: str(t.path, 600),
      html: str(t.html, MAX_HTML),
      rect: { x: num(rect.x), y: num(rect.y), w: num(rect.w), h: num(rect.h) },
    };
  }

  const p = (r.page && typeof r.page === "object" ? r.page : {}) as Record<string, unknown>;
  const vp = (p.viewport && typeof p.viewport === "object" ? p.viewport : {}) as Record<string, unknown>;
  const page: ChangePage = {
    url: str(p.url, 500),
    title: str(p.title, 200),
    history: Array.isArray(p.history) ? p.history.filter((h): h is string => typeof h === "string").slice(-8).map((h) => h.slice(0, 200)) : [],
    viewport: { w: num(vp.w), h: num(vp.h), dpr: typeof vp.dpr === "number" ? Math.round(vp.dpr * 100) / 100 : 1 },
    theme: str(p.theme, 40) || "light",
    ua: str(p.ua, 300),
    platform: str(p.platform, 60),
    standalone: Boolean(p.standalone),
    lang: str(p.lang, 20),
    online: p.online !== false,
  };

  const d = (r.diag && typeof r.diag === "object" ? r.diag : {}) as Record<string, unknown>;
  const errors: DiagError[] = Array.isArray(d.errors)
    ? (d.errors as unknown[]).slice(-MAX_ERRORS).flatMap((e) => {
        const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
        const message = str(o.message, 600);
        return message ? [{ at: str(o.at, 40), kind: str(o.kind, 30) || "error", message }] : [];
      })
    : [];
  const requests: DiagRequest[] = Array.isArray(d.requests)
    ? (d.requests as unknown[]).slice(-MAX_REQUESTS).flatMap((e) => {
        const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
        const url = str(o.url, 300);
        return url
          ? [
              {
                at: str(o.at, 40),
                method: str(o.method, 10).toUpperCase() || "GET",
                url,
                status: typeof o.status === "number" ? o.status : str(o.status, 30) || "failed",
                ms: num(o.ms),
              },
            ]
          : [];
      })
    : [];

  return {
    kind,
    target,
    page,
    diag: { errors, requests },
    shot: r.shot === "auto" || r.shot === "own" ? r.shot : "none",
    ...(str(r.shotError, 300) ? { shotError: str(r.shotError, 300) } : {}),
    capturedAt: str(r.capturedAt, 40) || new Date().toISOString(),
  };
}

/** One line naming the tapped thing: `button “Save”` */
export function describeTarget(t: ChangeTarget | null): string {
  if (!t) return "the whole page";
  const label = t.text || t.attrs["aria-label"] || t.attrs.title || t.attrs.placeholder || t.attrs.name || "";
  const short = label.length > 60 ? `${label.slice(0, 60)}…` : label;
  return short ? `${t.tag} “${short}”` : t.tag;
}

/** The ticket title: `Change: make this bigger — button “Save” on /app/jobs/123` */
export function changeRequestTitle(note: string, capture: ChangeCapture): string {
  const n = note.trim().replace(/\s+/g, " ");
  const head = n.length > 70 ? `${n.slice(0, 70)}…` : n;
  const where = capture.page.url ? ` on ${pathOf(capture.page.url)}` : "";
  return `Change: ${head} — ${describeTarget(capture.target)}${where}`.slice(0, 200);
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url, "https://x.invalid");
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * The ticket body — the same sectioned layout as the Atlas report so the
 * console, the email and the pull script all read it the same way. Section
 * 1 is what the submitter typed; everything after is captured.
 */
export function changeRequestDetails(
  note: string,
  capture: ChangeCapture,
  actor: { name: string; id: string; role: string; companyId: string; companyName?: string }
): string {
  const t = capture.target;
  const p = capture.page;
  const sections: string[] = [];

  sections.push(`WHAT TO CHANGE (${KIND_LABEL[capture.kind]})\n${note.trim()}`);

  sections.push(
    [
      "WHERE",
      `page: ${pathOf(p.url) || "(unknown)"}${p.title ? ` — ${p.title}` : ""}`,
      `target: ${describeTarget(t)}`,
      t ? `path: ${t.path || "(none)"}` : "",
      t ? `box: ${t.rect.w}×${t.rect.h} at (${t.rect.x}, ${t.rect.y})` : "",
      p.history.length ? `came from: ${p.history.join(" → ")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  if (t) {
    const attrs = Object.entries(t.attrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    sections.push(
      [
        "ELEMENT",
        `<${t.tag}${attrs ? ` ${attrs}` : ""}>`,
        t.classes ? `classes: ${t.classes}` : "",
        t.text ? `text: ${t.text}` : "",
        t.html ? `\n${t.html}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  sections.push(
    [
      "SCREEN",
      `viewport: ${p.viewport.w}×${p.viewport.h} @${p.viewport.dpr}x · ${p.theme}${p.standalone ? " · installed app" : " · browser tab"}${p.online ? "" : " · OFFLINE"}`,
      `device: ${p.platform || "?"}${p.lang ? ` · ${p.lang}` : ""}`,
      `ua: ${p.ua || "?"}`,
      `picture: ${capture.shot === "auto" ? "rendered by the app" : capture.shot === "own" ? "attached by the user" : "none"}${capture.shotError ? ` · the app's render failed: ${capture.shotError}` : ""}`,
      `user: ${actor.name} (${actor.id}) · role ${actor.role} · company ${actor.companyName ? `${actor.companyName} ` : ""}${actor.companyId}`,
      `captured: ${capture.capturedAt}`,
    ].join("\n")
  );

  const errs = capture.diag.errors;
  sections.push(
    `RECENT ERRORS\n${errs.length ? errs.map((e) => `${e.at} ${e.kind}: ${e.message}`).join("\n") : "(none in the last few minutes)"}`
  );
  const reqs = capture.diag.requests;
  sections.push(
    `FAILED REQUESTS\n${reqs.length ? reqs.map((r) => `${r.at} ${r.method} ${r.url} → ${r.status} (${r.ms} ms)`).join("\n") : "(none in the last few minutes)"}`
  );

  return sections.join(SEP);
}

/** The ticket's spoken handle: the last six characters of its id (`#ab12cd`). */
export function shortTicketId(id: string): string {
  return id.slice(-6);
}
