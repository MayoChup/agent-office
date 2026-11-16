/* Service worker Kantor Virtual: membuat situs bisa dipasang sebagai aplikasi & tetap terbuka saat sinyal jelek.
 * - Halaman (HTML): ambil dari jaringan dulu (selalu versi terbaru); kalau offline pakai salinan terakhir.
 * - File /assets/ (namanya berubah tiap rilis): simpan & pakai dari cache.
 * - /api/ dan server lain TIDAK pernah disimpan (data pribadi tetap di server). */
const CACHE = 'kantor-v1';
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
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const k = r.clone(); caches.open(CACHE).then((c) => c.put(req, k)); } return r; })));
  }
});
