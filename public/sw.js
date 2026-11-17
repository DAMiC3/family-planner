// Family Planner service worker: makes the app installable and lets it open offline.
// Data always comes live from Supabase; only the app's own files are cached.
const VERSION = "v2";
const CACHE = `family-planner-${VERSION}`;
const BASE = new URL(self.registration.scope).pathname; // e.g. "/family-planner/"
const SHELL = ["", "program/", "calendar/", "tasks/", "shopping/", "meals/", "inbox/", "family/", "rules/", "login/", "onboarding/"].map(
  (p) => BASE + p,
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("family-planner-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Never touch Supabase or other sites, and never cache non-GET requests.
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Pages: try the network first so updates show up, fall back to the cached copy offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(BASE + "program/")) || Response.error()),
    );
    return;
  }

  // Hashed build files never change: cache first.
  if (url.pathname.startsWith(BASE + "_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else (icons, manifest, page data): network first, cached copy when offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(request)) || Response.error()),
  );
});

// ---------------------------------------------------------------- push notifications

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Family Planner", body: event.data ? event.data.text() : "" };
  }
  const url = BASE + String(data.url || "/inbox/").replace(/^\//, "");
  event.waitUntil(
    self.registration.showNotification(data.title || "Family Planner", {
      body: data.body || "",
      icon: BASE + "icons/icon-192.png",
      badge: BASE + "icons/icon-192.png",
      tag: data.tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || BASE + "inbox/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin + BASE) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
