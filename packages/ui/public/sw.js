/* Service worker Kantor Virtual: membuat situs bisa dipasang sebagai aplikasi & tetap terbuka saat sinyal jelek.
 * - Halaman (HTML): ambil dari jaringan dulu (selalu versi terbaru); kalau offline pakai salinan terakhir.
 * - File /assets/ (namanya berubah tiap rilis): simpan & pakai dari cache.
 * - /api/ dan server lain TIDAK pernah disimpan (data pribadi tetap di server). */
const CACHE = 'kantor-v3'; // v3: ikon & manifest biru (buang simpanan ikon hijau lama)
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png']).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const k = r.clone(); caches.open(CACHE).then((c) => c.put('/', k)); return r; }).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/') || /\.(png|webmanifest)$/.test(url.pathname)) {
    // Simpan hanya kalau isinya memang berkas yang diminta (bukan halaman HTML pengganti untuk berkas yang tidak ada).
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const jenis = r.headers.get('content-type') || ''; if (r.ok && !jenis.includes('text/html')) { const k = r.clone(); caches.open(CACHE).then((c) => c.put(req, k)); } return r; })));
  }
});

/* ── Notifikasi chat ala WhatsApp (Web Push dari server kantor) ── */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Kantor Virtual', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'Kantor Virtual', {
      body: d.body || '', tag: d.tag || 'kantor', renotify: true, icon: '/icon-192.png', badge: '/icon-192.png',
      data: { url: d.url || '/' }, timestamp: Date.now()
    });
    try { if (d.badge && self.navigator && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(d.badge); } catch { /* tidak didukung */ }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  const chat = url.searchParams.get('chat');
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if ('focus' in c) { c.postMessage({ bukaChat: chat }); return c.focus(); } }
    return self.clients.openWindow(url.href);
  })());
});
