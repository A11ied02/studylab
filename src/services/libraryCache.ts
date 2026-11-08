export const LIBRARY_CACHE_NAME = 'studylab-library-v1';

export type LibraryAssetKind = 'pdf' | 'cover' | 'preview' | 'index';

export interface LibraryCacheTarget {
  path: string;
  kind: LibraryAssetKind;
}

export interface LibraryCachedAsset extends LibraryCacheTarget {
  downloaded: boolean;
}

export interface LibraryCacheStatus {
  cachedItems: number;
  totalItems: number;
  cachedBytes: number;
  downloading: boolean;
  assets: LibraryCachedAsset[];
}

const listeners = new Set<(status: LibraryCacheStatus) => void>();
const activeControllers = new Set<AbortController>();
let status: LibraryCacheStatus = { cachedItems: 0, totalItems: 0, cachedBytes: 0, downloading: false, assets: [] };
let targets: (LibraryCacheTarget & { url: string })[] = [];
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

export async function getLibraryCacheStatus(): Promise<LibraryCacheStatus> {
  const currentTargets = targets;
  const totalItems = currentTargets.length;
  if (!('caches' in window) || totalItems === 0) {
    const next = {
      ...status,
      cachedItems: 0,
      totalItems,
      cachedBytes: 0,
      downloading: false,
      assets: currentTargets.map(({ path, kind }) => ({ path, kind, downloaded: false })),
    };
    publish(next);
    return next;
  }

  try {
    const cache = await caches.open(LIBRARY_CACHE_NAME);
    const responses = await Promise.all(currentTargets.map(({ url }) => cache.match(url)));
    const cachedResponses = responses.filter((response): response is Response => Boolean(response));
    const cachedItems = cachedResponses.length;
    const cachedBytes = cachedResponses.reduce((total, response) => total + cachedEntryBytes(response), 0);
    const assets = currentTargets.map(({ path, kind }, index) => ({ path, kind, downloaded: Boolean(responses[index]) }));
    const next = { ...status, cachedItems, totalItems, cachedBytes, assets };
    publish(next);
    return next;
  } catch {
    const next = {
      ...status,
      cachedItems: 0,
      totalItems,
      cachedBytes: 0,
      downloading: false,
      assets: currentTargets.map(({ path, kind }) => ({ path, kind, downloaded: false })),
    };
    publish(next);
    return next;
  }
}

async function cacheOne(target: LibraryCacheTarget & { url: string }, runGeneration: number): Promise<boolean> {
  const controller = new AbortController();
  activeControllers.add(controller);
  try {
    const cache = await caches.open(LIBRARY_CACHE_NAME);
    if (await cache.match(target.url)) return false;
    const response = await fetch(target.url, {
      signal: controller.signal,
      // Hint that this background work should yield to user initiated navigation and PDF reads.
      priority: 'low',
    } as RequestInit);
    if (!response.ok || response.type === 'opaque' || runGeneration !== generation) return false;
    const bytes = cachedEntryBytes(response);
    // Clone before CacheStorage consumes the body.
    const copy = response.clone();
    await cache.put(target.url, copy);
    if (runGeneration !== generation) return false;
    publish({
      ...status,
      cachedItems: Math.min(status.totalItems, status.cachedItems + 1),
      cachedBytes: status.cachedBytes + bytes,
      assets: status.assets.map((asset) => asset.path === target.path ? { ...asset, downloaded: true } : asset),
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
  await getLibraryCacheStatus();
  if (runGeneration !== generation) return;

  const uncached: (LibraryCacheTarget & { url: string })[] = [];
  try {
    const cache = await caches.open(LIBRARY_CACHE_NAME);
    for (const target of allTargets) {
      if (runGeneration !== generation) return;
      if (!(await cache.match(target.url))) uncached.push(target);
    }
  } catch {
    return;
  }

  publish({ ...status, totalItems: allTargets.length, downloading: uncached.length > 0 });
  if (!uncached.length) return;

  const priority = uncached.find((target) => target.url === priorityTarget);
  if (priority) {
    await cacheOne(priority, runGeneration);
  }
  if (runGeneration !== generation) return;
  if (storageQuotaReached) {
    await getLibraryCacheStatus();
    publish({ ...status, downloading: false });
    return;
  }
  const remaining = uncached.filter((target) => target.url !== priorityTarget);

  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  const slowConnection = connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g';
  const concurrency = slowConnection ? 1 : 2;
  let nextIndex = 0;
  const worker = async () => {
    while (runGeneration === generation && !storageQuotaReached && nextIndex < remaining.length) {
      const target = remaining[nextIndex++];
      await cacheOne(target, runGeneration);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, remaining.length) }, worker));
  } finally {
    if (runGeneration === generation) {
      await getLibraryCacheStatus();
      publish({ ...status, downloading: false });
    }
  }
}

export function startLibraryCaching(assets: LibraryCacheTarget[], searchIndexPath: string): void {
  if (typeof window === 'undefined' || disabledForSession) return;
  // The index is small and useful immediately, so cache it before the larger PDFs.
  const indexUrl = absoluteUrl(searchIndexPath);
  priorityTarget = indexUrl;
  const uniqueTargets = new Map<string, LibraryCacheTarget & { url: string }>();
  uniqueTargets.set(indexUrl, { path: searchIndexPath, kind: 'index', url: indexUrl });
  const kindPriority: Record<LibraryAssetKind, number> = { cover: 0, preview: 1, pdf: 2, index: -1 };
  const orderedAssets = [...assets].sort((left, right) => kindPriority[left.kind] - kindPriority[right.kind]);
  for (const target of orderedAssets) {
    const url = absoluteUrl(target.path);
    if (!uniqueTargets.has(url)) uniqueTargets.set(url, { ...target, url });
  }
  targets = [...uniqueTargets.values()];
  publish({ ...status, totalItems: targets.length });
  if (!onlineListenerInstalled) {
    window.addEventListener('online', () => {
      if (targets.length && !disabledForSession) {
        startLibraryCaching(targets.slice(1).map(({ path, kind }) => ({ path, kind })), targets[0].path);
      }
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
  publish({
    cachedItems: 0,
    totalItems: targets.length,
    cachedBytes: 0,
    downloading: false,
    assets: targets.map(({ path, kind }) => ({ path, kind, downloaded: false })),
  });
}
