// PWA mínima: HTML de red primero (siempre fresco, con copia offline) y
// assets con hash de caché primero. Supabase y mapas nunca se cachean.
const C = 'be-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(['/', '/offline.html']))); });
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (u.pathname.startsWith('/_astro/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copia = res.clone(); caches.open(C).then((c) => c.put(e.request, copia)); return res;
    })));
  } else if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => {
      const copia = res.clone(); caches.open(C).then((c) => c.put(e.request, copia)); return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/offline.html'))));
  }
});
