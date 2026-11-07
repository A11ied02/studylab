import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import {
  ArrowLeft, ZoomIn, ZoomOut, Columns,
  Maximize2, Minimize2, Download, Share2,
  Check, ChevronUp, ChevronDown, Loader2,
  Search, X,
} from 'lucide-react';
import { BookFile } from '../../types/library';
import { useLibrary } from '../../context/LibraryContext';
import { chanakyaToUnicode } from '../../services/chanakyaToUnicode';
import { findNormalizedTextRanges, parseCommaSeparatedKeywords } from '../../services/searchText';
import { getPdfDocumentTask, releasePdfDocumentTask } from '../../services/pdfDocument';

interface PageMeta { pageNum: number; width: number; height: number; }
interface TextRange { start: number; end: number; }
interface FindOccurrence extends TextRange { page: number; }

const EMPTY_RANGES: TextRange[] = [];

function highlightPdfText(container: HTMLElement, query: string, ranges: TextRange[] = []) {
  const spans = Array.from(container.querySelectorAll('span'));
  let pageOffset = 0;
  spans.forEach((span, spanIndex) => {
    const text = span.textContent ?? '';
    const spanStart = pageOffset;
    const spanEnd = spanStart + text.length;
    pageOffset = spanEnd + (spanIndex < spans.length - 1 ? 1 : 0);

    const highlights = ranges.length
      ? ranges
          .map((range) => ({
            start: Math.max(range.start, spanStart) - spanStart,
            end: Math.min(range.end, spanEnd) - spanStart,
          }))
          .filter((range) => range.end > range.start)
      : (() => {
          return findNormalizedTextRanges(text, query);
        })();
    if (!highlights.length) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    highlights.sort((a, b) => a.start - b.start).forEach(({ start, end }) => {
      if (start > cursor) fragment.append(document.createTextNode(text.slice(cursor, start)));
      const mark = document.createElement('mark');
      mark.className = 'pdf-find-highlight';
      mark.textContent = text.slice(Math.max(cursor, start), end);
      fragment.append(mark);
      cursor = end;
    });
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    span.replaceChildren(fragment);
  });
}

export const PdfViewer: React.FC<{
  file: BookFile;
  initialPage?: number;
  initialSearchQuery?: string;
  initialSearchPage?: number;
  initialMinKeywordMatches?: number;
  onRouteChange?: (page: number, query: string, minKeywordMatches: number) => void;
  onClose: () => void;
}> = ({
  file,
  initialPage = 1,
  initialSearchQuery = '',
  initialSearchPage = initialPage,
  initialMinKeywordMatches = 1,
  onRouteChange,
  onClose,
}) => {
  const { getAssetUrl } = useLibrary();
  const pdfUrl = getAssetUrl(file.path);
  const pdfWorkerUrl = getAssetUrl('pdf.worker.min.mjs');
  const isHindiPdf = file.rawPath.replace(/\\/g, '/').split('/')[0]?.toLowerCase() === 'hindi';

  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [shared, setShared] = useState(false);
  const [pagesMeta, setPagesMeta] = useState<PageMeta[]>([]);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1, 2]));
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [minKeywordMatches, setMinKeywordMatches] = useState(initialMinKeywordMatches);
  const [isKeywordSettingsOpen, setIsKeywordSettingsOpen] = useState(false);
  const [findMatches, setFindMatches] = useState<FindOccurrence[]>([]);
  const [findPageRanges, setFindPageRanges] = useState<Map<number, TextRange[]>>(new Map());
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState('');
  const findInputRef = useRef<HTMLInputElement>(null);
  const findRequestId = useRef(0);
  const keywordTerms = useMemo(() => parseCommaSeparatedKeywords(findQuery), [findQuery]);
  const keywordSignature = keywordTerms.join('\u0000');
  const previousKeywordSignatureRef = useRef(keywordSignature);

  useEffect(() => {
    if (previousKeywordSignatureRef.current === keywordSignature) return;
    previousKeywordSignatureRef.current = keywordSignature;
    const initialQueryIsActive = findQuery.trim() === initialSearchQuery.trim() && Boolean(initialSearchQuery.trim());
    setMinKeywordMatches(initialQueryIsActive ? initialMinKeywordMatches : Math.max(1, keywordTerms.length));
    setIsKeywordSettingsOpen(false);
  }, [keywordSignature, keywordTerms.length, findQuery, initialSearchQuery, initialMinKeywordMatches]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const task = getPdfDocumentTask(pdfUrl, pdfWorkerUrl);
    task.promise.then(async (doc) => {
      if (cancelled) return;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      const p = await doc.getPage(1);
      const vp = p.getViewport({ scale: 1 });
      setPagesMeta(Array.from({ length: doc.numPages }, (_, i) => ({
        pageNum: i + 1, width: vp.width, height: vp.height,
      })));
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) { setError(err.message || 'Failed to load PDF'); setLoading(false); }
    });
    return () => { cancelled = true; releasePdfDocumentTask(pdfUrl, task); };
  }, [pdfUrl, pdfWorkerUrl]);

  useEffect(() => {
    if (!containerRef.current || !pagesMeta.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const n = Number(e.target.getAttribute('data-page-num'));
          if (e.isIntersecting) {
            setVisiblePages((prev) => {
              const s = new Set(prev);
              s.add(n); if (n > 1) s.add(n - 1); if (n < numPages) s.add(n + 1);
              return s;
            });
            setCurrentPage(n);
          }
        });
      },
      { root: containerRef.current, rootMargin: '400px 0px', threshold: 0.1 }
    );
    containerRef.current.querySelectorAll('.pdf-page').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [pagesMeta, numPages]);

  useEffect(() => {
    if (!pdfDoc) return;
    const timeout = window.setTimeout(() => onRouteChange?.(currentPage, findQuery, minKeywordMatches), 180);
    return () => window.clearTimeout(timeout);
  }, [pdfDoc, currentPage, findQuery, minKeywordMatches, onRouteChange]);

  const handleFitWidth = useCallback(() => {
    if (!containerRef.current || !pagesMeta.length) return;
    const w = containerRef.current.clientWidth - 48;
    setScale(Number(Math.min(Math.max(w / pagesMeta[0].width, 0.5), 2.5).toFixed(2)));
  }, [pagesMeta]);

  useEffect(() => {
    if (pagesMeta.length && window.innerWidth < 768) handleFitWidth();
  }, [pagesMeta, handleFitWidth]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) { document.exitFullscreen().catch(() => {}); setFullscreen(false); }
        else onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); setScale((s) => Math.min(s + 0.15, 3)); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setScale((s) => Math.max(s - 0.15, 0.4)); }
      const target = e.target as HTMLElement | null;
      const isEditing = target?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target?.tagName ?? '');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !isEditing) {
        e.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => findInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [fullscreen, onClose]);

  const scrollToPage = (n: number) => {
    const p = Math.max(1, Math.min(n, numPages));
    containerRef.current?.querySelector(`[data-page-num="${p}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    findRequestId.current += 1;
    setCurrentPage(initialPage);
    setVisiblePages(new Set([initialPage, initialPage + 1]));
    setFindQuery(initialSearchQuery);
    setMinKeywordMatches(initialMinKeywordMatches);
    setIsKeywordSettingsOpen(false);
    setFindOpen(Boolean(initialSearchQuery.trim()));
    setFindMatches([]);
    setFindPageRanges(new Map());
    setFindError('');
  }, [file.id, initialPage, initialSearchQuery, initialMinKeywordMatches]);

  useEffect(() => {
    if (!pagesMeta.length || !containerRef.current) return;
    const target = Math.max(1, Math.min(initialPage, numPages));
    setVisiblePages((previous) => new Set([...previous, target, target - 1, target + 1]));
    window.setTimeout(() => scrollToPage(target), 80);
  }, [pagesMeta, initialPage, numPages]);

  const jumpToFindMatch = (index: number) => {
    if (!findMatches.length) return;
    const wrappedIndex = (index + findMatches.length) % findMatches.length;
    const match = findMatches[wrappedIndex];
    setActiveFindIndex(wrappedIndex);
    setVisiblePages((previous) => new Set([...previous, match.page, match.page - 1, match.page + 1]));
    scrollToPage(match.page);
  };

  const searchPages = useCallback(async (rawTerm: string, pageNumbers: number[], requiredKeywordMatches = 1) => {
    const term = rawTerm.trim();
    if (!term) return;
    if (isHindiPdf) {
      setFindError('Feature not available for this language.');
      return;
    }
    if (!pdfDoc) {
      setFindError('The PDF is still loading. Try again in a moment.');
      return;
    }
    const requestId = ++findRequestId.current;
    setFindLoading(true);
    setFindError('');
    setFindMatches([]);
    setFindPageRanges(new Map());
    try {
      const matches: FindOccurrence[] = [];
      const pageRanges = new Map<number, TextRange[]>();
      const keywords = parseCommaSeparatedKeywords(term);
      for (const pageNumber of pageNumbers) {
        if (requestId !== findRequestId.current) return;
        const page = await pdfDoc.getPage(pageNumber);
        const content = await page.getTextContent();
        const textItems = content.items.filter((item): item is typeof item & { str: string } => 'str' in item && typeof item.str === 'string' && item.str.length > 0);
        const pageText = textItems.map((item) => item.str).join(' ');
        const keywordRanges = keywords.map((keyword) => findNormalizedTextRanges(pageText, keyword));
        if (keywords.length > 1 && keywordRanges.filter((ranges) => ranges.length > 0).length < Math.min(keywords.length, requiredKeywordMatches)) continue;
        const foundRanges = (keywords.length ? keywordRanges.flat() : findNormalizedTextRanges(pageText, term))
          .sort((a, b) => a.start - b.start || a.end - b.end);
        const ranges = foundRanges.reduce<TextRange[]>((merged, range) => {
          const previous = merged[merged.length - 1];
          if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
          else merged.push({ ...range });
          return merged;
        }, []);
        if (ranges.length) {
          pageRanges.set(pageNumber, ranges);
          ranges.forEach((range) => matches.push({ page: pageNumber, ...range }));
        }
      }
      if (requestId !== findRequestId.current) return;
      setFindPageRanges(pageRanges);
      setFindMatches(matches);
      if (matches.length) {
        const preferredIndex = matches.findIndex((match) => match.page === initialSearchPage);
        const firstMatchIndex = preferredIndex >= 0 ? preferredIndex : 0;
        const firstMatch = matches[firstMatchIndex];
        setActiveFindIndex(firstMatchIndex);
        setVisiblePages((previous) => new Set([...previous, firstMatch.page, firstMatch.page - 1, firstMatch.page + 1]));
        window.setTimeout(() => scrollToPage(firstMatch.page), 0);
      }
      else setFindError('No matches found in this PDF.');
    } catch (error) {
      setFindError(error instanceof Error ? error.message : 'Could not search this PDF.');
    } finally {
      if (requestId === findRequestId.current) setFindLoading(false);
    }
  }, [pdfDoc, initialSearchPage, isHindiPdf]);

  const runDocumentFind = (event: React.FormEvent) => {
    event.preventDefault();
    if (isHindiPdf) {
      setFindError('Feature not available for this language.');
      return;
    }
    if (findQuery.trim()) void searchPages(findQuery, Array.from({ length: pdfDoc?.numPages ?? 0 }, (_, index) => index + 1), minKeywordMatches);
  };

  useEffect(() => {
    if (isHindiPdf) {
      if (initialSearchQuery.trim()) {
        setFindOpen(true);
        setFindQuery(initialSearchQuery);
      }
      setFindError('Feature not available for this language.');
      return;
    }
    if (!pdfDoc || !initialSearchQuery.trim()) return;
    setFindOpen(true);
    setFindQuery(initialSearchQuery);
    void searchPages(initialSearchQuery, [Math.max(1, Math.min(initialSearchPage, pdfDoc.numPages))], initialMinKeywordMatches);
    window.setTimeout(() => findInputRef.current?.focus(), 0);
  }, [pdfDoc, file.id, initialSearchQuery, initialSearchPage, initialMinKeywordMatches, searchPages, isHindiPdf]);

  const handlePdfCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (file.rawPath.replace(/\\/g, '/').split('/')[0]?.toLocaleLowerCase() !== 'hindi') return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !event.clipboardData) return;

    const selectedText = selection.toString();
    const fragment = selection.getRangeAt(0).cloneContents();
    const legacyRuns = Array.from(fragment.querySelectorAll<HTMLElement>('[data-legacy-hindi-font="chanakya"]'))
      .map((element) => element.textContent ?? '')
      .filter(Boolean);
    if (!legacyRuns.length) return;

    let copiedText = selectedText;
    let searchFrom = 0;
    for (const encodedRun of legacyRuns) {
      const offset = copiedText.indexOf(encodedRun, searchFrom);
      if (offset < 0) continue;
      const unicodeRun = chanakyaToUnicode(encodedRun);
      copiedText = `${copiedText.slice(0, offset)}${unicodeRun}${copiedText.slice(offset + encodedRun.length)}`;
      searchFrom = offset + unicodeRun.length;
    }

    event.clipboardData.setData('text/plain', copiedText);
    event.preventDefault();
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = pdfUrl; a.download = file.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: file.title, url }); return; } catch {}
    }
    navigator.clipboard.writeText(url).then(() => {
      setShared(true); setTimeout(() => setShared(false), 2000);
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]" onCopy={handlePdfCopy}>
      {/* Minimal toolbar */}
      <div className="h-12 bg-[#111111] border-b border-white/[0.07] flex items-center px-4 gap-3 shrink-0">
        {/* Back */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#f0f0f0] transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline text-xs">Back</span>
        </button>

        <button
          onClick={() => {
            if (isHindiPdf) {
              setFindOpen(true);
              setFindError('Feature not available for this language.');
              return;
            }
            setFindOpen((open) => !open);
            if (!findOpen) window.setTimeout(() => findInputRef.current?.focus(), 0);
          }}
          title="Find in this PDF"
          aria-label="Find in this PDF"
          className={`rounded-md p-1.5 transition-colors ${findOpen ? 'bg-blue-500/15 text-blue-300' : 'text-[#888] hover:bg-white/5 hover:text-[#f0f0f0]'}`}
        >
          <Search size={15} />
        </button>

        <span className="h-4 w-px bg-white/10" />

        {/* Title */}
        <span className="text-xs text-[#f0f0f0] truncate flex-1 font-medium" title={file.title}>
          {file.title}
        </span>

        {/* Page counter + nav */}
        <div className="flex items-center gap-0.5 bg-white/5 rounded-lg px-1 py-0.5">
          <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1}
            className="p-1 text-[#888] hover:text-[#f0f0f0] disabled:opacity-30">
            <ChevronUp size={13} />
          </button>
          <span className="text-[11px] font-mono text-[#888] px-1 min-w-[52px] text-center">
            {currentPage} / {numPages || 1}
          </span>
          <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= numPages}
            className="p-1 text-[#888] hover:text-[#f0f0f0] disabled:opacity-30">
            <ChevronDown size={13} />
          </button>
        </div>

        <span className="h-4 w-px bg-white/10" />

        {/* Zoom */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setScale((s) => Math.max(s - 0.15, 0.4))}
            className="p-1.5 text-[#888] hover:text-[#f0f0f0] rounded">
            <ZoomOut size={14} />
          </button>
          <span className="text-[11px] font-mono text-[#888] w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale((s) => Math.min(s + 0.15, 3))}
            className="p-1.5 text-[#888] hover:text-[#f0f0f0] rounded">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleFitWidth} title="Fit width"
            className="p-1.5 text-[#888] hover:text-[#f0f0f0] rounded hidden sm:block">
            <Columns size={14} />
          </button>
        </div>

        <span className="h-4 w-px bg-white/10" />

        {/* Actions */}
        <button onClick={handleShare}
          className={`p-1.5 rounded transition-colors ${shared ? 'text-emerald-400' : 'text-[#888] hover:text-[#f0f0f0]'}`}>
          {shared ? <Check size={14} /> : <Share2 size={14} />}
        </button>
        <button onClick={handleDownload} className="p-1.5 text-[#888] hover:text-[#f0f0f0] rounded">
          <Download size={14} />
        </button>
        <button onClick={toggleFullscreen} className="p-1.5 text-[#888] hover:text-[#f0f0f0] rounded hidden md:block">
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {findOpen && (
        <form onSubmit={runDocumentFind} className="absolute left-4 top-14 z-30 flex w-[min(25rem,calc(100vw-2rem))] items-center gap-2 rounded-xl border border-white/10 bg-[#171717] p-2 shadow-xl">
          <Search size={15} className="ml-1 shrink-0 text-neutral-500" />
          <input
            ref={findInputRef}
            value={findQuery}
            disabled={isHindiPdf}
            onChange={(event) => {
              const nextQuery = event.target.value;
              findRequestId.current += 1;
              setFindQuery(nextQuery);
              setFindMatches([]);
              setFindPageRanges(new Map());
              setFindError('');
              setFindLoading(false);
              onRouteChange?.(currentPage, nextQuery, minKeywordMatches);
            }}
            placeholder="Find in this PDF"
            aria-label="Find in this PDF"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-white outline-none placeholder:text-neutral-600"
          />
          {findMatches.length > 0 && <span className="shrink-0 text-[10px] text-neutral-500">{activeFindIndex + 1}/{findMatches.length}</span>}
          <button type="submit" aria-label="Search this PDF" disabled={isHindiPdf || findLoading || !findQuery.trim()} className="rounded-md p-1.5 text-blue-300 hover:bg-white/5 disabled:opacity-40">
            {findLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
          {keywordTerms.length > 1 && !isHindiPdf && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsKeywordSettingsOpen((open) => !open)}
                aria-label="Set keyword match threshold"
                aria-expanded={isKeywordSettingsOpen}
                className={`flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-bold ${isKeywordSettingsOpen ? 'border-blue-400/40 bg-blue-500/15 text-blue-200' : 'border-white/10 text-neutral-300 hover:bg-white/5'}`}
              >K</button>
              {isKeywordSettingsOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/10 bg-[#1a1a1a] p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-neutral-200">Keywords that must match</span>
                    <span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-blue-200">{Math.min(minKeywordMatches, keywordTerms.length)} / {keywordTerms.length}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={keywordTerms.length}
                    value={Math.min(minKeywordMatches, keywordTerms.length)}
                    onChange={(event) => {
                      const nextMinimum = Number(event.target.value);
                      setMinKeywordMatches(nextMinimum);
                      onRouteChange?.(currentPage, findQuery, nextMinimum);
                      void searchPages(findQuery, Array.from({ length: pdfDoc?.numPages ?? 0 }, (_, index) => index + 1), nextMinimum);
                    }}
                    aria-label="Minimum matching keywords"
                    className="w-full accent-blue-500"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-neutral-500"><span>1 keyword</span><span>All {keywordTerms.length}</span></div>
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => jumpToFindMatch(activeFindIndex - 1)} disabled={!findMatches.length} aria-label="Previous match" className="rounded-md p-1.5 text-neutral-400 hover:bg-white/5 disabled:opacity-30"><ChevronUp size={14} /></button>
          <button type="button" onClick={() => jumpToFindMatch(activeFindIndex + 1)} disabled={!findMatches.length} aria-label="Next match" className="rounded-md p-1.5 text-neutral-400 hover:bg-white/5 disabled:opacity-30"><ChevronDown size={14} /></button>
          <button type="button" onClick={() => setFindOpen(false)} aria-label="Close find" className="rounded-md p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"><X size={14} /></button>
          {findError && <span className="absolute left-3 top-full mt-2 rounded-md bg-[#171717] px-2 py-1 text-[10px] text-neutral-400">{findError}</span>}
        </form>
      )}

      {/* PDF canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-auto flex flex-col items-center gap-4 py-6 px-4 select-text"
      >
        {loading && (
          <div className="w-full max-w-[42rem] animate-pulse px-1" role="status" aria-label="Loading PDF page">
            <div className="relative mx-auto aspect-[0.74] w-full overflow-hidden rounded-sm bg-[#f4f4f5] p-8 shadow-[0_8px_36px_rgba(0,0,0,.35)] sm:p-12">
              <div className="mb-10 h-5 w-2/5 rounded bg-neutral-200" />
              <div className="space-y-3">
                <div className="h-2.5 w-full rounded bg-neutral-200" />
                <div className="h-2.5 w-[94%] rounded bg-neutral-200" />
                <div className="h-2.5 w-[97%] rounded bg-neutral-200" />
                <div className="h-2.5 w-[83%] rounded bg-neutral-200" />
                <div className="mt-7 h-32 rounded-lg bg-neutral-200/80" />
                <div className="h-2.5 w-full rounded bg-neutral-200" />
                <div className="h-2.5 w-[89%] rounded bg-neutral-200" />
                <div className="h-2.5 w-[95%] rounded bg-neutral-200" />
                <div className="h-2.5 w-[68%] rounded bg-neutral-200" />
              </div>
              <div className="absolute bottom-5 left-0 right-0 text-center text-[11px] font-medium text-neutral-400">Preparing PDF…</div>
            </div>
          </div>
        )}
        {error && (
          <div className="text-center mt-24 space-y-2">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={handleDownload}
              className="px-3 py-1.5 text-xs text-[#f0f0f0] bg-bg-surface rounded-lg">
              Download PDF
            </button>
          </div>
        )}
        {pdfDoc && pagesMeta.map((meta) => {
          const isFindMatch = findMatches.some((match) => match.page === meta.pageNum);
          const isInitialSearchMatch = Boolean(initialSearchQuery.trim()) && meta.pageNum === initialSearchPage;
          return (
            <PdfPage
              key={meta.pageNum}
              pdfDoc={pdfDoc}
              pageNum={meta.pageNum}
              scale={scale}
              width={meta.width}
              height={meta.height}
              isVisible={visiblePages.has(meta.pageNum)}
              isSearchMatch={isFindMatch || isInitialSearchMatch}
              searchTerm={isFindMatch ? findQuery : isInitialSearchMatch ? initialSearchQuery : ''}
              matchRanges={findPageRanges.get(meta.pageNum) ?? EMPTY_RANGES}
            />
          );
        })}
      </div>
    </div>
  );
};

/* ─── Individual page renderer ─── */
const PdfPage: React.FC<{
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  scale: number;
  width: number;
  height: number;
  isVisible: boolean;
  isSearchMatch: boolean;
  searchTerm: string;
  matchRanges: TextRange[];
}> = ({ pdfDoc, pageNum, scale, width, height, isVisible, isSearchMatch, searchTerm, matchRanges }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;

    async function render() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;

        if (taskRef.current) taskRef.current.cancel();
        const renderCtx: any = {
          canvasContext: ctx,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          viewport: vp,
        };
        taskRef.current = page.render(renderCtx);
        await taskRef.current.promise;
        if (cancelled) return;

        if (textRef.current) {
          textRef.current.innerHTML = '';
          textRef.current.style.width = `${Math.floor(vp.width)}px`;
          textRef.current.style.height = `${Math.floor(vp.height)}px`;
          textRef.current.style.setProperty('--scale-factor', `${scale}`);
          const tc = await page.getTextContent();
          if (cancelled) return;
          const tl = new pdfjsLib.TextLayer({ textContentSource: tc, container: textRef.current, viewport: vp });
          await tl.render();
          if (typeof page.commonObjs?.get === 'function') {
            const spans = Array.from(textRef.current.querySelectorAll('span'));
            let spanIndex = 0;
            for (const item of tc.items) {
              if (!('str' in item) || !item.str) continue;
              const span = spans[spanIndex++];
              if (!span) continue;
              try {
                const font = page.commonObjs.get(item.fontName) as { name?: string };
                if (font.name && /(?:walkman[- ]?chanakya|chanakya)/i.test(font.name)) {
                  span.dataset.legacyHindiFont = 'chanakya';
                }
              } catch {
                // Fonts can be unresolved for hidden or malformed text runs.
              }
            }
          }
          if (isSearchMatch && searchTerm) highlightPdfText(textRef.current, searchTerm, matchRanges);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') console.warn(err);
      }
    }
    render();
    return () => {
      cancelled = true;
      taskRef.current?.cancel();
    };
  }, [pdfDoc, pageNum, scale, isVisible, isSearchMatch, searchTerm, matchRanges]);

  const displayW = Math.round(width * scale);
  const displayH = Math.round(height * scale);

  return (
    <div
      data-page-num={pageNum}
      className={`pdf-page relative shadow-[0_4px_24px_rgba(0,0,0,0.6)] rounded-sm bg-white overflow-hidden ${isSearchMatch ? 'ring-2 ring-blue-400' : ''}`}
      style={{ width: displayW, minHeight: displayH }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div ref={textRef} className="textLayer absolute inset-0 select-text" />
    </div>
  );
};
