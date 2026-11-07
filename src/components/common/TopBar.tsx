import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ExternalLink, FileText, Search, Settings, X, LogOut, RefreshCw, LoaderCircle } from 'lucide-react';
import { useLibrary } from '../../context/LibraryContext';
import { useAuth } from '../../context/AuthContext';
import { useCloudSync } from '../../context/CloudSyncContext';
import { getBreadcrumbTrail } from '../../services/folderMapper';
import { HighlightedText } from './HighlightedText';
import { PYQS_SITE_URL } from './PyqsView';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onOpenGlobalSearch: (query: string) => void;
  isGlobalSearchOpen: boolean;
  flashcardsQuery: string;
  onFlashcardsSearch: (query: string) => void;
  guestMode?: boolean;
  onAuthenticate?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, onOpenGlobalSearch, isGlobalSearchOpen, flashcardsQuery, onFlashcardsSearch, guestMode = false, onAuthenticate }) => {
  const { activeTab, setActiveTab, allPdfs, openPdf, folderNameMap, setIsSettingsOpen } = useLibrary();
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const isFlashcards = activeTab === 'flashcards';
  const { user, signOutUser } = useAuth();
  const { intervalSeconds, status, lastSyncedAt, error, syncNow, hasUnsyncedChanges } = useCloudSync();
  const syncLabel = status === 'syncing'
    ? 'Syncing'
    : status === 'error' || status === 'conflict'
      ? 'Sync needs attention'
      : hasUnsyncedChanges
        ? 'Unsynced changes'
        : 'Synced';
  const syncDotColor = status === 'syncing'
    ? 'bg-amber-400'
    : status === 'error' || status === 'conflict' || hasUnsyncedChanges
      ? 'bg-red-500'
      : 'bg-emerald-500';

  useEffect(() => {
    setShowSuggestions(false);
    if (isFlashcards) setQuery(flashcardsQuery);
    else {
      setQuery('');
      onFlashcardsSearch('');
    }
  }, [activeTab]);

  const suggestions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term || isFlashcards) return [];
    return allPdfs
      .filter((file) => file.title.toLocaleLowerCase().includes(term) || file.rawPath.toLocaleLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.title.toLocaleLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.title.toLocaleLowerCase().startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.title.localeCompare(b.title);
      })
      .slice(0, 6);
  }, [allPdfs, query, isFlashcards]);

  useEffect(() => {
    const handleOutsideClick = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setShowSuggestions(false);
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (isGlobalSearchOpen) setShowSuggestions(false);
  }, [isGlobalSearchOpen]);

  const openFullTextSearch = () => {
    onOpenGlobalSearch(query.trim());
    setShowSuggestions(false);
  };

  const handleSignOut = async () => {
    setSignOutBusy(true);
    setSignOutError('');
    try {
      if (hasUnsyncedChanges && !(await syncNow())) {
        setSignOutError('Your workspace could not be synced, so you are still signed in. Resolve the sync issue and try again.');
        return;
      }
      await signOutUser();
      setConfirmSignOut(false);
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setSignOutBusy(false);
    }
  };

  const mobileSearchActions = (
    <div className="flex shrink-0 items-center gap-2 md:hidden">
      {!guestMode && <button
        type="button"
        onClick={() => setIsSettingsOpen(true)}
        aria-label="Open settings"
        title="Settings"
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-bg-border bg-bg-surface text-neutral-300 transition hover:border-white/20 hover:text-white"
      >
        <Settings size={18} strokeWidth={1.8} />
      </button>}
      <button
        type="button"
        onClick={() => onOpenGlobalSearch('')}
        aria-label="Open advanced search"
        title="Advanced search"
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-bg-border bg-bg-surface text-neutral-300 transition hover:border-blue-400/50 hover:text-white"
      >
        <span className="text-lg font-bold leading-none">A</span>
      </button>
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-4 px-4 pt-3 pb-3 sm:gap-6 sm:px-8 sm:pt-5 sm:pb-5 border-b border-bg-border select-none">
        <div className="min-w-0 flex flex-1 items-center gap-5 overflow-x-auto sm:gap-6">
          {(guestMode ? [
            { id: 'books', label: 'Books' },
          ] as const : [
            { id: 'books', label: 'Books' },
            { id: 'flashcards', label: 'Flashcards' },
            { id: 'pyqs', label: 'PYQs' },
          ] as const).map(({ id: tab, label }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 pb-2.5 text-sm font-medium transition-colors relative ${active ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                {label}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-[#4285f4] shadow-[0_0_10px_rgba(66,133,244,0.9)]" />}
              </button>
            );
          })}
        </div>
        {activeTab === 'pyqs' && (
          <a
            href={PYQS_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open PYQs site in a new tab"
            title="Open PYQs site in a new tab"
            className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition hover:border-blue-400/50 hover:bg-white/5 hover:text-white"
          >
            <ExternalLink size={17} strokeWidth={1.8} />
          </a>
        )}
        {guestMode ? (
          <button
            type="button"
            onClick={onAuthenticate}
            className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <span className="sm:hidden">Sign in</span>
            <span className="hidden sm:inline">Sign in to unlock features</span>
          </button>
        ) : <div className="relative shrink-0" ref={accountRef}>
          <button
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-label={`Open account and sync details. ${syncLabel}.`}
            title={`Account and sync details · ${syncLabel}`}
            className="relative flex h-9 w-9 items-center justify-center overflow-visible rounded-full border border-white/15 bg-bg-surface transition hover:border-blue-400/70"
          >
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
              {user?.photoURL
                ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                : <span className="text-sm font-semibold text-blue-200">{user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}</span>}
            </span>
            <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#111] ${syncDotColor}`} />
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-full z-50 mt-3 w-72 rounded-2xl border border-bg-border bg-[#151515] p-4 shadow-modal">
              <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                <div className="h-10 w-10 overflow-hidden rounded-full bg-bg-surface">
                  {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{user?.displayName || 'Google account'}</p>
                  <p className="truncate text-xs text-neutral-400">{user?.email}</p>
                </div>
              </div>
              <div className="space-y-2 py-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">Sync status</span>
                  <span className={status === 'error' || status === 'conflict' || hasUnsyncedChanges ? 'text-red-300' : status === 'syncing' ? 'text-amber-300' : 'text-emerald-300'}>
                    {status === 'error' ? 'Sync issue' : status === 'conflict' ? 'Cloud conflict' : status === 'syncing' ? 'Syncing…' : hasUnsyncedChanges ? 'Changes not synced' : 'Synced'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">Sync interval</span><span className="text-neutral-200">Every {intervalSeconds} seconds</span>
                </div>
                {lastSyncedAt && <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Last sync</span><span className="text-neutral-200">{lastSyncedAt.toLocaleTimeString()}</span></div>}
                {error && <p className="break-words pt-1 leading-5 text-red-300">{error}</p>}
              </div>
              <div className="flex gap-2 border-t border-white/10 pt-3">
                <button type="button" onClick={() => void syncNow()} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500/15 px-3 py-2 text-xs font-medium text-blue-200 hover:bg-blue-500/25"><RefreshCw size={13} /> Sync now</button>
                <button type="button" onClick={() => { setAccountOpen(false); setSignOutError(''); setConfirmSignOut(true); }} className="flex items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10"><LogOut size={13} /> Sign out</button>
              </div>
            </div>
          )}
        </div>}
      </div>

      <div className={`${activeTab === 'pyqs' ? 'hidden md:flex' : 'flex'} flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 md:flex-nowrap md:gap-8 md:px-8 md:pt-6 md:pb-5`}>
        <div className="order-1 flex w-full min-w-0 items-center justify-between select-none md:order-none md:w-auto">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-white tracking-tight sm:text-2xl">{title}</h1>
            {subtitle && <p className="text-sm text-neutral-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {activeTab !== 'pyqs' && (
        <div className="relative order-2 flex w-full min-w-0 items-start gap-2 md:order-none md:ml-auto md:w-full md:max-w-sm md:shrink-0">
          <div ref={searchRef} className="relative min-w-0 flex-1">
          <div className={`flex h-11 items-center gap-3 rounded-xl border bg-bg-surface px-4 transition-colors ${showSuggestions ? 'border-[#4285f4]/60' : 'border-bg-border hover:border-white/20'}`}>
            <Search size={16} strokeWidth={1.8} className="text-neutral-400 shrink-0" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (isFlashcards) onFlashcardsSearch(event.target.value);
                else setShowSuggestions(true);
              }}
              onFocus={() => { if (!isFlashcards) setShowSuggestions(true); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && query.trim() && !isFlashcards) openFullTextSearch();
                if (event.key === 'Escape') setShowSuggestions(false);
              }}
              placeholder={isFlashcards ? 'Search decks, folders, infographics' : 'Search books and chapters'}
              aria-label={isFlashcards ? 'Search flashcards and infographics' : 'Search books and chapters'}
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setShowSuggestions(false); if (isFlashcards) onFlashcardsSearch(''); }}
                aria-label="Clear search"
                className="text-neutral-500 hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {!isFlashcards && showSuggestions && query.trim() && (
            <div className="absolute right-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-bg-border bg-[#151515] shadow-modal">
              {suggestions.length ? (
                <div className="py-1.5">
                  {suggestions.map((file) => {
                    const breadcrumb = getBreadcrumbTrail(file.rawPath, folderNameMap).slice(0, -1).map((part) => part.name).join(' / ');
                    return (
                      <button
                        key={file.id}
                        onClick={() => { openPdf(file, 1, query.trim()); setQuery(''); setShowSuggestions(false); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.06]"
                      >
                        <FileText size={15} className="shrink-0 text-neutral-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-neutral-100"><HighlightedText text={file.title} query={query} /></span>
                          <span className="block truncate text-xs text-neutral-500"><HighlightedText text={breadcrumb} query={query} /></span>
                        </span>
                        <ChevronRight size={14} className="shrink-0 text-neutral-600" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-neutral-500">No book titles match “{query}”.</p>
              )}
              <button
                onClick={openFullTextSearch}
                className="flex w-full items-center justify-between border-t border-bg-border px-4 py-3 text-left text-xs font-medium text-blue-300 hover:bg-white/[0.04]"
              >
                <span>Search text across NCERT</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          </div>
          {mobileSearchActions}
        </div>
        )}

        <button
          type="button"
          onClick={() => onOpenGlobalSearch('')}
          aria-label="Open advanced search"
          title="Advanced search"
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-bg-border bg-bg-surface text-neutral-300 transition hover:border-blue-400/50 hover:text-white md:flex"
        >
          <span className="text-lg font-bold leading-none">A</span>
        </button>
      </div>

      {confirmSignOut && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !signOutBusy) setConfirmSignOut(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="confirm-sign-out-title" className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151515] p-5 shadow-[0_30px_100px_rgba(0,0,0,.65)]">
            <h2 id="confirm-sign-out-title" className="text-base font-semibold text-white">Sign out of Studylab?</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">We’ll sync your latest workspace changes before signing out. If syncing fails, you’ll stay signed in.</p>
            {signOutError && <p role="alert" className="mt-3 text-xs leading-5 text-red-300">{signOutError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmSignOut(false)} disabled={signOutBusy} className="rounded-lg border border-white/10 px-3.5 py-2 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void handleSignOut()} disabled={signOutBusy || status === 'syncing'} className="flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-wait disabled:opacity-50">
                {signOutBusy ? <LoaderCircle size={14} className="animate-spin" /> : <LogOut size={14} />}
                {signOutBusy ? 'Syncing…' : 'Sign out'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
