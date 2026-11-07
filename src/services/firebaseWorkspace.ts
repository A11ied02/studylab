import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  Firestore,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseDb } from './firebaseClient';
import { CloudWorkspaceSnapshot } from './workspaceBackup';

const CHUNK_CHARACTERS = 600_000;
// Keep each Firestore commit below the 10 MiB request limit as well as the 500-write limit.
const MAX_BATCH_WRITES = 12;

export interface LoadedCloudWorkspace {
  snapshot: CloudWorkspaceSnapshot;
  serialized: string;
  revision: string;
}

const getDb = (): Firestore => {
  if (!firebaseDb) throw new Error('Firebase is not configured. Add the config to src/services/firebase.ts or set the VITE_FIREBASE_* values in .env.local.');
  return firebaseDb;
};

const currentWorkspaceDoc = (uid: string) => doc(getDb(), 'users', uid, 'workspace', 'current');
const snapshotCollection = (uid: string) => collection(getDb(), 'users', uid, 'workspaceSnapshots');
const snapshotDoc = (uid: string, snapshotId: string) => doc(getDb(), 'users', uid, 'workspaceSnapshots', snapshotId);
const snapshotChunks = (uid: string, snapshotId: string) => collection(getDb(), 'users', uid, 'workspaceSnapshots', snapshotId, 'chunks');

const encodeBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const decodeBase64 = (value: string): string => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
};

const splitIntoChunks = (value: string): string[] => {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += CHUNK_CHARACTERS) {
    chunks.push(value.slice(offset, offset + CHUNK_CHARACTERS));
  }
  return chunks.length ? chunks : [''];
};

export const FirebaseWorkspace = {
  async getRevision(uid: string): Promise<string | null> {
    const current = await getDoc(currentWorkspaceDoc(uid));
    if (!current.exists()) return null;
    const snapshotId = current.data().snapshotId;
    return typeof snapshotId === 'string' ? snapshotId : null;
  },

  async load(uid: string): Promise<LoadedCloudWorkspace | null> {
    const current = await getDoc(currentWorkspaceDoc(uid));
    if (!current.exists()) return null;
    const { snapshotId, chunkCount } = current.data();
    if (typeof snapshotId !== 'string' || !Number.isInteger(chunkCount) || chunkCount < 1) {
      throw new Error('The saved Firebase workspace is incomplete. Check Firestore rules and try again.');
    }

    const chunksSnapshot = await getDocs(snapshotChunks(uid, snapshotId));
    const chunks = new Array<string>(chunkCount);
    chunksSnapshot.forEach((chunkDoc) => {
      const { index, data } = chunkDoc.data();
      if (Number.isInteger(index) && typeof data === 'string' && index >= 0 && index < chunkCount) chunks[index] = data;
    });
    if (chunks.some((chunk) => typeof chunk !== 'string')) {
      throw new Error('The saved Firebase workspace is missing data. Check your connection and try again.');
    }

    const serialized = decodeBase64(chunks.join(''));
    const snapshot = JSON.parse(serialized) as CloudWorkspaceSnapshot;
    return { snapshot, serialized, revision: snapshotId };
  },

  async save(uid: string, serialized: string): Promise<string> {
    const db = getDb();
    const previous = await getDoc(currentWorkspaceDoc(uid));
    const previousSnapshotId = previous.exists() && typeof previous.data().snapshotId === 'string'
      ? previous.data().snapshotId as string
      : null;
    const encoded = encodeBase64(serialized);
    const chunks = splitIntoChunks(encoded);
    if (chunks.length > 20_000) throw new Error('This workspace is too large to sync to Firestore.');

    const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await setDoc(snapshotDoc(uid, snapshotId), { version: 1, chunkCount: chunks.length, createdAt: serverTimestamp() });
    for (let offset = 0; offset < chunks.length; offset += MAX_BATCH_WRITES) {
      const batch = writeBatch(db);
      chunks.slice(offset, offset + MAX_BATCH_WRITES).forEach((data, batchIndex) => {
        const index = offset + batchIndex;
        batch.set(doc(snapshotChunks(uid, snapshotId), String(index).padStart(6, '0')), { index, data });
      });
      await batch.commit();
    }

    await setDoc(currentWorkspaceDoc(uid), {
      snapshotId,
      chunkCount: chunks.length,
      version: 1,
      updatedAt: serverTimestamp(),
    });

    if (previousSnapshotId) {
      try {
        await this.removeSnapshot(uid, previousSnapshotId);
      } catch (cleanupError) {
        console.warn('Old Firebase workspace snapshot cleanup failed.', cleanupError);
      }
    }
    return snapshotId;
  },

  async removeSnapshot(uid: string, snapshotId: string): Promise<void> {
    const db = getDb();
    const chunks = await getDocs(snapshotChunks(uid, snapshotId));
    const refs = chunks.docs.map((item) => item.ref);
    refs.push(snapshotDoc(uid, snapshotId));
    for (let offset = 0; offset < refs.length; offset += MAX_BATCH_WRITES) {
      const batch = writeBatch(db);
      refs.slice(offset, offset + MAX_BATCH_WRITES).forEach((reference) => batch.delete(reference));
      await batch.commit();
    }
  },

  async deleteWorkspace(uid: string): Promise<void> {
    const db = getDb();
    const current = await getDoc(currentWorkspaceDoc(uid));
    const currentSnapshotId = current.exists() && typeof current.data().snapshotId === 'string'
      ? current.data().snapshotId as string
      : null;
    if (currentSnapshotId) await this.removeSnapshot(uid, currentSnapshotId);
    const snapshots = await getDocs(snapshotCollection(uid));
    for (const snapshot of snapshots.docs) await this.removeSnapshot(uid, snapshot.id);
    await deleteDoc(currentWorkspaceDoc(uid));
  },
};

