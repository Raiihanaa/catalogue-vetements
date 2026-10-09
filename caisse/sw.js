// Mode hors ligne de la caisse : garde la page et la bibliothèque Excel en mémoire.
const CACHE = 'caisse-v1';
const XL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try { await c.add('./'); } catch (_) {}
    try { await c.put(XL, await fetch(XL, { mode: 'no-cors' })); } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) { if (k !== CACHE) await caches.delete(k); }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const net = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
        ]);
        if (net && net.ok) c.put(req, net.clone());
        return net;
      } catch (_) {
        return (await c.match(req)) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (req.url === XL || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const net = await fetch(req);
        c.put(req, net.clone());
        return net;
      } catch (_) { return Response.error(); }
    })());
  }
});
