import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { FirebaseWorkspace } from '../services/firebaseWorkspace';
import { stableStringify, WorkspaceBackup } from '../services/workspaceBackup';

const SYNC_INTERVAL_KEY = 'studylab_sync_interval_seconds';
const DEFAULT_SYNC_INTERVAL = 5;

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'conflict';

interface CloudSyncContextValue {
  intervalSeconds: number;
  setIntervalSeconds: (seconds: number) => void;
  status: CloudSyncStatus;
  lastSyncedAt: Date | null;
  error: string;
  syncNow: () => Promise<void>;
  deleteCloudWorkspace: () => Promise<void>;
}

const CloudSyncContext = createContext<CloudSyncContextValue | undefined>(undefined);

const readInterval = (): number => {
  const saved = Number(localStorage.getItem(SYNC_INTERVAL_KEY));
  return Number.isFinite(saved) && saved >= 5 && saved <= 300 ? saved : DEFAULT_SYNC_INTERVAL;
};

export const CloudSyncProvider: React.FC<{
  user: User;
  initialSerialized: string | null;
  initialRevision: string | null;
  children: React.ReactNode;
}> = ({ user, initialSerialized, initialRevision, children }) => {
  const [intervalSeconds, setIntervalState] = useState(readInterval);
  const [status, setStatus] = useState<CloudSyncStatus>(initialSerialized ? 'synced' : 'idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(initialSerialized ? new Date() : null);
  const [error, setError] = useState('');
  const syncing = useRef(false);
  const lastPayload = useRef<string | null>(initialSerialized);
  const lastRevision = useRef<string | null>(initialRevision);

  const setIntervalSeconds = (seconds: number) => {
    const safeSeconds = Math.max(5, Math.min(300, Math.round(seconds)));
    setIntervalState(safeSeconds);
    localStorage.setItem(SYNC_INTERVAL_KEY, String(safeSeconds));
  };

  const syncNow = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setStatus('syncing');
    setError('');
    try {
      const localSnapshot = await WorkspaceBackup.createCloudSnapshot();
      const localPayload = stableStringify(localSnapshot);
      const remoteRevision = await FirebaseWorkspace.getRevision(user.uid);

      if (remoteRevision !== lastRevision.current) {
        if (localPayload !== lastPayload.current) {
          setStatus('conflict');
          setError('Another signed-in session updated this workspace while you have local changes. Your changes were kept on this device and were not uploaded. Export a workspace ZIP before reloading if you need to keep them.');
          return;
        }
        // The local workspace has no unsynced edits, so let the bootstrapper load the changed cloud copy.
        window.location.reload();
        return;
      }

      if (localPayload !== lastPayload.current || lastRevision.current === null) {
        const revision = await FirebaseWorkspace.save(user.uid, localPayload);
        lastPayload.current = localPayload;
        lastRevision.current = revision;
      }
      setLastSyncedAt(new Date());
      setStatus('synced');
    } catch (syncError) {
      setStatus('error');
      setError(syncError instanceof Error ? syncError.message : 'Could not sync this workspace.');
    } finally {
      syncing.current = false;
    }
  }, [user.uid]);

  useEffect(() => {
    const timer = window.setInterval(() => void syncNow(), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [intervalSeconds, syncNow]);

  useEffect(() => {
    void syncNow();
  }, [syncNow]);

  const deleteCloudWorkspace = useCallback(async () => {
    await FirebaseWorkspace.deleteWorkspace(user.uid);
    lastPayload.current = null;
    lastRevision.current = null;
    setLastSyncedAt(null);
    setStatus('idle');
  }, [user.uid]);

  const value = useMemo(() => ({
    intervalSeconds,
    setIntervalSeconds,
    status,
    lastSyncedAt,
    error,
    syncNow,
    deleteCloudWorkspace,
  }), [intervalSeconds, status, lastSyncedAt, error, syncNow, deleteCloudWorkspace]);

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
};

export const useCloudSync = (): CloudSyncContextValue => {
  const context = useContext(CloudSyncContext);
  if (!context) throw new Error('useCloudSync must be used within CloudSyncProvider');
  return context;
};

