// PWA mínima: HTML de red primero (siempre fresco, con copia offline) y
// assets con hash de caché primero. Supabase y mapas nunca se cachean.
const C = 'be-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(['/', '/offline.html']))); });
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Web Push
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const d = e.data.json();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ tipo: 'bip' }))));
  e.waitUntil(self.registration.showNotification(d.title || '💈 El Estadio', {
    body: d.body, icon: d.icon || '/icono-192.png', badge: d.badge || '/icono-192.png',
    data: { url: d.url || '/' }, vibrate: [200, 100, 200], silent: false, renotify: true, tag: 'estadio-' + Date.now(),
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (new URL(c.url).pathname === url && 'focus' in c) return c.focus();
    return clients.openWindow(url);
  }));
});

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
