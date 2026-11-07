import React, { useState } from 'react';
import { useLibrary, BookScale } from '../../context/LibraryContext';
import { Subject } from '../../types/library';
import { ImageOff } from 'lucide-react';

interface BookCoverProps {
  subject: Subject;
  onClick: () => void;
}

const BookCover: React.FC<BookCoverProps> = ({ subject, onClick }) => {
  const { getAssetUrl } = useLibrary();
  const [imgError, setImgError] = useState(false);
  const coverUrl = getAssetUrl(subject.cover);

  return (
    <button
      onClick={onClick}
      className="group relative w-full bg-[#141414] rounded-2xl overflow-hidden border border-transparent hover:border-[#4285f4] transition-colors duration-200 focus:outline-none flex items-center justify-center p-3"
      style={{ aspectRatio: '3/4' }}
      aria-label={subject.displayName}
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
        <div className="w-full h-full rounded-xl bg-[#1c1c1c] border border-white/5 flex flex-col items-center justify-center text-neutral-500 group-hover:text-neutral-400 transition-colors">
          <ImageOff size={36} strokeWidth={1.5} className="mb-2 opacity-60" />
          <span className="text-[11px] font-mono tracking-wider uppercase opacity-40">Cover Missing</span>
        </div>
      )}
      <div className="absolute inset-x-3 bottom-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent py-3 px-2.5 rounded-b-xl translate-y-0 md:translate-y-full md:group-hover:translate-y-0 md:group-focus-visible:translate-y-0 transition-transform duration-200">
        <p className="text-white text-xs font-semibold line-clamp-2 leading-snug">
          {subject.displayName}
        </p>
      </div>
    </button>
  );
};

export const BooksHome: React.FC = () => {
  const { subjects, navigateToSubject, loading, error, bookScale } = useLibrary();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-neutral-400">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-3.5 py-1.5 rounded-lg bg-bg-surface text-white text-xs hover:bg-white/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Responsive Grid scale based on user setting
  const gridClasses = {
    compact: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 max-w-7xl',
    normal:  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 md:gap-6 max-w-6xl',
    large:   'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-7 max-w-5xl',
  }[bookScale] || 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 max-w-7xl';

  return (
    <div className="flex-1 overflow-y-auto px-8 pb-10">
      <div className={gridClasses}>
        {subjects.map((subject) => (
          <BookCover
            key={subject.id}
            subject={subject}
            onClick={() => navigateToSubject(subject.id)}
          />
        ))}
      </div>
    </div>
  );
};
