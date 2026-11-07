import React, { useState } from 'react';
import { FileText, Eye, Download, BookOpen } from 'lucide-react';
import { BookFile } from '../../types/library';
import { useLibrary } from '../../context/LibraryContext';

interface DocumentCardProps {
  file: BookFile;
  onOpen: (file: BookFile) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({ file, onOpen }) => {
  const { getAssetUrl } = useLibrary();
  const [imageError, setImageError] = useState(false);

  const formatSize = (bytes: number): string => {
    if (!bytes) return '';
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  const thumbUrl = getAssetUrl(file.thumbnailUrl);

  return (
    <div
      onClick={() => onOpen(file)}
      className="group relative flex flex-col bg-ubuntu-light-card dark:bg-ubuntu-dark-card rounded-ubuntu-xl border border-ubuntu-light-border dark:border-ubuntu-dark-border overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-ubuntu-md hover:border-ubuntu-orange/40"
    >
      {/* Thumbnail Aspect Box */}
      <div className="relative w-full aspect-[3/4] bg-neutral-100 dark:bg-neutral-900 overflow-hidden flex items-center justify-center">
        {!imageError ? (
          <img
            src={thumbUrl}
            alt={file.title}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-102"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center text-ubuntu-light-muted dark:text-ubuntu-dark-muted">
            <BookOpen size={36} className="mb-2 text-ubuntu-orange/50" />
            <span className="text-xs font-mono">PDF Preview</span>
          </div>
        )}

        {/* Economics Exception badge indicator */}
        {file.isEconomicsException && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-ubuntu-sm bg-amber-500/90 text-neutral-950 font-bold text-[9px] uppercase tracking-wider backdrop-blur-xs">
            Pg 2 Cover
          </div>
        )}

        {/* Subtle hover overlay with Quick Read icon */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
          <div className="px-3 py-1.5 rounded-ubuntu-md bg-ubuntu-orange text-white text-xs font-semibold flex items-center space-x-1.5 shadow-ubuntu-sm transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <Eye size={14} />
            <span>Read Chapter</span>
          </div>
        </div>
      </div>

      {/* Card Info */}
      <div className="p-3 flex flex-col flex-1 justify-between">
        <h4 
          className="text-xs font-semibold text-ubuntu-light-text dark:text-ubuntu-dark-text line-clamp-2 group-hover:text-ubuntu-orange transition-colors"
          title={file.title}
        >
          {file.title}
        </h4>

        <div className="mt-2.5 pt-2 border-t border-ubuntu-light-border dark:border-ubuntu-dark-border flex items-center justify-between text-[11px] text-ubuntu-light-muted dark:text-ubuntu-dark-muted">
          <span className="font-mono">{formatSize(file.sizeBytes)}</span>
          <span className="flex items-center space-x-1 text-ubuntu-orange font-medium group-hover:underline">
            <span>Open</span>
            <FileText size={11} />
          </span>
        </div>
      </div>
    </div>
  );
};
