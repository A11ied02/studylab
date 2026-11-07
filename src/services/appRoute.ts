export interface AppRoute {
  isBooksRoute: boolean;
  path: string;
  page?: number;
  query?: string;
  scopeIds: string[];
  minKeywordMatches?: number;
}

const decodeSegment = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
};

export function parseAppRoute(hash = window.location.hash): AppRoute {
  const routeText = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathname, search = ''] = routeText.split('?');
  if (!pathname.startsWith('/books')) return { isBooksRoute: false, path: '', scopeIds: [] };

  const routeSegments = pathname.replace(/^\/books\/?/, '').split('/').filter(Boolean).map(decodeSegment);
  const params = new URLSearchParams(search);
  const page = Number(params.get('page'));
  const minKeywordMatches = Number(params.get('min'));
  return {
    isBooksRoute: true,
    path: routeSegments.join('/'),
    page: Number.isInteger(page) && page > 0 ? page : undefined,
    query: params.get('q') || undefined,
    scopeIds: params.getAll('scope'),
    minKeywordMatches: Number.isInteger(minKeywordMatches) && minKeywordMatches > 0 ? minKeywordMatches : undefined,
  };
}

export function isPdfRoute(route: AppRoute): boolean {
  return route.isBooksRoute && route.path.toLowerCase().endsWith('.pdf');
}

export function writeAppRoute(route: Omit<AppRoute, 'isBooksRoute'>, replace = false): void {
  const path = route.path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const pathname = `#/books${path ? `/${path}` : ''}`;
  const params = new URLSearchParams();
  if (route.page && route.page > 1) params.set('page', String(route.page));
  if (route.query?.trim()) params.set('q', route.query.trim());
  route.scopeIds.forEach((scope) => params.append('scope', scope));
  if (route.minKeywordMatches && route.minKeywordMatches > 1) params.set('min', String(route.minKeywordMatches));
  const queryString = params.toString();
  const hash = `${pathname}${queryString ? `?${queryString}` : ''}`;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (window.location.hash === hash) return;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

export function clearAppRoute(replace = false): void {
  if (!window.location.hash) return;
  const url = `${window.location.pathname}${window.location.search}`;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}
