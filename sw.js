/* Offline copy of the app. Change VERSION whenever any file changes, so phones pick up the new copy
   the next time they open the app with a connection. */
const VERSION = '2026-10-01.2';
const CACHE = 'xcfl-' + VERSION;
const ASSETS = ['./', 'index.html', 'styles.css', 'logic.js', 'app.js', 'vendor/qrcode.js', 'vendor/jsQR.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, {cache: 'reload'}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('xcfl-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then((c) =>
    c.match(req, {ignoreSearch: true})
      .then((hit) => hit || (req.mode === 'navigate' ? c.match('./') : undefined))
      .then((hit) => hit || fetch(req))));
});
