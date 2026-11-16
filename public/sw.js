// Family Planner service worker: makes the app installable and lets it open offline.
// Data always comes live from Supabase; only the app's own files are cached.
const VERSION = "v1";
const CACHE = `family-planner-${VERSION}`;
const BASE = new URL(self.registration.scope).pathname; // e.g. "/family-planner/"
const SHELL = ["", "dashboard/", "calendar/", "tasks/", "shopping/", "meals/", "family/", "login/", "onboarding/"].map(
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
        .catch(async () => (await caches.match(request)) || (await caches.match(BASE + "dashboard/")) || Response.error()),
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
