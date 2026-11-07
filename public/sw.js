const CACHE_NAME = 'studylab-shell-v1';
const APP_ROOT = new URL('./', self.location.href);
const SHELL_FILES = [
  APP_ROOT.href,
  new URL('manifest.webmanifest', APP_ROOT).href,
  new URL('foldernamemap.json', APP_ROOT).href,
  new URL('library-manifest.json', APP_ROOT).href,
  new URL('pdf.worker.min.mjs', APP_ROOT).href,
  new URL('icons/studylab-192.png', APP_ROOT).href,
  new URL('icons/studylab-512.png', APP_ROOT).href,
  new URL('icons/studylab-180.png', APP_ROOT).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('studylab-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== APP_ROOT.origin || !requestUrl.href.startsWith(APP_ROOT.href)) return;
  if (/\.pdf$/i.test(requestUrl.pathname) || requestUrl.pathname.endsWith('/search/index.json')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(APP_ROOT.href)) || Response.error(),
      ),
    );
    return;
  }

  const essentialData = ['library-manifest.json', 'foldernamemap.json'].some((file) => requestUrl.pathname.endsWith(`/${file}`));
  if (!essentialData && !['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
