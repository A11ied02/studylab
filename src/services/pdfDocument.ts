import * as pdfjsLib from 'pdfjs-dist';

const loadingTasks = new Map<string, pdfjsLib.PDFDocumentLoadingTask>();

export function getPdfDocumentTask(url: string, workerSrc: string): pdfjsLib.PDFDocumentLoadingTask {
  const existing = loadingTasks.get(url);
  if (existing) return existing;

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjsLib.getDocument({
    url,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
  });
  loadingTasks.set(url, task);
  task.promise.catch(() => {
    if (loadingTasks.get(url) === task) loadingTasks.delete(url);
  });
  return task;
}

export function preloadPdfDocument(url: string, workerSrc: string): void {
  void getPdfDocumentTask(url, workerSrc).promise.catch(() => {});
}

export function releasePdfDocumentTask(url: string, task: pdfjsLib.PDFDocumentLoadingTask): void {
  if (loadingTasks.get(url) === task) loadingTasks.delete(url);
  void task.destroy();
}
