/**
 * Fetch wrapper for client-side form submits. Never throws — network errors
 * and non-JSON error pages come back as { ok: false } so submit handlers can
 * always clear their loading state and show a message.
 */
export async function postJson<T = unknown>(
  url: string,
  body?: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST"
): Promise<{ ok: boolean; status: number; data: (T & { error?: string }) | null }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data: (T & { error?: string }) | null = null;
    try {
      data = await res.json();
    } catch {
      // Non-JSON response (e.g. a 500 error page) — treat as no payload
    }
    if (!res.ok) data = friendlyAuthError(res.status, data);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/**
 * The API's two guard words, said in English. 287 routes answer an expired
 * session with `{ error: "Unauthorized" }` and 197 answer a role check with
 * `{ error: "Forbidden" }`; 158 call sites render `data.error` straight into
 * a dialog, so that is literally what a tech read after lunch when the tab
 * had gone stale (audit 2026-10-12). Only the exact guard words are
 * replaced — a route that already explains itself ("Only the note's author
 * can edit it.") keeps its sentence. A 401 inside the app also starts the
 * trip back to sign-in; public pages (hub, pay, book) are left alone.
 */
function friendlyAuthError<T>(
  status: number,
  data: (T & { error?: string }) | null
): (T & { error?: string }) | null {
  const err = data?.error;
  if (status === 401 && (!err || err === "Unauthorized")) {
    if (typeof window !== "undefined" && /^\/app(\/|$)/.test(window.location.pathname)) {
      // Give the dialog a beat to show, then take them to sign in.
      setTimeout(() => window.location.assign("/app/login"), 1500);
    }
    return { ...(data ?? ({} as T)), error: SESSION_ENDED };
  }
  if (status === 403 && (!err || err === "Forbidden")) {
    return { ...(data ?? ({} as T)), error: NO_PERMISSION };
  }
  return data;
}

export const GENERIC_ERROR =
  "Something went wrong — your changes were not saved. Please try again.";
export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
export const SESSION_ENDED = "Your session ended — sign in again to continue.";
export const NO_PERMISSION = "You don't have permission to do this. Ask an owner or admin.";
