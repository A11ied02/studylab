import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { LibraryProvider, useLibrary } from './context/LibraryContext';
import { FlashcardsProvider } from './context/FlashcardsContext';
import { Sidebar } from './components/common/Sidebar';
import { TopBar } from './components/common/TopBar';
import { BooksHome } from './components/books/BooksHome';
import { SubjectView } from './components/books/SubjectView';
import { PdfViewer } from './components/viewer/PdfViewer';
import { FlashcardsView } from './components/flashcards/FlashcardsView';
import { PyqsView } from './components/common/PyqsView';
import { SettingsModal } from './components/settings/SettingsModal';
import { SearchModal } from './components/common/SearchModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CloudSyncProvider } from './context/CloudSyncContext';
import { FirebaseWorkspace } from './services/firebaseWorkspace';
import { stableStringify, WorkspaceBackup } from './services/workspaceBackup';
import { User } from 'firebase/auth';
import { clearAppRoute, isPdfRoute, parseAppRoute, writeAppRoute } from './services/appRoute';
import { parseCommaSeparatedKeywords } from './services/searchText';

interface SearchSeed {
  query: string;
  scopeIds: string[];
  minKeywordMatches: number;
}

const AppContent: React.FC<{ guestMode?: boolean }> = ({ guestMode = false }) => {
  const {
    activeTab,
    selectedSubject,
    selectedFolder,
    activePdf,
    activePdfPage,
    activePdfSearchQuery,
    activePdfSearchPage,
    activePdfMinKeywordMatches,
    closePdf,
    updatePdfRoute,
    loading: libraryLoading,
  } = useLibrary();
  const handlePdfRouteChange = useCallback((page: number, query: string, minimum: number) => {
    updatePdfRoute(page, query, minimum);
  }, [updatePdfRoute]);
  const initialRoute = parseAppRoute();
  const initialSeed: SearchSeed = {
    query: initialRoute.query ?? '',
    scopeIds: initialRoute.scopeIds,
    minKeywordMatches: initialRoute.minKeywordMatches ?? Math.max(1, parseCommaSeparatedKeywords(initialRoute.query ?? '').length),
  };
  const [isSearchOpen, setIsSearchOpen] = useState(Boolean(initialRoute.query && !isPdfRoute(initialRoute)));
  const [searchSeed, setSearchSeed] = useState<SearchSeed>(initialSeed);
  const [flashcardsQuery, setFlashcardsQuery] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const openGlobalSearch = (query = '') => {
    const route = parseAppRoute();
    const basePath = activePdf
      ? activePdf.rawPath.split('/').slice(0, -1).join('/')
      : selectedFolder?.path ?? selectedSubject?.path ?? (route.isBooksRoute ? route.path : '');
    if (activePdf) closePdf();
    const seed = {
      query,
      scopeIds: [],
      minKeywordMatches: Math.max(1, parseCommaSeparatedKeywords(query).length),
    };
    setSearchSeed(seed);
    setIsSearchOpen(true);
    writeAppRoute({ path: basePath, query, scopeIds: [], minKeywordMatches: seed.minKeywordMatches });
  };

  const closeGlobalSearch = () => {
    setIsSearchOpen(false);
    const route = parseAppRoute();
    // Opening a PDF from a result changes the route before this callback runs; keep that shareable PDF URL intact.
    if (isPdfRoute(route)) return;
    if (route.isBooksRoute) writeAppRoute({ path: route.path, scopeIds: [] }, true);
    else clearAppRoute(true);
    setSearchSeed({ query: '', scopeIds: [], minKeywordMatches: 1 });
  };

  const updateSearchRoute = (query: string, scopeIds: string[], minKeywordMatches: number) => {
    const route = parseAppRoute();
    const path = route.isBooksRoute && !isPdfRoute(route)
      ? route.path
      : selectedFolder?.path ?? selectedSubject?.path ?? '';
    writeAppRoute({ path, query, scopeIds, minKeywordMatches }, true);
  };

  useEffect(() => {
    const syncModalFromRoute = () => {
      const route = parseAppRoute();
      if (route.isBooksRoute && route.query && !isPdfRoute(route)) {
        setSearchSeed({
          query: route.query,
          scopeIds: route.scopeIds,
          minKeywordMatches: route.minKeywordMatches ?? Math.max(1, parseCommaSeparatedKeywords(route.query).length),
        });
        setIsSearchOpen(true);
      } else {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('popstate', syncModalFromRoute);
    window.addEventListener('hashchange', syncModalFromRoute);
    return () => {
      window.removeEventListener('popstate', syncModalFromRoute);
      window.removeEventListener('hashchange', syncModalFromRoute);
    };
  }, []);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (isSearchOpen) return;
        openGlobalSearch();
      }
    };
    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, [activePdf, selectedFolder?.path, selectedSubject?.path, closePdf, isSearchOpen]);

  /* Decide title shown in TopBar */
  const topBarTitle =
    activeTab === 'flashcards' ? 'Flashcards' :
    activeTab === 'pyqs'       ? 'PYQs' :
    'My Books';

  return (
    <div className="app-shell relative flex h-screen w-full overflow-hidden bg-bg-base text-txt-primary font-sans">
      {/* Slim icon sidebar */}
        <Sidebar guestMode={guestMode} />

      {/* Main panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Only show TopBar on non-PDF views */}
        {!activePdf && (
          <TopBar
            title={topBarTitle}
            onOpenGlobalSearch={openGlobalSearch}
            isGlobalSearchOpen={isSearchOpen}
            flashcardsQuery={flashcardsQuery}
            onFlashcardsSearch={setFlashcardsQuery}
            guestMode={guestMode}
            onAuthenticate={() => setIsAuthModalOpen(true)}
          />
        )}

        {/* Content */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {activeTab === 'books' && (
            selectedSubject ? <SubjectView /> : <BooksHome />
          )}
          {!guestMode && activeTab === 'flashcards' && <FlashcardsView searchQuery={flashcardsQuery} />}
          {!guestMode && activeTab === 'pyqs'       && <PyqsView />}

          {/* PDF Viewer overlay */}
          {activePdf && (
            <PdfViewer
              file={activePdf}
              initialPage={activePdfPage}
              initialSearchQuery={activePdfSearchQuery}
              initialSearchPage={activePdfSearchPage}
              initialMinKeywordMatches={activePdfMinKeywordMatches}
              onRouteChange={handlePdfRouteChange}
              onClose={closePdf}
            />
          )}
        </div>
      </div>

      {!guestMode && <SettingsModal />}
      <SearchModal
        isOpen={isSearchOpen && !libraryLoading}
        initialQuery={searchSeed.query}
        initialScopeIds={searchSeed.scopeIds}
        initialMinKeywordMatches={searchSeed.minKeywordMatches}
        onClose={closeGlobalSearch}
        onRouteChange={updateSearchRoute}
      />
      {guestMode && isAuthModalOpen && <GoogleAuthModal onClose={() => setIsAuthModalOpen(false)} />}
    </div>
  );
};

interface WorkspaceBootstrapData {
  serialized: string | null;
  revision: string | null;
}

const workspaceBootstraps = new Map<string, Promise<WorkspaceBootstrapData>>();

const bootstrapWorkspace = (uid: string): Promise<WorkspaceBootstrapData> => {
  const existing = workspaceBootstraps.get(uid);
  if (existing) return existing;
  const bootstrap = (async () => {
    // Start each signed-in session clean: legacy browser workspace state is never migrated to Firebase.
    await WorkspaceBackup.clear();
    const cloudWorkspace = await FirebaseWorkspace.load(uid);
    if (!cloudWorkspace) return { serialized: null, revision: null };
    await WorkspaceBackup.restoreCloudSnapshot(cloudWorkspace.snapshot);
    return { serialized: stableStringify(cloudWorkspace.snapshot), revision: cloudWorkspace.revision };
  })();
  workspaceBootstraps.set(uid, bootstrap);
  return bootstrap;
};

const GoogleMark = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4 1.9-6.8 1.9-5.2 0-9.7-3.5-11.3-8.2H5.8v5.2A20 20 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.7 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 18l6.9-5.2Z" />
    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.8 15l6.9 5.2C14.3 15.5 18.8 12 24 12Z" />
  </svg>
);

const GoogleAuthModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { configured, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const continueWithGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Google sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#111318] p-7 text-white shadow-2xl sm:p-9">
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close sign-in" className="absolute right-4 top-4 rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white disabled:opacity-40"><X size={17} /></button>
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-xl font-bold text-blue-300">S</div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Studylab</p>
        <h2 id="auth-title" className="mt-3 text-2xl font-bold tracking-tight">Unlock your study workspace</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-400">Sign in with Google to sync your workspace and use flashcards, PYQs, and settings. You can keep browsing and searching books without signing in.</p>
        <button
          type="button"
          onClick={() => void continueWithGoogle()}
          disabled={busy}
          className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 text-sm font-semibold text-[#202124] transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <GoogleMark />}
          {busy ? 'Connecting…' : 'Continue with Google'}
        </button>
        {!configured && <p className="mt-4 text-xs leading-5 text-amber-300">Firebase is not configured. Copy `src/services/.firebase-template` to `src/services/firebase.ts` and paste your Firebase web app config there, or set the VITE_FIREBASE_* values in `.env.local`.</p>}
        {error && <p role="alert" className="mt-4 text-xs leading-5 text-red-300">{error}</p>}
      </section>
    </div>
  );
};

const GuestWorkspace: React.FC = () => (
  <ThemeProvider>
    <FlashcardsProvider>
      <LibraryProvider>
        <AppContent guestMode />
      </LibraryProvider>
    </FlashcardsProvider>
  </ThemeProvider>
);

const WorkspaceBootstrap: React.FC<{ user: User }> = ({ user }) => {
  const [attempt, setAttempt] = useState(0);
  const [bootstrap, setBootstrap] = useState<{ loading: boolean; data: WorkspaceBootstrapData | null; error: string }>({ loading: true, data: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    setBootstrap({ loading: true, data: null, error: '' });
    bootstrapWorkspace(user.uid)
      .then((data) => { if (!cancelled) setBootstrap({ loading: false, data, error: '' }); })
      .catch((loadError) => {
        workspaceBootstraps.delete(user.uid);
        if (!cancelled) setBootstrap({ loading: false, data: null, error: loadError instanceof Error ? loadError.message : 'Could not load your Firebase workspace.' });
      });
    return () => { cancelled = true; };
  }, [user.uid, attempt]);

  if (bootstrap.loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#08090c] text-sm text-neutral-400">Loading your workspace…</main>;
  }
  if (bootstrap.error || !bootstrap.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#08090c] px-5 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111318] p-8">
          <h1 className="text-xl font-semibold">Could not load workspace</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-red-300">{bootstrap.error || 'Try again after checking your connection and Firebase configuration.'}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">Retry</button>
        </section>
      </main>
    );
  }

  return (
    <CloudSyncProvider user={user} initialSerialized={bootstrap.data.serialized} initialRevision={bootstrap.data.revision}>
      <ThemeProvider>
        <FlashcardsProvider>
          <LibraryProvider>
            <AppContent />
          </LibraryProvider>
        </FlashcardsProvider>
      </ThemeProvider>
    </CloudSyncProvider>
  );
};

const AppGate: React.FC = () => {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) workspaceBootstraps.clear();
  }, [loading, user]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#08090c] text-sm text-neutral-400">Checking sign-in…</main>;
  if (!user) return <GuestWorkspace />;
  return <WorkspaceBootstrap user={user} />;
};

export const App: React.FC = () => (
  <AuthProvider>
    <AppGate />
  </AuthProvider>
);

export default App;
