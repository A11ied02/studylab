import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Trash2, 
  BookOpen, 
  HardDrive, 
  Info, 
  Sparkles,
  Layers,
  Maximize2,
  Cpu,
  RotateCw,
  LoaderCircle,
  Download,
  Upload,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { 
  useLibrary, 
  DEFAULT_SCIENCE_GRADIENTS, 
  DEFAULT_IT_GRADIENTS, 
  BookScale 
} from '../../context/LibraryContext';
import { useFlashcards } from '../../context/FlashcardsContext';
import { StorageService } from '../../services/storage';
import { buildPdfSearchIndex, formatIndexSize, LoadedPdfSearchIndex, loadPdfSearchIndex, PdfIndexProgress } from '../../services/pdfSearch';
import { WorkspaceBackup } from '../../services/workspaceBackup';
import { useCloudSync } from '../../context/CloudSyncContext';

type SettingsTab = 'tiles' | 'science' | 'it' | 'flashcards' | 'library' | 'storage' | 'sync' | 'about';

const GITHUB_REPOSITORY_URL = 'https://github.com/A11ied02/studylab';
const OPEN_SOURCE_LICENSES = [
  { name: 'React', license: 'MIT' },
  { name: 'React DOM', license: 'MIT' },
  { name: 'Firebase JavaScript SDK', license: 'Apache-2.0' },
  { name: 'PDF.js', license: 'Apache-2.0' },
  { name: 'JSZip', license: 'MIT OR GPL-3.0-or-later' },
  { name: 'MiniSearch', license: 'MIT' },
  { name: 'Lucide React', license: 'ISC' },
  { name: 'clsx', license: 'MIT' },
  { name: 'tailwind-merge', license: 'MIT' },
  { name: 'Vite', license: 'MIT' },
  { name: 'TypeScript', license: 'Apache-2.0' },
  { name: 'Tailwind CSS', license: 'MIT' },
  { name: 'PostCSS', license: 'MIT' },
  { name: 'Autoprefixer', license: 'MIT' },
  { name: '@vitejs/plugin-react', license: 'MIT' },
  { name: 'gh-pages', license: 'MIT' },
  { name: '@types/node', license: 'MIT' },
  { name: '@types/react', license: 'MIT' },
  { name: '@types/react-dom', license: 'MIT' },
];
const LICENSE_URLS: Record<string, string> = {
  MIT: 'https://spdx.org/licenses/MIT.html',
  'Apache-2.0': 'https://spdx.org/licenses/Apache-2.0.html',
  ISC: 'https://spdx.org/licenses/ISC.html',
  'GPL-3.0-or-later': 'https://spdx.org/licenses/GPL-3.0-or-later.html',
};

// Preset gradient pairs for filled folders
const GRADIENT_PRESETS: Array<{ label: string; value: [string, string] }> = [
  { label: 'Cyan to Blue (Tech Teal)', value: ['#06b6d4', '#0284c7'] },
  { label: 'Violet to Purple', value: ['#8b5cf6', '#6d28d9'] },
  { label: 'Google Blue', value: ['#4285f4', '#1a73e8'] },
  { label: 'Emerald & Teal', value: ['#22c55e', '#059669'] },
  { label: 'Forest Green', value: ['#16a34a', '#065f46'] },
  { label: 'Sky & Indigo', value: ['#38bdf8', '#2563eb'] },
  { label: 'Amber & Orange', value: ['#fb923c', '#ea580c'] },
  { label: 'Flame Tangerine', value: ['#f97316', '#c2410c'] },
  { label: 'Sunset Crimson', value: ['#f43f5e', '#be123c'] },
  { label: 'Gold & Bronze', value: ['#eab308', '#d97706'] },
];

export const SettingsModal: React.FC = () => {
  const { 
    isSettingsOpen, 
    setIsSettingsOpen, 
    sidebarExpanded,
    allPdfs, 
    subjects, 
    folderNameMap,
    getAssetUrl,
    manifest,
    scienceGradients, 
    setScienceGradients,
    itGradients,
    setItGradients,
    bookScale,
    setBookScale
  } = useLibrary();
  const { decks, infographics, folderGradients, setFolderGradient, resetFolderGradients } = useFlashcards();
  const { intervalSeconds, setIntervalSeconds, status: syncStatus, hasUnsyncedChanges, lastSyncedAt, error: syncError, syncNow, allowNextNavigation, deleteCloudWorkspace } = useCloudSync();
  const [activeTab, setActiveTab] = useState<SettingsTab>('tiles');
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [confirmDeleteWorkspace, setConfirmDeleteWorkspace] = useState(false);
  const [pendingWorkspaceImport, setPendingWorkspaceImport] = useState<File | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const workspaceFileRef = useRef<HTMLInputElement>(null);
  const [searchIndex, setSearchIndex] = useState<LoadedPdfSearchIndex | null>(null);
  const [indexStatus, setIndexStatus] = useState<'idle' | 'loading' | 'ready' | 'rebuilding' | 'error'>('idle');
  const [indexProgress, setIndexProgress] = useState<PdfIndexProgress | null>(null);
  const [indexError, setIndexError] = useState('');

  const storage = StorageService.getStorageUsage();

  useEffect(() => {
    if (!isSettingsOpen || activeTab !== 'storage' || searchIndex) return;
    let cancelled = false;
    setIndexStatus('loading');
    loadPdfSearchIndex(getAssetUrl)
      .then((index) => { if (!cancelled) { setSearchIndex(index); setIndexStatus('ready'); } })
      .catch((error) => { if (!cancelled) { setIndexError(error instanceof Error ? error.message : 'Search index is unavailable.'); setIndexStatus('error'); } });
    return () => { cancelled = true; };
  }, [isSettingsOpen, activeTab, searchIndex, getAssetUrl]);

  const handleReindex = async () => {
    setIndexStatus('rebuilding');
    setIndexProgress({ completedPdfs: 0, totalPdfs: allPdfs.length, stage: 'extracting' });
    setIndexError('');
    try {
      await buildPdfSearchIndex(allPdfs, subjects, folderNameMap, getAssetUrl, setIndexProgress);
      const nextIndex = await loadPdfSearchIndex(getAssetUrl);
      setSearchIndex(nextIndex);
      setIndexStatus('ready');
    } catch (error) {
      setIndexError(error instanceof Error ? error.message : 'Could not rebuild the PDF search index.');
      setIndexStatus('error');
    }
  };

  const handleWorkspaceExport = async () => {
    setWorkspaceBusy(true);
    setWorkspaceError('');
    setWorkspaceMessage('');
    try {
      const archive = await WorkspaceBackup.create();
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = `studylab-workspace-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setWorkspaceMessage('Workspace ZIP exported.');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Could not export the workspace.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleWorkspaceImport = async () => {
    if (!pendingWorkspaceImport) return;
    setWorkspaceBusy(true);
    setWorkspaceError('');
    try {
      await WorkspaceBackup.restore(pendingWorkspaceImport);
      const synced = await syncNow();
      if (!synced) throw new Error('The imported workspace could not be synced. It is still on this device; resolve the sync issue before reloading.');
      allowNextNavigation();
      window.location.reload();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Could not import that workspace ZIP.');
      setPendingWorkspaceImport(null);
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleWorkspaceDelete = async () => {
    setWorkspaceBusy(true);
    setWorkspaceError('');
    try {
      await deleteCloudWorkspace();
      await WorkspaceBackup.clear();
      allowNextNavigation();
      window.location.reload();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Could not delete the workspace.');
      setWorkspaceBusy(false);
      setConfirmDeleteWorkspace(false);
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isSettingsOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsSettingsOpen(false);
    }, 180);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen]);

  if (!shouldRender) return null;

  return (
    <div 
      className={`settings-overlay fixed top-0 right-0 bottom-0 z-50 bg-[#0a0a0a] flex flex-col select-none transition-all duration-200 ease-in-out ${
        isClosing ? 'opacity-0 scale-98 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      style={{ left: sidebarExpanded ? '14rem' : '4rem' }}
    >
      {/* Top Header Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-bg-border px-4 sm:h-20 sm:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-3xl">
          Settings
        </h1>
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
          title="Close Settings (Esc)"
        >
          <X size={20} strokeWidth={2.2} />
        </button>
      </div>

      {/* Main Settings Body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left Side: Navigation */}
        <aside className="flex max-h-28 shrink-0 flex-row gap-1 overflow-x-auto border-b border-bg-border bg-[#0d0d0d] p-2 md:max-h-full md:w-64 md:flex-col md:space-y-1 md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r md:p-5">
          <button
            onClick={() => setActiveTab('tiles')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'tiles'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Maximize2 size={18} strokeWidth={1.8} className={activeTab === 'tiles' ? 'text-[#4285f4]' : ''} />
            <span>Book Tiles Scale</span>
          </button>

          <button
            onClick={() => setActiveTab('science')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'science'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles size={18} strokeWidth={1.8} className={activeTab === 'science' ? 'text-[#4285f4]' : ''} />
            <span>Science Folders</span>
          </button>

          <button
            onClick={() => setActiveTab('it')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'it'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cpu size={18} strokeWidth={1.8} className={activeTab === 'it' ? 'text-[#4285f4]' : ''} />
            <span>IT Folders</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'library'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen size={18} strokeWidth={1.8} className={activeTab === 'library' ? 'text-[#4285f4]' : ''} />
            <span>Library Source</span>
          </button>

          <button
            onClick={() => setActiveTab('flashcards')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'flashcards'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers size={18} strokeWidth={1.8} className={activeTab === 'flashcards' ? 'text-[#4285f4]' : ''} />
            <span>Flashcard Folders</span>
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'storage'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <HardDrive size={18} strokeWidth={1.8} className={activeTab === 'storage' ? 'text-[#4285f4]' : ''} />
            <span>Data & Storage</span>
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'sync'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cloud size={18} strokeWidth={1.8} className={activeTab === 'sync' ? 'text-[#4285f4]' : ''} />
            <span>Cloud Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`w-auto min-w-max flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all md:w-full md:gap-3 md:px-4 md:py-3 md:text-sm ${
              activeTab === 'about'
                ? 'bg-[#1a73e8]/20 text-white font-semibold border border-[#4285f4]/40'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Info size={18} strokeWidth={1.8} className={activeTab === 'about' ? 'text-[#4285f4]' : ''} />
            <span>About Studylab</span>
          </button>
        </aside>

        {/* Right Side: Tab Contents */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 md:max-w-2xl space-y-8">
          {/* Book Tiles Scale Tab */}
          {activeTab === 'tiles' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Book Tile Size</h2>
                <p className="text-sm text-neutral-400">
                  Control the size and density of book covers on the library homepage.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {(['compact', 'normal', 'large'] as BookScale[]).map((scale) => {
                  const isSelected = bookScale === scale;
                  return (
                    <button
                      key={scale}
                      onClick={() => setBookScale(scale)}
                      className={`p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all ${
                        isSelected
                          ? 'border-[#4285f4] bg-[#1a73e8]/15 text-white shadow-[0_0_12px_rgba(66,133,244,0.3)]'
                          : 'border-bg-border bg-bg-card text-neutral-400 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <div className={`rounded bg-white/20 ${scale === 'compact' ? 'w-4 h-5' : scale === 'normal' ? 'w-5 h-6' : 'w-6 h-8'}`} />
                        <div className={`rounded bg-white/20 ${scale === 'compact' ? 'w-4 h-5' : scale === 'normal' ? 'w-5 h-6' : 'w-6 h-8'}`} />
                        <div className={`rounded bg-white/20 ${scale === 'compact' ? 'w-4 h-5' : scale === 'normal' ? 'w-5 h-6' : 'w-6 h-8'}`} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold capitalize text-white">{scale}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {scale === 'compact' ? '6-col desktop' : scale === 'normal' ? '5-col desktop' : '4-col desktop'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Science Folders Tab */}
          {activeTab === 'science' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Science Folder Gradients</h2>
                <p className="text-sm text-neutral-400">
                  Filled folder icons for Biology, Physics, and Chemistry units.
                </p>
              </div>

              {/* Live Preview */}
              <div className="grid grid-cols-3 gap-4 p-6 rounded-2xl bg-bg-card border border-bg-border">
                {/* Biology Preview */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16">
                    <svg viewBox="0 0 24 24" className="w-full h-full">
                      <defs>
                        <linearGradient id="prev_bio" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={scienceGradients.bio[0]} />
                          <stop offset="100%" stopColor={scienceGradients.bio[1]} />
                        </linearGradient>
                      </defs>
                      <path
                        d="M4 4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4H4Z"
                        fill="url(#prev_bio)"
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-white">Biology</span>
                </div>

                {/* Physics Preview */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16">
                    <svg viewBox="0 0 24 24" className="w-full h-full">
                      <defs>
                        <linearGradient id="prev_phy" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={scienceGradients.phy[0]} />
                          <stop offset="100%" stopColor={scienceGradients.phy[1]} />
                        </linearGradient>
                      </defs>
                      <path
                        d="M4 4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4H4Z"
                        fill="url(#prev_phy)"
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-white">Physics</span>
                </div>

                {/* Chemistry Preview */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16">
                    <svg viewBox="0 0 24 24" className="w-full h-full">
                      <defs>
                        <linearGradient id="prev_chem" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={scienceGradients.chem[0]} />
                          <stop offset="100%" stopColor={scienceGradients.chem[1]} />
                        </linearGradient>
                      </defs>
                      <path
                        d="M4 4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4H4Z"
                        fill="url(#prev_chem)"
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-white">Chemistry</span>
                </div>
              </div>

              {/* Color Selectors */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Biology Gradient
                  </label>
                  <select
                    value={JSON.stringify(scienceGradients.bio)}
                    onChange={(e) => setScienceGradients({ ...scienceGradients, bio: JSON.parse(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-bg-border text-white text-sm outline-none focus:border-[#4285f4]"
                  >
                    {GRADIENT_PRESETS.map((g) => (
                      <option key={g.label} value={JSON.stringify(g.value)}>{g.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Physics Gradient
                  </label>
                  <select
                    value={JSON.stringify(scienceGradients.phy)}
                    onChange={(e) => setScienceGradients({ ...scienceGradients, phy: JSON.parse(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-bg-border text-white text-sm outline-none focus:border-[#4285f4]"
                  >
                    {GRADIENT_PRESETS.map((g) => (
                      <option key={g.label} value={JSON.stringify(g.value)}>{g.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Chemistry Gradient
                  </label>
                  <select
                    value={JSON.stringify(scienceGradients.chem)}
                    onChange={(e) => setScienceGradients({ ...scienceGradients, chem: JSON.parse(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-bg-border text-white text-sm outline-none focus:border-[#4285f4]"
                  >
                    {GRADIENT_PRESETS.map((g) => (
                      <option key={g.label} value={JSON.stringify(g.value)}>{g.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setScienceGradients(DEFAULT_SCIENCE_GRADIENTS)}
                  className="text-xs text-[#4285f4] hover:underline pt-1"
                >
                  Reset Science Gradients to Defaults
                </button>
              </div>
            </div>
          )}

          {/* 4. IT Folders Tab */}
          {activeTab === 'it' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Information Technology (IT) Folders</h2>
                <p className="text-sm text-neutral-400">
                  Part A folders always use the blue gradient. Choose a gradient for Part B.
                </p>
              </div>

              {/* Live Preview */}
              <div className="grid grid-cols-2 gap-4 p-6 rounded-2xl bg-bg-card border border-bg-border">
                {/* Part A Preview */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16">
                    <svg viewBox="0 0 24 24" className="w-full h-full">
                      <defs>
                        <linearGradient id="prev_it_a" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={DEFAULT_IT_GRADIENTS.partA[0]} />
                          <stop offset="100%" stopColor={DEFAULT_IT_GRADIENTS.partA[1]} />
                        </linearGradient>
                      </defs>
                      <path
                        d="M4 4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4H4Z"
                        fill="url(#prev_it_a)"
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-white">Part A</span>
                </div>

                {/* Part B Preview */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16">
                    <svg viewBox="0 0 24 24" className="w-full h-full">
                      <defs>
                        <linearGradient id="prev_it_b" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={itGradients.partB[0]} />
                          <stop offset="100%" stopColor={itGradients.partB[1]} />
                        </linearGradient>
                      </defs>
                      <path
                        d="M4 4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4H4Z"
                        fill="url(#prev_it_b)"
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-white">Part B</span>
                </div>
              </div>

              {/* Color Selectors */}
              <div className="space-y-4">
                <div className="rounded-xl border border-bg-border bg-bg-card px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300">Part A Gradient</p>
                  <p className="mt-1 text-xs text-neutral-500">Consistent blue gradient across every Part A folder.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Part B Gradient
                  </label>
                  <select
                    value={JSON.stringify(itGradients.partB)}
                    onChange={(e) => setItGradients({ ...itGradients, partB: JSON.parse(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-bg-border text-white text-sm outline-none focus:border-[#4285f4]"
                  >
                    {GRADIENT_PRESETS.map((g) => (
                      <option key={g.label} value={JSON.stringify(g.value)}>{g.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setItGradients({ ...itGradients, partB: DEFAULT_IT_GRADIENTS.partB })}
                  className="text-xs text-[#4285f4] hover:underline pt-1"
                >
                  Reset Part B Gradient to Default
                </button>
              </div>
            </div>
          )}

          {activeTab === 'flashcards' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Flashcard Folder Gradients</h2>
                <p className="text-sm text-neutral-400">
                  Choose the default folder color for each subject. The same gradient follows its nested folders.
                </p>
              </div>

              <div className="space-y-3">
                {subjects.map((subject) => {
                  const gradient = folderGradients[subject.id] ?? ['#38bdf8', '#2563eb'];
                  return (
                    <div key={subject.id} className="flex items-center gap-4 rounded-xl border border-bg-border bg-bg-card p-3">
                      <div
                        className="h-11 w-11 shrink-0 rounded-lg shadow-inner"
                        style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`flashcard-gradient-${subject.id}`} className="mb-1 block text-xs font-semibold text-neutral-300">
                          {subject.displayName}
                        </label>
                        <select
                          id={`flashcard-gradient-${subject.id}`}
                          value={JSON.stringify(gradient)}
                          onChange={(event) => setFolderGradient(subject.id, JSON.parse(event.target.value))}
                          className="w-full rounded-lg border border-bg-border bg-[#111] px-3 py-2 text-sm text-white outline-none focus:border-[#4285f4]"
                        >
                          {GRADIENT_PRESETS.map((preset) => (
                            <option key={preset.label} value={JSON.stringify(preset.value)}>{preset.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={resetFolderGradients} className="text-xs text-[#4285f4] hover:underline">
                Reset Flashcard Folder Gradients
              </button>
            </div>
          )}

          {/* 5. Library Tab */}
          {activeTab === 'library' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Library Information</h2>
                <p className="text-sm text-neutral-400">Class 10 NCERT books manifest details.</p>
              </div>

              <div className="rounded-2xl bg-bg-card border border-bg-border p-6 space-y-4">
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-neutral-400 text-sm">Source Directory</span>
                  <span className="text-sm font-mono text-white truncate max-w-xs" title={manifest?.sourceDirectory}>
                    {manifest?.sourceDirectory || '/home/user01/Desktop/ClassXbooks'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-neutral-400 text-sm">Subjects Count</span>
                  <span className="text-sm font-semibold text-white">{subjects.length} Subjects</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-neutral-400 text-sm">Total Chapter PDFs</span>
                  <span className="text-sm font-semibold text-white">{allPdfs.length} Chapters</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-neutral-400 text-sm">Display Mapping File</span>
                  <span className="text-sm font-mono text-[#4285f4]">foldernamemap.json</span>
                </div>
              </div>
            </div>
          )}

          {/* 6. Storage Tab */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Data Controls</h2>
                <p className="text-sm text-neutral-400">Back up, restore, or clear this signed-in Studylab workspace.</p>
              </div>

              <div className="rounded-2xl bg-bg-card border border-bg-border p-6 space-y-4">
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-neutral-400 text-sm">Local Storage Utilized</span>
                  <span className="text-sm font-mono font-semibold text-white">{storage.formatted}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-neutral-400 text-sm">Flashcard Decks Stored</span>
                  <span className="text-sm font-semibold text-white">{decks.length} Decks</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-neutral-400 text-sm">Infographics Stored</span>
                  <span className="text-sm font-semibold text-white">{infographics.length}</span>
                </div>
                <div className="grid gap-2 border-t border-white/5 pt-4 sm:grid-cols-2">
                  <button
                    onClick={() => void handleWorkspaceExport()}
                    disabled={workspaceBusy}
                    className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-200 transition hover:bg-blue-500/15 disabled:opacity-60"
                  >
                    <Download size={16} /> Export workspace ZIP
                  </button>
                  <button
                    onClick={() => workspaceFileRef.current?.click()}
                    disabled={workspaceBusy}
                    className="flex items-center justify-center gap-2 rounded-xl border border-bg-border bg-bg-surface px-4 py-3 text-sm font-medium text-neutral-200 transition hover:border-white/20 disabled:opacity-60"
                  >
                    <Upload size={16} /> Import workspace ZIP
                  </button>
                  <input
                    ref={workspaceFileRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(event) => {
                      setPendingWorkspaceImport(event.target.files?.[0] ?? null);
                      setWorkspaceError('');
                      event.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => { setConfirmDeleteWorkspace(true); setWorkspaceError(''); }}
                    disabled={workspaceBusy}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/15 disabled:opacity-60 sm:col-span-2"
                  >
                    <Trash2 size={16} /> Delete current workspace
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-neutral-500">ZIP backups include your decks, infographics, and saved settings. They exclude the built-in book search index. Deleting this workspace also keeps that book index intact.</p>
                {workspaceMessage && <p className="text-xs text-emerald-300">{workspaceMessage}</p>}
                {workspaceError && <p className="text-xs text-red-300">{workspaceError}</p>}
              </div>

              <div className="rounded-2xl bg-bg-card border border-bg-border p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">PDF search index</h3>
                  <p className="mt-1 text-xs text-neutral-500">Page text and book locations used by full text search.</p>
                </div>
                <div className="flex items-center justify-between border-y border-white/5 py-3">
                  <span className="text-sm text-neutral-400">Index size</span>
                  <span className="font-mono text-sm font-semibold text-white">
                    {indexStatus === 'loading' ? 'Loading index…' : searchIndex ? formatIndexSize(searchIndex.sizeBytes) : indexStatus === 'error' ? 'Unavailable' : 'Not loaded'}
                  </span>
                </div>
                {searchIndex && (
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>{searchIndex.pdfCount} PDFs · {searchIndex.documentCount.toLocaleString()} pages</span>
                    <span>{searchIndex.source === 'rebuilt' ? 'Local index' : 'Built-in index'}</span>
                  </div>
                )}
                {indexStatus === 'rebuilding' && indexProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>{indexProgress.stage === 'extracting' ? 'Extracting PDF text' : 'Finishing search index'}</span>
                      <span>{indexProgress.completedPdfs}/{indexProgress.totalPdfs}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${indexProgress.stage === 'building' ? 100 : Math.round(indexProgress.completedPdfs / Math.max(indexProgress.totalPdfs, 1) * 100)}%` }} />
                    </div>
                  </div>
                )}
                {indexError && <p className="text-xs text-red-300">{indexError}</p>}
                <button
                  onClick={() => void handleReindex()}
                  disabled={indexStatus === 'rebuilding'}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 py-3 text-sm font-medium text-blue-200 transition hover:bg-blue-500/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {indexStatus === 'rebuilding' ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCw size={15} />}
                  {indexStatus === 'rebuilding' ? 'Reindexing PDFs…' : 'Rebuild PDF search index'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Cloud Sync</h2>
                <p className="text-sm text-neutral-400">Your workspace is stored in Firestore and checked on this device at the interval below.</p>
              </div>

              <div className="rounded-2xl bg-bg-card border border-bg-border p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Sync interval</h3>
                    <p className="mt-1 text-xs text-neutral-500">Choose how often Studylab checks and uploads workspace changes.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-300">
                    <span className="sr-only">Sync interval in seconds</span>
                    <input
                      type="number"
                      min={5}
                      max={300}
                      step={1}
                      value={intervalSeconds}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value >= 5) setIntervalSeconds(value);
                      }}
                      className="w-20 rounded-lg border border-bg-border bg-bg-surface px-3 py-2 text-center text-sm text-white outline-none focus:border-blue-500"
                    />
                    <span>seconds</span>
                  </label>
                </div>
                <p className="text-xs text-neutral-500">The default is 5 seconds. The interval can be set from 5 to 300 seconds. Book PDFs and the built-in library remain part of the site and are not uploaded.</p>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
                  <div className="text-sm">
                    <span className="text-neutral-400">Status: </span>
                    <span className={syncStatus === 'error' || syncStatus === 'conflict' || hasUnsyncedChanges ? 'text-red-300' : syncStatus === 'syncing' ? 'text-amber-300' : 'text-emerald-300'}>
                      {syncStatus === 'error' ? 'Needs attention' : syncStatus === 'conflict' ? 'Cloud changed elsewhere' : syncStatus === 'syncing' ? 'Syncing…' : hasUnsyncedChanges ? 'Changes not synced' : 'Up to date'}
                    </span>
                    {lastSyncedAt && <span className="ml-2 text-xs text-neutral-500">Last checked {lastSyncedAt.toLocaleTimeString()}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void syncNow()}
                    disabled={syncStatus === 'syncing'}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    <RefreshCw size={14} /> Sync now
                  </button>
                </div>
                {syncError && <p role="alert" className="text-xs leading-5 text-red-300">{syncError}</p>}
              </div>
            </div>
          )}

          {/* About Tab */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">About Studylab</h2>
                <p className="text-sm text-neutral-400">Personal Class 10 NCERT study library.</p>
              </div>

              <div className="rounded-2xl bg-bg-card border border-bg-border p-6 space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-neutral-400">Version</span>
                  <span className="font-mono text-white">v1.5.0</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-neutral-400">Curriculum</span>
                  <span className="text-white">CBSE / NCERT Class 10</span>
                </div>
                <div className="space-y-2 border-b border-white/5 pb-3">
                  <p className="text-neutral-400">Created by</p>
                  <p className="text-white">DaksshDev <span className="text-neutral-500">(alt account: A11ied02)</span></p>
                  <p className="text-white">Codex Agent</p>
                </div>
                <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 pt-1 font-medium text-blue-300 hover:text-blue-200">
                  Studylab on GitHub <span aria-hidden="true">↗</span>
                </a>
              </div>

              <div className="rounded-2xl border border-bg-border bg-bg-card p-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white">Open-source licenses</h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">Direct app and build dependencies with their declared package licenses. See each package’s license files for full terms.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OPEN_SOURCE_LICENSES.map(({ name, license }) => (
                    <div key={name} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                      <span className="truncate text-neutral-300">{name}</span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
                        {license.split(' OR ').map((licenseId, index) => (
                          <React.Fragment key={licenseId}>
                            {index > 0 && <span className="text-neutral-600">or</span>}
                            <a href={LICENSE_URLS[licenseId]} target="_blank" rel="noreferrer" className="text-neutral-400 underline decoration-neutral-700 underline-offset-2 hover:text-blue-300">{licenseId}</a>
                          </React.Fragment>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] leading-5 text-neutral-500">JSZip is available under MIT or GPL-3.0-or-later. Indirect dependencies carry the licenses published with their packages.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {(confirmDeleteWorkspace || pendingWorkspaceImport) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => { if (!workspaceBusy) { setConfirmDeleteWorkspace(false); setPendingWorkspaceImport(null); } }}>
          <div className="w-full max-w-md rounded-2xl border border-bg-border bg-[#151515] p-5 shadow-modal sm:p-6" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white">{pendingWorkspaceImport ? 'Import workspace backup?' : 'Delete current workspace?'}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              {pendingWorkspaceImport
                ? `Importing “${pendingWorkspaceImport.name}” replaces the current decks, infographics, and saved settings. The built-in book search index stays available.`
                : 'This removes saved decks, infographics, and app settings from Firebase and this browser. The built-in books and search index stay available.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setConfirmDeleteWorkspace(false); setPendingWorkspaceImport(null); }}
                disabled={workspaceBusy}
                className="rounded-lg border border-bg-border px-4 py-2 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={() => void (pendingWorkspaceImport ? handleWorkspaceImport() : handleWorkspaceDelete())}
                disabled={workspaceBusy}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${pendingWorkspaceImport ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-500'}`}
              >{workspaceBusy ? 'Working…' : pendingWorkspaceImport ? 'Replace workspace' : 'Delete workspace'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
