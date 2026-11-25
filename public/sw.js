const CACHE = 'ryora-v52';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon.svg'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => e.waitUntil(clients.claim().then(() => caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))))));
// Network-first untuk shell app (JS/CSS/HTML) — update selalu keambil; cache cuma fallback offline
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.includes('/api/') || u.pathname.includes('socket.io')) return;
  if (e.request.mode === 'navigate' || /\.(js|css|html|json|svg)$/.test(u.pathname)) {
    e.respondWith(
      fetch(e.request).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // aset lain (gambar/font) — cache-first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// --- Web Push: notif masuk walau app ketutup ---
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || '💓 Ryora Watch', {
    body: d.body || 'Ada kabar dari pasanganmu',
    icon: '/icon.svg', badge: '/icon.svg',
    tag: d.tag || 'ryora', renotify: true,
    vibrate: [200, 100, 200],
    data: { url: '/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs =>
    cs.length ? cs[0].focus() : clients.openWindow('/')));
});
