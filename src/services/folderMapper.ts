import { FolderNameMap } from '../types/library';

// In-memory cache for loaded map
let folderNameMapCache: FolderNameMap = {};

/**
 * Initialize or update the active folder name map
 */
export function setFolderNameMap(map: FolderNameMap): void {
  folderNameMapCache = { ...map };
}

/**
 * Resolves an actual relative folder path into its UI display name.
 * 
 * Examples:
 * - "SST" -> "Social Science"
 * - "SST/Civics" -> "Civics"
 * - "English Language and Literature" -> "English"
 * - "English Language and Literature/First Flight" -> "First Flight"
 * 
 * If no mapping exists for the path, falls back to the basename of the folder.
 */
export function getFolderDisplayName(folderPath: string, customMap?: FolderNameMap): string {
  if (!folderPath) return '';
  const map = customMap || folderNameMapCache;
  const normalizedPath = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  // 1. Direct match on relative path
  if (map[normalizedPath]) {
    return map[normalizedPath];
  }

  // 2. Basename fallback (last component)
  const segments = normalizedPath.split('/');
  const baseName = segments[segments.length - 1];

  return baseName;
}

/**
 * Returns formatted breadcrumb segments for a path
 */
export function getBreadcrumbTrail(
  folderPath: string, 
  customMap?: FolderNameMap
): Array<{ path: string; name: string }> {
  if (!folderPath) return [];
  const normalized = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/');
  const trail: Array<{ path: string; name: string }> = [];

  let current = '';
  for (const seg of segments) {
    current = current ? `${current}/${seg}` : seg;
    trail.push({
      path: current,
      name: getFolderDisplayName(current, customMap)
    });
  }

  return trail;
}
