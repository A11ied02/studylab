import React, { useState, useEffect, useRef, useCallback } from 'react';
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

interface PageMeta { pageNum: number; width: number; height: number; }
interface TextRange { start: number; end: number; }
interface FindOccurrence extends TextRange { page: number; }

const EMPTY_RANGES: TextRange[] = [];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
          const matcher = new RegExp(escapeRegExp(query).replace(/\s+/g, '\\s+'), 'giu');
          return Array.from(text.matchAll(matcher), (match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
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
  onClose: () => void;
}> = ({
  file,
  initialPage = 1,
  initialSearchQuery = '',
  initialSearchPage = initialPage,
  onClose,
}) => {
  const { getAssetUrl } = useLibrary();
  const pdfUrl = getAssetUrl(file.path);

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
  const [findMatches, setFindMatches] = useState<FindOccurrence[]>([]);
  const [findPageRanges, setFindPageRanges] = useState<Map<number, TextRange[]>>(new Map());
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState('');
  const findInputRef = useRef<HTMLInputElement>(null);
  const findRequestId = useRef(0);

  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = getAssetUrl('pdf.worker.min.mjs');
  }, [getAssetUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const task = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
    });
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
    return () => { cancelled = true; task.destroy(); };
  }, [pdfUrl]);

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
    setFindQuery('');
    setFindMatches([]);
    setFindPageRanges(new Map());
    setFindError('');
  }, [file.id, initialPage]);

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

  const runDocumentFind = async (event: React.FormEvent) => {
    event.preventDefault();
    const term = findQuery.trim();
    if (!term) return;
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
      const matcher = new RegExp(escapeRegExp(term).replace(/\s+/g, '\\s+'), 'giu');
      const matches: FindOccurrence[] = [];
      const pageRanges = new Map<number, TextRange[]>();
      for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
        if (requestId !== findRequestId.current) return;
        const page = await pdfDoc.getPage(pageNumber);
        const content = await page.getTextContent();
        const textItems = content.items.filter((item): item is typeof item & { str: string } => 'str' in item && typeof item.str === 'string' && item.str.length > 0);
        const pageText = textItems.map((item) => item.str).join(' ');
        const ranges: TextRange[] = Array.from(pageText.matchAll(matcher), (match) => {
          const start = match.index ?? 0;
          return { start, end: start + match[0].length };
        });
        if (ranges.length) {
          pageRanges.set(pageNumber, ranges);
          ranges.forEach((range) => matches.push({ page: pageNumber, ...range }));
        }
      }
      if (requestId !== findRequestId.current) return;
      setFindPageRanges(pageRanges);
      setFindMatches(matches);
      if (matches.length) {
        setActiveFindIndex(0);
        setVisiblePages((previous) => new Set([...previous, matches[0].page, matches[0].page - 1, matches[0].page + 1]));
        window.setTimeout(() => scrollToPage(matches[0].page), 0);
      }
      else setFindError('No exact matches in this PDF.');
    } catch (error) {
      setFindError(error instanceof Error ? error.message : 'Could not search this PDF.');
    } finally {
      if (requestId === findRequestId.current) setFindLoading(false);
    }
  };

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
    const url = new URL(pdfUrl, window.location.href).toString();
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
            onChange={(event) => {
              findRequestId.current += 1;
              setFindQuery(event.target.value);
              setFindMatches([]);
              setFindPageRanges(new Map());
              setFindError('');
              setFindLoading(false);
            }}
            placeholder="Find in this PDF"
            aria-label="Find in this PDF"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-white outline-none placeholder:text-neutral-600"
          />
          {findMatches.length > 0 && <span className="shrink-0 text-[10px] text-neutral-500">{activeFindIndex + 1}/{findMatches.length}</span>}
          <button type="submit" aria-label="Search this PDF" disabled={findLoading || !findQuery.trim()} className="rounded-md p-1.5 text-blue-300 hover:bg-white/5 disabled:opacity-40">
            {findLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
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
          <div className="flex flex-col items-center gap-3 mt-24">
            <Loader2 size={24} className="text-accent animate-spin" />
            <p className="text-xs text-[#555]">Loading…</p>
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
