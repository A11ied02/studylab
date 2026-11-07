import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { FirebaseWorkspace } from '../services/firebaseWorkspace';
import { stableStringify, WorkspaceBackup } from '../services/workspaceBackup';
import { saveWorkspaceValue, WORKSPACE_CHANGE_EVENT } from '../services/workspaceChanges';

const SYNC_INTERVAL_KEY = 'studylab_sync_interval_seconds';
const DEFAULT_SYNC_INTERVAL = 5;

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'conflict';

interface CloudSyncContextValue {
  intervalSeconds: number;
  setIntervalSeconds: (seconds: number) => void;
  status: CloudSyncStatus;
  lastSyncedAt: Date | null;
  error: string;
  hasUnsyncedChanges: boolean;
  syncNow: () => Promise<boolean>;
  allowNextNavigation: () => void;
  deleteCloudWorkspace: () => Promise<void>;
}

const CloudSyncContext = createContext<CloudSyncContextValue | undefined>(undefined);
const GUEST_CLOUD_SYNC: CloudSyncContextValue = {
  intervalSeconds: DEFAULT_SYNC_INTERVAL,
  setIntervalSeconds: () => {},
  status: 'synced',
  lastSyncedAt: null,
  error: '',
  hasUnsyncedChanges: false,
  syncNow: async () => true,
  allowNextNavigation: () => {},
  deleteCloudWorkspace: async () => {},
};

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
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(!initialSerialized);
  const syncing = useRef(false);
  const dirtyRef = useRef(!initialSerialized);
  const changeVersion = useRef(0);
  const allowNavigationRef = useRef(false);
  const lastPayload = useRef<string | null>(initialSerialized);
  const lastRevision = useRef<string | null>(initialRevision);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setHasUnsyncedChanges(dirty);
  }, []);

  const allowNextNavigation = useCallback(() => {
    allowNavigationRef.current = true;
    setDirty(false);
  }, [setDirty]);

  const setIntervalSeconds = (seconds: number) => {
    const safeSeconds = Math.max(5, Math.min(300, Math.round(seconds)));
    setIntervalState(safeSeconds);
    saveWorkspaceValue(SYNC_INTERVAL_KEY, String(safeSeconds));
  };

  const syncNow = useCallback(async () => {
    if (syncing.current) return false;
    syncing.current = true;
    const versionAtStart = changeVersion.current;
    setStatus('syncing');
    setError('');
    try {
      const localSnapshot = await WorkspaceBackup.createCloudSnapshot();
      const localPayload = stableStringify(localSnapshot);
      const hasLocalChanges = localPayload !== lastPayload.current;
      if (hasLocalChanges || lastRevision.current === null) setDirty(true);
      const remoteRevision = await FirebaseWorkspace.getRevision(user.uid);

      if (remoteRevision !== lastRevision.current) {
        if (localPayload !== lastPayload.current) {
          setStatus('conflict');
          setDirty(true);
          setError('Another signed-in session updated this workspace while you have local changes. Your changes were kept on this device and were not uploaded. Export a workspace ZIP before reloading if you need to keep them.');
          return false;
        }
        // The local workspace has no unsynced edits, so let the bootstrapper load the changed cloud copy.
        allowNextNavigation();
        window.location.reload();
        return false;
      }

      const needsInitialWorkspace = lastRevision.current === null;
      if (!hasLocalChanges && !needsInitialWorkspace) {
        // Poll the small revision document for remote edits, but don't write an unchanged workspace.
        setLastSyncedAt(new Date());
        setStatus('synced');
        const changedDuringSync = changeVersion.current !== versionAtStart;
        setDirty(changedDuringSync);
        return !changedDuringSync;
      }

      const revision = await FirebaseWorkspace.save(user.uid, localPayload);
      lastPayload.current = localPayload;
      lastRevision.current = revision;
      setLastSyncedAt(new Date());
      setStatus('synced');
      const changedDuringSync = changeVersion.current !== versionAtStart;
      setDirty(changedDuringSync);
      return !changedDuringSync;
    } catch (syncError) {
      setStatus('error');
      setError(syncError instanceof Error ? syncError.message : 'Could not sync this workspace.');
      return false;
    } finally {
      syncing.current = false;
    }
  }, [user.uid, allowNextNavigation, setDirty]);

  useEffect(() => {
    const onWorkspaceChanged = () => {
      changeVersion.current += 1;
      setDirty(true);
    };
    const onOtherTabStorageChanged = (event: StorageEvent) => {
      if (!event.key?.startsWith('studylab_')) return;
      onWorkspaceChanged();
    };
    window.addEventListener(WORKSPACE_CHANGE_EVENT, onWorkspaceChanged);
    window.addEventListener('storage', onOtherTabStorageChanged);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGE_EVENT, onWorkspaceChanged);
      window.removeEventListener('storage', onOtherTabStorageChanged);
    };
  }, [setDirty]);

  useEffect(() => {
    const protectUnsyncedWorkspace = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsyncedWorkspace);
    return () => window.removeEventListener('beforeunload', protectUnsyncedWorkspace);
  }, []);

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
    setDirty(true);
  }, [user.uid, setDirty]);

  const value = useMemo(() => ({
    intervalSeconds,
    setIntervalSeconds,
    status,
    lastSyncedAt,
    error,
    hasUnsyncedChanges,
    syncNow,
    allowNextNavigation,
    deleteCloudWorkspace,
  }), [intervalSeconds, status, lastSyncedAt, error, hasUnsyncedChanges, syncNow, allowNextNavigation, deleteCloudWorkspace]);

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
};

export const useCloudSync = (): CloudSyncContextValue => {
  const context = useContext(CloudSyncContext);
  return context ?? GUEST_CLOUD_SYNC;
};

