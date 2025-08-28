/* Abelion AI Service Worker – stable */
'use strict';

const SW_VERSION = self.APP_VERSION || 'v0.0.0';
const CACHE = `abelion-cache::${SW_VERSION}`;

// Gunakan path relatif agar jalan di GitHub Pages / subfolder
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './privacy.js'
];

// Install: cache app shell
self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE))
  );
  self.skipWaiting();
});

// Activate: hapus cache lama
self.addEventListener('activate', (event)=>{
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k=>k.startsWith('abelion-cache::') && k!==CACHE)
        .map(k=>caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Fetch handler
self.addEventListener('fetch', (event)=>{
  const req = event.request;

  // Abaikan non-GET
  if (req.method !== 'GET') return;

  // Navigasi HTML: network-first, fallback cache/offline
  if (req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html')) {
    event.respondWith((async()=> {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Asset: stale-while-revalidate
  event.respondWith((async()=>{
    const cached = await caches.match(req);
    const fetchPromise = fetch(req).then(net => {
      const cache = caches.open(CACHE);
      cache.then(c=>c.put(req, net.clone()));
      return net;
    }).catch(err => {
      console.warn('SW fetch failed:', err);
    });
    return cached || fetchPromise;
  })());
});

self.addEventListener('message', (event) => {
  // Hanya proses pesan dari asal yang sama
  if (event.origin !== self.location.origin) {
    console.warn('Mengabaikan pesan dari asal tidak dikenal:', event.origin);
    return;
  }
  
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});