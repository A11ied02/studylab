import React, { useState } from 'react';
import { ChevronLeft, ImageOff } from 'lucide-react';
import { DEFAULT_IT_GRADIENTS, useLibrary } from '../../context/LibraryContext';
import { BookFile, BookFolder } from '../../types/library';

const makeSvgGradientId = (prefix: string, index: number, folderPath: string) =>
  `${prefix}_${index}_${folderPath.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/* ─── Single chapter / PDF card ─────────────────────────────────────── */
const ChapterCard: React.FC<{ file: BookFile; onOpen: (f: BookFile) => void; showTitle?: boolean }> = ({
  file,
  onOpen,
  showTitle = false,
}) => {
  const { getAssetUrl } = useLibrary();
  const [imgError, setImgError] = useState(false);
  const thumbUrl = getAssetUrl(file.thumbnailUrl);

  return (
    <button
      onClick={() => onOpen(file)}
      className={`group relative w-full bg-[#141414] rounded-2xl overflow-hidden border border-transparent hover:border-[#4285f4] transition-colors duration-200 focus:outline-none p-3 ${showTitle ? 'flex flex-col gap-2' : ''}`}
      style={showTitle ? undefined : { aspectRatio: '3/4' }}
      title={file.title}
    >
      <div className={`relative w-full overflow-hidden rounded-xl ${showTitle ? 'aspect-[3/4]' : 'h-full'}`}>
        {!imgError ? (
          <img
            src={thumbUrl}
            alt=""
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-top shadow-md"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-[#1c1c1c] border border-white/5 flex flex-col items-center justify-center text-neutral-500">
            <ImageOff size={32} strokeWidth={1.5} className="mb-1 opacity-60" />
            <span className="text-[10px] font-mono tracking-wider uppercase opacity-40">No Preview</span>
          </div>
        )}
      </div>

      {showTitle ? (
        <p className="px-1 text-white text-xs font-medium leading-snug text-left break-words">
          {file.title}
        </p>
      ) : (
        <div className="absolute inset-x-3 bottom-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent py-3 px-2.5 rounded-b-xl translate-y-0 md:translate-y-full md:group-hover:translate-y-0 md:group-focus-visible:translate-y-0 transition-transform duration-200">
          <p className="text-white text-xs font-medium line-clamp-2 leading-snug">
            {file.title}
          </p>
        </div>
      )}
    </button>
  );
};

/* ─── Filled Gradient Folder Card (for Science and IT) ───────────────── */
const FilledGradientFolderCard: React.FC<{
  folder: BookFolder;
  gradientColors: [string, string];
  gradientId: string;
  onOpen: (path: string) => void;
}> = ({ folder, gradientColors, gradientId, onOpen }) => {
  return (
    <button
      onClick={() => onOpen(folder.path)}
      className="group relative w-full bg-[#141414] rounded-2xl overflow-hidden border border-transparent hover:border-[#4285f4] transition-colors duration-200 focus:outline-none p-6 flex flex-col items-center justify-center gap-4"
      style={{ aspectRatio: '3/4' }}
      title={folder.displayName}
    >
      {/* 
        Clean Filled Folder Icon:
        - Filled folder shape with gradient fill
        - No UNIT text, no chapter counts, just icon and clean name
      */}
      <div className="w-24 h-24 flex items-center justify-center drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
        <svg viewBox="0 0 24 24" className="w-full h-full">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientColors[0]} />
              <stop offset="100%" stopColor={gradientColors[1]} />
            </linearGradient>
          </defs>
          <path
            d="M4 4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4H4Z"
            fill={`url(#${gradientId})`}
          />
        </svg>
      </div>

      <h3 className="text-base font-bold text-white tracking-wide text-center">
        {folder.displayName}
      </h3>
    </button>
  );
};

/* ─── Standard Subfolder (book) card (for SST/English/Hindi) ─────────── */
const FolderCard: React.FC<{ folder: BookFolder; onOpen: (path: string) => void }> = ({
  folder,
  onOpen,
}) => {
  const { getAssetUrl } = useLibrary();
  const [imgError, setImgError] = useState(false);
  const coverUrl = getAssetUrl(folder.cover);

  return (
    <button
      onClick={() => onOpen(folder.path)}
      className="group relative w-full bg-[#141414] rounded-2xl overflow-hidden border border-transparent hover:border-[#4285f4] transition-colors duration-200 focus:outline-none p-3"
      style={{ aspectRatio: '3/4' }}
      title={folder.displayName}
    >
      {!imgError ? (
        <img
          src={coverUrl}
          alt=""
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center rounded-xl shadow-md"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full rounded-xl bg-[#1c1c1c] border border-white/5 flex flex-col items-center justify-center text-neutral-500">
          <ImageOff size={32} strokeWidth={1.5} className="mb-1 opacity-60" />
          <span className="text-[10px] font-mono tracking-wider uppercase opacity-40">No Cover</span>
        </div>
      )}

      <div className="absolute inset-x-3 bottom-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent py-3 px-2.5 rounded-b-xl translate-y-full group-hover:translate-y-0 transition-transform duration-200">
        <p className="text-white text-xs font-medium">{folder.displayName}</p>
      </div>
    </button>
  );
};

/* ─── Main Subject view ──────────────────────────────────────────────── */
export const SubjectView: React.FC = () => {
  const {
    selectedSubject,
    selectedFolder,
    scienceGradients,
    itGradients,
    bookScale,
    navigateToSubject,
    navigateToFolder,
    navigateToBooksHome,
    openPdf,
  } = useLibrary();

  if (!selectedSubject) return null;

  const current = selectedFolder || selectedSubject;
  const isRoot = current.path === selectedSubject.path;
  const isScience = selectedSubject.displayName.toLowerCase() === 'science';
  const isIT = selectedSubject.id === 'IT';
  const subfolders = current.subfolders ?? [];
  const files = current.files ?? [];

  const handleBack = () => {
    if (isRoot) {
      navigateToBooksHome();
    } else {
      const segs = current.path.split('/');
      const parentPath = segs.length <= 2
        ? selectedSubject.id
        : segs.slice(0, -1).join('/');
      if (parentPath === selectedSubject.id) {
        navigateToSubject(selectedSubject.id);
      } else {
        navigateToFolder(parentPath);
      }
    }
  };

  const title = current.displayName;

  const getScienceGradientColors = (folder: BookFolder): [string, string] => {
    const name = folder.displayName.toLowerCase();
    const p = folder.path.toLowerCase();
    if (name.includes('bio') || p.includes('bio')) return scienceGradients.bio;
    if (name.includes('phy') || p.includes('phy')) return scienceGradients.phy;
    if (name.includes('chem') || p.includes('chem')) return scienceGradients.chem;
    return ['#38bdf8', '#2563eb'];
  };

  const getITGradientColors = (folder: BookFolder): [string, string] => {
    return folder.path.toLowerCase().includes('part b')
      ? itGradients.partB
      : DEFAULT_IT_GRADIENTS.partA;
  };

  // Grid responsiveness based on bookScale
  const subfoldersGridClass = {
    compact: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-5 max-w-5xl',
    normal:  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-4xl',
    large:   'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-3xl',
  }[bookScale] || 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 max-w-5xl';

  const chaptersGridClass = {
    compact: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4',
    normal:  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5',
    large:   'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6',
  }[bookScale] || 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4';

  return (
    <div className="flex-1 overflow-y-auto px-8 pb-10 space-y-6">
      {/* Back + title inline */}
      <div className="flex items-center gap-2 -ml-1 pt-1">
        <button
          onClick={handleBack}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"
          title="Go back"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </button>
        <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
      </div>

      {/* Subfolders grid */}
      {subfolders.length > 0 && (
        <div className={subfoldersGridClass}>
          {subfolders.map((folder, idx) => {
            // For Science root: Bio, Phy, Chem are filled gradient folders
            if (isScience && isRoot) {
              const gradId = makeSvgGradientId('sciGrad', idx, folder.path);
              return (
                <FilledGradientFolderCard
                  key={folder.path}
                  folder={folder}
                  gradientColors={getScienceGradientColors(folder)}
                  gradientId={gradId}
                  onOpen={navigateToFolder}
                />
              );
            }

            // All IT folders use the configurable Part A / Part B gradients.
            if (isIT) {
              const gradId = makeSvgGradientId('itGrad', idx, folder.path);
              return (
                <FilledGradientFolderCard
                  key={folder.path}
                  folder={folder}
                  gradientColors={getITGradientColors(folder)}
                  gradientId={gradId}
                  onOpen={navigateToFolder}
                />
              );
            }

            // For other subjects and sub-levels: normal book cover cards
            return (
              <FolderCard
                key={folder.path}
                folder={folder}
                onOpen={navigateToFolder}
              />
            );
          })}
        </div>
      )}

      {/* Chapter grid */}
      {files.length > 0 && (
        <div className="space-y-3">
          {subfolders.length > 0 && (
            <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider pt-2">
              Chapters ({files.length})
            </p>
          )}
          <div className={chaptersGridClass}>
            {files.map((file) => (
              <ChapterCard
                key={file.id}
                file={file}
                onOpen={openPdf}
                showTitle={file.rawPath.startsWith('Maths/')}
              />
            ))}
          </div>
        </div>
      )}

      {subfolders.length === 0 && files.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-neutral-500">
          <ImageOff size={40} className="mb-2 opacity-40" />
          <p className="text-sm">No books or chapters found in this folder.</p>
        </div>
      )}
    </div>
  );
};
