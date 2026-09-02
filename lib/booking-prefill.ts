/**
 * What an embed hands to the hosted booking page for a paid booking:
 * finix.js hosted fields refuse to mount inside an iframe on a
 * non-allowlisted origin ("embedding origin not allowed"), so the card step
 * has to run on our own page. Everything the customer picked in the embed
 * rides along in a URL-safe base64 blob so nothing is re-entered. Pure —
 * runs on the server (page) and in the browser (stepper).
 */
export type Prefill = {
  services?: string[];
  address?: string;
  start?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
};

export function encodePrefill(p: Prefill): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePrefill(raw: string | null | undefined): Prefill | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as Prefill;
    if (!p || typeof p !== "object") return null;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
    return {
      services: Array.isArray(p.services) ? p.services.filter((s): s is string => typeof s === "string").slice(0, 20) : undefined,
      address: str(p.address, 300),
      start: str(p.start, 40),
      firstName: str(p.firstName, 100),
      lastName: str(p.lastName, 100),
      email: str(p.email, 200),
      phone: str(p.phone, 40),
      notes: str(p.notes, 2000),
    };
  } catch {
    return null;
  }
}
