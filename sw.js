/* Abelion AI Service Worker – universal scope-safe */
const SW_TAG = 'v2';
const CACHE = `abelion-cache::${SW_TAG}`;

// Tentukan base path sesuai lokasi deploy (GitHub Pages biasanya pakai subfolder)
const SCOPE_PATH = self.registration.scope.replace(/\/+$/, '/') || '/';
const p = (rel) => SCOPE_PATH + rel.replace(/^\/+/, '');

// Cache inti
const CORE = [
  p('index.html'),
  p('styles.css'),
  p('app.js'),
  p('manifest.webmanifest')
];

// Install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => null)
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('abelion-cache::') && k !== CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Fetch
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const isHTML = req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    e.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch {
        return (await caches.match(req)) || (await caches.match(p('index.html')));
      }
    })());
  } else {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const fetching = fetch(req).then((res) => {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fetching;
    })());
  }
});

// Message handler
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
