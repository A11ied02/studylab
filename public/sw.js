const CACHE_NAME = 'studylab-shell-v1';
const LIBRARY_CACHE_NAME = 'studylab-library-v1';
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
const pdfBuffers = new Map();
let pdfBufferBytes = 0;

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'STUDYLAB_CLEAR_LIBRARY_CACHE') return;
  pdfBuffers.clear();
  pdfBufferBytes = 0;
});

async function getCachedPdfBytes(url, response) {
  const cached = pdfBuffers.get(url);
  if (cached) {
    pdfBuffers.delete(url);
    pdfBuffers.set(url, cached);
    return cached;
  }

  const bytes = await response.arrayBuffer();
  // Keep a small worker-side LRU so PDF.js range requests do not reread a whole
  // document from CacheStorage for every page chunk.
  if (bytes.byteLength <= 48 * 1024 * 1024) {
    pdfBuffers.set(url, bytes);
    pdfBufferBytes += bytes.byteLength;
    while (pdfBufferBytes > 64 * 1024 * 1024 && pdfBuffers.size > 1) {
      const oldestUrl = pdfBuffers.keys().next().value;
      const oldest = pdfBuffers.get(oldestUrl);
      pdfBufferBytes -= oldest?.byteLength ?? 0;
      pdfBuffers.delete(oldestUrl);
    }
  }
  return bytes;
}

async function respondFromCachedPdf(request, url, cached) {
  const range = request.headers.get('range');
  if (!range) return cached;

  const bytes = await getCachedPdfBytes(url, cached);
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}` } });

  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null) {
    const suffixLength = end ?? 0;
    start = Math.max(0, bytes.byteLength - suffixLength);
    end = bytes.byteLength - 1;
  } else {
    end = Math.min(end ?? (bytes.byteLength - 1), bytes.byteLength - 1);
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= bytes.byteLength) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}` } });
  }

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
    'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}`,
    'Content-Type': cached.headers.get('content-type') || 'application/pdf',
  });
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

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
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('studylab-') && key !== CACHE_NAME && key !== LIBRARY_CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== APP_ROOT.origin || !requestUrl.href.startsWith(APP_ROOT.href)) return;

  if (/\.pdf$/i.test(requestUrl.pathname)) {
    event.respondWith((async () => {
      try {
        const libraryCache = await caches.open(LIBRARY_CACHE_NAME);
        const cached = await libraryCache.match(requestUrl.href);
        if (cached) return respondFromCachedPdf(request, requestUrl.href, cached);
      } catch {
        // Fall through to the network when browser storage is unavailable.
      }
      return fetch(request);
    })());
    return;
  }

  if (requestUrl.pathname.endsWith('/search/index.json')) {
    event.respondWith((async () => {
      try {
        const libraryCache = await caches.open(LIBRARY_CACHE_NAME);
        const cached = await libraryCache.match(requestUrl.href);
        if (cached) return cached;
        return fetch(request);
      } catch {
        return fetch(request);
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined));
          }
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
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined));
      }
      return response;
    })),
  );
});
