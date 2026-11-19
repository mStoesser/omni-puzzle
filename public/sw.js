// Service worker: network first, cache as fallback, so the app works offline after the first visit
// and always gets updates when online. Shared puzzles work offline too: they live completely in the link.
// Bump VERSION when the caching logic changes; old caches are deleted on activation.
const VERSION = "v2"; // v2: also caches the chunks loaded with import() (languages, escape rooms)
const CACHE = `raetsel-${VERSION}`;
const SHELL = ["./", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // The built index.html references hashed bundles; cache them right away, not only on the second visit.
      const html = await (await cache.match("./")).text();
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.registration.scope).href);
      await cache.addAll(assets);
      // Chunks loaded later with import() (the texts of each language, escape rooms) are named in the bundles as
      // "./name-hash.js". Without them the app could not start offline after an update: the texts are a chunk too.
      const seen = new Set(assets);
      for (let i = 0; i < assets.length; i++) {
        if (!assets[i].endsWith(".js")) continue;
        const code = await (await cache.match(assets[i])).text();
        // A chunk may be named more than once; addAll refuses duplicates (and the whole install would fail).
        const found = [...new Set([...code.matchAll(/["'`]\.\/([\w-]+-[\w-]{8}\.js)["'`]/g)].map((m) => new URL(m[1], assets[i]).href))].filter((url) => !seen.has(url));
        for (const url of found) seen.add(url);
        await cache.addAll(found);
        assets.push(...found);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only same-origin GETs: backend requests (Supabase) are never cached, community data must be fresh.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // Offline navigation (e.g. a share link): the app shell handles every route via the hash.
        if (request.mode === "navigate") {
          const shell = await caches.match("./");
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});
