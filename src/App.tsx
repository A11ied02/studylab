import React, { useEffect, useState } from 'react';
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

const AppContent: React.FC = () => {
  const {
    activeTab,
    selectedSubject,
    activePdf,
    activePdfPage,
    activePdfSearchQuery,
    activePdfSearchPage,
    closePdf,
  } = useLibrary();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [initialSearchQuery, setInitialSearchQuery] = useState('');
  const [flashcardsQuery, setFlashcardsQuery] = useState('');

  const openGlobalSearch = (query = '') => {
    setInitialSearchQuery(query);
    setIsSearchOpen(true);
  };

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        openGlobalSearch();
      }
    };
    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, []);

  /* Decide title shown in TopBar */
  const topBarTitle =
    activeTab === 'flashcards' ? 'Flashcards' :
    activeTab === 'pyqs'       ? 'PYQs' :
    'My Books';

  return (
    <div className="app-shell relative flex h-screen w-full overflow-hidden bg-bg-base text-txt-primary font-sans">
      {/* Slim icon sidebar */}
      <Sidebar />

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
          />
        )}

        {/* Content */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {activeTab === 'books' && (
            selectedSubject ? <SubjectView /> : <BooksHome />
          )}
          {activeTab === 'flashcards' && <FlashcardsView searchQuery={flashcardsQuery} />}
          {activeTab === 'pyqs'       && <PyqsView />}

          {/* PDF Viewer overlay */}
          {activePdf && (
            <PdfViewer
              file={activePdf}
              initialPage={activePdfPage}
              initialSearchQuery={activePdfSearchQuery}
              initialSearchPage={activePdfSearchPage}
              onClose={closePdf}
            />
          )}
        </div>
      </div>

      <SettingsModal />
      <SearchModal isOpen={isSearchOpen} initialQuery={initialSearchQuery} onClose={() => setIsSearchOpen(false)} />
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

const LoginScreen: React.FC = () => {
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
    <main className="flex min-h-screen items-center justify-center bg-[#08090c] px-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111318] p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-xl font-bold text-blue-300">S</div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Studylab</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Sign in to continue</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">Use your Google account to open your synced workspace.</p>
        <button
          type="button"
          onClick={() => void continueWithGoogle()}
          disabled={busy}
          className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 text-sm font-semibold text-[#202124] transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-70"
        >
          <GoogleMark />
          {busy ? 'Connecting…' : 'Continue with Google'}
        </button>
        {!configured && <p className="mt-4 text-xs leading-5 text-amber-300">Firebase is not configured. Copy `src/services/.firebase-template` to `src/services/firebase.ts` and paste your Firebase web app config there, or set the VITE_FIREBASE_* values in `.env.local`.</p>}
        {error && <p role="alert" className="mt-4 text-xs leading-5 text-red-300">{error}</p>}
      </section>
    </main>
  );
};

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
  if (!user) return <LoginScreen />;
  return <WorkspaceBootstrap user={user} />;
};

export const App: React.FC = () => (
  <AuthProvider>
    <AppGate />
  </AuthProvider>
);

export default App;
