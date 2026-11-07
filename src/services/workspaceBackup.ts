import JSZip from 'jszip';
import { FlashcardInfographic } from '../types/flashcards';
import { InfographicsStorage } from './infographics';

const BACKUP_PATH = 'workspace.json';
const INFOGRAPHIC_PREFIX = 'infographics/';

interface WorkspaceManifest {
  format: 'studylab-workspace';
  version: 1;
  exportedAt: string;
  entries: Record<string, string>;
  infographics: Array<Omit<FlashcardInfographic, 'image'> & { imagePath: string }>;
}

export interface CloudWorkspaceSnapshot {
  format: 'studylab-cloud-workspace';
  version: 1;
  entries: Record<string, string>;
  infographics: Array<Omit<FlashcardInfographic, 'image'> & { imageBase64: string }>;
}

const isWorkspaceKey = (key: string): boolean =>
  key.startsWith('studylab_') && !/(search|index)/i.test(key);

const getWorkspaceEntries = (includeBookHistory = true): Record<string, string> => {
  const entries: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && isWorkspaceKey(key) && (includeBookHistory || !key.includes('recent_books'))) {
      const value = localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  }
  return entries;
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const base64ToBlob = (value: string, mimeType: string): Blob => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
};

export const stableStringify = (value: unknown): string => {
  const sortObject = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sortObject);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortObject(nested)]));
    }
    return item;
  };
  return JSON.stringify(sortObject(value));
};

export const WorkspaceBackup = {
  async createCloudSnapshot(): Promise<CloudWorkspaceSnapshot> {
    const items = await InfographicsStorage.list();
    return {
      format: 'studylab-cloud-workspace',
      version: 1,
      entries: getWorkspaceEntries(false),
      infographics: await Promise.all(items.map(async ({ image, ...item }) => ({
        ...item,
        imageBase64: await blobToBase64(image),
      }))),
    };
  },

  async restoreCloudSnapshot(snapshot: CloudWorkspaceSnapshot): Promise<void> {
    if (snapshot.format !== 'studylab-cloud-workspace' || snapshot.version !== 1 || !snapshot.entries || typeof snapshot.entries !== 'object') {
      throw new Error('The Firebase workspace has an unsupported or invalid format.');
    }
    const entries = Object.entries(snapshot.entries).filter(([key, value]) =>
      isWorkspaceKey(key) && !key.includes('recent_books') && typeof value === 'string');
    const infographics = await Promise.all((Array.isArray(snapshot.infographics) ? snapshot.infographics : []).map(async (item) => {
      if (!item || typeof item.id !== 'string' || !/^[\w-]+$/.test(item.id) || typeof item.name !== 'string' || typeof item.imageBase64 !== 'string') {
        throw new Error('The Firebase workspace contains an invalid infographic record.');
      }
      if (item.mimeType !== 'image/png' && item.mimeType !== 'image/jpeg') {
        throw new Error(`The Firebase workspace contains an unsupported image type for “${item.name}”.`);
      }
      const { imageBase64, ...metadata } = item;
      return { ...metadata, image: base64ToBlob(imageBase64, item.mimeType) } as FlashcardInfographic;
    }));

    clearWorkspaceStorage();
    await InfographicsStorage.clear();
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
    for (const infographic of infographics) await InfographicsStorage.put(infographic);
  },

  async create(): Promise<Blob> {
    const zip = new JSZip();
    const items = await InfographicsStorage.list();
    const manifest: WorkspaceManifest = {
      format: 'studylab-workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: getWorkspaceEntries(),
      infographics: items.map(({ image, ...item }) => {
        const imagePath = `${INFOGRAPHIC_PREFIX}${item.id}.${item.mimeType === 'image/png' ? 'png' : 'jpg'}`;
        zip.file(imagePath, image);
        return { ...item, imagePath };
      }),
    };
    zip.file(BACKUP_PATH, JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  },

  async restore(file: Blob): Promise<void> {
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file(BACKUP_PATH);
    if (!manifestFile) throw new Error('This ZIP does not contain a Studylab workspace backup.');
    const parsed = JSON.parse(await manifestFile.async('string')) as Partial<WorkspaceManifest>;
    if (parsed.format !== 'studylab-workspace' || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
      throw new Error('This workspace backup has an unsupported or invalid format.');
    }

    const entries = Object.entries(parsed.entries).filter(([key, value]) => isWorkspaceKey(key) && typeof value === 'string');
    const infographicData = Array.isArray(parsed.infographics) ? parsed.infographics : [];
    const infographics: FlashcardInfographic[] = await Promise.all(infographicData.map(async (item) => {
      if (!item || typeof item.id !== 'string' || !/^[\w-]+$/.test(item.id) || typeof item.name !== 'string' || typeof item.imagePath !== 'string' || !new RegExp(`^${INFOGRAPHIC_PREFIX.replace('/', '\\/')}[\\w-]+\\.(png|jpg)$`).test(item.imagePath)) {
        throw new Error('The backup contains an invalid infographic record.');
      }
      if (item.mimeType !== 'image/png' && item.mimeType !== 'image/jpeg') {
        throw new Error(`The backup contains an unsupported image type for “${item.name}”.`);
      }
      const imageFile = zip.file(item.imagePath);
      if (!imageFile) throw new Error(`The image for “${item.name}” is missing from the backup.`);
      const image = await imageFile.async('blob');
      return {
        id: item.id,
        name: item.name,
        folderId: item.folderId ?? null,
        mimeType: item.mimeType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        image,
      };
    }));

    clearWorkspaceStorage();
    await InfographicsStorage.clear();
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
    for (const infographic of infographics) await InfographicsStorage.put(infographic);
  },

  async clear(): Promise<void> {
    clearWorkspaceStorage();
    await InfographicsStorage.clear();
  },
};

const clearWorkspaceStorage = (): void => {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && isWorkspaceKey(key)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
};
