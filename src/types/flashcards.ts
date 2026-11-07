export interface Flashcard {
  id: string;
  front: string; // Question / Term
  back: string;  // Answer / Definition
  mastered?: boolean;
  lastReviewed?: string;
}

export interface FlashcardDeck {
  id: string;
  name: string;
  description?: string;
  subject?: string;
  folderId?: string;
  cards: Flashcard[];
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardInfographic {
  id: string;
  name: string;
  folderId: string | null;
  image: Blob;
  mimeType: 'image/png' | 'image/jpeg';
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardFolder {
  id: string;
  name: string;
  parentId: string;
  subjectId: string;
  createdAt: string;
}

export type FlashcardFolderGradient = [string, string];
export type FlashcardFolderGradients = Record<string, FlashcardFolderGradient>;

export interface FlashcardFolderOption {
  id: string;
  label: string;
  subjectId: string;
  subjectName: string;
}

export interface CsvPreview {
  headers: string[];
  rows: string[][];
  detectedQuestionIndex: number;
  detectedAnswerIndex: number;
  totalCards: number;
}
