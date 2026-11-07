import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  FlashcardDeck,
  FlashcardFolder,
  FlashcardFolderGradient,
  FlashcardFolderGradients,
  FlashcardInfographic,
} from '../types/flashcards';
import { StorageService } from '../services/storage';
import { InfographicsStorage } from '../services/infographics';

export const DEFAULT_FLASHCARD_FOLDER_GRADIENTS: FlashcardFolderGradients = {
  Science: ['#22c55e', '#059669'],
  Maths: ['#38bdf8', '#2563eb'],
  SST: ['#fb923c', '#ea580c'],
  'English Language and Literature': ['#8b5cf6', '#6d28d9'],
  Hindi: ['#f43f5e', '#be123c'],
  IT: ['#06b6d4', '#0284c7'],
};

interface FlashcardsContextType {
  decks: FlashcardDeck[];
  activeDeck: FlashcardDeck | null;
  setActiveDeck: (deck: FlashcardDeck | null) => void;
  createDeck: (deck: Omit<FlashcardDeck, 'id' | 'createdAt' | 'updatedAt'>) => FlashcardDeck;
  updateDeck: (deck: FlashcardDeck) => void;
  deleteDeck: (deckId: string) => void;
  infographics: FlashcardInfographic[];
  createInfographic: (data: Omit<FlashcardInfographic, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FlashcardInfographic>;
  updateInfographic: (infographic: FlashcardInfographic) => Promise<void>;
  deleteInfographic: (infographicId: string) => Promise<void>;
  folders: FlashcardFolder[];
  createFolder: (name: string, parentId: string, subjectId: string) => FlashcardFolder;
  folderGradients: FlashcardFolderGradients;
  setFolderGradient: (subjectId: string, gradient: FlashcardFolderGradient) => void;
  resetFolderGradients: () => void;
  clearAll: () => void;
}

const FlashcardsContext = createContext<FlashcardsContextType | undefined>(undefined);

export const FlashcardsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [decks, setDecks] = useState<FlashcardDeck[]>(() => StorageService.getDecks());
  const [folders, setFolders] = useState<FlashcardFolder[]>(() => StorageService.getFlashcardFolders());
  const [folderGradients, setFolderGradients] = useState<FlashcardFolderGradients>(() => ({
    ...DEFAULT_FLASHCARD_FOLDER_GRADIENTS,
    ...(StorageService.getFlashcardFolderGradients() ?? {}),
  }));
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [infographics, setInfographics] = useState<FlashcardInfographic[]>([]);

  useEffect(() => {
    let cancelled = false;
    InfographicsStorage.list()
      .then((items) => { if (!cancelled) setInfographics(items); })
      .catch((error) => console.error('Failed to load infographics', error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    StorageService.saveDecks(decks);
  }, [decks]);

  useEffect(() => {
    StorageService.saveFlashcardFolders(folders);
  }, [folders]);

  useEffect(() => {
    StorageService.saveFlashcardFolderGradients(folderGradients);
  }, [folderGradients]);

  const createFolder = (name: string, parentId: string, subjectId: string): FlashcardFolder => {
    const folder: FlashcardFolder = {
      id: `flashfolder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      parentId,
      subjectId,
      createdAt: new Date().toISOString(),
    };
    setFolders((previous) => [...previous, folder]);
    return folder;
  };

  const createDeck = (data: Omit<FlashcardDeck, 'id' | 'createdAt' | 'updatedAt'>): FlashcardDeck => {
    const newDeck: FlashcardDeck = {
      ...data,
      id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDecks(prev => [newDeck, ...prev]);
    return newDeck;
  };

  const updateDeck = (updated: FlashcardDeck) => {
    const modified: FlashcardDeck = {
      ...updated,
      updatedAt: new Date().toISOString()
    };
    setDecks(prev => prev.map(d => d.id === modified.id ? modified : d));
    if (activeDeck && activeDeck.id === modified.id) {
      setActiveDeck(modified);
    }
  };

  const deleteDeck = (deckId: string) => {
    setDecks(prev => prev.filter(d => d.id !== deckId));
    if (activeDeck && activeDeck.id === deckId) {
      setActiveDeck(null);
    }
  };

  const createInfographic = async (data: Omit<FlashcardInfographic, 'id' | 'createdAt' | 'updatedAt'>): Promise<FlashcardInfographic> => {
    const now = new Date().toISOString();
    const infographic: FlashcardInfographic = {
      ...data,
      id: `infographic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    await InfographicsStorage.put(infographic);
    setInfographics((previous) => [infographic, ...previous]);
    return infographic;
  };

  const updateInfographic = async (updated: FlashcardInfographic): Promise<void> => {
    const infographic = { ...updated, updatedAt: new Date().toISOString() };
    await InfographicsStorage.put(infographic);
    setInfographics((previous) => previous.map((item) => item.id === infographic.id ? infographic : item));
  };

  const deleteInfographic = async (infographicId: string): Promise<void> => {
    await InfographicsStorage.remove(infographicId);
    setInfographics((previous) => previous.filter((item) => item.id !== infographicId));
  };

  const setFolderGradient = (subjectId: string, gradient: FlashcardFolderGradient) => {
    setFolderGradients((previous) => ({ ...previous, [subjectId]: gradient }));
  };

  const resetFolderGradients = () => setFolderGradients(DEFAULT_FLASHCARD_FOLDER_GRADIENTS);

  const clearAll = () => {
    setDecks([]);
    setActiveDeck(null);
    StorageService.clearAllDecks();
  };

  return (
    <FlashcardsContext.Provider
      value={{
        decks,
        activeDeck,
        setActiveDeck,
        createDeck,
        updateDeck,
        deleteDeck,
        infographics,
        createInfographic,
        updateInfographic,
        deleteInfographic,
        folders,
        createFolder,
        folderGradients,
        setFolderGradient,
        resetFolderGradients,
        clearAll
      }}
    >
      {children}
    </FlashcardsContext.Provider>
  );
};

export function useFlashcards(): FlashcardsContextType {
  const ctx = useContext(FlashcardsContext);
  if (!ctx) {
    throw new Error('useFlashcards must be used within a FlashcardsProvider');
  }
  return ctx;
}
