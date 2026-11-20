// Polestar Sales service worker
// 1. Offline: pages are fetched from the network first and kept as a fallback, so the
//    app still opens (with the last data seen) when there's no signal.
// 2. Push: shows reminder notifications and opens the right screen when tapped.

const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
// On localhost, skip offline caching so development reloads aren't affected (push still works).
const DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![PAGES, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Polestar Sales</title><style>body{font-family:system-ui,sans-serif;background:#f5f6f8;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}
a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:12px;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><div><h1 style="font-size:20px">You're offline</h1><p style="color:#64748b">This page hasn't been opened on this phone yet.<br>Pages you've opened before still work, and anything you log is saved and synced later.</p>
<a href="/log">Log a visit / call</a></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (DEV || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/login") return;

  // Build assets never change once published: cache-first.
  if (url.pathname.startsWith("/_next/static/") || /\.(?:png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
    return;
  }

  // Pages and in-app navigation data: network first, last copy as fallback.
  const isPage = req.mode === "navigate";
  const isRsc = req.headers.get("RSC") === "1";
  if (!isPage && !isRsc) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) caches.open(PAGES).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (isRsc) return Response.error(); // makes the app fall back to a full page load
        const page = await caches.match(url.pathname, { ignoreSearch: true });
        return page || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }),
  );
});

// Signing out clears saved pages so the next person on this phone can't see them.
self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Polestar Sales";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: data.tag || "polestar",
      renotify: true,
      data: { url: data.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
