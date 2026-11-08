import MiniSearch from 'minisearch';
import * as pdfjsLib from 'pdfjs-dist';
import { BookFile, FolderNameMap, Subject } from '../types/library';
import { getFolderDisplayName } from './folderMapper';
import { countSearchOccurrences, normalizeSearchText, normalizeSearchTextWithMap, parseCommaSeparatedKeywords } from './searchText';

export interface PageSearchDocument {
  id: string;
  text: string;
  title: string;
  fileId: string;
  filePath: string;
  subjectId: string;
  subject: string;
  folder: string;
  scopeIds: string[];
  page: number;
}

export interface SearchIndexEnvelope {
  schemaVersion: 3;
  indexedAt: string;
  pdfCount: number;
  documentCount: number;
  index: Record<string, unknown>;
}

export interface LoadedPdfSearchIndex {
  index: MiniSearch<PageSearchDocument>;
  indexedAt: string;
  pdfCount: number;
  documentCount: number;
  sizeBytes: number;
  source: 'built-in' | 'rebuilt';
}

export interface PdfTextMatch extends PageSearchDocument {
  score: number;
  snippet: string;
  occurrences: number;
}

export interface PdfIndexProgress {
  completedPdfs: number;
  totalPdfs: number;
  stage: 'extracting' | 'building';
}

const INDEX_SCHEMA_VERSION = 3 as const;
const INDEX_DB_NAME = 'studylab-search-index';
const INDEX_DB_STORE = 'indices';
const INDEX_DB_KEY = 'current';

// Keep these options identical in scripts/build-search-index.mjs.
const MINI_SEARCH_OPTIONS = {
  fields: ['text', 'title', 'subject', 'folder'],
  storeFields: ['text', 'title', 'fileId', 'filePath', 'subjectId', 'subject', 'folder', 'scopeIds', 'page'],
  tokenize: (text: string) => normalizeSearchText(text).split(' ').filter(Boolean),
};

let loadedIndex: LoadedPdfSearchIndex | null = null;
let loadingIndex: Promise<LoadedPdfSearchIndex> | null = null;

export const formatIndexSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const excludeHindiPdfs = (files: BookFile[]) =>
  files.filter((file) => file.rawPath.replace(/\\/g, '/').split('/')[0]?.toLocaleLowerCase() !== 'hindi');

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

function openIndexDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(INDEX_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INDEX_DB_STORE)) db.createObjectStore(INDEX_DB_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readSavedIndex(): Promise<{ json: string; sizeBytes: number } | null> {
  const db = await openIndexDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(INDEX_DB_STORE, 'readonly').objectStore(INDEX_DB_STORE).get(INDEX_DB_KEY);
    request.onsuccess = () => {
      db.close();
      const record = request.result as { json?: string; sizeBytes?: number } | undefined;
      resolve(record?.json ? { json: record.json, sizeBytes: record.sizeBytes ?? byteLength(record.json) } : null);
    };
    request.onerror = () => { db.close(); resolve(null); };
  });
}

async function saveIndex(json: string, sizeBytes: number): Promise<void> {
  const db = await openIndexDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(INDEX_DB_STORE, 'readwrite');
    transaction.objectStore(INDEX_DB_STORE).put({ id: INDEX_DB_KEY, json, sizeBytes });
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); resolve(); };
  });
}

export async function clearSavedPdfSearchIndex(): Promise<void> {
  loadedIndex = null;
  loadingIndex = null;
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(INDEX_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function decodeIndex(json: string, sizeBytes: number, source: LoadedPdfSearchIndex['source']): LoadedPdfSearchIndex {
  const envelope = JSON.parse(json) as SearchIndexEnvelope;
  if (envelope.schemaVersion !== INDEX_SCHEMA_VERSION || !envelope.index) {
    throw new Error('The PDF search index has an unsupported format. Rebuild it from Settings.');
  }
  const index = MiniSearch.loadJSON<PageSearchDocument>(JSON.stringify(envelope.index), MINI_SEARCH_OPTIONS);
  return {
    index,
    indexedAt: envelope.indexedAt,
    pdfCount: envelope.pdfCount,
    documentCount: envelope.documentCount,
    sizeBytes,
    source,
  };
}

export async function loadPdfSearchIndex(getAssetUrl: (path: string) => string): Promise<LoadedPdfSearchIndex> {
  if (loadedIndex) return loadedIndex;
  if (loadingIndex) return loadingIndex;

  loadingIndex = (async () => {
    const saved = await readSavedIndex();
    if (saved) {
      try {
        loadedIndex = decodeIndex(saved.json, saved.sizeBytes, 'rebuilt');
        return loadedIndex;
      } catch {
        // A stale or incompatible local index falls back to the baked asset.
      }
    }

    const response = await fetch(getAssetUrl('search/index.json'));
    if (!response.ok) throw new Error('The built-in PDF search index could not be loaded.');
    const json = await response.text();
    loadedIndex = decodeIndex(json, byteLength(json), 'built-in');
    return loadedIndex;
  })();

  try {
    return await loadingIndex;
  } finally {
    loadingIndex = null;
  }
}

const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();

function getPdfBreadcrumb(file: BookFile, subject: Subject, folderNameMap: FolderNameMap): string {
  const pathParts = file.rawPath.replace(/\\/g, '/').split('/');
  const subjectPartCount = subject.path.split('/').length;
  const folderParts = pathParts.slice(subjectPartCount, -1);
  let currentPath = subject.path;
  return [subject.displayName, ...folderParts.map((part) => {
    currentPath = `${currentPath}/${part}`;
    return getFolderDisplayName(currentPath, folderNameMap);
  })].join(' / ');
}

function getSubjectForFile(file: BookFile, subjects: Subject[]): Subject | undefined {
  return subjects.find((subject) => file.rawPath === subject.path || file.rawPath.startsWith(`${subject.path}/`));
}

export async function buildPdfSearchIndex(
  inputFiles: BookFile[],
  subjects: Subject[],
  folderNameMap: FolderNameMap,
  getAssetUrl: (path: string) => string,
  onProgress: (progress: PdfIndexProgress) => void,
): Promise<{ json: string; sizeBytes: number; pdfCount: number; documentCount: number }> {
  const files = excludeHindiPdfs(inputFiles).filter((file) => file.isAdvancedSearchable !== false);
  pdfjsLib.GlobalWorkerOptions.workerSrc = getAssetUrl('pdf.worker.min.mjs');
  const miniSearch = new MiniSearch<PageSearchDocument>(MINI_SEARCH_OPTIONS);
  let pageBatch: PageSearchDocument[] = [];
  let documentCount = 0;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    const subject = getSubjectForFile(file, subjects);
    if (subject) {
      const task = pdfjsLib.getDocument({
        url: getAssetUrl(file.path),
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
      });
      try {
        const document = await task.promise;
        const folder = getPdfBreadcrumb(file, subject, folderNameMap);
        const scopeIds = [subject.id, subject.path];
        const rawFolders = file.rawPath.replace(/\\/g, '/').split('/').slice(subject.path.split('/').length, -1);
        let folderPath = subject.path;
        rawFolders.forEach((part) => { folderPath = `${folderPath}/${part}`; scopeIds.push(folderPath); });
        scopeIds.push(`@direct:${folderPath}`);
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = cleanText(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
          if (!text) continue;
          pageBatch.push({
            id: `${file.id}::${pageNumber}`,
            text,
            title: file.title,
            fileId: file.id,
            filePath: file.path,
            subjectId: subject.id,
            subject: subject.displayName,
            folder,
            scopeIds: [...new Set(scopeIds)],
            page: pageNumber,
          });
          documentCount += 1;
          if (pageBatch.length >= 400) {
            await miniSearch.addAllAsync(pageBatch, { chunkSize: 200 });
            pageBatch = [];
          }
        }
      } finally {
        await task.destroy();
      }
    }
    onProgress({ completedPdfs: fileIndex + 1, totalPdfs: files.length, stage: 'extracting' });
  }

  if (pageBatch.length) await miniSearch.addAllAsync(pageBatch, { chunkSize: 200 });
  onProgress({ completedPdfs: files.length, totalPdfs: files.length, stage: 'building' });

  const envelope: SearchIndexEnvelope = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    indexedAt: new Date().toISOString(),
    pdfCount: files.length,
    documentCount,
    index: miniSearch.toJSON() as unknown as Record<string, unknown>,
  };
  const json = JSON.stringify(envelope);
  const sizeBytes = byteLength(json);
  const decoded = decodeIndex(json, sizeBytes, 'rebuilt');
  loadedIndex = decoded;
  await saveIndex(json, sizeBytes);
  return { json, sizeBytes, pdfCount: files.length, documentCount };
}

function makeSnippet(text: string, query: string): string {
  const normalized = cleanText(text);
  const mappedText = normalizeSearchTextWithMap(normalized);
  const lowerQuery = normalizeSearchText(query);
  const keywords = parseCommaSeparatedKeywords(query);
  const terms = keywords.length ? keywords : lowerQuery.split(' ').filter(Boolean);
  const foundAt = lowerQuery ? mappedText.value.indexOf(lowerQuery) : -1;
  const termLocations = terms.map((term) => mappedText.value.indexOf(term)).filter((index) => index >= 0);
  const normalizedStart = foundAt >= 0 ? foundAt : termLocations.length ? Math.min(...termLocations) : 0;
  const startAt = mappedText.sourceRanges[normalizedStart]?.start ?? 0;
  const start = Math.max(0, startAt - 90);
  const end = Math.min(normalized.length, Math.max(startAt, 0) + 180);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
}

export interface SearchPdfPagesOptions {
  fileId?: string;
  limit?: number;
  /** Minimum number of explicit comma-separated keywords that a page must match. */
  minKeywordMatches?: number;
}

export function searchPdfPages(
  loaded: LoadedPdfSearchIndex,
  rawQuery: string,
  scopeIds: string[] = [],
  options: SearchPdfPagesOptions = {},
): PdfTextMatch[] {
  const query = rawQuery.trim();
  if (!query) return [];
  const keywords = parseCommaSeparatedKeywords(query);
  const minimumMatches = keywords.length
    ? Math.max(1, Math.min(keywords.length, options.minKeywordMatches ?? keywords.length))
    : 0;
  const filter = (result: { id: string } & Record<string, unknown>) => {
    const document = result as typeof result & PageSearchDocument;
    const docScopes = document.scopeIds ?? [document.subjectId];
    return (!scopeIds.length || docScopes.some((scopeId) => scopeIds.includes(scopeId)))
      && (!options.fileId || document.fileId === options.fileId);
  };

  let results: Array<{ id: string; score: number }>;
  if (keywords.length) {
    const matchesById = new Map<string, { id: string; score: number; keywordMatches: number }>();
    for (const keyword of keywords) {
      for (const result of loaded.index.search(keyword, { prefix: false, fuzzy: false, combineWith: 'AND', filter })) {
        const id = String(result.id);
        const previous = matchesById.get(id);
        matchesById.set(id, {
          id,
          score: (previous?.score ?? 0) + result.score,
          keywordMatches: (previous?.keywordMatches ?? 0) + 1,
        });
      }
    }
    results = [...matchesById.values()]
      .filter((result) => result.keywordMatches >= minimumMatches)
      .map(({ id, score }) => ({ id, score }));
  } else {
    results = loaded.index.search(query, { prefix: false, fuzzy: false, combineWith: 'AND', filter })
      .map((result) => ({ id: String(result.id), score: result.score }));
  }

  return results.map((result) => {
    const document = loaded.index.getStoredFields(result.id) as Omit<PageSearchDocument, 'id'>;
    return {
      id: String(result.id),
      ...document,
      score: result.score,
      snippet: makeSnippet(document.text ?? '', query),
      occurrences: countSearchOccurrences(document.text ?? '', query),
    };
  }).filter((match) => {
    // MiniSearch also searches metadata fields; only keep pages whose text contains the requested terms.
    const tokens = normalizeSearchText(match.text).split(' ').filter(Boolean);
    if (keywords.length) {
      const tokenSet = new Set(tokens);
      const matchedKeywords = keywords.filter((keyword) => tokenSet.has(keyword)).length;
      return matchedKeywords >= minimumMatches;
    }
    const queryTokens = normalizeSearchText(query).split(' ').filter(Boolean);
    return queryTokens.length > 0 && tokens.some((_, start) => queryTokens.every((word, index) => tokens[start + index] === word));
  }).sort((a, b) => {
    const normalizedQuery = normalizeSearchText(query);
    const exactA = normalizedQuery && normalizeSearchText(a.text).includes(normalizedQuery) ? 1 : 0;
    const exactB = normalizedQuery && normalizeSearchText(b.text).includes(normalizedQuery) ? 1 : 0;
    return exactB - exactA || b.score - a.score;
  }).slice(0, options.limit ?? Number.MAX_SAFE_INTEGER);
}

