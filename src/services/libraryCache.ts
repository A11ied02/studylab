export const LIBRARY_CACHE_NAME = 'studylab-library-v1';

export interface LibraryCacheStatus {
  cachedItems: number;
  totalItems: number;
  cachedBytes: number;
  downloading: boolean;
}

const listeners = new Set<(status: LibraryCacheStatus) => void>();
const activeControllers = new Set<AbortController>();
let status: LibraryCacheStatus = { cachedItems: 0, totalItems: 0, cachedBytes: 0, downloading: false };
let targets: string[] = [];
let priorityTarget = '';
let activeRun: Promise<void> | null = null;
let generation = 0;
let disabledForSession = false;
let onlineListenerInstalled = false;
let storageQuotaReached = false;

const absoluteUrl = (value: string) => new URL(value, window.location.href).href;

function publish(next: LibraryCacheStatus): void {
  status = next;
  for (const listener of listeners) listener(status);
}

function cachedEntryBytes(response: Response): number {
  const size = Number(response.headers.get('content-length'));
  return Number.isFinite(size) && size > 0 ? size : 0;
}

export function subscribeLibraryCache(listener: (status: LibraryCacheStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export async function getLibraryCacheStatus(urls?: string[]): Promise<LibraryCacheStatus> {
  const currentTargets = urls?.length ? [...new Set(urls.map(absoluteUrl))] : targets;
  const totalItems = currentTargets.length;
  if (!('caches' in window) || totalItems === 0) {
    const next = { ...status, totalItems };
    publish(next);
    return next;
  }

  try {
    const cache = await caches.open(LIBRARY_CACHE_NAME);
    const responses = await Promise.all(currentTargets.map((url) => cache.match(url)));
    const cachedResponses = responses.filter((response): response is Response => Boolean(response));
    const cachedItems = cachedResponses.length;
    const cachedBytes = cachedResponses.reduce((total, response) => total + cachedEntryBytes(response), 0);
    const next = { ...status, cachedItems, totalItems, cachedBytes };
    publish(next);
    return next;
  } catch {
    const next = { ...status, totalItems };
    publish(next);
    return next;
  }
}

async function cacheOne(url: string, runGeneration: number): Promise<boolean> {
  const controller = new AbortController();
  activeControllers.add(controller);
  try {
    const cache = await caches.open(LIBRARY_CACHE_NAME);
    if (await cache.match(url)) return false;
    const response = await fetch(url, {
      signal: controller.signal,
      // Hint that this background work should yield to user initiated navigation and PDF reads.
      priority: 'low',
    } as RequestInit);
    if (!response.ok || response.type === 'opaque' || runGeneration !== generation) return false;
    const bytes = cachedEntryBytes(response);
    // Clone before CacheStorage consumes the body.
    const copy = response.clone();
    await cache.put(url, copy);
    if (runGeneration !== generation) return false;
    publish({
      ...status,
      cachedItems: Math.min(status.totalItems, status.cachedItems + 1),
      cachedBytes: status.cachedBytes + bytes,
    });
    return true;
  } catch (error) {
    const errorName = error instanceof DOMException ? error.name : (error as { name?: string })?.name;
    if (errorName === 'QuotaExceededError') storageQuotaReached = true;
    // A failed or interrupted download is retried on the next visit or online event.
    return false;
  } finally {
    activeControllers.delete(controller);
  }
}

async function runCacheQueue(runGeneration: number): Promise<void> {
  if (!('caches' in window) || !targets.length || disabledForSession) return;
  storageQuotaReached = false;
  const allTargets = targets;
  await getLibraryCacheStatus(allTargets);
  if (runGeneration !== generation) return;

  const uncached: string[] = [];
  try {
    const cache = await caches.open(LIBRARY_CACHE_NAME);
    for (const url of allTargets) {
      if (runGeneration !== generation) return;
      if (!(await cache.match(url))) uncached.push(url);
    }
  } catch {
    return;
  }

  publish({ ...status, totalItems: allTargets.length, downloading: uncached.length > 0 });
  if (!uncached.length) return;

  if (priorityTarget && uncached.includes(priorityTarget)) {
    await cacheOne(priorityTarget, runGeneration);
  }
  if (runGeneration !== generation) return;
  if (storageQuotaReached) {
    await getLibraryCacheStatus(allTargets);
    publish({ ...status, downloading: false });
    return;
  }
  const remaining = uncached.filter((url) => url !== priorityTarget);

  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  const slowConnection = connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g';
  const concurrency = slowConnection ? 1 : 2;
  let nextIndex = 0;
  const worker = async () => {
    while (runGeneration === generation && !storageQuotaReached && nextIndex < remaining.length) {
      const url = remaining[nextIndex++];
      await cacheOne(url, runGeneration);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, remaining.length) }, worker));
  } finally {
    if (runGeneration === generation) {
      await getLibraryCacheStatus(allTargets);
      publish({ ...status, downloading: false });
    }
  }
}

export function startLibraryCaching(pdfUrls: string[], searchIndexUrl: string): void {
  if (typeof window === 'undefined' || disabledForSession) return;
  // The index is small and useful immediately, so cache it before the larger PDFs.
  const indexUrl = absoluteUrl(searchIndexUrl);
  priorityTarget = indexUrl;
  targets = [...new Set([indexUrl, ...pdfUrls.map(absoluteUrl)])];
  publish({ ...status, totalItems: targets.length });
  if (!onlineListenerInstalled) {
    window.addEventListener('online', () => {
      if (targets.length && !disabledForSession) startLibraryCaching(targets.slice(1), targets[0]);
    });
    onlineListenerInstalled = true;
  }
  if (activeRun) return;

  const runGeneration = generation;
  activeRun = runCacheQueue(runGeneration).finally(() => {
    activeRun = null;
  });
  void activeRun;
}

export async function clearLibraryCache(): Promise<void> {
  disabledForSession = true;
  generation += 1;
  for (const controller of activeControllers) controller.abort();
  await activeRun?.catch(() => undefined);
  navigator.serviceWorker?.controller?.postMessage({ type: 'STUDYLAB_CLEAR_LIBRARY_CACHE' });
  if ('caches' in window) {
    try {
      await caches.delete(LIBRARY_CACHE_NAME);
    } catch {
      // Cache removal is best effort if the browser storage is unavailable.
    }
  }
  publish({ cachedItems: 0, totalItems: targets.length, cachedBytes: 0, downloading: false });
}
