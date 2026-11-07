import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Filter, LoaderCircle, Search, X } from 'lucide-react';
import { useLibrary } from '../../context/LibraryContext';
import { LoadedPdfSearchIndex, PdfTextMatch, loadPdfSearchIndex, searchPdfPages } from '../../services/pdfSearch';
import { BookFolder, Subject } from '../../types/library';
import { HighlightedText } from './HighlightedText';

interface SearchModalProps {
  isOpen: boolean;
  initialQuery: string;
  onClose: () => void;
}

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

interface SearchScope {
  id: string;
  label: string;
  ancestors: string[];
  directScopeId?: string;
  children: SearchScope[];
}

const buildScopeTree = (subjects: Subject[]): SearchScope[] => subjects
  .filter((subject) => subject.displayName.toLocaleLowerCase() !== 'hindi' && subject.path.toLocaleLowerCase().split('/')[0] !== 'hindi')
  .map((subject) => {
    const makeFolder = (folder: BookFolder, ancestors: string[]): SearchScope => ({
      id: folder.path,
      label: subject.displayName === 'IT' ? `IT / ${folder.path.split('/').slice(1).map((part) => part).join(' / ')}` : folder.displayName,
      ancestors,
      directScopeId: folder.files?.length ? `@direct:${folder.path}` : undefined,
      children: (folder.subfolders ?? []).map((child) => makeFolder(child, [...ancestors, folder.path])),
    });
    return {
      id: subject.id,
      label: subject.displayName,
      ancestors: [],
      directScopeId: subject.files?.length ? `@direct:${subject.path}` : undefined,
      children: (subject.subfolders ?? []).map((folder) => makeFolder(folder, [subject.id])),
    };
  });

const getAllSelectionIds = (scope: SearchScope): string[] => [scope.id, ...(scope.directScopeId ? [scope.directScopeId] : []), ...scope.children.flatMap(getAllSelectionIds)];
const getIncludedScopeIds = (scope: SearchScope): string[] => scope.children.length
  ? [...(scope.directScopeId ? [scope.directScopeId] : []), ...scope.children.flatMap(getIncludedScopeIds)]
  : [scope.id];

function findScope(scopes: SearchScope[], id: string): SearchScope | undefined {
  for (const scope of scopes) {
    if (scope.id === id) return scope;
    const child = findScope(scope.children, id);
    if (child) return child;
  }
  return undefined;
}

function isScopeChecked(scope: SearchScope, selectedIds: string[]): boolean {
  if (selectedIds.includes(scope.id) || scope.ancestors.some((id) => selectedIds.includes(id))) return true;
  if (!scope.children.length) return false;
  const ownFilesSelected = !scope.directScopeId || selectedIds.includes(scope.directScopeId);
  return ownFilesSelected && scope.children.every((child) => isScopeChecked(child, selectedIds));
}

function isScopePartial(scope: SearchScope, selectedIds: string[]): boolean {
  if (isScopeChecked(scope, selectedIds)) return false;
  return (Boolean(scope.directScopeId && selectedIds.includes(scope.directScopeId)))
    || scope.children.some((child) => isScopeChecked(child, selectedIds) || isScopePartial(child, selectedIds));
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, initialQuery, onClose }) => {
  const { allPdfs, subjects, openPdf, getAssetUrl } = useLibrary();
  const [query, setQuery] = useState('');
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [results, setResults] = useState<PdfTextMatch[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const loadedIndexRef = useRef<LoadedPdfSearchIndex | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery(initialQuery);
    setSelectedScopeIds([]);
    setIsFilterOpen(false);
    setResults([]);
    setStatus('idle');
    setError('');
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) requestRef.current += 1;
  }, [isOpen]);

  const scopeTree = useMemo(() => buildScopeTree(subjects), [subjects]);
  const allSearchablePdfCount = useMemo(() => allPdfs.filter((pdf) => pdf.rawPath.split('/')[0]?.toLocaleLowerCase() !== 'hindi').length, [allPdfs]);
  const scopeLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const visit = (scopes: SearchScope[]) => scopes.forEach((scope) => { labels.set(scope.id, scope.label); visit(scope.children); });
    visit(scopeTree);
    return labels;
  }, [scopeTree]);

  const scopeLabel = selectedScopeIds.length === 0
    ? 'All subjects and folders'
    : selectedScopeIds.length === 1
      ? scopeLabels.get(selectedScopeIds[0]) ?? '1 folder'
      : `${selectedScopeIds.length} selected`;

  const runSearch = async (scope = selectedScopeIds) => {
    const term = query.trim();
    if (!term) return;
    const requestId = ++requestRef.current;
    setStatus('loading');
    setResults([]);
    setError('');
    try {
      const index = loadedIndexRef.current ?? await loadPdfSearchIndex(getAssetUrl);
      loadedIndexRef.current = index;
      if (requestId !== requestRef.current) return;
      const matches = searchPdfPages(index, term, scope);
      setResults(matches);
      setStatus('done');
    } catch (searchError) {
      if (requestId !== requestRef.current) return;
      setError(searchError instanceof Error ? searchError.message : 'Search could not be completed.');
      setStatus('error');
    }
  };

  const toggleScope = (scope: SearchScope) => {
    let next: string[];
    if (!selectedScopeIds.length) {
      next = [scope.id];
    } else if (selectedScopeIds.includes(scope.id)) {
      next = selectedScopeIds.filter((id) => id !== scope.id);
    } else {
      const selectedAncestors = scope.ancestors.filter((id) => selectedScopeIds.includes(id));
      if (selectedAncestors.length) {
        const ancestorId = selectedAncestors[selectedAncestors.length - 1];
        const ancestor = findScope(scopeTree, ancestorId);
        const excludeIds = new Set(getIncludedScopeIds(scope));
        next = selectedScopeIds.filter((id) => !selectedAncestors.includes(id));
        if (ancestor) next.push(...getIncludedScopeIds(ancestor).filter((id) => !excludeIds.has(id)));
      } else {
        const descendants = new Set(getAllSelectionIds(scope).slice(1));
        const selectedDescendants = selectedScopeIds.some((id) => descendants.has(id));
        next = selectedDescendants
          ? [...selectedScopeIds.filter((id) => !descendants.has(id)), scope.id]
          : [...selectedScopeIds, scope.id];
      }
    }
    next = [...new Set(next)];
    setSelectedScopeIds(next);
    if (status === 'done' && query.trim()) void runSearch(next);
  };

  const renderScope = (scope: SearchScope, depth = 0): React.ReactNode => {
    const checked = isScopeChecked(scope, selectedScopeIds);
    const partial = isScopePartial(scope, selectedScopeIds);
    return (
      <React.Fragment key={scope.id}>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-white/[0.05]" style={{ paddingLeft: `${12 + depth * 18}px` }}>
          <input
            type="checkbox"
            checked={checked}
            ref={(element) => { if (element) element.indeterminate = partial; }}
            onChange={() => toggleScope(scope)}
            className="accent-blue-500"
          />
          <span className={`${depth === 0 ? 'text-sm font-medium text-neutral-100' : 'text-[13px] text-neutral-300'}`}>{scope.label}</span>
        </label>
        {scope.children.map((child) => renderScope(child, depth + 1))}
      </React.Fragment>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-14 backdrop-blur-sm sm:py-20"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-[0_30px_100px_rgba(0,0,0,.65)]">
        <div className="border-b border-white/[0.07] p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Search your library</h2>
              <p className="mt-1 text-sm text-neutral-400">Find a phrase on any page across your PDFs.</p>
            </div>
            <button onClick={onClose} aria-label="Close search" className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white">
              <X size={17} />
            </button>
          </div>

          <form
            onSubmit={(event) => { event.preventDefault(); void runSearch(); }}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#191919] px-4 py-3 focus-within:border-blue-500/60"
          >
            <Search size={17} className="shrink-0 text-neutral-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search text, a topic, or an exact phrase"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600"
            />
            {query && <button type="button" onClick={() => { setQuery(''); setResults([]); setStatus('idle'); }} aria-label="Clear query" className="text-neutral-500 hover:text-white"><X size={15} /></button>}
            <button
              type="submit"
              disabled={!query.trim() || status === 'loading'}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'loading' ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />}
              <span>Search PDFs</span>
            </button>
          </form>

          <div className="relative mt-3">
            <button
              onClick={() => setIsFilterOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]"
              aria-expanded={isFilterOpen}
            >
              <Filter size={13} />
              <span>{scopeLabel}</span>
              <ChevronDown size={13} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
            </button>

            {isFilterOpen && (
                <div className="absolute left-0 top-full z-20 mt-2 max-h-[55vh] w-72 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1a] p-2 shadow-xl">
                <button onClick={() => { setSelectedScopeIds([]); setIsFilterOpen(false); if (status === 'done') void runSearch([]); }} className="mb-1 w-full rounded-lg px-3 py-2 text-left text-xs text-blue-300 hover:bg-white/[0.05]">Search all subjects and folders</button>
                <div className="space-y-0.5">{scopeTree.map((scope) => renderScope(scope))}</div>
                <p className="px-3 pb-1 pt-2 text-[10px] text-neutral-600">No selection searches everything. Select a subject or folders to narrow results.</p>
              </div>
            )}
          </div>
        </div>

        <div className="max-h-[52vh] min-h-48 overflow-y-auto">
          {status === 'idle' && (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300"><Search size={19} /></div>
              <p className="text-sm font-medium text-neutral-300">Search across {allSearchablePdfCount} PDFs</p>
              <p className="mt-1 text-xs text-neutral-600">Results include the matching page and a text preview.</p>
            </div>
          )}
          {status === 'loading' && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-neutral-400">
              <LoaderCircle size={22} className="animate-spin text-blue-400" />
              <span className="text-sm">Preparing your library search…</span>
            </div>
          )}
          {status === 'error' && <p className="px-6 py-12 text-center text-sm text-red-300">{error}</p>}
          {status === 'done' && !results.length && (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-neutral-300">No matching pages found</p>
              <p className="mt-1 text-xs text-neutral-600">Try a shorter phrase or choose more subjects.</p>
            </div>
          )}
          {status === 'done' && results.length > 0 && (
            <div className="divide-y divide-white/[0.06]">
              <div className="px-5 py-3 text-xs text-neutral-500">Top {results.length} matching pages</div>
              {results.map((result) => {
                const file = allPdfs.find((pdf) => pdf.id === result.fileId);
                if (!file) return null;
                return (
                  <button
                    key={result.id}
                    onClick={() => { openPdf(file, result.page, query.trim()); onClose(); }}
                    className="group flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-white/[0.04]"
                  >
                    <FileText size={16} className="mt-0.5 shrink-0 text-blue-300/80" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-medium text-neutral-100"><HighlightedText text={result.title} query={query} /></span>
                        <span className="text-[11px] text-neutral-500">Page {result.page}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-neutral-500"><HighlightedText text={result.folder} query={query} /></span>
                      <span className="mt-2 block text-xs leading-relaxed text-neutral-400"><HighlightedText text={result.snippet} query={query} /></span>
                    </span>
                    <ChevronRight size={15} className="mt-1 shrink-0 text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-neutral-300" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-2.5 text-[10px] text-neutral-600">
          <span>Searches searchable text extracted from each PDF page.</span>
          <span>Esc to close</span>
        </div>
      </section>
    </div>
  );
};
