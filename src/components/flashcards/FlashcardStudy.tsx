import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, RotateCw, ChevronLeft, ChevronRight, Shuffle, CheckCircle,
} from 'lucide-react';
import { FlashcardDeck, Flashcard } from '../../types/flashcards';

interface Props {
  deck: FlashcardDeck;
  onBack: () => void;
  onUpdateDeck: (d: FlashcardDeck) => void;
}

export const FlashcardStudy: React.FC<Props> = ({ deck, onBack, onUpdateDeck }) => {
  const [cards, setCards] = useState<Flashcard[]>(deck.cards);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flipAnimation, setFlipAnimation] = useState<'forward' | 'back' | null>(null);

  useEffect(() => { setCards(deck.cards); }, [deck]);

  const card = cards[idx];
  const toggleFlip = () => {
    setFlipAnimation(flipped ? 'back' : 'forward');
    setFlipped((current) => !current);
  };
  const next = () => { setFlipped(false); setFlipAnimation(null); setIdx((i) => (i < cards.length - 1 ? i + 1 : 0)); };
  const prev = () => { setFlipped(false); setFlipAnimation(null); setIdx((i) => (i > 0 ? i - 1 : cards.length - 1)); };

  const shuffle = () => {
    setFlipped(false);
    setFlipAnimation(null);
    setCards([...cards].sort(() => Math.random() - 0.5));
    setIdx(0);
  };

  const toggleMastered = () => {
    if (!card) return;
    const updated = cards.map((c, i) => i === idx ? { ...c, mastered: !c.mastered } : c);
    setCards(updated);
    onUpdateDeck({ ...deck, cards: updated });
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFlip(); }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'm') toggleMastered();
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [idx, cards, flipped]);

  if (!card) return null;

  const mastered = cards.filter((c) => c.mastered).length;
  const pct = Math.round(((idx + 1) / cards.length) * 100);

  return (
    <div className="flex-1 flex flex-col items-center px-6 py-6 overflow-y-auto max-w-2xl mx-auto w-full gap-5">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-txt-muted hover:text-txt-secondary">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-txt-primary">{deck.name}</p>
          <p className="text-xs text-txt-muted">{idx + 1} / {cards.length}</p>
        </div>
        <button onClick={shuffle} className="flex items-center gap-1.5 text-xs text-txt-muted hover:text-txt-secondary">
          <Shuffle size={13} /> Shuffle
        </button>
      </div>

      {/* Progress */}
      <div className="w-full h-1 rounded-full bg-bg-hover overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Card */}
      <button
        onClick={toggleFlip}
        className={`w-full rounded-2xl border flex flex-col items-center justify-center gap-4 p-10 min-h-[260px] transition-colors cursor-pointer select-none focus:outline-none ${flipAnimation ? `flashcard-turn-${flipAnimation}` : ''}
          ${flipped
            ? 'bg-[#15803d] border-[#22c55e]/40 shadow-[0_16px_50px_rgba(21,128,61,0.24)]'
            : 'bg-bg-card border-bg-border'
          }`}
        style={{ flex: '0 0 auto' }}
      >
        <span className={`text-[10px] uppercase tracking-widest font-medium ${flipped ? 'text-white/75' : 'text-txt-muted'}`}>
          {flipped ? 'Answer' : 'Question'}
        </span>
        <p className={`text-base font-medium text-center leading-relaxed ${flipped ? 'text-white' : 'text-txt-primary'}`}>
          {flipped ? card.back : card.front}
        </p>
        <span className={`text-[10px] ${flipped ? 'text-white/60' : 'text-txt-muted opacity-50'}`}>Space to flip</span>
      </button>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button onClick={prev} className="w-10 h-10 rounded-xl bg-bg-card border border-bg-border flex items-center justify-center text-txt-muted hover:text-txt-primary transition-colors">
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={toggleMastered}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-medium transition-colors ${
            card.mastered
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-bg-card border-bg-border text-txt-muted hover:text-txt-primary'
          }`}
        >
          <CheckCircle size={13} />
          {card.mastered ? 'Mastered' : 'Mark mastered'}
        </button>
        <button onClick={next} className="w-10 h-10 rounded-xl bg-bg-card border border-bg-border flex items-center justify-center text-txt-muted hover:text-txt-primary transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};
