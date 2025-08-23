/* Abelion AI SW */
const CACHE = 'abelion-cache::v1';
const CORE = [
  '/', 
    '/index.html', 
      '/styles.css', 
        '/app.js', 
          '/manifest.webmanifest'
          ];

          self.addEventListener('install', e => {
            e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
              self.skipWaiting();
              });

              self.addEventListener('activate', e => {
                e.waitUntil((async () => {
                    const keys = await caches.keys();
                        await Promise.all(
                              keys.filter(k => k.startsWith('abelion-cache::') && k !== CACHE)
                                        .map(k => caches.delete(k))
                                            );
                                                await self.clients.claim();
                                                  })());
                                                  });

                                                  self.addEventListener('fetch', e => {
                                                    const req = e.request;
                                                      const isHTML = req.headers.get('accept')?.includes('text/html');
                                                        if (isHTML) {
                                                            e.respondWith((async () => {
                                                                  try {
                                                                          const net = await fetch(req);
                                                                                  const cache = await caches.open(CACHE);
                                                                                          cache.put(req, net.clone());
                                                                                                  return net;
                                                                                                        } catch {
                                                                                                                return (await caches.match(req)) || caches.match('/index.html');
                                                                                                                      }
                                                                                                                          })());
                                                                                                                            } else {
                                                                                                                                e.respondWith((async () => {
                                                                                                                                      const hit = await caches.match(req);
                                                                                                                                            const net = fetch(req).then(r => {
                                                                                                                                                    caches.open(CACHE).then(c => c.put(req, r.clone()));
                                                                                                                                                            return r;
                                                                                                                                                                  }).catch(() => hit);
                                                                                                                                                                        return hit || net;
                                                                                                                                                                            })());
                                                                                                                                                                              }
                                                                                                                                                                              });

                                                                                                                                                                              self.addEventListener('message', e => {
                                                                                                                                                                                if (e.data === 'SKIP_WAITING') self.skipWaiting();
                                                                                                                                                                                });