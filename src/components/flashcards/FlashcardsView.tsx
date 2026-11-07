import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileImage,
  FolderPlus,
  ImagePlus,
  Layers,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Play,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useFlashcards } from '../../context/FlashcardsContext';
import { useLibrary } from '../../context/LibraryContext';
import { BookFolder, Subject } from '../../types/library';
import { FlashcardDeck, FlashcardFolder, FlashcardFolderOption, FlashcardInfographic } from '../../types/flashcards';
import { CsvImporterModal } from './CsvImporterModal';
import { FlashcardStudy } from './FlashcardStudy';

type ViewMode = 'grid' | 'list';

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  subjectId: string;
  isSubject: boolean;
  isCustom: boolean;
  children: FolderNode[];
}

const EMPTY_FOLDER_COLORS: [string, string] = ['#737373', '#525252'];

const hexToHsl = (value: string): [number, number, number] => {
  const hex = value.replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const number = Number.parseInt(normalized, 16);
  let red = ((number >> 16) & 255) / 255;
  let green = ((number >> 8) & 255) / 255;
  let blue = (number & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case red: hue = (green - blue) / delta + (green < blue ? 6 : 0); break;
      case green: hue = (blue - red) / delta + 2; break;
      default: hue = (red - green) / delta + 4; break;
    }
    hue /= 6;
  }

  return [hue * 360, saturation * 100, lightness * 100];
};

const shiftHue = (color: string, shift: number): string => {
  const [hue, saturation, lightness] = hexToHsl(color);
  return `hsl(${(hue + shift + 360) % 360} ${saturation}% ${lightness}%)`;
};

const getRandomGradient = (folderId: string, base: [string, string]): [string, string] => {
  const hash = Array.from(folderId).reduce((value, character) => ((value << 5) - value + character.charCodeAt(0)) | 0, 0);
  const hueShift = (Math.abs(hash) % 241) - 120;
  return [shiftHue(base[0], hueShift), shiftHue(base[1], hueShift)];
};

const buildFolderTree = (subjects: Subject[], customFolders: FlashcardFolder[]): FolderNode[] => {
  const buildCustomNodes = (parentId: string, subjectId: string): FolderNode[] => customFolders
    .filter((folder) => folder.parentId === parentId)
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      subjectId,
      isSubject: false,
      isCustom: true,
      children: buildCustomNodes(folder.id, subjectId),
    }));

  const buildBookNode = (
    folder: BookFolder,
    parentId: string | null,
    subjectId: string,
    isSubject = false,
  ): FolderNode => {
    const id = isSubject ? folder.id : folder.path;
    return {
      id,
      name: folder.displayName,
      parentId,
      subjectId,
      isSubject,
      isCustom: false,
      children: [
        ...(folder.subfolders ?? []).map((child) => buildBookNode(child, id, subjectId)),
        ...(folder.files ?? []).map((file) => {
          const chapterId = `chapter:${file.id}`;
          return {
            id: chapterId,
            name: file.title,
            parentId: id,
            subjectId,
            isSubject: false,
            isCustom: false,
            children: buildCustomNodes(chapterId, subjectId),
          };
        }),
        ...buildCustomNodes(id, subjectId),
      ],
    };
  };

  return subjects.map((subject) => buildBookNode(subject, null, subject.id, true));
};

const flattenNodes = (nodes: FolderNode[]): FolderNode[] => nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);

const getNodePath = (node: FolderNode, nodesById: Map<string, FolderNode>): string => {
  const parts = [node.name];
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodesById.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join(' / ');
};

const getLegacyDeckFolderId = (deck: FlashcardDeck, roots: FolderNode[]): string | undefined => {
  if (deck.folderId) return deck.folderId;
  if (!deck.subject) return undefined;
  const subject = deck.subject.toLocaleLowerCase();
  return roots.find((node) => node.id.toLocaleLowerCase() === subject || node.name.toLocaleLowerCase() === subject)?.id;
};

const GradientFolderIcon: React.FC<{ id: string; colors: [string, string]; size?: number }> = ({ id, colors, size = 50 }) => {
  const gradientId = `flashcard_folder_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors[0]} />
          <stop offset="100%" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <path
        d="M4 4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4H4Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
};

interface FolderTileProps {
  folder: FolderNode;
  colors: [string, string];
  folderCount: number;
  deckCount: number;
  infographicCount: number;
  onOpen: () => void;
}

const FolderTile: React.FC<FolderTileProps> = ({ folder, colors, folderCount, deckCount, infographicCount, onOpen }) => (
  <button
    onClick={onOpen}
    className="group flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-[#141414] p-4 text-center transition hover:border-white/20 hover:bg-[#191919] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    title={folder.name}
  >
    <div className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]">
      <GradientFolderIcon id={folder.id} colors={colors} size={52} />
    </div>
    <span className="max-w-full text-sm font-semibold leading-snug text-white line-clamp-2">{folder.name}</span>
    <span className="text-[10px] text-neutral-500">
      {folderCount} folders · {deckCount} decks · {infographicCount} infographics
    </span>
  </button>
);

const FolderListRow: React.FC<FolderTileProps> = ({ folder, colors, folderCount, deckCount, infographicCount, onOpen }) => (
  <button
    onClick={onOpen}
    className="group flex w-full items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/[0.06] hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    title={folder.name}
  >
    <GradientFolderIcon id={folder.id} colors={colors} size={30} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-white">{folder.name}</span>
      <span className="block text-xs text-neutral-500">
        {folderCount} folders · {deckCount} decks · {infographicCount} infographics
      </span>
    </span>
    <ChevronRight size={16} className="text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-neutral-300" />
  </button>
);

interface DeckCardProps {
  deck: FlashcardDeck;
  mode: ViewMode;
  onStudy: () => void;
  onDelete: () => void;
  onRename: () => void;
}

const DeckCard: React.FC<DeckCardProps> = ({ deck, mode, onStudy, onDelete, onRename }) => {
  const mastered = deck.cards.filter((card) => card.mastered).length;
  const pct = deck.cards.length ? Math.round((mastered / deck.cards.length) * 100) : 0;

  return (
    <div className={`group rounded-xl border border-bg-border bg-bg-card ${mode === 'grid' ? 'flex flex-col gap-4 p-4' : 'flex items-center gap-4 px-3 py-2.5'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-neutral-400">
          <Layers size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-txt-primary">{deck.name}</h3>
          <p className="mt-0.5 truncate text-xs text-txt-muted">{deck.subject || 'Flashcards'}</p>
        </div>
        <button
          onClick={onRename}
          aria-label={`Rename ${deck.name}`}
          title="Rename deck"
          className="shrink-0 rounded-md p-1.5 text-txt-muted transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete ${deck.name}`}
          title="Delete deck"
          className="shrink-0 rounded-md p-1.5 text-txt-muted transition hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className={`flex items-center gap-3 ${mode === 'grid' ? 'justify-between' : ''}`}>
        <div className="min-w-20 flex-1 space-y-1.5">
          <div className="flex justify-between gap-3 font-mono text-[10px] text-txt-muted">
            <span>{deck.cards.length} cards</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-bg-hover">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          onClick={onStudy}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-surface px-3 py-2 text-xs text-txt-secondary transition hover:border-white/20 hover:text-txt-primary"
        >
          <Play size={12} fill="currentColor" /> Study
        </button>
      </div>
    </div>
  );
};

interface InfographicCardProps {
  infographic: FlashcardInfographic;
  mode: ViewMode;
  onRename: () => void;
  onDelete: () => void;
}

const InfographicCard: React.FC<InfographicCardProps> = ({ infographic, mode, onRename, onDelete }) => {
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(infographic.image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [infographic.image]);

  return (
    <article className={`group overflow-hidden rounded-xl border border-bg-border bg-bg-card ${mode === 'grid' ? 'flex flex-col' : 'flex items-center gap-3 p-2'}`}>
      <div className={`flex items-center justify-center overflow-hidden bg-black/20 ${mode === 'grid' ? 'aspect-[4/3] w-full' : 'h-16 w-20 shrink-0 rounded-lg'}`}>
        {imageUrl && <img src={imageUrl} alt={infographic.name} className="h-full w-full object-contain" />}
      </div>
      <div className={`flex min-w-0 items-center gap-1 ${mode === 'grid' ? 'p-2.5' : 'flex-1'}`}>
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-txt-primary" title={infographic.name}>{infographic.name}</span>
        <button onClick={onRename} aria-label={`Rename ${infographic.name}`} title="Rename infographic" className="shrink-0 rounded-md p-1.5 text-txt-muted transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><Pencil size={13} /></button>
        <button onClick={onDelete} aria-label={`Delete ${infographic.name}`} title="Delete infographic" className="shrink-0 rounded-md p-1.5 text-txt-muted transition hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><Trash2 size={13} /></button>
      </div>
    </article>
  );
};

interface DialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

const Dialog: React.FC<DialogProps> = ({ title, children, onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
    <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-bg-border bg-[#151515] p-5 shadow-modal sm:p-6" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white"><X size={17} /></button>
      </div>
      {children}
    </div>
  </div>
);

export const FlashcardsView: React.FC<{ searchQuery?: string }> = ({ searchQuery = '' }) => {
  const {
    decks,
    infographics,
    activeDeck,
    setActiveDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    createInfographic,
    updateInfographic,
    deleteInfographic,
    folders: customFolders,
    createFolder,
    folderGradients,
  } = useFlashcards();
  const { subjects } = useLibrary();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem('studylab_flashcards_view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ type: 'deck' | 'infographic'; id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'deck' | 'infographic'; id: string; name: string } | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageError, setImageError] = useState('');
  const [managementError, setManagementError] = useState('');
  const [isSavingImage, setIsSavingImage] = useState(false);
  const imageFileRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('studylab_flashcards_view', viewMode);
    } catch {
      // Ignore unavailable local storage.
    }
  }, [viewMode]);

  const rootFolders = useMemo(() => buildFolderTree(subjects, customFolders), [subjects, customFolders]);
  const allFolders = useMemo(() => flattenNodes(rootFolders), [rootFolders]);
  const foldersById = useMemo(() => new Map(allFolders.map((folder) => [folder.id, folder])), [allFolders]);
  const currentFolder = currentFolderId ? foldersById.get(currentFolderId) ?? null : null;
  const currentChildren = currentFolder?.children ?? rootFolders;

  const folderOptions = useMemo<FlashcardFolderOption[]>(() => allFolders.map((folder) => ({
    id: folder.id,
    label: getNodePath(folder, foldersById),
    subjectId: folder.subjectId,
    subjectName: rootFolders.find((root) => root.id === folder.subjectId)?.name ?? folder.subjectId,
  })), [allFolders, foldersById, rootFolders]);

  const deckLocations = useMemo(() => decks.map((deck) => ({
    deck,
    folderId: getLegacyDeckFolderId(deck, rootFolders),
  })), [decks, rootFolders]);

  const decksInFolder = deckLocations
    .filter((entry) => entry.folderId === currentFolderId)
    .map((entry) => entry.deck);
  const infographicsInFolder = infographics.filter((item) => item.folderId === currentFolderId);

  const getFolderDeckCount = (folderId: string) => deckLocations.filter((entry) => entry.folderId === folderId).length;
  const getFolderInfographicCount = (folderId: string) => infographics.filter((item) => item.folderId === folderId).length;
  const getFolderPath = (folderId: string | null | undefined) => folderId ? (foldersById.has(folderId) ? getNodePath(foldersById.get(folderId)!, foldersById) : '') : '';

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const searchedFolders = normalizedQuery ? allFolders.filter((folder) => getNodePath(folder, foldersById).toLocaleLowerCase().includes(normalizedQuery)) : [];
  const searchedDecks = normalizedQuery ? deckLocations.filter(({ deck, folderId }) =>
    deck.name.toLocaleLowerCase().includes(normalizedQuery) || getFolderPath(folderId).toLocaleLowerCase().includes(normalizedQuery),
  ) : [];
  const searchedInfographics = normalizedQuery ? infographics.filter((item) =>
    item.name.toLocaleLowerCase().includes(normalizedQuery) || getFolderPath(item.folderId).toLocaleLowerCase().includes(normalizedQuery),
  ) : [];

  const breadcrumbs: FolderNode[] = [];
  let breadcrumbNode = currentFolder;
  while (breadcrumbNode) {
    breadcrumbs.unshift(breadcrumbNode);
    breadcrumbNode = breadcrumbNode.parentId ? foldersById.get(breadcrumbNode.parentId) ?? null : null;
  }

  if (activeDeck) {
    return (
      <FlashcardStudy
        deck={activeDeck}
        onBack={() => setActiveDeck(null)}
        onUpdateDeck={updateDeck}
      />
    );
  }

  const saveNewFolder = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!currentFolder || !name) return;
    if (currentFolder.children.some((child) => child.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setFolderError('A folder with that name already exists here.');
      return;
    }
    createFolder(name, currentFolder.id, currentFolder.subjectId);
    setNewFolderName('');
    setFolderError('');
    setCreatingFolder(false);
  };

  const handleImageSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setImageError('Choose a PNG or JPG image.');
      return;
    }
    setPendingImage(file);
    setImageName(file.name.replace(/\.(png|jpe?g)$/i, '').replace(/[-_]/g, ' '));
    setImageError('');
  };

  const saveImage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingImage || !imageName.trim()) return;
    setIsSavingImage(true);
    setImageError('');
    try {
      await createInfographic({
        name: imageName.trim(),
        folderId: currentFolderId,
        image: pendingImage,
        mimeType: pendingImage.type as 'image/png' | 'image/jpeg',
      });
      setPendingImage(null);
      setImageName('');
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Could not save this infographic.');
    } finally {
      setIsSavingImage(false);
    }
  };

  const saveRename = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = renameTarget?.name.trim();
    if (!renameTarget || !name) return;
    if (renameTarget.type === 'deck') {
      const deck = decks.find((item) => item.id === renameTarget.id);
      if (deck) updateDeck({ ...deck, name });
    } else {
      const infographic = infographics.find((item) => item.id === renameTarget.id);
      if (infographic) {
        try {
          await updateInfographic({ ...infographic, name });
        } catch (error) {
          setManagementError(error instanceof Error ? error.message : 'Could not rename this infographic.');
          return;
        }
      }
    }
    setRenameTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'deck') deleteDeck(deleteTarget.id);
      else await deleteInfographic(deleteTarget.id);
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : 'Could not delete this item.');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Flashcard folder path" className="flex flex-wrap items-center gap-1 text-sm">
            <button onClick={() => setCurrentFolderId(null)} className={`${currentFolder ? 'text-neutral-500 hover:text-white' : 'font-medium text-white'}`}>
              Flashcards
            </button>
            {breadcrumbs.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <ChevronRight size={13} className="text-neutral-700" />
                <button
                  onClick={() => setCurrentFolderId(folder.id)}
                  className={`${index === breadcrumbs.length - 1 ? 'font-medium text-white' : 'text-neutral-500 hover:text-white'}`}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <p className="mt-1 text-xs text-neutral-500">
            {currentFolder
              ? `${currentChildren.length} folders · ${decksInFolder.length} decks · ${infographicsInFolder.length} infographics`
              : `${rootFolders.length} subject folders · ${decks.length} decks · ${infographicsInFolder.length} infographics`}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {currentFolder && (
            <button
              onClick={() => { setCreatingFolder((open) => !open); setFolderError(''); }}
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-surface px-3 py-2 text-xs text-txt-secondary transition hover:border-white/20 hover:text-txt-primary"
            >
              <FolderPlus size={14} /> New folder
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-surface px-3 py-2 text-xs text-txt-secondary transition hover:border-white/20 hover:text-txt-primary"
          >
            <Upload size={14} /> Import CSV
          </button>
          <input ref={imageFileRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden" onChange={handleImageSelection} />
          <button
            onClick={() => { setImageError(''); imageFileRef.current?.click(); }}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-surface px-3 py-2 text-xs text-txt-secondary transition hover:border-white/20 hover:text-txt-primary"
          >
            <ImagePlus size={14} /> Add infographic
          </button>
          <div className="flex items-center rounded-lg border border-bg-border bg-bg-surface p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {creatingFolder && currentFolder && (
        <form onSubmit={saveNewFolder} className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <FolderPlus size={16} className="text-neutral-500" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(event) => { setNewFolderName(event.target.value); setFolderError(''); }}
            placeholder={`New folder in ${currentFolder.name}`}
            aria-label="New folder name"
            className="min-w-48 flex-1 bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-neutral-600"
          />
          <button type="submit" disabled={!newFolderName.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Create folder</button>
          <button type="button" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} aria-label="Cancel folder creation" className="rounded-lg p-1.5 text-neutral-500 hover:text-white"><X size={15} /></button>
          {folderError && <p className="w-full pl-7 text-xs text-red-300">{folderError}</p>}
        </form>
      )}

      {normalizedQuery ? (
        searchedFolders.length || searchedDecks.length || searchedInfographics.length ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6' : 'space-y-1'}>
            {searchedFolders.map((folder) => {
              const subjectGradient = folderGradients[folder.subjectId] ?? ['#38bdf8', '#2563eb'];
              const hasItems = folder.children.length > 0 || getFolderDeckCount(folder.id) > 0 || getFolderInfographicCount(folder.id) > 0;
              const gradient: [string, string] = hasItems ? getRandomGradient(folder.id, subjectGradient) : EMPTY_FOLDER_COLORS;
              const folderProps: FolderTileProps = {
                folder,
                colors: gradient,
                folderCount: folder.children.length,
                deckCount: getFolderDeckCount(folder.id),
                infographicCount: getFolderInfographicCount(folder.id),
                onOpen: () => { setCurrentFolderId(folder.id); setCreatingFolder(false); },
              };
              return viewMode === 'grid' ? <FolderTile key={`search-${folder.id}`} {...folderProps} /> : <FolderListRow key={`search-${folder.id}`} {...folderProps} />;
            })}
            {searchedDecks.map(({ deck, folderId }) => (
              <DeckCard
                key={`search-${deck.id}`}
                deck={{ ...deck, subject: getFolderPath(folderId) || deck.subject }}
                mode={viewMode}
                onStudy={() => setActiveDeck(deck)}
                onRename={() => setRenameTarget({ type: 'deck', id: deck.id, name: deck.name })}
                onDelete={() => setDeleteTarget({ type: 'deck', id: deck.id, name: deck.name })}
              />
            ))}
            {searchedInfographics.map((infographic) => (
              <InfographicCard
                key={`search-${infographic.id}`}
                infographic={infographic}
                mode={viewMode}
                onRename={() => setRenameTarget({ type: 'infographic', id: infographic.id, name: infographic.name })}
                onDelete={() => setDeleteTarget({ type: 'infographic', id: infographic.id, name: infographic.name })}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.08] text-center">
            <Search size={20} className="text-neutral-600" />
            <h2 className="text-sm font-medium text-neutral-200">No matching flashcards or infographics</h2>
            <p className="text-xs text-neutral-500">Search by deck, folder, or infographic name.</p>
          </div>
        )
      ) : currentChildren.length || decksInFolder.length || infographicsInFolder.length ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6' : 'space-y-1'}>
          {currentChildren.map((folder) => {
            const subjectGradient = folderGradients[folder.subjectId] ?? ['#38bdf8', '#2563eb'];
            const hasItems = folder.children.length > 0 || getFolderDeckCount(folder.id) > 0 || getFolderInfographicCount(folder.id) > 0;
            const gradient: [string, string] = hasItems
              ? getRandomGradient(folder.id, subjectGradient)
              : EMPTY_FOLDER_COLORS;
            const folderProps: FolderTileProps = {
              folder,
              colors: gradient,
              folderCount: folder.children.length,
              deckCount: getFolderDeckCount(folder.id),
              infographicCount: getFolderInfographicCount(folder.id),
              onOpen: () => { setCurrentFolderId(folder.id); setCreatingFolder(false); },
            };
            return viewMode === 'grid'
              ? <FolderTile key={folder.id} {...folderProps} />
              : <FolderListRow key={folder.id} {...folderProps} />;
          })}
          {decksInFolder.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              mode={viewMode}
              onStudy={() => setActiveDeck(deck)}
              onRename={() => setRenameTarget({ type: 'deck', id: deck.id, name: deck.name })}
              onDelete={() => setDeleteTarget({ type: 'deck', id: deck.id, name: deck.name })}
            />
          ))}
          {infographicsInFolder.map((infographic) => (
            <InfographicCard
              key={infographic.id}
              infographic={infographic}
              mode={viewMode}
              onRename={() => setRenameTarget({ type: 'infographic', id: infographic.id, name: infographic.name })}
              onDelete={() => setDeleteTarget({ type: 'infographic', id: infographic.id, name: infographic.name })}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.08] text-center">
          <GradientFolderIcon id={`empty_${currentFolder?.id ?? 'root'}`} colors={EMPTY_FOLDER_COLORS} size={48} />
          <div>
            <h2 className="text-sm font-medium text-neutral-200">This folder is empty</h2>
            <p className="mt-1 text-xs text-neutral-500">Create a folder, import a deck, or add an infographic here.</p>
          </div>
          {currentFolder && (
            <button onClick={() => setCreatingFolder(true)} className="flex items-center gap-2 rounded-lg bg-bg-surface px-3 py-2 text-xs text-white hover:bg-white/10">
              <Plus size={13} /> Create folder
            </button>
          )}
        </div>
      )}

      {currentFolder && !creatingFolder && currentChildren.length > 0 && (
        <p className="mt-5 flex items-center gap-1.5 text-[11px] text-neutral-600">
          <ArrowLeft size={12} /> Open a folder to browse deeper or import a deck into this location.
        </p>
      )}

      {managementError && <p role="alert" className="mt-4 text-sm text-red-300">{managementError}</p>}

      <CsvImporterModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        folderOptions={folderOptions}
        defaultFolderId={currentFolderId ?? ''}
        onImport={(data) => {
          const deck = createDeck(data);
          setActiveDeck(deck);
        }}
      />

      {pendingImage && (
        <Dialog title="Add infographic" onClose={() => { if (!isSavingImage) { setPendingImage(null); setImageName(''); setImageError(''); } }}>
          <form onSubmit={saveImage} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-bg-border bg-bg-card p-3">
              <FileImage size={19} className="shrink-0 text-blue-300" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{pendingImage.name}</p>
                <p className="text-xs text-neutral-500">{(pendingImage.size / 1024 / 1024).toFixed(2)} MB · {currentFolder ? `Saved to ${currentFolder.name}` : 'Saved in the root folder'}</p>
              </div>
            </div>
            <label className="block text-xs font-medium text-neutral-300" htmlFor="infographic-name">Infographic name</label>
            <input
              id="infographic-name"
              autoFocus
              required
              value={imageName}
              onChange={(event) => setImageName(event.target.value)}
              className="-mt-3 w-full rounded-lg border border-bg-border bg-bg-card px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400"
              placeholder="Name this infographic"
            />
            {imageError && <p role="alert" className="text-xs text-red-300">{imageError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setPendingImage(null); setImageName(''); }} disabled={isSavingImage} className="rounded-lg border border-bg-border px-4 py-2 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={!imageName.trim() || isSavingImage} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">{isSavingImage ? 'Saving…' : <><Check size={15} /> Save infographic</>}</button>
            </div>
          </form>
        </Dialog>
      )}

      {renameTarget && (
        <Dialog title={`Rename ${renameTarget.type}`} onClose={() => setRenameTarget(null)}>
          <form onSubmit={saveRename} className="space-y-4">
            <label htmlFor="rename-item" className="block text-xs font-medium text-neutral-300">Name</label>
            <input id="rename-item" autoFocus required value={renameTarget.name} onChange={(event) => setRenameTarget({ ...renameTarget, name: event.target.value })} className="-mt-3 w-full rounded-lg border border-bg-border bg-bg-card px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRenameTarget(null)} className="rounded-lg border border-bg-border px-4 py-2 text-sm text-neutral-300 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={!renameTarget.name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">Save name</button>
            </div>
          </form>
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog title={`Delete ${deleteTarget.type}?`} onClose={() => setDeleteTarget(null)}>
          <p className="text-sm leading-relaxed text-neutral-400">
            Delete <span className="font-medium text-white">{deleteTarget.name}</span>{deleteTarget.type === 'deck' ? ' and its flashcards' : ''}? This action cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-bg-border px-4 py-2 text-sm text-neutral-300 hover:bg-white/5">Cancel</button>
            <button type="button" onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">Delete</button>
          </div>
        </Dialog>
      )}
    </div>
  );
};
