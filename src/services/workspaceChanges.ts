export const WORKSPACE_CHANGE_EVENT = 'studylab-workspace-change';

export function notifyWorkspaceChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORKSPACE_CHANGE_EVENT));
}

export function saveWorkspaceValue(key: string, value: string): void {
  if (localStorage.getItem(key) === value) return;
  localStorage.setItem(key, value);
  notifyWorkspaceChanged();
}
