const CACHE = 'ryora-v33';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon.svg'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => e.waitUntil(clients.claim().then(() => caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))))));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/') || e.request.url.includes('socket.io')) return;
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
