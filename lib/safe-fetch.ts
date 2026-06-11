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
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export const GENERIC_ERROR =
  "Something went wrong — your changes were not saved. Please try again.";
