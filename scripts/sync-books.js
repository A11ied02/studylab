import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Source directory: check BOOKS_DIR env, or desktop folder, or local books
const sourceDir = process.env.BOOKS_DIR ||
  (fs.existsSync('/home/user01/Desktop/ClassXbooks')
    ? '/home/user01/Desktop/ClassXbooks'
    : fs.existsSync(path.join(rootDir, 'books'))
      ? path.join(rootDir, 'books')
      : path.join(rootDir, 'public', 'books'));

console.log(`[Sync] Reading books from source: ${sourceDir}`);

const publicDir = path.join(rootDir, 'public');
const destBooksDir = path.join(publicDir, 'books');
const thumbnailsDir = path.join(publicDir, 'thumbnails');
const coversDir = path.join(publicDir, 'covers');

fs.mkdirSync(destBooksDir, { recursive: true });
fs.mkdirSync(thumbnailsDir, { recursive: true });
fs.mkdirSync(coversDir, { recursive: true });

// Copy foldernamemap.json
const folderMapPath = path.join(rootDir, 'foldernamemap.json');
let folderMap = {};
if (fs.existsSync(folderMapPath)) {
  const content = fs.readFileSync(folderMapPath, 'utf-8');
  folderMap = JSON.parse(content);
  fs.writeFileSync(path.join(publicDir, 'foldernamemap.json'), content);
  console.log('[Sync] Copied foldernamemap.json to public/');
}

// Copy pdf worker for seamless browser execution
const pdfWorkerSrc = path.join(rootDir, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
if (fs.existsSync(pdfWorkerSrc)) {
  fs.copyFileSync(pdfWorkerSrc, path.join(publicDir, 'pdf.worker.min.mjs'));
  console.log('[Sync] Copied PDF.js worker to public/pdf.worker.min.mjs');
}

// Known chapter titles for folders where filenames are just numbers
const MATHS_CHAPTER_NAMES = {
  "01.pdf": "Real Numbers",
  "02.pdf": "Polynomials",
  "03.pdf": "Pair of Linear Equations in Two Variables",
  "04.pdf": "Quadratic Equations",
  "05.pdf": "Arithmetic Progressions",
  "06.pdf": "Triangles",
  "07.pdf": "Coordinate Geometry",
  "08.pdf": "Introduction to Trigonometry",
  "09.pdf": "Some Applications of Trigonometry",
  "10.pdf": "Circles",
  "11.pdf": "Areas Related to Circles",
  "12.pdf": "Surface Areas and Volumes",
  "13.pdf": "Statistics",
  "14.pdf": "Probability"
};

const HINDI_SPARSH_NAMES = {
  "01.pdf": "Sakhi (Kabir)",
  "02.pdf": "Pad (Meera)",
  "03.pdf": "Manushyata (Maithilisharan Gupt)",
  "04.pdf": "Parvat Pradesh Mein Pavas (Sumitranandan Pant)",
  "05.pdf": "Top (Virendra Dangwal)",
  "06.pdf": "Kar Chale Hum Fida (Kaifi Azmi)",
  "07.pdf": "Aatmatraan (Rabindranath Thakur)",
  "08.pdf": "Bade Bhai Sahab (Premchand)",
  "09.pdf": "Diary Ka Ek Panna (Sitaram Seksaria)",
  "10.pdf": "Tatara-Vamiro Katha (Liladhar Mandloi)",
  "11.pdf": "Teesri Kasam Ke Shilpkar Shailendra (Prahlad Agrawal)",
  "12.pdf": "Ab Kahan Doosre Ke Dukh Se Dukhi Hone Wale (Nida Fazli)",
  "13.pdf": "Patjhar Mein Tooti Pattiyan - Zen Ki Den (Ravindra Kelekar)",
  "14.pdf": "Kartus (Habib Tanvir)"
};

// Cover mapping based on folder relative path (PNG/JPEG raster files)
function getCoverForPath(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (norm === 'Science' || norm.startsWith('Science/')) return 'covers/ncert/science.jpg';
  if (norm === 'Maths') return 'covers/ncert/mathematics.jpg';
  if (norm === 'SST') return 'covers/ncert/social-science.png';
  if (norm === 'SST/History') return 'covers/ncert/history.jpg';
  if (norm === 'SST/Geo') return 'covers/ncert/geography.png';
  if (norm === 'SST/Civics') return 'covers/ncert/civics.jpg';
  if (norm === 'SST/Eco') return 'covers/ncert/economics.png';
  if (norm === 'English Language and Literature') return 'covers/ncert/english-combined.png';
  if (norm.includes('First Flight')) return 'covers/ncert/first-flight.jpg';
  if (norm.includes('Footprints')) return 'covers/ncert/footprints.jpg';
  if (norm === 'Hindi') return 'covers/ncert/hindi-combined.png';
  if (norm.includes('Sparsh')) return 'covers/ncert/sparsh.jpg';
  if (norm.includes('Sanchayan')) return 'covers/ncert/sanchayan.jpg';
  if (norm === 'IT') return 'covers/ncert/it-class-x.png';
  if (norm.includes('Part A') || norm.includes('Part B')) return 'covers/ncert/it-class-x.png';
  return 'covers/ncert/social-science.png';
}

function cleanTitle(filename, relFolderPath) {
  const base = filename.replace(/\.pdf$/i, '');
  if (relFolderPath === 'Maths' && MATHS_CHAPTER_NAMES[filename]) {
    return `${base} - ${MATHS_CHAPTER_NAMES[filename]}`;
  }
  if (relFolderPath.includes('Sparsh') && HINDI_SPARSH_NAMES[filename]) {
    return `${base}- ${HINDI_SPARSH_NAMES[filename]}`;
  }
  return base;
}

function getPublishedFilename(filename, relFolderPath) {
  if (relFolderPath.replace(/\\/g, '/').includes('Sparsh') && HINDI_SPARSH_NAMES[filename]) {
    const base = filename.replace(/\.pdf$/i, '');
    return `${base}- ${HINDI_SPARSH_NAMES[filename]}.pdf`;
  }
  return filename;
}

let totalPdfCount = 0;
let totalThumbnailsGenerated = 0;

// Scan directory recursively
function scanDir(dir, relPath = '') {
  const items = fs.readdirSync(dir);
  const subfolders = [];
  const files = [];

  for (const item of items) {
    if (item.startsWith('.')) continue;
    const fullPath = path.join(dir, item);
    const itemRelPath = relPath ? `${relPath}/${item}` : item;
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const normalizedItemPath = itemRelPath.replace(/\\/g, '/');
      if (normalizedItemPath === 'IT/Part B/Chapters') {
        // Keep the Part B chapter PDFs directly on the Part B page instead of nesting them.
        const flattenedChapters = scanDir(fullPath, 'IT/Part B');
        files.push(...flattenedChapters.files);
        subfolders.push(...flattenedChapters.subfolders);
        continue;
      }

      const child = scanDir(fullPath, itemRelPath);
      // Only include subfolder if it has files or non-empty children
      if (child.files.length > 0 || child.subfolders.length > 0) {
        subfolders.push({
          id: itemRelPath,
          name: item,
          path: itemRelPath,
          displayName: folderMap[itemRelPath] || item,
          cover: getCoverForPath(itemRelPath),
          subfolders: child.subfolders,
          files: child.files,
        });
      }
    } else if (item.toLowerCase().endsWith('.pdf')) {
      const normalizedPdfPath = itemRelPath.replace(/\\/g, '/');
      const isExcludedItPdf = normalizedPdfPath.startsWith('IT/') && (
        /full book/i.test(item)
        || item === 'CBSE IT 402 Class X Curriculum - Session 2026-27.pdf'
      );
      if (isExcludedItPdf) continue;

      totalPdfCount++;

      const publishedFilename = getPublishedFilename(item, relPath);
      const publishedRelPath = relPath ? `${relPath}/${publishedFilename}` : publishedFilename;

      // Copy file to public/books if source is different
      const destPdf = path.join(destBooksDir, publishedRelPath);
      const destSubDir = path.dirname(destPdf);
      fs.mkdirSync(destSubDir, { recursive: true });

      if (!fs.existsSync(destPdf) || fs.statSync(destPdf).size !== stat.size) {
        fs.copyFileSync(fullPath, destPdf);
      }

      // Generate thumbnail
      const destThumbDir = path.join(thumbnailsDir, relPath);
      fs.mkdirSync(destThumbDir, { recursive: true });
      const thumbBaseName = publishedFilename.replace(/\.pdf$/i, '');
      const finalThumbPath = path.join(destThumbDir, `${thumbBaseName}.png`);
      const thumbWebPath = `thumbnails/${publishedRelPath.replace(/\.pdf$/i, '.png')}`;

      // Economics exception: Use page 2 for Economics! Page 1 for others.
      const isEconomics = itemRelPath.includes('SST/Eco') || itemRelPath.includes('Eco');
      const pageToRender = isEconomics ? 2 : 1;

      if (!fs.existsSync(finalThumbPath)) {
        try {
          const tempPrefix = path.join(destThumbDir, `__temp_${thumbBaseName}`);
          execFileSync('pdftoppm', [
            '-png',
            '-r', '90',
            '-f', String(pageToRender),
            '-l', String(pageToRender),
            fullPath,
            tempPrefix
          ], { stdio: 'pipe' });

          // Find generated temp file
          const paddedPage = String(pageToRender).padStart(pageToRender >= 10 ? 2 : 1, '0');
          const generatedFiles = fs.readdirSync(destThumbDir)
            .filter(f => f.startsWith(`__temp_${thumbBaseName}`));

          if (generatedFiles.length > 0) {
            const genPath = path.join(destThumbDir, generatedFiles[0]);
            fs.renameSync(genPath, finalThumbPath);
            totalThumbnailsGenerated++;
          }
        } catch (err) {
          // If page 2 failed (e.g. 1-page PDF), fallback to page 1
          if (pageToRender === 2) {
            try {
              const tempPrefix = path.join(destThumbDir, `__temp_${thumbBaseName}`);
              execFileSync('pdftoppm', [
                '-png',
                '-r', '90',
                '-f', '1',
                '-l', '1',
                fullPath,
                tempPrefix
              ], { stdio: 'pipe' });
              const generatedFiles = fs.readdirSync(destThumbDir)
                .filter(f => f.startsWith(`__temp_${thumbBaseName}`));
              if (generatedFiles.length > 0) {
                fs.renameSync(path.join(destThumbDir, generatedFiles[0]), finalThumbPath);
                totalThumbnailsGenerated++;
              }
            } catch (fallbackErr) {
              // ignore
            }
          }
        }
      }

      files.push({
        id: publishedRelPath,
        filename: publishedFilename,
        title: cleanTitle(item, relPath),
        path: `books/${publishedRelPath}`,
        rawPath: publishedRelPath,
        sizeBytes: stat.size,
        thumbnailUrl: thumbWebPath,
        isEconomicsException: isEconomics,
        ...(normalizedPdfPath === 'Maths/Answers.pdf' ? { isAdvancedSearchable: false } : {})
      });
    }
  }

  if (relPath.replace(/\\/g, '/') === 'IT/Part A') {
    const folderOrder = new Map([
      ['Writer', 0],
      ['Calc', 1],
      ['Base (Database)', 2],
      ['Workplace Safety', 3],
    ]);
    subfolders.sort((left, right) => (folderOrder.get(left.name) ?? 99) - (folderOrder.get(right.name) ?? 99));
  }

  // Sort files naturally by chapter number
  files.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));

  return { subfolders, files };
}

console.log('[Sync] Scanning book hierarchy...');
const rootScan = scanDir(sourceDir);

const SUBJECT_ORDER = [
  "Science",
  "Maths",
  "Social Science",
  "English",
  "Hindi",
  "IT"
];

function getSubjectPriority(displayName) {
  const clean = displayName.trim();
  const index = SUBJECT_ORDER.indexOf(clean);
  if (index !== -1) return index;
  const lower = clean.toLowerCase();
  const foundIndex = SUBJECT_ORDER.findIndex(s => s.toLowerCase() === lower);
  return foundIndex !== -1 ? foundIndex : 999;
}

// Construct subjects
const subjects = rootScan.subfolders.map(folder => ({
  id: folder.id,
  name: folder.name,
  path: folder.path,
  displayName: folderMap[folder.path] || folder.name,
  cover: getCoverForPath(folder.path),
  subfolders: folder.subfolders,
  files: folder.files,
})).sort((a, b) => {
  const priorityA = getSubjectPriority(a.displayName);
  const priorityB = getSubjectPriority(b.displayName);
  if (priorityA !== priorityB) return priorityA - priorityB;
  return a.displayName.localeCompare(b.displayName);
});

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceDirectory: 'Bundled book library',
  totalPdfs: totalPdfCount,
  subjects: subjects,
};

const manifestPath = path.join(publicDir, 'library-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

console.log(`[Sync] Successfully generated library-manifest.json with ${subjects.length} subjects and ${totalPdfCount} PDFs.`);
console.log(`[Sync] Generated ${totalThumbnailsGenerated} new thumbnails in public/thumbnails/`);
