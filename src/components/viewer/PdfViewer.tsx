import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
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
import { findSearchTextRanges, parseCommaSeparatedKeywords } from '../../services/searchText';
import { getPdfDocumentTask, releasePdfDocumentTask } from '../../services/pdfDocument';

interface PageMeta { pageNum: number; width: number; height: number; }
interface TextRange { start: number; end: number; }
interface FindOccurrence extends TextRange { page: number; }
interface VisualTextItem { text: string; spanIndex: number; x: number; y: number; height: number; }
interface ZoomAnchor {
  pageNum: number;
  pageRatioX: number;
  pageRatioY: number;
  viewportX: number;
  viewportY: number;
  startScrollLeft: number;
  startScrollTop: number;
  baseLeft: number;
  baseTop: number;
  baseWidth: number;
  baseHeight: number;
  containerLeft: number;
  containerTop: number;
}
type PdfTextContent = Awaited<ReturnType<pdfjsLib.PDFPageProxy['getTextContent']>>;

const EMPTY_RANGES: TextRange[] = [];

function getVisualTextItems(page: pdfjsLib.PDFPageProxy, content: PdfTextContent): VisualTextItem[] {
  const viewport = page.getViewport({ scale: 1 });
  let spanIndex = 0;
  const items = content.items.flatMap((item) => {
    if (!('str' in item) || typeof item.str !== 'string' || !item.str.length) return [];
    const transform = item.transform;
    const [x, y] = viewport.convertToViewportPoint(transform[4], transform[5]);
    const height = Math.max(1, Math.hypot(transform[2], transform[3]));
    const visualItem = { text: item.str, spanIndex, x, y, height };
    spanIndex += 1;
    return [visualItem];
  }).sort((a, b) => a.y - b.y || a.x - b.x || a.spanIndex - b.spanIndex);

  const lines: { y: number; height: number; items: VisualTextItem[] }[] = [];
  for (const item of items) {
    const line = lines[lines.length - 1];
    const tolerance = line ? Math.max(2, Math.min(line.height, item.height) * 0.45) : 0;
    if (!line || Math.abs(item.y - line.y) > tolerance) {
      lines.push({ y: item.y, height: item.height, items: [item] });
    } else {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
      line.height = Math.max(line.height, item.height);
    }
  }

  return lines.flatMap((line) => line.items.sort((a, b) => a.x - b.x || a.spanIndex - b.spanIndex));
}

function highlightPdfText(container: HTMLElement, query: string, minMatches: number, activeRange?: TextRange): number {
  // PDF.js nests text spans inside marked-content wrapper spans; only count the actual text spans.
  const spans = Array.from(container.querySelectorAll<HTMLSpanElement>('span[data-pdf-find-order]'))
    .sort((a, b) => Number(a.dataset.pdfFindOrder) - Number(b.dataset.pdfFindOrder));
  const pageText = spans.map((span) => span.textContent ?? '').join(' ');
  const sortedRanges = findSearchTextRanges(pageText, query, minMatches);
  let pageOffset = 0;
  let firstRangeIndex = 0;
  spans.forEach((span, spanIndex) => {
    const text = span.textContent ?? '';
    const spanStart = pageOffset;
    const spanEnd = spanStart + text.length;
    pageOffset = spanEnd + (spanIndex < spans.length - 1 ? 1 : 0);

    while (firstRangeIndex < sortedRanges.length && sortedRanges[firstRangeIndex].end <= spanStart) firstRangeIndex += 1;
    const highlights: TextRange[] = [];
    for (let rangeIndex = firstRangeIndex; rangeIndex < sortedRanges.length && sortedRanges[rangeIndex].start < spanEnd; rangeIndex += 1) {
      const range = sortedRanges[rangeIndex];
      const start = Math.max(range.start, spanStart) - spanStart;
      const end = Math.min(range.end, spanEnd) - spanStart;
      if (end > start) highlights.push({ start, end });
    }
    if (!highlights.length) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    highlights.sort((a, b) => a.start - b.start).forEach(({ start, end }) => {
      if (start > cursor) fragment.append(document.createTextNode(text.slice(cursor, start)));
      const mark = document.createElement('mark');
      const absoluteStart = spanStart + start;
      const absoluteEnd = spanStart + end;
      const isActive = activeRange && absoluteStart < activeRange.end && absoluteEnd > activeRange.start;
      mark.className = `pdf-find-highlight${isActive ? ' pdf-find-highlight-active' : ''}`;
      mark.textContent = text.slice(Math.max(cursor, start), end);
      fragment.append(mark);
      cursor = end;
    });
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    span.replaceChildren(fragment);
  });
  return sortedRanges.length;
}

export const PdfViewer: React.FC<{
  file: BookFile;
  initialPage?: number;
  initialSearchQuery?: string;
  initialSearchPage?: number;
  initialMinKeywordMatches?: number;
  initialSearchRanges?: TextRange[];
  spotlightInitialSearch?: boolean;
  onRouteChange?: (page: number, query: string, minKeywordMatches: number) => void;
  onClose: () => void;
}> = ({
  file,
  initialPage = 1,
  initialSearchQuery = '',
  initialSearchPage = initialPage,
  initialMinKeywordMatches = 1,
  initialSearchRanges = EMPTY_RANGES,
  spotlightInitialSearch = false,
  onRouteChange,
  onClose,
}) => {
  const { getAssetUrl } = useLibrary();
  const pdfUrl = getAssetUrl(file.path);
  const pdfWorkerUrl = getAssetUrl('pdf.worker.min.mjs');
  const isHindiPdf = file.rawPath.replace(/\\/g, '/').split('/')[0]?.toLowerCase() === 'hindi';

  const containerRef = useRef<HTMLDivElement>(null);
  const zoomFrameRef = useRef<HTMLDivElement>(null);
  const pageStackRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);
  const currentPageRef = useRef(initialPage);
  const numPagesRef = useRef(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [renderScale, setRenderScale] = useState(1.2);
  const scaleRef = useRef(1.2);
  const renderScaleRef = useRef(renderScale);
  renderScaleRef.current = renderScale;
  const zoomCommitTimerRef = useRef<number | null>(null);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const zoomLayoutRef = useRef({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [shared, setShared] = useState(false);
  const [pagesMeta, setPagesMeta] = useState<PageMeta[]>([]);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set(initialSearchQuery.trim() ? [initialPage] : [1, 2]));
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [initialSearchDismissed, setInitialSearchDismissed] = useState(false);
  const [minKeywordMatches, setMinKeywordMatches] = useState(initialMinKeywordMatches);
  const [isKeywordSettingsOpen, setIsKeywordSettingsOpen] = useState(false);
  const [findMatches, setFindMatches] = useState<FindOccurrence[]>([]);
  const [findPageRanges, setFindPageRanges] = useState<Map<number, TextRange[]>>(new Map());
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState('');
  const [spotlightPhase, setSpotlightPhase] = useState<'hidden' | 'active' | 'fading'>('hidden');
  const findInputRef = useRef<HTMLInputElement>(null);
  const findRequestId = useRef(0);
  const spotlightTargetPageRef = useRef<number | null>(null);
  const spotlightArmedRef = useRef(false);
  const spotlightStartedRef = useRef(false);
  const spotlightTimersRef = useRef<number[]>([]);
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);
  const keywordTerms = useMemo(() => parseCommaSeparatedKeywords(findQuery), [findQuery]);
  const keywordSignature = keywordTerms.join('\u0000');
  const previousKeywordSignatureRef = useRef(keywordSignature);

  const syncZoomLayout = useCallback((ratio = scaleRef.current / renderScaleRef.current) => {
    const container = containerRef.current;
    const frame = zoomFrameRef.current;
    const stack = pageStackRef.current;
    if (!container || !frame || !stack) return;
    const safeRatio = Math.max(0.4 / renderScaleRef.current, Math.min(3 / renderScaleRef.current, ratio));
    const pagesWidth = pagesMeta.reduce((largest, page) => Math.max(largest, page.width * renderScaleRef.current), 0);
    const pagesHeight = pagesMeta.reduce((total, page) => total + page.height * renderScaleRef.current, 0);
    const baseWidth = Math.max(container.clientWidth, pagesWidth + 32);
    const baseHeight = pagesMeta.length ? pagesHeight + Math.max(0, pagesMeta.length - 1) * 16 + 48 : stack.offsetHeight;
    zoomLayoutRef.current = { width: baseWidth, height: Math.max(1, baseHeight) };
    stack.style.boxSizing = 'border-box';
    stack.style.width = `${baseWidth}px`;
    stack.style.left = '0px';
    frame.style.width = `${Math.max(container.clientWidth, baseWidth * safeRatio)}px`;
    frame.style.height = `${Math.max(1, baseHeight * safeRatio)}px`;
    stack.style.transformOrigin = 'top left';
    stack.style.transform = `scale(${safeRatio})`;
  }, [pagesMeta]);

  const createZoomAnchor = useCallback((x: number, y: number): ZoomAnchor | null => {
    const container = containerRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const page = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.pdf-page')
      ?? container.querySelector<HTMLElement>(`[data-page-num="${currentPageRef.current}"]`)
      ?? container.querySelector<HTMLElement>('.pdf-page');
    if (!page) return null;
    const pageRect = page.getBoundingClientRect();
    const pageNum = Number(page.dataset.pageNum);
    const pageMeta = pagesMeta[pageNum - 1];
    if (!pageMeta || !pageRect.width || !pageRect.height) return null;
    const baseWidth = pageMeta.width * renderScaleRef.current;
    const baseHeight = pageMeta.height * renderScaleRef.current;
    const stackWidth = zoomLayoutRef.current.width || container.clientWidth;
    const viewportX = x - containerRect.left;
    const viewportY = y - containerRect.top;
    return {
      pageNum,
      pageRatioX: Math.max(0, Math.min(1, (x - pageRect.left) / pageRect.width)),
      pageRatioY: Math.max(0, Math.min(1, (y - pageRect.top) / pageRect.height)),
      viewportX,
      viewportY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
      baseLeft: (stackWidth - baseWidth) / 2,
      baseTop: 24 + (pageNum - 1) * (baseHeight + 16),
      baseWidth,
      baseHeight,
      containerLeft: containerRect.left,
      containerTop: containerRect.top,
    };
  }, [pagesMeta]);

  const commitZoomScale = useCallback(() => {
    if (zoomCommitTimerRef.current !== null) window.clearTimeout(zoomCommitTimerRef.current);
    zoomCommitTimerRef.current = null;
    const nextScale = scaleRef.current;
    renderScaleRef.current = nextScale;
    setRenderScale((previous) => previous === nextScale ? previous : nextScale);
  }, []);

  const updateZoomScale = useCallback((value: number, commitImmediately = false, anchorPoint?: { x: number; y: number }) => {
    const nextScale = Number(Math.max(0.4, Math.min(3, value)).toFixed(2));
    const container = containerRef.current;
    const existingAnchor = anchorPoint ? zoomAnchorRef.current : null;
    const containerRect = anchorPoint && existingAnchor ? null : container?.getBoundingClientRect();
    const anchorX = anchorPoint?.x ?? (containerRect ? containerRect.left + (container?.clientWidth ?? 0) / 2 : 0);
    const anchorY = anchorPoint?.y ?? (containerRect ? containerRect.top + (container?.clientHeight ?? 0) / 2 : 0);
    if (anchorPoint) {
      const anchor = existingAnchor ?? createZoomAnchor(anchorX, anchorY);
      if (anchor) zoomAnchorRef.current = { ...anchor, viewportX: anchorX - anchor.containerLeft, viewportY: anchorY - anchor.containerTop };
    } else {
      zoomAnchorRef.current = createZoomAnchor(anchorX, anchorY);
    }
    scaleRef.current = nextScale;
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(nextScale * 100)}%`;
    if (zoomCommitTimerRef.current !== null) window.clearTimeout(zoomCommitTimerRef.current);
    if (commitImmediately) {
      commitZoomScale();
      return;
    }
    const ratio = nextScale / renderScaleRef.current;
    const stack = pageStackRef.current;
    if (stack) {
      const anchor = zoomAnchorRef.current;
      if (anchor) {
        const originX = anchor.baseLeft + anchor.pageRatioX * anchor.baseWidth;
        const originY = anchor.baseTop + anchor.pageRatioY * anchor.baseHeight;
        const translateX = anchor.startScrollLeft + anchor.viewportX - originX;
        const translateY = anchor.startScrollTop + anchor.viewportY - originY;
        stack.style.transformOrigin = `${originX}px ${originY}px`;
        stack.style.transform = `translate(${translateX}px, ${translateY}px) scale(${ratio})`;
      }
    }
    zoomCommitTimerRef.current = window.setTimeout(() => {
      // A slow device may deliver pinch events less often than the debounce interval.
      // Keep the PDF canvas untouched until the gesture ends in that case.
      if (!pinchStartRef.current) commitZoomScale();
    }, 140);
  }, [commitZoomScale, createZoomAnchor]);

  useLayoutEffect(() => {
    syncZoomLayout(scaleRef.current / renderScale);
    const anchor = zoomAnchorRef.current;
    const container = containerRef.current;
    if (anchor && container) {
      const page = container.querySelector<HTMLElement>(`[data-page-num="${anchor.pageNum}"]`);
      if (page) {
        const pageRect = page.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        container.scrollLeft += pageRect.left - containerRect.left + anchor.pageRatioX * pageRect.width - anchor.viewportX;
        container.scrollTop += pageRect.top - containerRect.top + anchor.pageRatioY * pageRect.height - anchor.viewportY;
      }
      zoomAnchorRef.current = null;
    }
  }, [pagesMeta, renderScale, syncZoomLayout]);

  useEffect(() => () => {
    if (zoomCommitTimerRef.current !== null) window.clearTimeout(zoomCommitTimerRef.current);
  }, []);

  const startSearchSpotlight = useCallback(() => {
    if (spotlightStartedRef.current) return;
    spotlightStartedRef.current = true;
    spotlightTimersRef.current.forEach(window.clearTimeout);
    setSpotlightPhase('active');
    const fadeTimer = window.setTimeout(() => setSpotlightPhase('fading'), 2400);
    const hideTimer = window.setTimeout(() => setSpotlightPhase('hidden'), 3200);
    spotlightTimersRef.current = [fadeTimer, hideTimer];
  }, []);

  const handleSearchHighlightReady = useCallback((pageNum: number) => {
    if (pageNum !== spotlightTargetPageRef.current) return;
    spotlightTargetPageRef.current = null;
    startSearchSpotlight();
  }, [startSearchSpotlight]);

  useEffect(() => () => {
    spotlightTimersRef.current.forEach(window.clearTimeout);
    spotlightTimersRef.current = [];
  }, []);

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
      numPagesRef.current = doc.numPages;
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

  const updateCurrentPageFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const anchorY = containerTop + Math.min(120, container.clientHeight * 0.25);
    const pages = Array.from(container.querySelectorAll<HTMLElement>('.pdf-page'));
    let pageAtAnchor = pages[0];
    for (const page of pages) {
      if (page.getBoundingClientRect().top <= anchorY) pageAtAnchor = page;
      else break;
    }
    const pageNum = Number(pageAtAnchor?.dataset.pageNum);
    if (!Number.isInteger(pageNum) || pageNum < 1) return;
    currentPageRef.current = pageNum;
    setCurrentPage((previous) => previous === pageNum ? previous : pageNum);
    const maxPage = numPagesRef.current || pages.length;
    const nextVisiblePages = new Set([pageNum - 2, pageNum - 1, pageNum, pageNum + 1, pageNum + 2]
      .filter((page) => page >= 1 && page <= maxPage));
    setVisiblePages((previous) => {
      if (previous.size === nextVisiblePages.size && [...previous].every((page) => nextVisiblePages.has(page))) return previous;
      return nextVisiblePages;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const handleScroll = () => {
      if (pinchStartRef.current) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (pinchStartRef.current) return;
        updateCurrentPageFromScroll();
      });
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pagesMeta, updateCurrentPageFromScroll]);

  useEffect(() => {
    if (!pdfDoc) return;
    const timeout = window.setTimeout(() => onRouteChange?.(currentPage, findQuery, minKeywordMatches), 180);
    return () => window.clearTimeout(timeout);
  }, [pdfDoc, currentPage, findQuery, minKeywordMatches, onRouteChange]);

  const handleFitWidth = useCallback(() => {
    if (!containerRef.current || !pagesMeta.length) return;
    const w = containerRef.current.clientWidth - 48;
    updateZoomScale(Math.min(Math.max(w / pagesMeta[0].width, 0.5), 2.5), true);
  }, [pagesMeta, updateZoomScale]);

  useEffect(() => {
    if (pagesMeta.length && window.innerWidth < 768) handleFitWidth();
  }, [pagesMeta, handleFitWidth]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) handleFitWidth();
      else syncZoomLayout(scaleRef.current / renderScaleRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleFitWidth, syncZoomLayout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const distance = getDistance(event.touches);
      if (distance > 0) {
        pinchStartRef.current = { distance, scale: scaleRef.current };
        const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const midpointY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        zoomAnchorRef.current = createZoomAnchor(midpointX, midpointY);
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchStartRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const midpointY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      const nextScale = Math.max(0.4, Math.min(3, pinch.scale * getDistance(event.touches) / pinch.distance));
      updateZoomScale(nextScale, false, { x: midpointX, y: midpointY });
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2 && pinchStartRef.current) {
        pinchStartRef.current = null;
        commitZoomScale();
        window.requestAnimationFrame(updateCurrentPageFromScroll);
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [commitZoomScale, createZoomAnchor, updateCurrentPageFromScroll, updateZoomScale]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) { document.exitFullscreen().catch(() => {}); setFullscreen(false); }
        else onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); updateZoomScale(scaleRef.current + 0.15); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); updateZoomScale(scaleRef.current - 0.15); }
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
  }, [fullscreen, onClose, updateZoomScale]);

  const scrollToPage = useCallback((n: number) => {
    const maxPage = numPagesRef.current || 1;
    const p = Math.max(1, Math.min(n, maxPage));
    currentPageRef.current = p;
    setCurrentPage((previous) => previous === p ? previous : p);
    setVisiblePages(new Set([p - 2, p - 1, p, p + 1, p + 2].filter((page) => page >= 1 && page <= maxPage)));
    containerRef.current?.querySelector(`[data-page-num="${p}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    findRequestId.current += 1;
    currentPageRef.current = initialPage;
    setCurrentPage(initialPage);
    setVisiblePages(new Set(initialSearchQuery.trim() ? [initialPage] : [initialPage, initialPage + 1]));
    setFindQuery(initialSearchQuery);
    setInitialSearchDismissed(false);
    setMinKeywordMatches(initialMinKeywordMatches);
    setIsKeywordSettingsOpen(false);
    setFindOpen(Boolean(initialSearchQuery.trim()));
    setFindMatches([]);
    setFindPageRanges(new Map());
    setFindError('');
    setSpotlightPhase('hidden');
    spotlightTargetPageRef.current = null;
    spotlightArmedRef.current = false;
    spotlightStartedRef.current = false;
    spotlightTimersRef.current.forEach(window.clearTimeout);
    spotlightTimersRef.current = [];
  }, [file.id, initialPage, initialSearchQuery, initialMinKeywordMatches, initialSearchRanges, spotlightInitialSearch]);

  useEffect(() => {
    if (!pagesMeta.length || !containerRef.current) return;
    const target = Math.max(1, Math.min(initialPage, numPages));
    setVisiblePages((previous) => {
      const next = new Set([...previous, target]);
      if (!initialSearchQuery.trim()) {
        if (target > 1) next.add(target - 1);
        if (target < numPages) next.add(target + 1);
      }
      return next;
    });
    window.setTimeout(() => scrollToPage(target), 80);
  }, [pagesMeta, initialPage, initialSearchQuery, numPages, scrollToPage]);

  const jumpToFindMatch = (index: number) => {
    if (index < 0 || index >= findMatches.length) return;
    const match = findMatches[index];
    setActiveFindIndex(index);
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
    spotlightTimersRef.current.forEach(window.clearTimeout);
    spotlightTimersRef.current = [];
    spotlightTargetPageRef.current = null;
    spotlightArmedRef.current = true;
    spotlightStartedRef.current = false;
    setSpotlightPhase('hidden');
    setInitialSearchDismissed(true);
    setFindLoading(true);
    setFindError('');
    setFindMatches([]);
    setActiveFindIndex(-1);
    setFindPageRanges(new Map());
    try {
      const pageRanges = new Map<number, TextRange[]>();
      const uniquePages = [...new Set(pageNumbers)];
      const currentPage = currentPageRef.current;
      const priorityPage = uniquePages.includes(currentPage) ? currentPage : uniquePages[0];
      const remainingPages = uniquePages.filter((pageNumber) => pageNumber !== priorityPage);
      let activeMatch: FindOccurrence | null = null;

      const scanPage = async (pageNumber: number) => {
        if (requestId !== findRequestId.current) return;
        const page = await pdfDoc.getPage(pageNumber);
        if (requestId !== findRequestId.current) return;
        const content = await page.getTextContent();
        const pageText = getVisualTextItems(page, content).map((item) => item.text).join(' ');
        const ranges = findSearchTextRanges(pageText, term, requiredKeywordMatches);
        if (requestId === findRequestId.current && ranges.length) pageRanges.set(pageNumber, ranges);
      };

      const activateMatch = (match: FindOccurrence, matches: FindOccurrence[]) => {
        activeMatch = match;
        const matchIndex = matches.findIndex((candidate) => candidate.page === match.page && candidate.start === match.start && candidate.end === match.end);
        setActiveFindIndex(matchIndex);
        if (spotlightArmedRef.current) {
          spotlightTargetPageRef.current = match.page;
          spotlightArmedRef.current = false;
        }
        window.setTimeout(() => scrollToPage(match.page), 0);
      };

      const publishMatches = (): FindOccurrence[] => {
        if (requestId !== findRequestId.current) return [];
        const orderedPages = [...pageRanges.keys()].sort((a, b) => a - b);
        const matches = orderedPages.flatMap((page) => (pageRanges.get(page) ?? []).map((range) => ({ page, ...range })));
        setFindPageRanges(new Map(pageRanges));
        setFindMatches(matches);
        if (activeMatch) {
          const activeIndex = matches.findIndex((match) => match.page === activeMatch?.page && match.start === activeMatch.start && match.end === activeMatch.end);
          if (activeIndex >= 0) setActiveFindIndex(activeIndex);
        }
        if (!activeMatch && priorityPage && pageRanges.has(priorityPage)) {
          const match = matches.find((candidate) => candidate.page === priorityPage);
          if (match) activateMatch(match, matches);
        }
        return matches;
      };

      if (priorityPage) {
        await scanPage(priorityPage);
        publishMatches();
      }

      let nextPageIndex = 0;
      let completed = 0;
      const concurrency = Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
      const workers = Array.from({ length: Math.min(concurrency, remainingPages.length) }, async () => {
        while (requestId === findRequestId.current && nextPageIndex < remainingPages.length) {
          const pageNumber = remainingPages[nextPageIndex++];
          await scanPage(pageNumber);
          completed += 1;
          if (pageRanges.has(pageNumber) || completed % 4 === 0) publishMatches();
        }
      });
      await Promise.all(workers);
      if (requestId !== findRequestId.current) return;
      const matches = publishMatches();
      if (!activeMatch && matches.length) {
        const firstForwardMatch = matches.find((match) => match.page > currentPage) ?? matches[0];
        activateMatch(firstForwardMatch, matches);
      }
      if (!pageRanges.size) setFindError('No matches found in this PDF.');
      else setFindError('');
    } catch (error) {
      if (requestId === findRequestId.current) {
        setFindError(error instanceof Error ? error.message : 'Could not search this PDF.');
      }
    } finally {
      if (requestId === findRequestId.current) setFindLoading(false);
    }
  }, [pdfDoc, isHindiPdf, scrollToPage]);

  const runDocumentFind = (event: React.FormEvent) => {
    event.preventDefault();
    if (isHindiPdf) {
      setFindError('Feature not available for this language.');
      return;
    }
    setInitialSearchDismissed(true);
    if (findQuery.trim()) void searchPages(findQuery, Array.from({ length: pdfDoc?.numPages ?? 0 }, (_, index) => index + 1), minKeywordMatches);
  };

  const clearDocumentFind = (closeSearch = false) => {
    findRequestId.current += 1;
    setFindQuery('');
    setFindMatches([]);
    setActiveFindIndex(0);
    setFindPageRanges(new Map());
    setFindLoading(false);
    setFindError('');
    setIsKeywordSettingsOpen(false);
    setInitialSearchDismissed(true);
    setSpotlightPhase('hidden');
    spotlightTargetPageRef.current = null;
    spotlightArmedRef.current = false;
    spotlightStartedRef.current = true;
    spotlightTimersRef.current.forEach(window.clearTimeout);
    spotlightTimersRef.current = [];
    if (closeSearch) setFindOpen(false);
    onRouteChange?.(currentPage, '', 1);
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
    if (initialSearchRanges.length) {
      const page = Math.max(1, Math.min(initialSearchPage, pdfDoc.numPages));
      const matches = initialSearchRanges.map((range) => ({ page, ...range }));
      spotlightArmedRef.current = spotlightInitialSearch;
      spotlightTargetPageRef.current = spotlightInitialSearch ? page : null;
      spotlightStartedRef.current = false;
      setFindPageRanges(new Map([[page, initialSearchRanges]]));
      setFindMatches(matches);
      setActiveFindIndex(0);
      setVisiblePages(new Set([page]));
      window.setTimeout(() => scrollToPage(page), 0);
      window.setTimeout(() => findInputRef.current?.focus(), 0);
      return;
    }
    void searchPages(initialSearchQuery, [Math.max(1, Math.min(initialSearchPage, pdfDoc.numPages))], initialMinKeywordMatches);
    window.setTimeout(() => findInputRef.current?.focus(), 0);
  }, [pdfDoc, file.id, initialSearchQuery, initialSearchPage, initialMinKeywordMatches, initialSearchRanges, searchPages, isHindiPdf]);

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
          <button onClick={() => updateZoomScale(scaleRef.current - 0.15)}
            className="p-1.5 text-[#888] hover:text-[#f0f0f0] rounded">
            <ZoomOut size={14} />
          </button>
          <span ref={zoomLabelRef} className="text-[11px] font-mono text-[#888] w-10 text-center">
            {Math.round(scaleRef.current * 100)}%
          </span>
          <button onClick={() => updateZoomScale(scaleRef.current + 0.15)}
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
              spotlightTargetPageRef.current = null;
              spotlightArmedRef.current = false;
              spotlightStartedRef.current = true;
              spotlightTimersRef.current.forEach(window.clearTimeout);
              spotlightTimersRef.current = [];
              setSpotlightPhase('hidden');
              setFindQuery(nextQuery);
              if (nextQuery.trim() !== initialSearchQuery.trim()) setInitialSearchDismissed(true);
              setFindMatches([]);
              setActiveFindIndex(0);
              setFindPageRanges(new Map());
              setFindError('');
              setFindLoading(false);
              onRouteChange?.(currentPage, nextQuery, minKeywordMatches);
            }}
            placeholder="Find in this PDF"
            aria-label="Find in this PDF"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-white outline-none placeholder:text-neutral-600"
          />
          {findMatches.length > 0 && activeFindIndex >= 0 && <span className="shrink-0 text-[10px] text-neutral-500">{activeFindIndex + 1}/{findMatches.length}</span>}
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
                <div className="absolute right-0 top-full z-50 mt-2 max-h-[55dvh] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#1a1a1a] p-3 shadow-xl sm:p-4">
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
                      setInitialSearchDismissed(true);
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
          <button type="button" onClick={() => jumpToFindMatch(activeFindIndex - 1)} disabled={findLoading || activeFindIndex <= 0} aria-label="Previous match" className="rounded-md p-1.5 text-neutral-400 hover:bg-white/5 disabled:opacity-30"><ChevronUp size={14} /></button>
          <button type="button" onClick={() => jumpToFindMatch(activeFindIndex + 1)} disabled={findLoading || activeFindIndex < 0 || activeFindIndex >= findMatches.length - 1} aria-label="Next match" className="rounded-md p-1.5 text-neutral-400 hover:bg-white/5 disabled:opacity-30"><ChevronDown size={14} /></button>
          <button type="button" onClick={() => clearDocumentFind(true)} aria-label="Close find" className="rounded-md p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"><X size={14} /></button>
          {findError && <span className="absolute left-3 top-full mt-2 rounded-md bg-[#171717] px-2 py-1 text-[10px] text-neutral-400">{findError}</span>}
        </form>
      )}

      {/* PDF canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-auto select-text"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div ref={zoomFrameRef} className="relative min-w-full">
          <div ref={pageStackRef} className="absolute left-0 top-0 flex flex-col items-center gap-4 px-4 py-6">
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
          const isFindMatch = findPageRanges.has(meta.pageNum);
          const isInitialSearchMatch = !initialSearchDismissed && Boolean(initialSearchQuery.trim()) && meta.pageNum === initialSearchPage;
          const activeFindMatch = findMatches[activeFindIndex];
          return (
            <PdfPage
              key={meta.pageNum}
              pdfDoc={pdfDoc}
              pageNum={meta.pageNum}
              renderScale={renderScale}
              displayScale={scaleRef.current}
              width={meta.width}
              height={meta.height}
              isVisible={visiblePages.has(meta.pageNum)}
              isSearchMatch={isFindMatch || isInitialSearchMatch}
              searchTerm={isFindMatch ? findQuery : isInitialSearchMatch ? initialSearchQuery : ''}
              activeRange={activeFindMatch?.page === meta.pageNum ? activeFindMatch : undefined}
              minKeywordMatches={minKeywordMatches}
              isHindiPdf={isHindiPdf}
              spotlightActive={spotlightPhase !== 'hidden'}
              spotlightFading={spotlightPhase === 'fading'}
              onSearchHighlightReady={handleSearchHighlightReady}
            />
          );
        })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Individual page renderer ─── */
const PdfPage: React.FC<{
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  renderScale: number;
  displayScale: number;
  width: number;
  height: number;
  isVisible: boolean;
  isSearchMatch: boolean;
  searchTerm: string;
  activeRange?: TextRange;
  minKeywordMatches: number;
  isHindiPdf: boolean;
  spotlightActive: boolean;
  spotlightFading: boolean;
  onSearchHighlightReady?: (pageNum: number) => void;
}> = ({ pdfDoc, pageNum, renderScale, displayScale, width, height, isVisible, isSearchMatch, searchTerm, activeRange, minKeywordMatches, isHindiPdf, spotlightActive, spotlightFading, onSearchHighlightReady }) => {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const textLayerReadyRef = useRef(false);
  const textRenderRequestRef = useRef(0);
  const [textLayerVersion, setTextLayerVersion] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const renderCanvas = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled || !canvasHostRef.current) return;
        const vp = page.getViewport({ scale: renderScale });
        const host = canvasHostRef.current;
        const cssWidth = Math.floor(vp.width);
        const cssHeight = Math.floor(vp.height);
        const previousCanvas = host.querySelector('canvas');
        if (previousCanvas) {
          previousCanvas.style.width = `${cssWidth}px`;
          previousCanvas.style.height = `${cssHeight}px`;
        }
        const canvas = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(12_000_000 / Math.max(1, vp.width * vp.height)));
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        taskRef.current?.cancel();
        const renderCtx: any = {
          canvasContext: ctx,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          viewport: vp,
        };
        renderTask = page.render(renderCtx);
        taskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled || !canvasHostRef.current) return;
        canvas.className = 'block';
        const oldCanvas = canvasHostRef.current.querySelector('canvas');
        if (oldCanvas) oldCanvas.replaceWith(canvas);
        else canvasHostRef.current.append(canvas);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') console.warn(err);
      }
    };
    void renderCanvas();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNum, renderScale, isVisible]);

  useEffect(() => {
    if (isVisible) return;
    const timeout = window.setTimeout(() => {
      canvasHostRef.current?.replaceChildren();
      textRef.current?.replaceChildren();
      textLayerReadyRef.current = false;
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !textRef.current) return;
    const requestId = ++textRenderRequestRef.current;
    let cancelled = false;
    const textContainer = textRef.current;
    textLayerReadyRef.current = false;
    textContainer.innerHTML = '';

    const renderTextLayer = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const content = await page.getTextContent();
        if (cancelled || requestId !== textRenderRequestRef.current) return;
        const viewport = page.getViewport({ scale: 1 });
        textContainer.style.width = `${Math.floor(viewport.width)}px`;
        textContainer.style.height = `${Math.floor(viewport.height)}px`;
        textContainer.style.setProperty('--scale-factor', '1');
        const layer = new pdfjsLib.TextLayer({ textContentSource: content, container: textContainer, viewport });
        await layer.render();
        if (cancelled || requestId !== textRenderRequestRef.current) return;

        const spans = Array.from(textContainer.querySelectorAll<HTMLSpanElement>('span:not(.markedContent)'));
        spans.forEach((span, index) => { span.dataset.pdfFindOrder = String(index); });
        const visualItems = getVisualTextItems(page, content);
        visualItems.forEach((item, order) => {
          const span = spans[item.spanIndex];
          if (span) span.dataset.pdfFindOrder = String(order);
        });

        if (isHindiPdf && typeof page.commonObjs?.get === 'function') {
          const sourceItems = content.items.filter((item): item is typeof item & { str: string; fontName: string } => 'str' in item && typeof item.str === 'string' && item.str.length > 0);
          sourceItems.forEach((item, index) => {
            const span = spans[index];
            if (!span) return;
            try {
              const font = page.commonObjs.get(item.fontName) as { name?: string };
              if (font.name && /(?:walkman[- ]?chanakya|chanakya)/i.test(font.name)) span.dataset.legacyHindiFont = 'chanakya';
            } catch {
              // Fonts can be unresolved for hidden or malformed text runs.
            }
          });
        }

        textLayerReadyRef.current = true;
        setTextLayerVersion((version) => version + 1);
      } catch (err) {
        if (!cancelled) console.warn(err);
      }
    };
    void renderTextLayer();
    return () => {
      cancelled = true;
      textRenderRequestRef.current += 1;
    };
  }, [pdfDoc, pageNum, isVisible, isHindiPdf, width, height]);

  useEffect(() => {
    const container = textRef.current;
    if (!container || !textLayerReadyRef.current) return;

    activeLineRef.current?.style.setProperty('display', 'none');
    container.querySelectorAll('mark.pdf-find-highlight').forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
    });
    container.querySelectorAll('span').forEach((span) => span.normalize());

    if (isSearchMatch && searchTerm) {
      const highlightCount = highlightPdfText(container, searchTerm, minKeywordMatches, activeRange);
      if (activeRange) {
        const activeMark = container.querySelector<HTMLElement>('mark.pdf-find-highlight-active');
        const activeLine = activeLineRef.current;
        const pageElement = pageRef.current;
        if (activeMark && activeLine && pageElement) {
          const pageRect = pageElement.getBoundingClientRect();
          const wordRect = activeMark.getBoundingClientRect();
          activeLine.style.top = `${(wordRect.top - pageRect.top) / displayScale}px`;
          activeLine.style.height = `${Math.max(1, wordRect.height / displayScale)}px`;
          activeLine.style.display = 'block';
          activeMark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }
      if (highlightCount) onSearchHighlightReady?.(pageNum);
    }
  }, [textLayerVersion, isSearchMatch, searchTerm, activeRange?.start, activeRange?.end, minKeywordMatches, pageNum, onSearchHighlightReady]);

  const renderW = Math.round(width * renderScale);
  const renderH = Math.round(height * renderScale);

  return (
    <div
      ref={pageRef}
      data-page-num={pageNum}
      className={`pdf-page relative shadow-[0_4px_24px_rgba(0,0,0,0.6)] rounded-sm bg-white overflow-hidden ${isSearchMatch ? 'ring-2 ring-blue-400' : ''}`}
      style={{ width: renderW, height: renderH }}
    >
      <div
        ref={canvasHostRef}
        className="absolute left-0 top-0 z-0 origin-top-left"
        style={{ width: renderW, height: renderH }}
      />
      {spotlightActive && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-[1] bg-black/70 transition-opacity duration-700 ${spotlightFading ? 'opacity-0' : 'opacity-100'}`}
        />
      )}
      <div
        ref={activeLineRef}
        aria-hidden="true"
        className="pdf-find-active-line"
        style={{ width, transform: `scale(${renderScale})`, display: 'none' }}
      />
      <div
        ref={textRef}
        className="textLayer absolute left-0 top-0 select-text"
        style={{ width, height, transform: `scale(${renderScale})`, transformOrigin: 'top left' }}
      />
    </div>
  );
};
