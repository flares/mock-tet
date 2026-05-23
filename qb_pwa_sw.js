const CACHE = 'qb-pwa-v4';

const SHELL = [
  './qb_pwa.html',
  './css/variables.css',
  './css/reset.css',
  './js/explanation.js',
  './exams/manifest.json',
  './exams/qb_index.json',
  './assets/pwa-icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip cross-origin (Firebase CDN, esm.run, etc.)
  if (url.origin !== self.location.origin) return;

  // Cache-first for images — cache grows as user browses
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(resp => {
          if (resp.ok) {
            caches.open(CACHE).then(c => c.put(request, resp.clone()));
          }
          return resp;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // Network-first for JSON so exam updates propagate; fall back to cache offline
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(request).then(resp => {
        if (resp.ok) {
          caches.open(CACHE).then(c => c.put(request, resp.clone()));
        }
        return resp;
      }).catch(() => caches.match(request).then(c => c || new Response('{}', {
        headers: { 'Content-Type': 'application/json' }
      })))
    );
    return;
  }

  // Stale-while-revalidate for HTML/JS/CSS
  e.respondWith(
    caches.match(request).then(cached => {
      const fresh = fetch(request).then(resp => {
        if (resp.ok) caches.open(CACHE).then(c => c.put(request, resp.clone()));
        return resp;
      }).catch(() => null);
      return cached || fresh;
    })
  );
});
