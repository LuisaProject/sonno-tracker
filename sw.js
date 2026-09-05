const CACHE_NAME = 'sonno-tracker-v2';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json'];

function isNetworkFirst(pathname) {
  return pathname.endsWith('/') || pathname.endsWith('index.html') || pathname.endsWith('app.js') || pathname.endsWith('style.css');
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (isNetworkFirst(url.pathname)) {
    event.respondWith(networkFirst(event.request));
  } else {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
