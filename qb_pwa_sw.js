const CACHE = 'qb-pwa-v9';

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

// Revalidate qb_index.json using ETag; notify open clients if content changed.
// Called by both background-sync and periodic-sync events.
async function revalidateQbIndex() {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./exams/qb_index.json');
  const prevEtag = cached?.headers.get('etag') ?? null;
  const headers = {};
  if (prevEtag) headers['If-None-Match'] = prevEtag;
  const resp = await fetch('./exams/qb_index.json', { headers, cache: 'no-cache' });
  if (resp.status === 304) return; // not modified
  if (!resp.ok) return;
  const newEtag = resp.headers.get('etag');
  await cache.put('./exams/qb_index.json', resp.clone());
  // Only notify when we had a prior cached version and the ETag actually changed
  if (cached && newEtag !== prevEtag) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'QB_INDEX_UPDATED' }));
  }
}

// Background Sync: revalidate when connectivity resumes after offline
self.addEventListener('sync', e => {
  if (e.tag === 'qb-index-sync') {
    e.waitUntil(revalidateQbIndex());
  }
});

// Periodic Background Sync: daily refresh (Android Chrome only; iOS PWA does not support this)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'qb-index-daily') {
    e.waitUntil(revalidateQbIndex());
  }
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

  // Stale-while-revalidate for qb_index.json — serve cached immediately, update in background.
  // If the ETag changes (new questions added), notify all open clients.
  if (url.pathname.endsWith('qb_index.json')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request);
        const fetchPromise = (async () => {
          const prevEtag = cached?.headers.get('etag') ?? null;
          const headers = {};
          if (prevEtag) headers['If-None-Match'] = prevEtag;
          try {
            const resp = await fetch(request, { headers, cache: 'no-cache' });
            if (resp.status === 304) return cached;
            if (resp.ok) {
              const newEtag = resp.headers.get('etag');
              await cache.put(request, resp.clone());
              // Only notify when we had a prior cached version and the ETag actually changed
              if (cached && newEtag !== prevEtag) {
                const clients = await self.clients.matchAll({ includeUncontrolled: true });
                clients.forEach(c => c.postMessage({ type: 'QB_INDEX_UPDATED' }));
              }
            }
            return resp;
          } catch {
            return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
          }
        })();
        // Serve from cache instantly; revalidate in background if already cached
        return cached ? cached : fetchPromise;
      })
    );
    return;
  }

  // Network-first for other JSON so exam updates propagate; fall back to cache offline
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
