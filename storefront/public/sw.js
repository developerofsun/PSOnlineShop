/* Hand-written service worker: no external libraries, no remote requests.
 * - Static assets (/_next/static, icons): cache-first
 * - Pages and images: network-first, falling back to cache, then to /offline.html
 * - API (/backend/*) and non-GET requests are never cached (cart/checkout/payment must be live).
 */
const VERSION = 'v1';
const STATIC_CACHE = `onshop-static-${VERSION}`;
const PAGE_CACHE = `onshop-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![STATIC_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin requests
  if (url.pathname.startsWith('/backend/')) return; // live API only

  // Cache-first for immutable build assets and icons
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first for pages (navigations) and uploaded images
  if (req.mode === 'navigate' || url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match(OFFLINE_URL);
          return Response.error();
        }),
    );
  }
});

// Web Push (wire-up happens later when the API gains a push endpoint)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    /* ignore malformed payloads */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'فروشگاه من', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url));
});
