import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MiniSearch from 'minisearch';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const publicDir = path.join(rootDir, 'public');
const manifest = JSON.parse(await fs.readFile(path.join(publicDir, 'library-manifest.json'), 'utf8'));
const indexDir = path.join(publicDir, 'search');
const indexPath = path.join(indexDir, 'index.json');

function normalizeSearchText(value) {
  return value.normalize('NFD').toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const miniSearch = new MiniSearch({
  fields: ['text', 'title', 'subject', 'folder'],
  storeFields: ['text', 'title', 'fileId', 'filePath', 'subjectId', 'subject', 'folder', 'scopeIds', 'page'],
  tokenize: (text) => normalizeSearchText(text).split(' ').filter(Boolean),
});

let batch = [];
let pageCount = 0;
let pdfCount = 0;

function isHindiSubject(subject) {
  return subject.displayName.toLocaleLowerCase() === 'hindi' || subject.path.toLocaleLowerCase().split('/')[0] === 'hindi';
}

function countPdfs(folder) {
  return (folder.files ?? []).filter((file) => file.isAdvancedSearchable !== false).length
    + (folder.subfolders ?? []).reduce((sum, child) => sum + countPdfs(child), 0);
}

const searchablePdfCount = manifest.subjects
  .filter((subject) => !isHindiSubject(subject))
  .reduce((sum, subject) => sum + countPdfs(subject), 0);

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function flushBatch() {
  if (!batch.length) return;
  await miniSearch.addAllAsync(batch, { chunkSize: 200 });
  batch = [];
}

async function indexFile(file, subject, folder, scopeIds) {
  const pdfPath = path.resolve(publicDir, file.path);
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const task = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
  });
  try {
    const document = await task.promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = cleanText(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      if (!text) continue;
      batch.push({
        id: `${file.id}::${pageNumber}`,
        text,
        title: file.title,
        fileId: file.id,
        filePath: file.path,
        subjectId: subject.id,
        subject: subject.displayName,
        folder,
        scopeIds: [...new Set([...scopeIds, `@direct:${scopeIds[scopeIds.length - 1]}`])],
        page: pageNumber,
      });
      pageCount += 1;
      if (batch.length >= 400) await flushBatch();
    }
  } finally {
    await task.destroy();
  }
  pdfCount += 1;
  if (pdfCount % 10 === 0 || pdfCount === searchablePdfCount) {
    console.log(`[Search index] Extracted ${pdfCount}/${searchablePdfCount} PDFs (${pageCount} pages)`);
  }
}

async function visitFolder(folder, subject, breadcrumb, scopeIds) {
  for (const file of folder.files ?? []) {
    if (file.isAdvancedSearchable === false) continue;
    await indexFile(file, subject, breadcrumb.join(' / '), scopeIds);
  }
  for (const child of folder.subfolders ?? []) {
    await visitFolder(child, subject, [...breadcrumb, child.displayName], [...scopeIds, child.path]);
  }
}

console.log(`[Search index] Building a full-text index for ${searchablePdfCount} non-Hindi PDFs...`);
for (const subject of manifest.subjects) {
  if (isHindiSubject(subject)) continue;
  await visitFolder(subject, subject, [subject.displayName], [subject.id, subject.path]);
}
await flushBatch();

const envelope = {
  schemaVersion: 3,
  indexedAt: new Date().toISOString(),
  pdfCount,
  documentCount: miniSearch.documentCount,
  index: miniSearch.toJSON(),
};
const serialized = JSON.stringify(envelope);
await fs.mkdir(indexDir, { recursive: true });
await fs.writeFile(indexPath, serialized);
console.log(`[Search index] Saved ${miniSearch.documentCount} searchable pages (${Buffer.byteLength(serialized)} bytes) to public/search/index.json`);
