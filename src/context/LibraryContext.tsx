import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { BookFile, BookFolder, FolderNameMap, LibraryManifest, Subject } from '../types/library';
import { sortSubjects, SUBJECT_ORDER } from '../constants/subjectOrder';
import { setFolderNameMap, getFolderDisplayName } from '../services/folderMapper';
import { StorageService } from '../services/storage';
import { preloadPdfDocument } from '../services/pdfDocument';
import { saveWorkspaceValue } from '../services/workspaceChanges';
import { clearAppRoute, parseAppRoute, writeAppRoute } from '../services/appRoute';
import { LibraryCacheTarget, startLibraryCaching } from '../services/libraryCache';
import { getGitHubPagesAssetUrl } from '../services/assetUrls';

export interface ScienceGradients {
  bio: [string, string];
  phy: [string, string];
  chem: [string, string];
}

export interface ItGradients {
  partA: [string, string];
  partB: [string, string];
}

export const DEFAULT_SCIENCE_GRADIENTS: ScienceGradients = {
  bio: ['#22c55e', '#059669'], // Greenish
  phy: ['#38bdf8', '#2563eb'], // Bluish
  chem: ['#fb923c', '#ea580c'], // Orangish
};

export const DEFAULT_IT_GRADIENTS: ItGradients = {
  partA: ['#06b6d4', '#0284c7'], // Cyan to Blue
  partB: ['#8b5cf6', '#6d28d9'], // Violet to Purple
};

export type BookScale = 'compact' | 'normal' | 'large';
export type LibraryTab = 'books' | 'flashcards' | 'pyqs';

const SCIENCE_GRADIENTS_KEY = 'studylab_science_gradients';
const IT_GRADIENTS_KEY = 'studylab_it_gradients';
const BOOK_SCALE_KEY = 'studylab_book_scale';

interface LibraryContextType {
  manifest: LibraryManifest | null;
  loading: boolean;
  error: string | null;
  subjects: Subject[];
  folderNameMap: FolderNameMap;
  
  // Navigation state
  activeTab: LibraryTab;
  selectedSubject: Subject | null;
  selectedFolder: BookFolder | null;
  activePdf: BookFile | null;
  activePdfPage: number;
  activePdfSearchQuery: string;
  activePdfSearchPage: number;
  activePdfMinKeywordMatches: number;
  activePdfSearchRanges: { start: number; end: number }[];
  activePdfSearchSpotlight: boolean;
  sidebarExpanded: boolean;
  isSettingsOpen: boolean;

  // Science & IT gradients, and book scale
  scienceGradients: ScienceGradients;
  setScienceGradients: (gradients: ScienceGradients) => void;
  itGradients: ItGradients;
  setItGradients: (gradients: ItGradients) => void;
  bookScale: BookScale;
  setBookScale: (scale: BookScale) => void;

  // Actions
  setActiveTab: (tab: LibraryTab) => void;
  navigateToSubject: (subjectId: string) => void;
  navigateToFolder: (folderPath: string) => void;
  navigateToBooksHome: () => void;
  openPdf: (
    file: BookFile,
    pageNum?: number,
    searchQuery?: string,
    minKeywordMatches?: number,
    searchOptions?: { ranges?: { start: number; end: number }[]; spotlight?: boolean },
  ) => void;
  updatePdfRoute: (pageNum: number, searchQuery: string, minKeywordMatches: number) => void;
  closePdf: () => void;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;

  // Helpers
  getAssetUrl: (relativePath: string) => string;
  getAssetFallbackUrl: (relativePath: string) => string;
  allPdfs: BookFile[];
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [manifest, setManifest] = useState<LibraryManifest | null>(null);
  const [folderNameMap, setMapState] = useState<FolderNameMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTabState] = useState<LibraryTab>('books');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<BookFile | null>(null);
  const [activePdfPage, setActivePdfPage] = useState(1);
  const [activePdfSearchQuery, setActivePdfSearchQuery] = useState('');
  const [activePdfSearchPage, setActivePdfSearchPage] = useState(1);
  const [activePdfMinKeywordMatches, setActivePdfMinKeywordMatches] = useState(1);
  const [activePdfSearchRanges, setActivePdfSearchRanges] = useState<{ start: number; end: number }[]>([]);
  const [activePdfSearchSpotlight, setActivePdfSearchSpotlight] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Book Scale state
  const [bookScale, setBookScaleState] = useState<BookScale>(() => {
    try {
      const saved = localStorage.getItem(BOOK_SCALE_KEY) as BookScale;
      return saved === 'compact' || saved === 'normal' || saved === 'large' ? saved : 'compact';
    } catch {
      return 'compact';
    }
  });

  const setBookScale = (scale: BookScale) => {
    setBookScaleState(scale);
    try {
      saveWorkspaceValue(BOOK_SCALE_KEY, scale);
    } catch {}
  };

  // Science gradients
  const [scienceGradients, setScienceGradientsState] = useState<ScienceGradients>(() => {
    try {
      const saved = localStorage.getItem(SCIENCE_GRADIENTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.bio)) return parsed;
      }
      return DEFAULT_SCIENCE_GRADIENTS;
    } catch {
      return DEFAULT_SCIENCE_GRADIENTS;
    }
  });

  const setScienceGradients = (newGrads: ScienceGradients) => {
    setScienceGradientsState(newGrads);
    try {
      saveWorkspaceValue(SCIENCE_GRADIENTS_KEY, JSON.stringify(newGrads));
    } catch {}
  };

  // IT gradients
  const [itGradients, setItGradientsState] = useState<ItGradients>(() => {
    try {
      const saved = localStorage.getItem(IT_GRADIENTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.partA)) return parsed;
      }
      return DEFAULT_IT_GRADIENTS;
    } catch {
      return DEFAULT_IT_GRADIENTS;
    }
  });

  const setItGradients = (newGrads: ItGradients) => {
    setItGradientsState(newGrads);
    try {
      saveWorkspaceValue(IT_GRADIENTS_KEY, JSON.stringify(newGrads));
    } catch {}
  };

  const baseUrl = import.meta.env.BASE_URL || './';

  const getAssetUrl = (relPath: string): string => {
    if (!relPath) return '';
    if (relPath.startsWith('http://') || relPath.startsWith('https://') || relPath.startsWith('data:')) {
      return relPath;
    }
    const cleanRel = relPath.replace(/^\/+/, '');
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${cleanBase}${cleanRel}`;
  };

  const getAssetFallbackUrl = (relPath: string): string => getGitHubPagesAssetUrl(relPath);

  useEffect(() => {
    async function loadLibraryData() {
      try {
        setLoading(true);
        let mapData: FolderNameMap = {};
        try {
          const mapRes = await fetch(getAssetUrl('foldernamemap.json'));
          if (mapRes.ok) {
            mapData = await mapRes.json();
            setFolderNameMap(mapData);
            setMapState(mapData);
          }
        } catch (e) {
          console.warn('Could not load external foldernamemap.json, using defaults', e);
        }

        const manifestRes = await fetch(getAssetUrl('library-manifest.json'));
        if (!manifestRes.ok) {
          throw new Error(`Failed to load library-manifest.json (HTTP ${manifestRes.status})`);
        }
        const data: LibraryManifest = await manifestRes.json();
        setManifest(data);
        setError(null);
      } catch (err: any) {
        console.error('Error loading library data:', err);
        setError(err.message || 'Failed to load study library.');
      } finally {
        setLoading(false);
      }
    }

    loadLibraryData();
  }, []);

  const subjects = useMemo(() => {
    if (!manifest?.subjects) return [];
    const mapped = manifest.subjects.map(s => ({
      ...s,
      displayName: getFolderDisplayName(s.path, folderNameMap)
    }));
    return sortSubjects(mapped);
  }, [manifest, folderNameMap]);

  const findFolderByPath = (folders: BookFolder[], targetPath: string): BookFolder | null => {
    for (const f of folders) {
      if (f.path === targetPath) return f;
      if (f.subfolders && f.subfolders.length > 0) {
        const found = findFolderByPath(f.subfolders, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedSubject = useMemo(() => {
    if (!selectedSubjectId) return null;
    return subjects.find(s => s.id === selectedSubjectId || s.path === selectedSubjectId) || null;
  }, [subjects, selectedSubjectId]);

  const selectedFolder = useMemo(() => {
    if (!selectedFolderPath) return null;
    if (selectedSubject && selectedSubject.path === selectedFolderPath) {
      return selectedSubject;
    }
    return findFolderByPath(subjects, selectedFolderPath);
  }, [subjects, selectedFolderPath, selectedSubject]);

  const setActiveTab = (tab: LibraryTab) => {
    setActiveTabState(tab);
    if (tab === 'books') {
      writeAppRoute({ path: selectedFolder?.path ?? selectedSubject?.path ?? '', scopeIds: [] });
    } else if (parseAppRoute().isBooksRoute) {
      clearAppRoute();
    }
  };

  const allPdfs = useMemo(() => {
    const list: BookFile[] = [];
    const extractPdfs = (f: BookFolder) => {
      if (f.files) list.push(...f.files);
      if (f.subfolders) {
        for (const child of f.subfolders) extractPdfs(child);
      }
    };
    for (const s of subjects) {
      extractPdfs(s);
    }
    return list;
  }, [subjects]);

  const cacheAssets = useMemo(() => {
    const assets: LibraryCacheTarget[] = [];
    const collect = (folder: BookFolder) => {
      if (folder.cover) assets.push({ path: folder.cover, kind: 'cover' });
      for (const file of folder.files ?? []) {
        assets.push({ path: file.thumbnailUrl, kind: 'preview' });
        assets.push({ path: file.path, kind: 'pdf' });
      }
      for (const child of folder.subfolders ?? []) collect(child);
    };
    subjects.forEach(collect);
    return assets;
  }, [subjects]);

  useEffect(() => {
    if (!manifest) return;
    startLibraryCaching(cacheAssets, 'search/index.json');
  }, [manifest, cacheAssets]);

  const applyRoute = useCallback(() => {
    const route = parseAppRoute();
    if (!route.isBooksRoute || !subjects.length) return;
    setActiveTabState('books');

    if (!route.path) {
      setSelectedSubjectId(null);
      setSelectedFolderPath(null);
      setActivePdf(null);
      setActivePdfSearchQuery('');
      setActivePdfSearchPage(1);
      setActivePdfMinKeywordMatches(1);
      setActivePdfSearchRanges([]);
      setActivePdfSearchSpotlight(false);
      return;
    }

    const file = allPdfs.find((item) => item.rawPath === route.path);
    if (file) {
      const subject = subjects.find((item) => file.rawPath === item.path || file.rawPath.startsWith(`${item.path}/`));
      if (!subject) return;
      const folderPath = file.rawPath.split('/').slice(0, -1).join('/');
      setSelectedSubjectId(subject.id);
      setSelectedFolderPath(folderPath || subject.path);
      setActivePdf(file);
      setActivePdfPage(route.page ?? 1);
      setActivePdfSearchQuery(route.query ?? '');
      setActivePdfSearchPage(route.page ?? 1);
      setActivePdfMinKeywordMatches(route.minKeywordMatches ?? 1);
      setActivePdfSearchRanges([]);
      setActivePdfSearchSpotlight(false);
      return;
    }

    const subject = subjects.find((item) => route.path === item.id || route.path === item.path || route.path.startsWith(`${item.path}/`));
    if (!subject) return;
    setSelectedSubjectId(subject.id);
    setSelectedFolderPath(route.path === subject.id ? subject.path : route.path);
    setActivePdf(null);
    setActivePdfSearchQuery('');
    setActivePdfSearchPage(1);
    setActivePdfMinKeywordMatches(1);
    setActivePdfSearchRanges([]);
    setActivePdfSearchSpotlight(false);
  }, [allPdfs, subjects]);

  useEffect(() => {
    if (!subjects.length) return;
    applyRoute();
    window.addEventListener('hashchange', applyRoute);
    window.addEventListener('popstate', applyRoute);
    return () => {
      window.removeEventListener('hashchange', applyRoute);
      window.removeEventListener('popstate', applyRoute);
    };
  }, [subjects.length, applyRoute]);

  useEffect(() => {
    if (activeTab !== 'books' && parseAppRoute().isBooksRoute) clearAppRoute();
  }, [activeTab]);

  const navigateToSubject = (subjectId: string) => {
    setActiveTabState('books');
    setActivePdf(null);
    setActivePdfSearchQuery('');
    setSelectedSubjectId(subjectId);
    setSelectedFolderPath(subjectId);
    writeAppRoute({ path: subjects.find((subject) => subject.id === subjectId || subject.path === subjectId)?.path ?? subjectId, scopeIds: [] });
  };

  const navigateToFolder = (folderPath: string) => {
    setActiveTabState('books');
    setActivePdf(null);
    setActivePdfSearchQuery('');
    setSelectedFolderPath(folderPath);
    writeAppRoute({ path: folderPath, scopeIds: [] });
  };

  const navigateToBooksHome = () => {
    setActiveTabState('books');
    setSelectedSubjectId(null);
    setSelectedFolderPath(null);
    setActivePdf(null);
    setActivePdfSearchQuery('');
    writeAppRoute({ path: '', scopeIds: [] });
  };

  const openPdf = (
    file: BookFile,
    pageNum = 1,
    searchQuery = '',
    minKeywordMatches = 1,
    searchOptions: { ranges?: { start: number; end: number }[]; spotlight?: boolean } = {},
  ) => {
    preloadPdfDocument(getAssetUrl(file.path), getAssetUrl('pdf.worker.min.mjs'));
    setActivePdf(file);
    setActivePdfPage(Math.max(1, pageNum));
    setActivePdfSearchQuery(searchQuery.trim());
    setActivePdfSearchPage(Math.max(1, pageNum));
    setActivePdfMinKeywordMatches(Math.max(1, Math.round(minKeywordMatches)));
    setActivePdfSearchRanges(searchOptions.ranges ?? []);
    setActivePdfSearchSpotlight(Boolean(searchOptions.spotlight && searchOptions.ranges?.length));
    writeAppRoute({ path: file.rawPath, page: Math.max(1, pageNum), query: searchQuery.trim(), minKeywordMatches, scopeIds: [] });
    StorageService.recordBookOpened({
      id: file.id,
      title: file.title,
      path: file.path,
      thumbnailUrl: file.thumbnailUrl,
      subjectName: selectedSubject?.displayName || 'Study Book',
      lastOpened: new Date().toISOString()
    });
  };

  const closePdf = () => {
    setActivePdf(null);
    setActivePdfSearchQuery('');
    setActivePdfSearchPage(1);
    setActivePdfMinKeywordMatches(1);
    setActivePdfSearchRanges([]);
    setActivePdfSearchSpotlight(false);
    writeAppRoute({ path: selectedFolderPath ?? selectedSubjectId ?? '', scopeIds: [] });
  };

  const updatePdfRoute = useCallback((pageNum: number, searchQuery: string, minKeywordMatches: number) => {
    if (!activePdf) return;
    writeAppRoute({
      path: activePdf.rawPath,
      page: Math.max(1, pageNum),
      query: searchQuery.trim(),
      minKeywordMatches: Math.max(1, minKeywordMatches),
      scopeIds: [],
    }, true);
  }, [activePdf]);

  const toggleSidebar = () => {
    setSidebarExpanded(prev => !prev);
  };

  return (
    <LibraryContext.Provider
      value={{
        manifest,
        loading,
        error,
        subjects,
        folderNameMap,
        activeTab,
        selectedSubject,
        selectedFolder,
        activePdf,
        activePdfPage,
        activePdfSearchQuery,
        activePdfSearchPage,
        activePdfMinKeywordMatches,
        activePdfSearchRanges,
        activePdfSearchSpotlight,
        sidebarExpanded,
        isSettingsOpen,
        scienceGradients,
        setScienceGradients,
        itGradients,
        setItGradients,
        bookScale,
        setBookScale,
        setActiveTab,
        navigateToSubject,
        navigateToFolder,
        navigateToBooksHome,
        openPdf,
        updatePdfRoute,
        closePdf,
        toggleSidebar,
        setSidebarExpanded,
        setIsSettingsOpen,
        getAssetUrl,
        getAssetFallbackUrl,
        allPdfs,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
};

export function useLibrary(): LibraryContextType {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return ctx;
}
