import { FlashcardDeck, FlashcardFolder, FlashcardFolderGradients } from '../types/flashcards';

const FLASHCARDS_KEY = 'studylab_flashcards_decks';
const FLASHCARD_FOLDERS_KEY = 'studylab_flashcard_folders';
const FLASHCARD_FOLDER_GRADIENTS_KEY = 'studylab_flashcard_folder_gradients';
const THEME_KEY = 'studylab_theme_preference';
const RECENT_BOOKS_KEY = 'studylab_recent_books';
const SETTINGS_KEY = 'studylab_user_settings';

export interface RecentBookItem {
  id: string;
  title: string;
  path: string;
  thumbnailUrl: string;
  subjectName: string;
  lastOpened: string;
  currentPage?: number;
}

export const StorageService = {
  // Theme
  getTheme(): 'dark' | 'light' {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark'; // Default to dark theme per requirement
  },

  setTheme(theme: 'dark' | 'light'): void {
    localStorage.setItem(THEME_KEY, theme);
  },

  // Flashcards
  getDecks(): FlashcardDeck[] {
    try {
      const data = localStorage.getItem(FLASHCARDS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse flashcard decks from localStorage', e);
      return [];
    }
  },

  saveDecks(decks: FlashcardDeck[]): void {
    try {
      localStorage.setItem(FLASHCARDS_KEY, JSON.stringify(decks));
    } catch (e) {
      console.error('Failed to save flashcard decks to localStorage', e);
    }
  },

  getFlashcardFolders(): FlashcardFolder[] {
    try {
      const data = localStorage.getItem(FLASHCARD_FOLDERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse flashcard folders from localStorage', e);
      return [];
    }
  },

  saveFlashcardFolders(folders: FlashcardFolder[]): void {
    try {
      localStorage.setItem(FLASHCARD_FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.error('Failed to save flashcard folders to localStorage', e);
    }
  },

  getFlashcardFolderGradients(): FlashcardFolderGradients | null {
    try {
      const data = localStorage.getItem(FLASHCARD_FOLDER_GRADIENTS_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to parse flashcard folder gradients from localStorage', e);
      return null;
    }
  },

  saveFlashcardFolderGradients(gradients: FlashcardFolderGradients): void {
    try {
      localStorage.setItem(FLASHCARD_FOLDER_GRADIENTS_KEY, JSON.stringify(gradients));
    } catch (e) {
      console.error('Failed to save flashcard folder gradients to localStorage', e);
    }
  },

  saveDeck(deck: FlashcardDeck): void {
    const decks = this.getDecks();
    const existingIndex = decks.findIndex(d => d.id === deck.id);
    if (existingIndex >= 0) {
      decks[existingIndex] = deck;
    } else {
      decks.unshift(deck);
    }
    this.saveDecks(decks);
  },

  deleteDeck(deckId: string): void {
    const decks = this.getDecks().filter(d => d.id !== deckId);
    this.saveDecks(decks);
  },

  clearAllDecks(): void {
    localStorage.removeItem(FLASHCARDS_KEY);
  },

  // Recent Books
  getRecentBooks(): RecentBookItem[] {
    try {
      const data = localStorage.getItem(RECENT_BOOKS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  recordBookOpened(book: RecentBookItem): void {
    try {
      const list = this.getRecentBooks().filter(b => b.path !== book.path);
      list.unshift({ ...book, lastOpened: new Date().toISOString() });
      localStorage.setItem(RECENT_BOOKS_KEY, JSON.stringify(list.slice(0, 10)));
    } catch (e) {
      // ignore
    }
  },

  // Storage Stats
  getStorageUsage(): { usedBytes: number; formatted: string } {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        total += (localStorage.getItem(key) || '').length * 2;
      }
    }
    const formatted = total > 1024 * 1024 
      ? `${(total / (1024 * 1024)).toFixed(2)} MB` 
      : `${(total / 1024).toFixed(1)} KB`;
    return { usedBytes: total, formatted };
  }
};
