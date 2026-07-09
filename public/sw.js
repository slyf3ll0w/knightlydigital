/**
 * Service worker for web push (registered from AppShell for signed-in users).
 * No caching/offline here — the app is fully server-rendered; this exists so
 * push notifications can be shown and clicked into the right page.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload — show the generic notification */
  }
  const title = data.title || "Streamflaire Hub";
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
