/**
 * Service worker for WorkBench. Two jobs:
 *
 * 1) Web push (original role): show notifications and click into the right page.
 * 2) Offline mode, phase 1 (read-only snapshot):
 *    - /app/* page navigations are network-first; when the network is gone the
 *      last cached copy is served, then offline.html as a final fallback.
 *    - Build assets and Google Fonts are cache-first (immutable per deploy).
 *    - Same-origin images (job photos, avatars, company logos) are
 *      stale-while-revalidate with a size cap.
 *    - A PREFETCH message warms the pages for today's/tomorrow's jobs (sent by
 *      components/OfflineSupport.tsx via /api/app/offline).
 *    - Any navigation that lands on the login page clears the snapshot: the
 *      cache belongs to the previous session (sign-out, expiry, user switch).
 *
 * Bump VERSION to drop every cache wholesale on the next deploy.
 */

const VERSION = "v1";
const STATIC_CACHE = `sfh-static-${VERSION}`;
const PAGES_CACHE = `sfh-pages-${VERSION}`;
const MEDIA_CACHE = `sfh-media-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PAGES_MAX = 80;
const MEDIA_MAX = 200;
const STATIC_MAX = 400;

// Never cached, and visiting one wipes the snapshot (privacy on shared devices)
const AUTH_PAGES = ["/app/login", "/app/register", "/app/forgot-password", "/app/reset-password"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("sfh-") && !n.endsWith(`-${VERSION}`))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// ── Cache helpers ────────────────────────────────────────────────────────────

/** Copy a response with an sw-cached-at header so the client can show "saved at". */
async function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("sw-cached-at", String(Date.now()));
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/** Store a response and keep the cache under `max` entries (oldest stamped first out). */
async function putCapped(cacheName, request, response, max) {
  try {
    const cache = await caches.open(cacheName);
    // Opaque bodies (no-cors font CSS) can't be re-wrapped — store them as-is
    if (response.type === "opaque") await cache.put(request, response);
    else await cache.put(request, await stamp(response));

    const keys = await cache.keys();
    if (keys.length > max) {
      const dated = await Promise.all(
        keys.map(async (key) => {
          const match = await cache.match(key);
          return { key, at: Number(match && match.headers.get("sw-cached-at")) || 0 };
        })
      );
      dated.sort((a, b) => a.at - b.at);
      await Promise.all(dated.slice(0, keys.length - max).map((d) => cache.delete(d.key)));
    }
  } catch {
    /* quota/storage errors must never break the page */
  }
}

async function clearSnapshot() {
  await Promise.all([caches.delete(PAGES_CACHE), caches.delete(MEDIA_CACHE)]);
}

function isAppPath(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isAuthPath(pathname) {
  return AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

// ── Fetch strategies ─────────────────────────────────────────────────────────

async function handleNavigation(event, request) {
  try {
    const response = await fetch(request);

    // Redirected to login = session over: don't cache, and drop the old snapshot
    let finalPath = "";
    try {
      finalPath = new URL(response.url).pathname;
    } catch {}
    if (response.redirected && isAuthPath(finalPath)) {
      event.waitUntil(clearSnapshot());
      return response;
    }

    if (response.ok && !response.redirected && response.type === "basic") {
      event.waitUntil(putCapped(PAGES_CACHE, request, response.clone(), PAGES_MAX));
    }
    return response;
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const exact = await cache.match(request, { ignoreVary: true });
    if (exact) return exact;
    // e.g. /app/jobs?status=ACTIVE falls back to the cached /app/jobs
    const loose = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
    if (loose) return loose;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw new Error("offline and no cached copy");
  }
}

async function cacheFirst(request, cacheName, max) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await putCapped(cacheName, request, response.clone(), max);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cached = await caches.match(request, { ignoreVary: true });
  const network = fetch(request).then((response) => {
    if (response.ok) putCapped(cacheName, request, response.clone(), max);
    return response;
  });
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  return network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  const sameOrigin = url.origin === self.location.origin;

  // App page navigations: network-first with snapshot fallback
  if (request.mode === "navigate") {
    if (!sameOrigin || !isAppPath(url.pathname)) return;
    if (isAuthPath(url.pathname)) {
      event.waitUntil(clearSnapshot());
      return; // auth pages are always live, never cached
    }
    event.respondWith(handleNavigation(event, request));
    return;
  }

  // Build assets: content-hashed, safe to serve cache-first forever
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, STATIC_MAX));
    return;
  }

  // Google Fonts (stylesheet + woff2)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, STATIC_CACHE, STATIC_MAX));
    return;
  }

  // Images: job photos (/api/job-photos/*), avatars, logos, pwa icons
  if (sameOrigin && request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE, MEDIA_MAX));
    return;
  }
});

// ── Messages from the page (OfflineSupport component) ────────────────────────

self.addEventListener("message", (event) => {
  const msg = event.data || {};

  // Warm the snapshot with the day's job pages
  if (msg.type === "PREFETCH" && Array.isArray(msg.urls)) {
    event.waitUntil(
      (async () => {
        for (const u of msg.urls.slice(0, 40)) {
          try {
            const request = new Request(u, { credentials: "same-origin" });
            const target = new URL(request.url);
            if (target.origin !== self.location.origin) continue;
            if (!isAppPath(target.pathname) || isAuthPath(target.pathname)) continue;
            const response = await fetch(request);
            if (response.ok && !response.redirected && response.type === "basic") {
              await putCapped(PAGES_CACHE, request, response, PAGES_MAX);
            }
          } catch {
            /* went offline mid-warm — keep whatever we got */
          }
        }
      })()
    );
  }

  // "When was the copy of this page saved?" → { cachedAt: number | null }
  if (msg.type === "CACHED_AT" && event.ports && event.ports[0]) {
    event.waitUntil(
      (async () => {
        let cachedAt = null;
        try {
          const cache = await caches.open(PAGES_CACHE);
          const match =
            (await cache.match(msg.url, { ignoreVary: true })) ||
            (await cache.match(msg.url, { ignoreSearch: true, ignoreVary: true }));
          if (match) cachedAt = Number(match.headers.get("sw-cached-at")) || null;
        } catch {}
        event.ports[0].postMessage({ cachedAt });
      })()
    );
  }

  if (msg.type === "CLEAR_SNAPSHOT") event.waitUntil(clearSnapshot());
});

// ── Web push (unchanged) ─────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload — show the generic notification */
  }
  const title = data.title || "WorkBench";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/app/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/dashboard";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith("/app")) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(url);
            return;
          } catch {
            /* fall through to opening a new window */
          }
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
