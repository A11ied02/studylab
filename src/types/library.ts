export interface BookFile {
  id: string;
  filename: string;
  title: string;
  path: string; // relative to baseUrl, e.g. "books/SST/Eco/01 - Development.pdf"
  rawPath: string; // relative filesystem path inside ClassXbooks
  sizeBytes: number;
  thumbnailUrl: string; // relative thumbnail, e.g. "thumbnails/SST/Eco/01 - Development.png"
  isEconomicsException?: boolean;
  isAdvancedSearchable?: boolean;
}

export interface BookFolder {
  id: string;
  name: string;
  path: string; // relative path from books root, e.g. "SST/Civics"
  displayName: string; // resolved via foldernamemap.json
  cover: string;
  subfolders: BookFolder[];
  files: BookFile[];
}

export interface Subject extends BookFolder {
  // Top-level subjects
}

export interface LibraryManifest {
  generatedAt: string;
  sourceDirectory: string;
  totalPdfs: number;
  subjects: Subject[];
}

export type FolderNameMap = Record<string, string>;

export interface ActiveView {
  tab: 'books' | 'flashcards' | 'pyqs';
  subjectId?: string | null;
  folderPath?: string | null;
  activePdf?: BookFile | null;
}
