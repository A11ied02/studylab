import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { BookFile, BookFolder, FolderNameMap, LibraryManifest, Subject } from '../types/library';
import { sortSubjects, SUBJECT_ORDER } from '../constants/subjectOrder';
import { setFolderNameMap, getFolderDisplayName } from '../services/folderMapper';
import { StorageService } from '../services/storage';

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
  openPdf: (file: BookFile, pageNum?: number, searchQuery?: string) => void;
  closePdf: () => void;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;

  // Helpers
  getAssetUrl: (relativePath: string) => string;
  allPdfs: BookFile[];
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [manifest, setManifest] = useState<LibraryManifest | null>(null);
  const [folderNameMap, setMapState] = useState<FolderNameMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<LibraryTab>('books');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<BookFile | null>(null);
  const [activePdfPage, setActivePdfPage] = useState(1);
  const [activePdfSearchQuery, setActivePdfSearchQuery] = useState('');
  const [activePdfSearchPage, setActivePdfSearchPage] = useState(1);
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
      localStorage.setItem(BOOK_SCALE_KEY, scale);
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
      localStorage.setItem(SCIENCE_GRADIENTS_KEY, JSON.stringify(newGrads));
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
      localStorage.setItem(IT_GRADIENTS_KEY, JSON.stringify(newGrads));
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

  const navigateToSubject = (subjectId: string) => {
    setActiveTab('books');
    setActivePdf(null);
    setActivePdfSearchQuery('');
    setSelectedSubjectId(subjectId);
    setSelectedFolderPath(subjectId);
  };

  const navigateToFolder = (folderPath: string) => {
    setActiveTab('books');
    setActivePdf(null);
    setActivePdfSearchQuery('');
    setSelectedFolderPath(folderPath);
  };

  const navigateToBooksHome = () => {
    setActiveTab('books');
    setSelectedSubjectId(null);
    setSelectedFolderPath(null);
    setActivePdf(null);
    setActivePdfSearchQuery('');
  };

  const openPdf = (file: BookFile, pageNum = 1, searchQuery = '') => {
    setActivePdf(file);
    setActivePdfPage(Math.max(1, pageNum));
    setActivePdfSearchQuery(searchQuery.trim());
    setActivePdfSearchPage(Math.max(1, pageNum));
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
  };

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
        closePdf,
        toggleSidebar,
        setSidebarExpanded,
        setIsSettingsOpen,
        getAssetUrl,
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
